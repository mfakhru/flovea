import { createServerFn } from '@tanstack/react-start'
import { apiFetch, apiJson } from './api'

export type Category = {
  id: number
  name: string
  is_default: boolean
  /** Number of expenses using this category — 0 means nothing recorded yet. */
  usage_count: number
}
/**
 * Preselected in the Tambah form — most expenses are Makan, so this saves a
 * click on the common case.
 */
export const DEFAULT_CATEGORY_NAME = 'Makan'

/**
 * The seeded catch-all category. Picking it in the Tambah form is what reveals
 * the "kategori baru" input — mirrors the name seeded in migration 0002.
 */
export const OTHERS_CATEGORY_NAME = 'Others'

export type UserSummary = { id: number; display_name: string }

export type Expense = {
  id: number
  user_id: number
  category_id: number
  expense_date: string
  detail: string
  amount: number
  notes: string | null
  needs_reimburse: boolean
  reimbursed_at: string | null
  reimbursed_by: number | null
  pay_period: string | null
  created_at: string
}

export type ExpenseFilters = {
  year?: number
  month?: number
  user_id?: number
  category_id?: number
  q?: string
  pay_period?: string
  sort?: 'asc' | 'desc'
  page?: number
}

export type ExpenseInput = {
  category_id: number
  expense_date: string
  detail: string
  amount: number
  notes?: string | null
  needs_reimburse?: boolean
  pay_period?: string | null
}

export type ImportResult = {
  inserted: number
  errors: Array<{ row: number; error: string }>
}

export type UserTotal = { user_id: number; display_name: string; total: number }
export type ExpenseSummary = {
  by_user: UserTotal[]
  pending_reimburse: number
  pending_count: number
  special_case_total: number
}
export type BulkReimburseResult = { count: number; total: number }
export type ExpensePage = {
  items: Expense[]
  page: number
  page_size: number
  total: number
  total_pages: number
}
export type SummaryFilters = {
  year?: number
  month?: number
  category_id?: number
  q?: string
  pay_period?: string
}

export type CategoryTotal = { category_id: number; category_name: string; total: number }
export type PeriodTotal = { pay_period: string; by_user: UserTotal[]; total: number }

export const listCategories = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Category[]> => apiJson<Category[]>('/categories'),
)

export const listPayPeriods = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string[]> => apiJson<string[]>('/expenses/pay-periods'),
)

/** Newest month (YYYY-MM) that holds an expense — Riwayat's default scope. */
export const getLatestMonth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ month: string | null }> =>
    apiJson<{ month: string | null }>('/expenses/latest-month'),
)

export const listUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<UserSummary[]> => apiJson<UserSummary[]>('/users'),
)

export const createCategory = createServerFn({ method: 'POST' })
  .validator((data: { name: string }) => data)
  .handler(
    async ({ data }): Promise<Category> =>
      apiJson<Category>('/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }),
  )

export const listExpenses = createServerFn({ method: 'GET' })
  .validator((filters: ExpenseFilters) => filters)
  .handler(async ({ data }): Promise<ExpensePage> => {
    const params = new URLSearchParams()
    if (data.year) params.set('year', String(data.year))
    if (data.month) params.set('month', String(data.month))
    if (data.user_id) params.set('user_id', String(data.user_id))
    if (data.category_id) params.set('category_id', String(data.category_id))
    if (data.q) params.set('q', data.q)
    if (data.pay_period) params.set('pay_period', data.pay_period)
    if (data.sort) params.set('sort', data.sort)
    if (data.page) params.set('page', String(data.page))
    return apiJson<ExpensePage>(`/expenses?${params.toString()}`)
  })

export const getExpensesSummary = createServerFn({ method: 'GET' })
  .validator((filters: SummaryFilters) => filters)
  .handler(async ({ data }): Promise<ExpenseSummary> => {
    const params = new URLSearchParams()
    if (data.year) params.set('year', String(data.year))
    if (data.month) params.set('month', String(data.month))
    if (data.category_id) params.set('category_id', String(data.category_id))
    if (data.q) params.set('q', data.q)
    if (data.pay_period) params.set('pay_period', data.pay_period)
    return apiJson<ExpenseSummary>(`/expenses/summary?${params.toString()}`)
  })

export const getExpensesByCategory = createServerFn({ method: 'GET' })
  .validator((filters: SummaryFilters) => filters)
  .handler(async ({ data }): Promise<CategoryTotal[]> => {
    const params = new URLSearchParams()
    if (data.year) params.set('year', String(data.year))
    if (data.month) params.set('month', String(data.month))
    if (data.q) params.set('q', data.q)
    if (data.pay_period) params.set('pay_period', data.pay_period)
    return apiJson<CategoryTotal[]>(`/expenses/by-category?${params.toString()}`)
  })

export const getExpensesByPeriod = createServerFn({ method: 'GET' })
  .validator((data: { limit?: number; group?: 'month' | 'year' }) => data)
  .handler(async ({ data }): Promise<PeriodTotal[]> => {
    const params = new URLSearchParams()
    if (data.limit) params.set('limit', String(data.limit))
    if (data.group) params.set('group', data.group)
    return apiJson<PeriodTotal[]>(`/expenses/by-period?${params.toString()}`)
  })

export const getExpense = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<Expense> => apiJson<Expense>(`/expenses/${data.id}`))

export const createExpense = createServerFn({ method: 'POST' })
  .validator((data: ExpenseInput) => data)
  .handler(
    async ({ data }): Promise<Expense> =>
      apiJson<Expense>('/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }),
  )

export const updateExpense = createServerFn({ method: 'POST' })
  .validator((data: ExpenseInput & { id: number }) => data)
  .handler(async ({ data }): Promise<Expense> => {
    const { id, ...body } = data
    return apiJson<Expense>(`/expenses/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  })

export const toggleReimburse = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(
    async ({ data }): Promise<Expense> =>
      apiJson<Expense>(`/expenses/${data.id}/reimburse`, { method: 'POST' }),
  )

/** Marks every pending expense matching the given filters as reimbursed in
 * one request — the filters mirror SummaryFilters so it settles exactly the
 * amount shown under "Perlu dibayarkan". */
export const reimburseAll = createServerFn({ method: 'POST' })
  .validator((filters: SummaryFilters) => filters)
  .handler(async ({ data }): Promise<BulkReimburseResult> => {
    const params = new URLSearchParams()
    if (data.year) params.set('year', String(data.year))
    if (data.month) params.set('month', String(data.month))
    if (data.category_id) params.set('category_id', String(data.category_id))
    if (data.q) params.set('q', data.q)
    if (data.pay_period) params.set('pay_period', data.pay_period)
    return apiJson<BulkReimburseResult>(`/expenses/reimburse-all?${params.toString()}`, {
      method: 'POST',
    })
  })

export const deleteExpense = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<void> => {
    const res = await apiFetch(`/expenses/${data.id}`, { method: 'DELETE' })
    if (!res.ok) {
      throw new Error(`Gagal menghapus: ${res.status}`)
    }
  })

export const importCsv = createServerFn({ method: 'POST' })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<ImportResult> => {
    const res = await apiFetch('/import/csv', { method: 'POST', body: data })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Import gagal (${res.status}): ${body}`)
    }
    return res.json()
  })
