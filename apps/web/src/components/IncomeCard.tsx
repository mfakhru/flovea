import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import AmountSheet from './AmountSheet'
import CountUp from './CountUp'
import { setIncome, setIstriIncome } from '../lib/incomes'
import { formatPeriod, formatRupiah, formatRupiahCompact } from '../lib/format'

/**
 * The two per-period figures that are typed in by hand rather than derived
 * from expenses. Both are entered exactly the same way, so they share a card
 * and differ only in the copy and the endpoint they save to.
 */
const VARIANTS = {
  /** Total household income — feeds the Home "Sisa" card and trend chart. */
  household: {
    tone: 'income',
    icon: '💰',
    label: 'Pemasukan',
    sheetTitle: 'Pemasukan',
    fieldLabel: 'Total pemasukan rumah tangga',
    hint: 'Diisi sekali per periode gajian. Menyimpan lagi akan menimpa nilai sebelumnya.',
    emptyAction: '+ Atur pemasukan',
  },
  /** The slice handed to Istri — the "diterima" side of the Saldo ledger. */
  istri: {
    tone: 'allowance',
    icon: '👛',
    label: 'Diterima Istri',
    sheetTitle: 'Uang diterima Istri',
    fieldLabel: 'Uang yang diterima Istri periode ini',
    hint: 'Dasar perhitungan saldo. Sisa periode ini otomatis terbawa ke periode berikutnya.',
    emptyAction: '+ Atur uang diterima',
  },
} as const

export type IncomeVariant = keyof typeof VARIANTS

/**
 * The one place a per-period income figure is entered, for the period already
 * selected on the page around it.
 *
 * A period with nothing recorded shows a prompt rather than "Rp 0", so an
 * unfilled period never reads as a month where nothing came in.
 */
export default function IncomeCard({
  payPeriod,
  amount,
  footer,
  variant = 'household',
}: {
  payPeriod: string | undefined
  amount: number
  footer?: ReactNode
  variant?: IncomeVariant
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const config = VARIANTS[variant]

  // Branching on the variant here rather than storing the server fn in
  // VARIANTS: the two are separate `createServerFn` values, and calling them
  // through a union type doesn't narrow.
  async function persist(period: string, value: number) {
    const input = { data: { pay_period: period, amount: value } }
    if (variant === 'istri') await setIstriIncome(input)
    else await setIncome(input)
  }

  const isEmpty = amount <= 0

  return (
    <>
      <div className={`stat-card stat-${config.tone}`}>
        <div className="stat-card-top">
          <span className="stat-icon" aria-hidden="true">
            {config.icon}
          </span>
          {payPeriod && !isEmpty && (
            <button
              type="button"
              className="stat-action"
              onClick={() => setOpen(true)}
              aria-label={`Ubah ${config.label.toLowerCase()} ${formatPeriod(payPeriod)}`}
            >
              ✎
            </button>
          )}
        </div>
        <span className="stat-label">{config.label}</span>
        {isEmpty ? (
          <button
            type="button"
            className="stat-empty-action"
            onClick={() => setOpen(true)}
            disabled={!payPeriod}
          >
            {config.emptyAction}
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
        <AmountSheet
          title={`${config.sheetTitle} ${formatPeriod(payPeriod)}`}
          fieldLabel={config.fieldLabel}
          hint={config.hint}
          value={amount}
          onClose={() => setOpen(false)}
          onSave={async (value) => {
            await persist(payPeriod, value)
            await router.invalidate()
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
