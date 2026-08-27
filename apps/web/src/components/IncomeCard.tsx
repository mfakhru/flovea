import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import CountUp from './CountUp'
import { setIncome } from '../lib/incomes'
import { formatPeriod, formatRupiah, formatRupiahCompact } from '../lib/format'

/** Digits only, grouped with dots as you type: 12400000 → "12.400.000". */
function groupDigits(raw: string) {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * The one place household income is entered — once per salary period, from
 * the period already selected on Home.
 *
 * A period with nothing recorded shows a prompt rather than "Rp 0", so an
 * unfilled period never reads as a month where nothing came in.
 */
export default function IncomeCard({
  payPeriod,
  amount,
  footer,
}: {
  payPeriod: string | undefined
  amount: number
  footer?: ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => (amount > 0 ? groupDigits(String(amount)) : ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-seed the form when the period changes underneath it, so switching
  // periods with the sheet closed doesn't leave a stale figure in the draft.
  useEffect(() => {
    setDraft(amount > 0 ? groupDigits(String(amount)) : '')
  }, [amount, payPeriod])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!payPeriod) return
    const value = Number(draft.replace(/\D/g, ''))
    if (!Number.isFinite(value) || value < 0) {
      setError('Nominal tidak valid')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setIncome({ data: { pay_period: payPeriod, amount: value } })
      await router.invalidate()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pemasukan')
    } finally {
      setSaving(false)
    }
  }

  const isEmpty = amount <= 0

  return (
    <>
      <div className="stat-card stat-income">
        <div className="stat-card-top">
          <span className="stat-icon" aria-hidden="true">
            💰
          </span>
          {payPeriod && !isEmpty && (
            <button
              type="button"
              className="stat-action"
              onClick={() => setOpen(true)}
              aria-label={`Ubah pemasukan ${formatPeriod(payPeriod)}`}
            >
              ✎
            </button>
          )}
        </div>
        <span className="stat-label">Pemasukan</span>
        {isEmpty ? (
          <button
            type="button"
            className="stat-empty-action"
            onClick={() => setOpen(true)}
            disabled={!payPeriod}
          >
            + Atur pemasukan
          </button>
        ) : (
          <CountUp
            className="stat-value"
            value={amount}
            format={formatRupiah}
            formatCompact={formatRupiahCompact}
          />
        )}
        {footer && <div className="stat-footer">{footer}</div>}
      </div>

      {open && payPeriod && (
        <div
          className="sheet-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="income-sheet-title">
            <div className="sheet-head">
              <h2 id="income-sheet-title">Pemasukan {formatPeriod(payPeriod)}</h2>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            <form className="sheet-body" onSubmit={handleSave}>
              <div className="field">
                <label htmlFor="income-amount">Total pemasukan rumah tangga</label>
                <div className="input-prefix">
                  <span aria-hidden="true">Rp</span>
                  <input
                    id="income-amount"
                    ref={inputRef}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={draft}
                    onChange={(e) => setDraft(groupDigits(e.target.value))}
                  />
                </div>
                <p className="field-hint">
                  Diisi sekali per periode gajian. Menyimpan lagi akan menimpa nilai sebelumnya.
                </p>
              </div>
              {error && <p className="error">{error}</p>}
              <div className="sheet-actions">
                <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
