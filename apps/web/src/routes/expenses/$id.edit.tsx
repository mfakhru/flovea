import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { SUAMI_DISPLAY_NAME, requireUser } from '../../lib/auth'
import {
  deleteExpense,
  getExpense,
  listCategories,
  listUsers,
  toggleReimburse,
  updateExpense,
} from '../../lib/expenses'

export const Route = createFileRoute('/expenses/$id/edit')({
  beforeLoad: async () => {
    await requireUser()
  },
  loader: async ({ params }) => {
    const id = Number(params.id)
    const [expense, categories, users] = await Promise.all([
      getExpense({ data: { id } }),
      listCategories(),
      listUsers(),
    ])
    return { expense, categories, users }
  },
  component: EditExpensePage,
})

function formatThousands(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function EditExpensePage() {
  const { expense: initialExpense, categories, users } = Route.useLoaderData()
  const owner = users.find((u) => u.id === initialExpense.user_id)
  const canReimburse = owner?.display_name === SUAMI_DISPLAY_NAME
  const navigate = useNavigate()
  const router = useRouter()
  const [expense, setExpense] = useState(initialExpense)
  const [expenseDate, setExpenseDate] = useState(expense.expense_date)
  const [categoryId, setCategoryId] = useState(expense.category_id)
  const [detail, setDetail] = useState(expense.detail)
  const [amount, setAmount] = useState(formatThousands(String(expense.amount)))
  const [notes, setNotes] = useState(expense.notes ?? '')
  const [payPeriod, setPayPeriod] = useState(expense.pay_period ?? '')
  const [needsReimburse, setNeedsReimburse] = useState(expense.needs_reimburse)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingReimburse, setTogglingReimburse] = useState(false)

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^0-9]/g, '')
    setAmount(formatThousands(digits))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNumber = Number(amount.replace(/\./g, ''))
    if (!amountNumber) {
      setError('Nominal tidak valid')
      return
    }
    setSubmitting(true)
    try {
      await updateExpense({
        data: {
          id: expense.id,
          category_id: categoryId,
          expense_date: expenseDate,
          detail,
          amount: amountNumber,
          notes: notes || null,
          needs_reimburse: needsReimburse,
          pay_period: payPeriod || null,
        },
      })
      await router.invalidate()
      navigate({ to: '/expenses' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleReimburse() {
    setTogglingReimburse(true)
    setError(null)
    try {
      const updated = await toggleReimburse({ data: { id: expense.id } })
      setExpense(updated)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal update status reimburse')
    } finally {
      setTogglingReimburse(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Hapus pengeluaran ini?')) return
    setSubmitting(true)
    try {
      await deleteExpense({ data: { id: expense.id } })
      await router.invalidate()
      navigate({ to: '/expenses' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus')
      setSubmitting(false)
    }
  }

  return (
    <main className="page container">
      <div className="page-head">
        <div>
          <h1>Edit Pengeluaran</h1>
          <p className="page-subtitle">Ubah atau hapus catatan ini</p>
        </div>
      </div>

      <form className="stack card" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="date">Tanggal</label>
          <input
            id="date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="category">Kategori</label>
          <select
            id="category"
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="detail">Untuk</label>
          <input id="detail" value={detail} onChange={(e) => setDetail(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="amount">Nominal (Rp)</label>
          <input
            id="amount"
            inputMode="numeric"
            value={amount}
            onChange={handleAmountChange}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="pay-period">Periode Gajian</label>
          <input
            id="pay-period"
            type="month"
            value={payPeriod}
            onChange={(e) => setPayPeriod(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="notes">Keterangan (opsional)</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        {canReimburse && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={needsReimburse}
              onChange={(e) => setNeedsReimburse(e.target.checked)}
            />
            Perlu direimburse Istri
          </label>
        )}

        {expense.needs_reimburse && (
          <div className="reimburse-box">
            <span className={expense.reimbursed_at ? 'badge badge-paid' : 'badge badge-pending'}>
              {expense.reimbursed_at
                ? `Lunas · ${expense.reimbursed_at.slice(0, 10)}${
                    expense.reimbursed_by
                      ? ` oleh ${users.find((u) => u.id === expense.reimbursed_by)?.display_name ?? '-'}`
                      : ''
                  }`
                : 'Belum dibayar'}
            </span>
            <button
              type="button"
              className="secondary btn-sm"
              onClick={handleToggleReimburse}
              disabled={togglingReimburse}
            >
              {expense.reimbursed_at ? 'Batalkan lunas' : 'Tandai lunas'}
            </button>
          </div>
        )}

        <div className="row">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate({ to: '/expenses' })}>
            Batal
          </button>
          <button type="button" className="danger" onClick={handleDelete} disabled={submitting}>
            Hapus
          </button>
        </div>
      </form>
    </main>
  )
}
