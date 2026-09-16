import { useEffect, useRef, useState } from 'react'

/** Digits only, grouped with dots as you type: 12400000 → "12.400.000". */
export function groupDigits(raw: string) {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** The digits back out of a grouped input. */
export function parseDigits(grouped: string) {
  return Number(grouped.replace(/\D/g, ''))
}

/**
 * The modal used everywhere a single rupiah figure is edited in place —
 * household income and Istri's received amount on Home, and the "Diterima"
 * cell on the Saldo ledger.
 *
 * Shared rather than copied because all three are the same interaction:
 * one prefilled numeric field, save-or-cancel, Escape to close. The caller
 * owns the amount and the saving, so this component never knows which
 * endpoint it is writing to.
 */
export default function AmountSheet({
  title,
  fieldLabel,
  hint,
  value,
  onSave,
  onClose,
}: {
  title: string
  fieldLabel: string
  hint?: string
  value: number
  onSave: (amount: number) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() => (value > 0 ? groupDigits(String(value)) : ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseDigits(draft)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Nominal tidak valid')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(amount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan')
      setSaving(false)
    }
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="amount-sheet-title">
        <div className="sheet-head">
          <h2 id="amount-sheet-title">{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>
        <form className="sheet-body" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="amount-sheet-input">{fieldLabel}</label>
            <div className="input-prefix">
              <span aria-hidden="true">Rp</span>
              <input
                id="amount-sheet-input"
                ref={inputRef}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={draft}
                onChange={(e) => setDraft(groupDigits(e.target.value))}
              />
            </div>
            {hint && <p className="field-hint">{hint}</p>}
          </div>
          {error && <p className="error">{error}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
