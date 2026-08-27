import type { Delta } from '../lib/analytics'
import { formatPercent } from '../lib/analytics'

/**
 * Arrow + percentage change vs the previous period.
 *
 * `goodDirection` decouples the arrow from the colour: spending more is a
 * rise but reads as a warning, while earning more is a rise that reads as
 * good. Without it every "up" would be tinted the same way and the colour
 * would stop meaning anything.
 */
export default function DeltaBadge({
  delta,
  goodDirection = 'down',
  label = 'dari periode lalu',
  emptyLabel = 'Periode pertama',
}: {
  delta: Delta | null
  goodDirection?: 'up' | 'down'
  label?: string
  emptyLabel?: string
}) {
  if (!delta) {
    return <span className="delta delta-empty">{emptyLabel}</span>
  }

  const tone =
    delta.direction === 'flat' ? 'flat' : delta.direction === goodDirection ? 'good' : 'bad'
  const arrow = delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'

  return (
    <span className={`delta delta-${tone}`}>
      <span className="delta-arrow" aria-hidden="true">
        {arrow}
      </span>
      {formatPercent(delta.percent)}
      <span className="delta-label">{label}</span>
    </span>
  )
}
