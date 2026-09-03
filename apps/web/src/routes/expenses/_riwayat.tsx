import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireUser } from '../../lib/auth'
import { getHistoryShell } from '../../lib/expenses'

/**
 * Pathless layout holding everything on Riwayat that doesn't change when you
 * turn a page: the totals, both filter dropdowns, the user list.
 *
 * It exists purely so paging is cheap. `loaderDeps` below deliberately leaves
 * out `page` and `sort` — the two things paging changes — so this loader stays
 * put while the rows route underneath it refetches. Pathless (rather than a
 * plain `route.tsx`) so Tambah and Edit, which sit under /expenses too, don't
 * pay for a shell they never render.
 */
export const Route = createFileRoute('/expenses/_riwayat')({
  // Declared here rather than on the index route so this loader can read the
  // filters; children inherit the validated search either way.
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
  loaderDeps: ({ search }) => ({
    user_id: search.user_id,
    category_id: search.category_id,
    q: search.q,
    pay_period: search.pay_period,
    all: search.all,
  }),
  loader: async ({ deps }) => getHistoryShell({ data: deps }),
  component: Outlet,
})

export type ExpensesSearch = {
  user_id?: number
  category_id?: number
  q?: string
  pay_period?: string
  sort?: 'asc' | 'desc'
  page?: number
  all?: boolean
}
