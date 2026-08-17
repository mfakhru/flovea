import { createServerFn } from '@tanstack/react-start'
import { apiFetch, apiJson } from './api'

export type Category = { id: number; name: string; is_default: boolean }
export type UserSummary = { id: number; display_name: string }

export type Expense = {
  id: number
  user_id: number
  category_id: number
  expense_date: string
  detail: string
  amount: number
  notes: string | null
  created_at: string
}

export type ExpenseFilters = {
  year?: number
  month?: number
  user_id?: number
  category_id?: number
  page?: number
}

export type ExpenseInput = {
  category_id: number
  expense_date: string
  detail: string
  amount: number
  notes?: string | null
}

export type ImportResult = {
  inserted: number
  errors: Array<{ row: number; error: string }>
}

export const listCategories = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Category[]> => apiJson<Category[]>('/categories'),
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
  .handler(async ({ data }): Promise<Expense[]> => {
    const params = new URLSearchParams()
    if (data.year) params.set('year', String(data.year))
    if (data.month) params.set('month', String(data.month))
    if (data.user_id) params.set('user_id', String(data.user_id))
    if (data.category_id) params.set('category_id', String(data.category_id))
    if (data.page) params.set('page', String(data.page))
    return apiJson<Expense[]>(`/expenses?${params.toString()}`)
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
