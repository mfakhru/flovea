import { createServerFn } from '@tanstack/react-start'
import { apiJson } from './api'

/** Mirrors `BalanceRow` in api/src/schemas.py — kept in sync by hand. */
export type BalanceRow = {
  pay_period: string
  /** Uang yang diterima Istri — incomes.istri_amount. */
  received: number
  /** Pengeluaran yang jatuh ke Istri, reimburse yang sudah lunas termasuk. */
  spent: number
  adjustment: number
  net: number
  /** Running balance up to and including this period. */
  closing_balance: number
}

export type Adjustment = {
  id: number
  pay_period: string
  amount: number
  note: string
  created_at: string
}

/** Mirrors `BalanceRecap` in api/src/schemas.py. */
export type BalanceRecap = {
  opening_balance: number
  current_balance: number
  pending_reimburse: number
  pending_count: number
  /** Newest period first. */
  rows: BalanceRow[]
  adjustments: Adjustment[]
}

export const getBalance = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BalanceRecap> => apiJson<BalanceRecap>('/balance'),
)

/**
 * Every mutation below returns the whole recomputed recap, not just the row
 * it touched — one edit moves every closing balance after it, so the server
 * hands back the new ledger instead of making the page re-fetch it.
 */
export const setOpeningBalance = createServerFn({ method: 'POST' })
  .validator((data: { amount: number }) => data)
  .handler(
    async ({ data }): Promise<BalanceRecap> =>
      apiJson<BalanceRecap>('/balance/opening', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }),
  )

export const addAdjustment = createServerFn({ method: 'POST' })
  .validator((data: { pay_period: string; amount: number; note: string }) => data)
  .handler(
    async ({ data }): Promise<BalanceRecap> =>
      apiJson<BalanceRecap>('/balance/adjustments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }),
  )

export const deleteAdjustment = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(
    async ({ data }): Promise<BalanceRecap> =>
      apiJson<BalanceRecap>(`/balance/adjustments/${data.id}`, { method: 'DELETE' }),
  )
