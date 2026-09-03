import {
  createFileRoute,
  Link,
  useLoaderData,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { getHistoryRows, reimburseAll } from '../../lib/expenses'
import type { ExpensesSearch } from './_riwayat'
import type { Category, SummaryFilters, UserSummary } from '../../lib/expenses'
import { formatDateShort, formatPeriod, formatPeriodShort, formatRupiah } from '../../lib/format'

// Pinch-to-zoom bounds for the table. At 100% a phone shows about three of
// its seven columns, which makes it impossible to read a row's date and its
// nominal at once; half size fits the lot on a 360px screen.
const MIN_ZOOM = 0.5
const MAX_ZOOM = 1
const ZOOM_STEP = 0.1

const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))

export const Route = createFileRoute('/expenses/_riwayat/')({
  // Everything the table's own query depends on. The filters are here as well
  // as on the layout above because rows have to be filtered too — but only
  // this loader re-runs when `page` or `sort` changes.
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => getHistoryRows({ data: deps }),
  component: ExpensesPage,
})

/**
 * A page step as a link rather than a button, so `preload="intent"` can start
 * the fetch on hover — or on touchstart, which fires before the tap completes,
 * meaning the rows are usually already on their way by the time the press
 * registers. Preloading is off by default for the app (see router.tsx, which
 * weighs it against the free tier); two links the reader is visibly reaching
 * for are worth the exception. At the ends of the range it falls back to a
 * disabled button — an anchor has no honest disabled state.
 */
function PageLink({
  page,
  disabled,
  children,
}: {
  page: number
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <button type="button" className="secondary" disabled>
        {children}
      </button>
    )
  }
  return (
    <Link
      to="/expenses"
      search={(prev: ExpensesSearch) => ({ ...prev, page })}
      preload="intent"
      className="btn secondary"
    >
      {children}
    </Link>
  )
}

