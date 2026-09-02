import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { requireUser } from '../../lib/auth'
import {
  getExpensesSummary,
  listCategories,
  listExpenses,
  listPayPeriods,
  listUsers,
  reimburseAll,
} from '../../lib/expenses'
import type { SummaryFilters } from '../../lib/expenses'
import type { Category, UserSummary } from '../../lib/expenses'
import { formatDateShort, formatPeriod, formatPeriodShort, formatRupiah } from '../../lib/format'

type ExpensesSearch = {
  user_id?: number
  category_id?: number
  q?: string
  pay_period?: string
  sort?: 'asc' | 'desc'
  page?: number
  all?: boolean
}

export const Route = createFileRoute('/expenses/')({
  validateSearch: (search: Record<string, unknown>): ExpensesSearch => ({
    user_id: search.user_id ? Number(search.user_id) : undefined,
    category_id: search.category_id ? Number(search.category_id) : undefined,
    q: search.q ? String(search.q) : undefined,
    pay_period: search.pay_period ? String(search.pay_period) : undefined,
    sort: search.sort === 'asc' ? 'asc' : 'desc',
    page: search.page ? Number(search.page) : 1,
    all: search.all === true || search.all === 'true' ? true : undefined,
  }),
  beforeLoad: async () => {
    await requireUser()
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    // The pay-period scope is a default view, not a filter the user picks: it
    // keeps a plain visit from scanning the whole table, and matches the
    // Dashboard, which also thinks in salary cycles rather than calendar
    // months. Any filter the user actually applies searches all of history
    // instead — a filter that silently only looked at one period would hide
    // most matches. Picking a period in the dropdown is the exception: that
    // *is* a scope, so it replaces the default instead of widening it.
    const filtered = Boolean(deps.q || deps.user_id || deps.category_id)
    const periodScoped = !deps.all && !filtered

    // Scope to the newest pay period on record rather than the one the
    // calendar happens to be in, which is regularly still empty and would
    // leave the page looking broken. Rows carry the period they're charged
    // to, so an expense dated 29 Agustus but charged to September lands here
    // as soon as the September period exists.
    const payPeriods = await listPayPeriods()
    const defaultPeriod = periodScoped ? payPeriods[0] : undefined
    const payPeriod = deps.pay_period ?? defaultPeriod

    // Also handed to the "Reimburse Semua" button as-is, so the bulk action
    // always settles exactly the set the summary (and its pending total) was
    // computed from — never a stale or differently-scoped set of rows.
    const summaryFilters: SummaryFilters = {
      category_id: deps.category_id,
      q: deps.q,
      pay_period: payPeriod,
    }
    const [expensesPage, categories, users, summary] = await Promise.all([
      listExpenses({ data: { ...deps, pay_period: payPeriod } }),
      listCategories(),
      listUsers(),
      getExpensesSummary({ data: summaryFilters }),
    ])
    const periodLabel = defaultPeriod ? formatPeriod(defaultPeriod) : null
    return { expensesPage, categories, users, summary, payPeriods, periodLabel, filtered, summaryFilters }
  },
  component: ExpensesPage,
})

function ExpensesPage() {
  const search = Route.useSearch()
  const { expensesPage, categories, users, summary, payPeriods, periodLabel, filtered, summaryFilters } =
    Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(search.q ?? '')
  const [reimbursing, setReimbursing] = useState(false)

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
          <p className="table-hint">↔ Geser tabel buat lihat kolom lainnya</p>
          <div className="table-wrap">
            <div className="table-scroll">
              <table className="expenses-table">
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
                      onClick={() =>
                        navigate({ to: '/expenses/$id/edit', params: { id: String(e.id) } })
                      }
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
            <button
              type="button"
              className="secondary"
              disabled={(search.page ?? 1) <= 1}
              onClick={() =>
                navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }) })
              }
            >
              ← Sebelumnya
            </button>
            <span className="muted">
              Halaman {search.page ?? 1} dari {expensesPage.total_pages} ({expensesPage.total} data)
            </span>
            <button
              type="button"
              className="secondary"
              disabled={(search.page ?? 1) >= expensesPage.total_pages}
              onClick={() =>
                navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }) })
              }
            >
              Berikutnya →
            </button>
          </div>
        </>
      )}
    </main>
  )
}
