import type { ReactNode } from 'react'
import CountUp from './CountUp'
import { formatRupiah, formatRupiahCompact } from '../lib/format'

export type StatTone = 'income' | 'expense' | 'balance' | 'warn' | 'neutral'

/**
 * One summary figure: soft-tinted round icon, label, animated amount, and an
 * optional footer for a delta badge or an action button.
 */
export default function StatCard({
  tone,
  icon,
  label,
  value,
  placeholder,
  footer,
  action,
}: {
  tone: StatTone
  icon: string
  label: string
  value: number
  /**
   * Shown instead of the figure when it can't be computed yet. Keeps an
   * unknown value from rendering as a real (and alarming) number — a "Sisa"
   * with no income recorded is unknown, not a large negative balance.
   */
  placeholder?: string
  footer?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-card-top">
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
        {action}
      </div>
      <span className="stat-label">{label}</span>
      {placeholder ? (
        <span className="stat-value stat-value-empty">{placeholder}</span>
      ) : (
        <CountUp
          className="stat-value"
          value={value}
          format={formatRupiah}
          formatCompact={formatRupiahCompact}
        />
      )}
      {footer && <div className="stat-footer">{footer}</div>}
    </div>
  )
}