function ExpensesPage() {
  const search = Route.useSearch()
  const expensesPage = Route.useLoaderData()
  const {
    summary,
    categories,
    users,
    pay_periods: payPeriods,
    pay_period: activePeriod,
    scoped_by_default: scopedByDefault,
  } = useLoaderData({ from: '/expenses/_riwayat' })
  const navigate = useNavigate({ from: Route.fullPath })
  // Turning a page swaps the rows out from under the reader; without this the
  // table just sits there looking unchanged until the new page lands.
  const loading = useRouterState({ select: (s) => s.isLoading })

  const filtered = Boolean(search.q || search.user_id || search.category_id)
  // Only a server-picked period gets the "showing the latest period" notice;
  // one the user chose in the dropdown is already visible in the filters.
  const periodLabel = scopedByDefault && activePeriod ? formatPeriod(activePeriod) : null
  // Handed to the "Reimburse Semua" button as-is, so the bulk action always
  // settles exactly the set the summary (and its pending total) was computed
  // from — never a stale or differently-scoped set of rows.
  const summaryFilters: SummaryFilters = {
    category_id: search.category_id,
    q: search.q,
    pay_period: activePeriod ?? undefined,
  }
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(search.q ?? '')
  const [reimbursing, setReimbursing] = useState(false)
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Read only at the start of a gesture, so the listeners below can be bound
  // once instead of re-bound on every zoom change — re-binding mid-pinch would
  // drop the gesture's starting reference and make the table jump.
  const zoomRef = useRef(zoom)
  // A pinch ends with a touchend over a row, which the browser then reports as
  // a click; without this the gesture would open that row's edit page.
  const pinchedRef = useRef(false)

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const spread = (touches: TouchList) =>
      Math.hypot(
        touches[0]!.clientX - touches[1]!.clientX,
        touches[0]!.clientY - touches[1]!.clientY,
      )
    let start: { spread: number; zoom: number } | null = null

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) pinchedRef.current = false
      if (e.touches.length !== 2) return
      start = { spread: spread(e.touches), zoom: zoomRef.current }
    }
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return
      // Non-passive on purpose: without this the browser zooms the whole page
      // instead, which is the behaviour we're replacing.
      e.preventDefault()
      pinchedRef.current = true
      setZoom(clampZoom((start.zoom * spread(e.touches)) / start.spread))
    }
    const onEnd = () => {
      start = null
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  async function handleReimburseAll() {
    const ok = confirm(
      `Lunasi ${summary.pending_count} transaksi senilai ${formatRupiah(summary.pending_reimburse)}? ` +
        'Semua akan ditandai sudah dibayarkan ke Istri.',
    )
    if (!ok) return
    setReimbursing(true)
    try {
      await reimburseAll({ data: summaryFilters })
      await router.invalidate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal melunasi semua')
    } finally {
      setReimbursing(false)
    }
  }
  // `all` isn't counted — the scope line above the cards already says
  // whether the whole history is showing, and offers the way back.
  const activeFilterCount = [
    search.user_id,
    search.category_id,
    search.q,
    search.pay_period,
  ].filter((v) => v !== undefined && v !== '').length
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0)

  // debounce the search box so typing doesn't fire a server function per keystroke
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (search.q ?? '')) {
        navigate({ search: (prev) => ({ ...prev, q: searchInput || undefined, page: 1 }) })
      }
    }, 400)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function updateFilter(patch: Partial<ExpensesSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) })
  }

  function toggleSort() {
    navigate({ search: (prev) => ({ ...prev, sort: prev.sort === 'asc' ? 'desc' : 'asc' }) })
  }

  const categoryById = new Map(categories.map((c: Category) => [c.id, c.name]))
  const userById = new Map(users.map((u: UserSummary) => [u.id, u.display_name]))

  // Only offer categories something was actually spent on — an empty one can
  // never match a row. The currently selected one stays listed regardless, so
  // an old link doesn't leave the dropdown showing a blank selection.
  const filterCategories = categories.filter(
    (c: Category) => c.usage_count > 0 || c.id === search.category_id,
  )

  const suamiTotal = summary.by_user.find((u) => u.display_name === 'Suami')?.total ?? 0
  const istriTotal = summary.by_user.find((u) => u.display_name === 'Istri')?.total ?? 0

  // Whose expense it is rides on the row's tint rather than its own column:
  // on a phone only about three columns of this table fit at once, and a
  // background colour costs none of them. The legend above the table says
  // which colour is whose, and the row's title repeats it for a pointer.
  const ownerRowClass = (userId: number) => {
    const name = userById.get(userId)
    if (name === 'Suami') return 'row-suami'
    if (name === 'Istri') return 'row-istri'
    return undefined
  }

  return (
    <main className="page container">
      <div className="page-head">
        <div>
          <h1>Riwayat Pengeluaran</h1>
          <p className="page-subtitle">Catatan pengeluaran rumah tangga</p>
        </div>
        <Link to="/expenses/new" className="btn">
          + Tambah
        </Link>
      </div>

      {periodLabel && (
        <p className="table-hint">
          Menampilkan periode gajian {periodLabel} (periode terakhir yang ada datanya).{' '}
          <button type="button" className="secondary btn-sm" onClick={() => updateFilter({ all: true })}>
            Tampilkan semua riwayat
          </button>
        </p>
      )}
      {filtered && <p className="table-hint">Filter aktif — dicari di semua riwayat.</p>}
      {search.all && !filtered && (
        <p className="table-hint">
          Menampilkan semua riwayat.{' '}
          <button
            type="button"
            className="secondary btn-sm"
            onClick={() => updateFilter({ all: undefined })}
          >
            Kembali ke periode terakhir
          </button>
        </p>
      )}

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-label">Total Suami</span>
          <span className="stat-value">{formatRupiah(suamiTotal)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Istri</span>
          <span className="stat-value">{formatRupiah(istriTotal)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Special Case</span>
          <span className="stat-value">{formatRupiah(summary.special_case_total)}</span>
        </div>
        {summary.pending_reimburse > 0 && (
          <div className="stat-card stat-warn">
            <span className="stat-label">Perlu dibayarkan</span>
            <span className="stat-value">{formatRupiah(summary.pending_reimburse)}</span>
            <button
              type="button"
              className="secondary btn-sm"
              onClick={handleReimburseAll}
              disabled={reimbursing}
            >
              {reimbursing ? 'Memproses...' : `Reimburse Semua (${summary.pending_count})`}
            </button>
          </div>
        )}
      </div>

      <div className="filters-card card">
        <div className="filters-header">
          <button
            type="button"
            className="secondary filter-toggle"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filter
            {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
            <span className="filter-caret">{filtersOpen ? '▲' : '▼'}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="secondary btn-sm"
              onClick={() => {
                setSearchInput('')
                navigate({ search: { sort: search.sort, page: 1 } })
              }}
            >
              Reset
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="filters">
            <div className="field">
              <label htmlFor="f-search">Cari</label>
              <input
                id="f-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="untuk / keterangan..."
              />
            </div>
            <div className="field">
              <label htmlFor="f-user">Orang</label>
              <select
                id="f-user"
                value={search.user_id ?? ''}
                onChange={(e) =>
                  updateFilter({ user_id: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">Semua orang</option>
                {users.map((u: UserSummary) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-category">Kategori</label>
              <select
                id="f-category"
                value={search.category_id ?? ''}
                onChange={(e) =>
                  updateFilter({ category_id: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">Semua kategori</option>
                {filterCategories.map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-period">Periode Gajian</label>
              <select
                id="f-period"
                value={search.pay_period ?? ''}
                onChange={(e) => updateFilter({ pay_period: e.target.value || undefined })}
              >
                <option value="">Semua periode</option>
                {payPeriods.map((p: string) => (
                  <option key={p} value={p}>
                    {formatPeriod(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {expensesPage.items.length === 0 ? (
        <div className="card empty-state">
          <span className="empty-icon">🧾</span>
          <p>Belum ada pengeluaran yang cocok dengan filter ini.</p>
          <Link to="/expenses/new" className="btn">
            Tambah pengeluaran
          </Link>
        </div>
      ) : (
        <>
          <div className="table-tools">
            <div className="owner-legend">
              <span className="chart-legend-item">
                <span className="legend-dot legend-dot-suami" />
                Suami
              </span>
              <span className="chart-legend-item">
                <span className="legend-dot legend-dot-istri" />
                Istri
              </span>
            </div>
            <div className="zoom-control">
              <button
                type="button"
                className="secondary"
                aria-label="Perkecil tabel"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
              >
                −
              </button>
              <span className="zoom-value">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="secondary"
                aria-label="Perbesar tabel"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
              >
                +
              </button>
            </div>
          </div>
          <p className="table-hint">↔ Geser atau cubit tabel buat lihat kolom lainnya</p>
          <div className={loading ? 'table-wrap is-loading' : 'table-wrap'}>
            <div className="table-scroll" ref={scrollRef}>
              <table className="expenses-table" style={{ zoom: String(zoom) }}>
                <thead>
                  <tr>
                    <th className="sortable" onClick={toggleSort}>
                      Tanggal {search.sort === 'asc' ? '↑' : '↓'}
                    </th>
                    <th>Periode</th>
                    <th>Kategori</th>
                    <th>Untuk</th>
                    <th className="amount">Nominal</th>
                    <th>Keterangan</th>
                    <th>Reimburse</th>
                  </tr>
                </thead>
                <tbody>
                  {expensesPage.items.map((e) => (
                    <tr
                      key={e.id}
                      className={ownerRowClass(e.user_id)}
                      title={userById.get(e.user_id) ?? undefined}
                      onClick={() => {
                        if (pinchedRef.current) return
                        navigate({ to: '/expenses/$id/edit', params: { id: String(e.id) } })
                      }}
                    >
                      <td>{formatDateShort(e.expense_date)}</td>
                      <td>
                        {e.pay_period ? (
                          formatPeriodShort(e.pay_period)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{categoryById.get(e.category_id) ?? '-'}</td>
                      <td>{e.detail}</td>
                      <td className="amount">{formatRupiah(e.amount)}</td>
                      <td>{e.notes || <span className="muted">—</span>}</td>
                      <td>
                        {e.needs_reimburse ? (
                          <span
                            className={e.reimbursed_at ? 'badge badge-paid' : 'badge badge-pending'}
                          >
                            {e.reimbursed_at
                              ? `Lunas${e.reimbursed_by ? ` · ${userById.get(e.reimbursed_by) ?? '-'}` : ''}`
                              : 'Belum'}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pagination">
            <PageLink page={(search.page ?? 1) - 1} disabled={(search.page ?? 1) <= 1}>
              ← Sebelumnya
            </PageLink>
            <span className="muted">
              Halaman {search.page ?? 1} dari {expensesPage.total_pages} ({expensesPage.total} data)
            </span>
            <PageLink
              page={(search.page ?? 1) + 1}
              disabled={(search.page ?? 1) >= expensesPage.total_pages}
            >
              Berikutnya →
            </PageLink>
          </div>
        </>
      )}
    </main>
  )
}
