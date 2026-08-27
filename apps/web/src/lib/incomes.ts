import { createServerFn } from '@tanstack/react-start'
import { apiJson } from './api'

/** Mirrors `IncomeOut` in api/src/schemas.py — kept in sync by hand. */
export type Income = {
  pay_period: string
  amount: number
}

export const listIncomes = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Income[]> => apiJson<Income[]>('/incomes'),
)

export const getIncome = createServerFn({ method: 'GET' })
  .validator((data: { pay_period: string }) => data)
  .handler(
    async ({ data }): Promise<Income> =>
      apiJson<Income>(`/incomes/${encodeURIComponent(data.pay_period)}`),
  )

/** Upsert — saving the same period twice overwrites rather than accumulates. */
export const setIncome = createServerFn({ method: 'POST' })
  .validator((data: { pay_period: string; amount: number }) => data)
  .handler(
    async ({ data }): Promise<Income> =>
      apiJson<Income>(`/incomes/${encodeURIComponent(data.pay_period)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: data.amount }),
      }),
  )
