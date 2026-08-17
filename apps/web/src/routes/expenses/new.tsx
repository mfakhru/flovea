import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { requireUser } from '../../lib/auth'
import { createCategory, createExpense, listCategories } from '../../lib/expenses'
import type { Category } from '../../lib/expenses'

export const Route = createFileRoute('/expenses/new')({
  beforeLoad: async () => {
    await requireUser()
  },
  loader: async () => ({ categories: await listCategories() }),
  component: NewExpensePage,
})

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatThousands(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function NewExpensePage() {
  const { categories: initialCategories } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [expenseDate, setExpenseDate] = useState(todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>(categories[0]?.id ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [detail, setDetail] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [needsReimburse, setNeedsReimburse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^0-9]/g, '')
    setAmount(formatThousands(digits))
  }

  async function handleAddCategory() {
    const name = newCategory.trim()
    if (!name) return
    try {
      const category = await createCategory({ data: { name } })
      setCategories((prev) => [...prev, category].sort((a, b) => a.name.localeCompare(b.name)))
      setCategoryId(category.id)
      setNewCategory('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah kategori')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!categoryId) {
      setError('Pilih kategori dulu')
      return
    }
    const amountNumber = Number(amount.replace(/\./g, ''))
    if (!amountNumber) {
      setError('Nominal tidak valid')
      return
    }
    setSubmitting(true)
    try {
      await createExpense({
        data: {
          category_id: categoryId,
          expense_date: expenseDate,
          detail,
          amount: amountNumber,
          notes: notes || null,
          needs_reimburse: needsReimburse,
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

  return (
    <main className="page container">
      <div className="page-head">
        <div>
          <h1>Tambah Pengeluaran</h1>
          <p className="page-subtitle">Catat pengeluaran baru</p>
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
          <div className="row" style={{ marginTop: '0.5rem', flexWrap: 'nowrap' }}>
            <input
              placeholder="Kategori baru..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button
              type="button"
              className="secondary"
              onClick={handleAddCategory}
              disabled={!newCategory.trim()}
            >
              Tambah
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="detail">Untuk</label>
          <input
            id="detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Makan siang, bensin, ..."
            required
          />
        </div>

        <div className="field">
          <label htmlFor="amount">Nominal (Rp)</label>
          <input
            id="amount"
            inputMode="numeric"
            value={amount}
            onChange={handleAmountChange}
            placeholder="0"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="notes">Keterangan (opsional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Catatan tambahan..."
          />
        </div>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={needsReimburse}
            onChange={(e) => setNeedsReimburse(e.target.checked)}
          />
          Perlu direimburse pasangan
        </label>

        <div className="row">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate({ to: '/expenses' })}>
            Batal
          </button>
        </div>
      </form>
    </main>
  )
}
