import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { requireUser } from '../lib/auth'
import { addAdjustment, deleteAdjustment, getBalance, setOpeningBalance } from '../lib/balance'
import { formatPeriod, formatPeriodShort, formatRupiah, formatRupiahCompact } from '../lib/format'
import AmountSheet, { groupDigits, parseDigits } from '../components/AmountSheet'
import IncomeCard from '../components/IncomeCard'
import StatCard from '../components/StatCard'

type SaldoSearch = { period?: string }

/** The calendar month as a pay period, so a month with nothing recorded yet
 * can still be picked and filled in. */
function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export const Route = createFileRoute('/saldo')({
  validateSearch: (search: Record<string, unknown>): SaldoSearch => ({
    period: search.period ? String(search.period) : undefined,
  }),
  beforeLoad: async () => {
    await requireUser()
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const recap = await getBalance()
    // The ledger only knows periods something was recorded in. The current
    // month is offered too, so "uang diterima" for a fresh month can be filled
    // in before the first expense of that month exists.
    const periods = [...new Set([currentPeriod(), ...recap.rows.map((r) => r.pay_period)])].sort(
      (a, b) => b.localeCompare(a),
    )
    return { recap, periods, activePeriod: deps.period ?? periods[0] }
  },
  component: SaldoPage,
})

