import { useMemo, useState } from 'react'
import ChartTooltip, { useChartFocus } from './ChartTooltip'
import type { TooltipAnchor } from './ChartTooltip'
import { buildDonutSlices, formatPercent } from '../../lib/analytics'
import type { CategoryTotal } from '../../lib/expenses'
import { formatRupiah, formatRupiahCompact } from '../../lib/format'

const SIZE = 220
const CX = SIZE / 2
const CY = SIZE / 2
const R_OUTER = 100
const R_INNER = 64

/**
 * Expense breakdown per category.
 *
 * Drawn as hand-rolled SVG rather than a charting library: it keeps the app
 * dependency-free, renders identically under the Worker's SSR, and lets the
 * tooltip be a real DOM node we can position and style — most library
 * tooltips assume a mouse and misbehave on touch.
 */
export default function DonutChart({ data }: { data: CategoryTotal[] }) {
  const { focused, setFocused, wrapperRef } = useChartFocus<number>()
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)

  const slices = useMemo(
    () => buildDonutSlices(data, { cx: CX, cy: CY, rOuter: R_OUTER, rInner: R_INNER }),
    [data],
  )
  const total = useMemo(() => data.reduce((sum, c) => sum + c.total, 0), [data])

  if (slices.length === 0) {
    return <p className="muted">Belum ada pengeluaran untuk periode ini.</p>
  }

  const active = slices.find((s) => s.id === focused) ?? null

  function focus(id: number, e: React.PointerEvent) {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    setPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setFocused(id)
  }

  const anchor: TooltipAnchor | null =
    active && point
      ? {
          x: point.x,
          y: point.y,
          content: (
            <>
              <span className="tip-title">
                <span className="tip-dot" style={{ background: active.color }} />
                {active.label}
              </span>
              <span className="tip-value">{formatRupiah(active.value)}</span>
              <span className="tip-meta">{formatPercent(active.percent)} dari total periode</span>
            </>
          ),
        }
      : null

  return (
    <div className="donut-wrap" ref={wrapperRef}>
      <div className="donut-figure">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="donut-svg"
          role="img"
          aria-label={`Pengeluaran per kategori, total ${formatRupiah(total)}. Rinciannya ada pada daftar di samping grafik.`}
        >
          {slices.map((slice) => (
            <path
              key={slice.id}
              d={slice.path}
              fill={slice.color}
              className={`donut-slice ${focused !== null && focused !== slice.id ? 'is-dimmed' : ''}`}
              onPointerEnter={(e) => focus(slice.id, e)}
              onPointerMove={(e) => focus(slice.id, e)}
              onPointerDown={(e) => focus(slice.id, e)}
              onPointerLeave={(e) => {
                // Leaving with a mouse clears; a touch "leave" fires straight
                // after the tap, which would hide the tooltip instantly.
                if (e.pointerType === 'mouse') setFocused(null)
              }}
            />
          ))}
        </svg>
        <div className="donut-center">
          <span className="donut-center-label">{active ? active.label : 'Total'}</span>
          <span className="donut-center-value">
            <span className="num-full">{formatRupiah(active ? active.value : total)}</span>
            <span className="num-compact">{formatRupiahCompact(active ? active.value : total)}</span>
          </span>
          {active && <span className="donut-center-meta">{formatPercent(active.percent)}</span>}
        </div>
      </div>

      <ul className="donut-legend">
        {slices.map((slice) => (
          <li key={slice.id}>
            <button
              type="button"
              className={`legend-item ${focused === slice.id ? 'is-active' : ''}`}
              onPointerEnter={(e) => focus(slice.id, e)}
              onPointerDown={(e) => focus(slice.id, e)}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setFocused(null)
              }}
            >
              <span className="legend-dot" style={{ background: slice.color }} aria-hidden="true" />
              <span className="legend-name">{slice.label}</span>
              <span className="legend-percent">{formatPercent(slice.percent)}</span>
              <span className="legend-value">{formatRupiahCompact(slice.value)}</span>
            </button>
          </li>
        ))}
      </ul>

      <ChartTooltip anchor={anchor} />
    </div>
  )
}
