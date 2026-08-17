import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { requireUser } from '../../lib/auth'
import { listCategories, listExpenses, listUsers } from '../../lib/expenses'
import type { Category, Expense, UserSummary } from '../../lib/expenses'

type ExpensesSearch = {
  year?: number
  month?: number
  user_id?: number
  category_id?: number
  q?: string
  sort?: 'asc' | 'desc'
  page?: number
}

const PAGE_SIZE = 50

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export const Route = createFileRoute('/expenses/')({
  validateSearch: (search: Record<string, unknown>): ExpensesSearch => ({
    year: search.year ? Number(search.year) : undefined,
    month: search.month ? Number(search.month) : undefined,
    user_id: search.user_id ? Number(search.user_id) : undefined,
    category_id: search.category_id ? Number(search.category_id) : undefined,
    q: search.q ? String(search.q) : undefined,
    sort: search.sort === 'asc' ? 'asc' : 'desc',
    page: search.page ? Number(search.page) : 1,
  }),
  beforeLoad: async () => {
    await requireUser()
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [expenses, categories, users] = await Promise.all([
      listExpenses({ data: deps }),
      listCategories(),
      listUsers(),
    ])
    return { expenses, categories, users }
  },
  component: ExpensesPage,
})

function ExpensesPage() {
  const search = Route.useSearch()
  const { expenses, categories, users } = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const [searchInput, setSearchInput] = useState(search.q ?? '')
  const activeFilterCount = [search.year, search.month, search.user_id, search.category_id, search.q].filter(
    (v) => v !== undefined && v !== '',
  ).length
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

  const totalAmount = expenses.reduce((sum: number, e: Expense) => sum + e.amount, 0)
  const pendingReimburse = expenses.filter((e: Expense) => e.needs_reimburse && !e.reimbursed_at).length

  return (
    <main className="page container">
      <h1>Riwayat Pengeluaran</h1>

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-label">Total ditampilkan</span>
          <span className="stat-value">{formatRupiah(totalAmount)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Transaksi</span>
          <span className="stat-value">{expenses.length}</span>
        </div>
        {pendingReimburse > 0 && (
          <div className="stat-card stat-card-warn">
            <span className="stat-label">Belum direimburse</span>
            <span className="stat-value">{pendingReimburse}</span>
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
            {filtersOpen ? '▲' : '▼'}
          </button>
          <Link to="/expenses/new" className="btn">
            + Tambah
          </Link>
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
              <label htmlFor="f-year">Tahun</label>
              <input
                id="f-year"
                type="number"
                value={search.year ?? ''}
                onChange={(e) =>
                  updateFilter({ year: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="2026"
              />
            </div>
            <div className="field">
              <label htmlFor="f-month">Bulan</label>
              <select
                id="f-month"
                value={search.month ?? ''}
                onChange={(e) =>
                  updateFilter({ month: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">Semua</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
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
                <option value="">Semua</option>
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
                <option value="">Semua</option>
                {categories.map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {expenses.length === 0 ? (
        <p className="muted">Belum ada data untuk filter ini.</p>
      ) : (
        <div className="card table-card">
          <table className="expenses-table">
            <thead>
              <tr>
                <th className="sortable" onClick={toggleSort}>
                  Tanggal {search.sort === 'asc' ? '↑' : '↓'}
                </th>
                <th>Kategori</th>
                <th>Untuk</th>
                <th className="amount">Nominal</th>
                <th>Keterangan</th>
                <th>Reimburse</th>
                <th>Orang</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e: Expense) => (
                <tr
                  key={e.id}
                  className="row-link"
                  onClick={() => navigate({ to: '/expenses/$id/edit', params: { id: String(e.id) } })}
                >
                  <td data-label="Tanggal">{e.expense_date}</td>
                  <td data-label="Kategori">{categoryById.get(e.category_id) ?? '-'}</td>
                  <td data-label="Untuk">{e.detail}</td>
                  <td data-label="Nominal" className="amount">
                    {formatRupiah(e.amount)}
                  </td>
                  <td data-label="Keterangan">{e.notes ?? ''}</td>
                  <td data-label="Reimburse">
                    {e.needs_reimburse ? (
                      <span className={e.reimbursed_at ? 'badge badge-paid' : 'badge badge-pending'}>
                        {e.reimbursed_at ? 'Lunas' : 'Belum'}
                      </span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td data-label="Orang">{userById.get(e.user_id) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button
          type="button"
          className="secondary"
          disabled={(search.page ?? 1) <= 1}
          onClick={() => navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }) })}
        >
          Sebelumnya
        </button>
        <span className="muted">Halaman {search.page ?? 1}</span>
        <button
          type="button"
          className="secondary"
          disabled={expenses.length < PAGE_SIZE}
          onClick={() => navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }) })}
        >
          Berikutnya
        </button>
      </div>
    </main>
  )
}
