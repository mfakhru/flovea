import { createServerFn } from '@tanstack/react-start'
import { apiJson } from './api'

/** Mirrors `IncomeOut` in api/src/schemas.py — kept in sync by hand. */
export type Income = {
  pay_period: string
  amount: number
  /** The slice handed over to Istri — the "diterima" side of the Saldo
   * ledger. Separate from `amount`, which stays the household figure. */
  istri_amount: number
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

/**
 * What Istri received for a period. Its own endpoint rather than a second
 * field on {@link setIncome}: the two figures are edited from different
 * places, and each upsert must leave the other column untouched.
 */
export const setIstriIncome = createServerFn({ method: 'POST' })
  .validator((data: { pay_period: string; amount: number }) => data)
  .handler(
    async ({ data }): Promise<Income> =>
      apiJson<Income>(`/incomes/${encodeURIComponent(data.pay_period)}/istri`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: data.amount }),
      }),
  )
