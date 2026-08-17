import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { requireUser } from '../../lib/auth'
import { deleteExpense, getExpense, listCategories, updateExpense } from '../../lib/expenses'

export const Route = createFileRoute('/expenses/$id/edit')({
  beforeLoad: async () => {
    await requireUser()
  },
  loader: async ({ params }) => {
    const id = Number(params.id)
    const [expense, categories] = await Promise.all([
      getExpense({ data: { id } }),
      listCategories(),
    ])
    return { expense, categories }
  },
  component: EditExpensePage,
})

function EditExpensePage() {
  const { expense, categories } = Route.useLoaderData()
  const navigate = useNavigate()
  const [expenseDate, setExpenseDate] = useState(expense.expense_date)
  const [categoryId, setCategoryId] = useState(expense.category_id)
  const [detail, setDetail] = useState(expense.detail)
  const [amount, setAmount] = useState(String(expense.amount))
  const [notes, setNotes] = useState(expense.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNumber = Number(amount.replace(/[^0-9]/g, ''))
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
        },
      })
      navigate({ to: '/expenses' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Hapus pengeluaran ini?')) return
    setSubmitting(true)
    try {
      await deleteExpense({ data: { id: expense.id } })
      navigate({ to: '/expenses' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus')
      setSubmitting(false)
    }
  }

  return (
    <main className="page container">
      <h1>Edit Pengeluaran</h1>
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
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="notes">Keterangan (opsional)</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <div className="row">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan'}
          </button>
          <button type="button" className="danger" onClick={handleDelete} disabled={submitting}>
            Hapus
          </button>
        </div>
      </form>
    </main>
  )
}
