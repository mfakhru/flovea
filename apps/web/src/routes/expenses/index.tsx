import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { requireUser } from '../../lib/auth'
import { listCategories, listExpenses, listUsers } from '../../lib/expenses'
import type { Category, Expense, UserSummary } from '../../lib/expenses'

type ExpensesSearch = {
  year?: number
  month?: number
  user_id?: number
  category_id?: number
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

  function updateFilter(patch: Partial<ExpensesSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) })
  }

  const categoryById = new Map(categories.map((c: Category) => [c.id, c.name]))
  const userById = new Map(users.map((u: UserSummary) => [u.id, u.display_name]))

  return (
    <main className="page container">
      <h1>Riwayat Pengeluaran</h1>

      <div className="filters card">
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
        <Link to="/expenses/new" className="btn">
          + Tambah
        </Link>
      </div>

      {expenses.length === 0 ? (
        <p className="muted">Belum ada data untuk filter ini.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kategori</th>
                <th>Untuk</th>
                <th>Orang</th>
                <th className="amount">Nominal</th>
                <th>Keterangan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e: Expense) => (
                <tr key={e.id}>
                  <td>{e.expense_date}</td>
                  <td>{categoryById.get(e.category_id) ?? '-'}</td>
                  <td>{e.detail}</td>
                  <td>{userById.get(e.user_id) ?? '-'}</td>
                  <td className="amount">{formatRupiah(e.amount)}</td>
                  <td>{e.notes ?? ''}</td>
                  <td className="actions-cell">
                    <Link to="/expenses/$id/edit" params={{ id: String(e.id) }}>
                      Edit
                    </Link>
                  </td>
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