function SignedAmount({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = value > 0 ? 'amount-plus' : value < 0 ? 'amount-minus' : 'muted'
  const sign = value > 0 ? '+' : ''
  const text = compact ? formatRupiahCompact(value) : formatRupiah(value)
  return <span className={tone}>{value === 0 ? '—' : `${sign}${text}`}</span>
}

function SaldoPage() {
  const search = Route.useSearch()
  const { recap, periods, activePeriod } = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()

  const [openingOpen, setOpeningOpen] = useState(false)
  const [adjPeriod, setAdjPeriod] = useState(activePeriod)
  const [adjDirection, setAdjDirection] = useState<'in' | 'out'>('out')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjNote, setAdjNote] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)
  const [adjError, setAdjError] = useState<string | null>(null)

  const activeRow = recap.rows.find((r) => r.pay_period === activePeriod)
  // A period with no ledger row yet carries the balance of the last period
  // before it — not zero, which would read as "all the money is gone".
  const balanceAt =
    activeRow?.closing_balance ??
    recap.rows.find((r) => r.pay_period < (activePeriod ?? ''))?.closing_balance ??
    recap.opening_balance
  const isLatest = !recap.rows.some((r) => r.pay_period > (activePeriod ?? ''))
  const oldestPeriod = recap.rows[recap.rows.length - 1]?.pay_period

  async function handleAddAdjustment(e: React.FormEvent) {
    e.preventDefault()
    const magnitude = parseDigits(adjAmount)
    if (!magnitude) {
      setAdjError('Nominal koreksi wajib diisi')
      return
    }
    if (!adjNote.trim()) {
      setAdjError('Keterangan wajib diisi')
      return
    }
    setAdjSaving(true)
    setAdjError(null)
    try {
      await addAdjustment({
        data: {
          pay_period: adjPeriod,
          amount: adjDirection === 'out' ? -magnitude : magnitude,
          note: adjNote.trim(),
        },
      })
      setAdjAmount('')
      setAdjNote('')
      await router.invalidate()
    } catch (err) {
      setAdjError(err instanceof Error ? err.message : 'Gagal menyimpan koreksi')
    } finally {
      setAdjSaving(false)
    }
  }

  async function handleDeleteAdjustment(id: number) {
    if (!confirm('Hapus koreksi ini?')) return
    await deleteAdjustment({ data: { id } })
    await router.invalidate()
  }

  return (
    <main className="page container">
      <div className="page-head">
        <div>
          <h1>Saldo Istri</h1>
          <p className="page-subtitle">
            Uang diterima dikurangi pengeluaran, dibawa terus dari periode ke periode
          </p>
        </div>
        <div className="field period-picker">
          <select
            aria-label="Periode gajian"
            value={search.period ?? activePeriod ?? ''}
            onChange={(e) => navigate({ search: { period: e.target.value || undefined } })}
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                {formatPeriod(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="stat-row">
        <StatCard
          tone={balanceAt < 0 ? 'warn' : 'balance'}
          icon={balanceAt < 0 ? '⚠️' : '🏦'}
          label="Saldo"
          value={balanceAt}
          footer={
            <span className="delta delta-neutral">
              {activePeriod
                ? `s/d ${formatPeriod(activePeriod)}${isLatest ? ' · terbaru' : ''}`
                : 'Belum ada periode'}
            </span>
          }
        />
        <IncomeCard
          variant="istri"
          payPeriod={activePeriod}
          amount={activeRow?.received ?? 0}
          footer={
            activeRow ? (
              <span className="delta delta-neutral">
                Keluar {formatRupiahCompact(activeRow.spent)}
              </span>
            ) : (
              <span className="delta delta-empty">Belum ada catatan periode ini</span>
            )
          }
        />
        <StatCard
          tone={(activeRow?.net ?? 0) < 0 ? 'warn' : 'income'}
          icon={(activeRow?.net ?? 0) < 0 ? '📉' : '📈'}
          label="Sisa periode ini"
          value={activeRow?.net ?? 0}
          placeholder={activeRow ? undefined : '—'}
          footer={
            activeRow ? (
              <span className="delta delta-neutral">
                {activeRow.net < 0 ? 'Terpakai dari saldo lama' : 'Ditambahkan ke saldo'}
              </span>
            ) : (
              <span className="delta delta-empty">Belum ada catatan periode ini</span>
            )
          }
        />
        {recap.pending_reimburse > 0 && (
          <StatCard
            tone="warn"
            icon="🔁"
            label="Belum dibayarkan"
            value={recap.pending_reimburse}
            footer={
              <span className="delta delta-neutral">
                {recap.pending_count} transaksi Suami · belum mengurangi saldo
              </span>
            }
          />
        )}
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Rekap per Periode</h2>
        </div>
        {recap.rows.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              🗒️
            </span>
            <p>Belum ada periode tercatat. Isi uang diterima di atas untuk memulai.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <div className="table-scroll">
              <table className="expenses-table ledger-table">
                <thead>
                  <tr>
                    <th>Periode</th>
                    <th className="amount">Diterima</th>
                    <th className="amount">Keluar</th>
                    <th className="amount">Koreksi</th>
                    <th className="amount">Sisa</th>
                    <th className="amount">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.rows.map((row) => (
                    <tr
                      key={row.pay_period}
                      className={row.pay_period === activePeriod ? 'is-active' : undefined}
                      onClick={() =>
                        navigate({ search: { period: row.pay_period } })
                      }
                    >
                      <td>{formatPeriodShort(row.pay_period)}</td>
                      <td className="amount">
                        {row.received > 0 ? (
                          formatRupiah(row.received)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="amount">
                        {row.spent > 0 ? formatRupiah(row.spent) : <span className="muted">—</span>}
                      </td>
                      <td className="amount">
                        <SignedAmount value={row.adjustment} />
                      </td>
                      <td className="amount">
                        <SignedAmount value={row.net} />
                      </td>
                      <td className={`amount ${row.closing_balance < 0 ? 'amount-minus' : ''}`}>
                        <strong>{formatRupiah(row.closing_balance)}</strong>
                      </td>
                    </tr>
                  ))}
                  {/* The opening balance closes the table because the rows run
                      newest first — read bottom-up, it is where the running
                      figure in the last column starts from. */}
                  <tr className="ledger-opening">
                    <td colSpan={5}>
                      Saldo awal
                      {oldestPeriod ? ` (sebelum ${formatPeriod(oldestPeriod)})` : ''}
                      <button
                        type="button"
                        className="link-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpeningOpen(true)
                        }}
                      >
                        Ubah
                      </button>
                    </td>
                    <td className="amount">
                      <strong>{formatRupiah(recap.opening_balance)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Koreksi Manual</h2>
        </div>
        <p className="muted">
          Untuk uang yang pindah tanpa jadi pengeluaran — misal disimpan ke tabungan, atau uang
          kembali. Dicatat di sini supaya saldo cocok dengan uang riil tanpa membuat pengeluaran
          palsu.
        </p>

        <form className="adjust-form" onSubmit={handleAddAdjustment}>
          <div className="field">
            <label htmlFor="adj-period">Periode</label>
            <select
              id="adj-period"
              value={adjPeriod}
              onChange={(e) => setAdjPeriod(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p} value={p}>
                  {formatPeriod(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="adj-amount">Nominal</label>
            <div className="segmented adjust-direction">
              <button
                type="button"
                className={adjDirection === 'out' ? 'btn-sm is-active' : 'secondary btn-sm'}
                onClick={() => setAdjDirection('out')}
              >
                Kurang
              </button>
              <button
                type="button"
                className={adjDirection === 'in' ? 'btn-sm is-active' : 'secondary btn-sm'}
                onClick={() => setAdjDirection('in')}
              >
                Tambah
              </button>
            </div>
            <div className="input-prefix">
              <span aria-hidden="true">Rp</span>
              <input
                id="adj-amount"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={adjAmount}
                onChange={(e) => setAdjAmount(groupDigits(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="adj-note">Keterangan</label>
            <input
              id="adj-note"
              autoComplete="off"
              placeholder="Pindah ke tabungan"
              value={adjNote}
              onChange={(e) => setAdjNote(e.target.value)}
            />
          </div>
          {adjError && <p className="error">{adjError}</p>}
          <button type="submit" className="btn" disabled={adjSaving}>
            {adjSaving ? 'Menyimpan...' : 'Tambah koreksi'}
          </button>
        </form>

        {recap.adjustments.length > 0 && (
          <ul className="adjust-list">
            {recap.adjustments.map((adj) => (
              <li key={adj.id}>
                <span className="adjust-period">{formatPeriodShort(adj.pay_period)}</span>
                <span className="adjust-note">{adj.note}</span>
                <SignedAmount value={adj.amount} compact />
                <button
                  type="button"
                  className="link-button danger"
                  onClick={() => handleDeleteAdjustment(adj.id)}
                  aria-label={`Hapus koreksi ${adj.note}`}
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openingOpen && (
        <AmountSheet
          title="Saldo awal"
          fieldLabel="Saldo Istri sebelum periode pertama tercatat"
          hint="Uang yang sudah dipegang sebelum aplikasi ini mulai mencatat. Semua saldo di tabel dihitung dari angka ini."
          value={recap.opening_balance}
          onClose={() => setOpeningOpen(false)}
          onSave={async (value) => {
            await setOpeningBalance({ data: { amount: value } })
            await router.invalidate()
            setOpeningOpen(false)
          }}
        />
      )}
    </main>
  )
}
