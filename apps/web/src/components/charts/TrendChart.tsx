import { useMemo, useState } from 'react'
import ChartTooltip, { useChartFocus } from './ChartTooltip'
import type { TooltipAnchor } from './ChartTooltip'
import type { TrendPoint } from '../../lib/analytics'
import { formatPeriod, formatRupiah, formatRupiahCompact } from '../../lib/format'

/**
 * Income vs expense across salary periods.
 *
 * Built from CSS-sized bars rather than a fixed SVG viewBox so the plot can
 * scroll horizontally on a phone while every bar keeps a readable width —
 * squeezing 12 periods × 2 bars into 360px would make them illegible. Mirrors
 * the horizontal-scroll pattern the Riwayat table already uses.
 */
export default function TrendChart({
  points,
  byYear,
}: {
  points: TrendPoint[]
  byYear: boolean
}) {
  const { focused, setFocused, wrapperRef } = useChartFocus<string>()
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)

  const max = useMemo(
    () => Math.max(1, ...points.flatMap((p) => [p.income, p.expense])),
    [points],
  )

  if (points.length === 0) {
    return <p className="muted">Belum ada pengeluaran yang ditandai periode gajian.</p>
  }

  const label = (key: string) => (byYear ? key : formatPeriod(key))
  const shortLabel = (key: string) => (byYear ? key : formatPeriod(key).slice(0, 3))

  const active = points.find((p) => p.key === focused) ?? null

  function focus(key: string, e: React.PointerEvent) {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    setPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setFocused(key)
  }

  const anchor: TooltipAnchor | null =
    active && point
      ? {
          x: point.x,
          y: point.y,
          content: (
            <>
              <span className="tip-title">{label(active.key)}</span>
              <span className="tip-row">
                <span className="tip-dot tip-dot-income" />
                Pemasukan
                <strong>
                  {active.income > 0 ? formatRupiah(active.income) : 'Belum diatur'}
                </strong>
              </span>
              <span className="tip-row">
                <span className="tip-dot tip-dot-expense" />
                Pengeluaran
                <strong>{formatRupiah(active.expense)}</strong>
              </span>
              {active.income > 0 && (
                <span className="tip-meta">
                  Sisa {formatRupiah(active.income - active.expense)}
                </span>
              )}
            </>
          ),
        }
      : null

  return (
    <div className="trend-wrap" ref={wrapperRef}>
      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="legend-dot legend-dot-income" aria-hidden="true" /> Pemasukan
        </span>
        <span className="chart-legend-item">
          <span className="legend-dot legend-dot-expense" aria-hidden="true" /> Pengeluaran
        </span>
      </div>

      <div className="trend-body">
        <div className="trend-axis" aria-hidden="true">
          <span>{formatRupiahCompact(max)}</span>
          <span>{formatRupiahCompact(max / 2)}</span>
          <span>0</span>
        </div>

        <div className="trend-scroll">
          <div className="trend-plot">
            <div className="trend-grid" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            {points.map((p) => (
              <div
                key={p.key}
                className={`trend-group ${focused === p.key ? 'is-active' : ''} ${
                  focused !== null && focused !== p.key ? 'is-dimmed' : ''
                }`}
                onPointerEnter={(e) => focus(p.key, e)}
                onPointerMove={(e) => focus(p.key, e)}
                onPointerDown={(e) => focus(p.key, e)}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse') setFocused(null)
                }}
              >
                <div className="trend-bars">
                  {p.income > 0 ? (
                    <div
                      className="trend-bar trend-bar-income"
                      style={{ height: `${Math.max(2, (p.income / max) * 100)}%` }}
                    />
                  ) : (
                    // An unset period gets a dashed placeholder rather than a
                    // zero-height bar, so "belum diisi" is visibly different
                    // from "tidak ada pemasukan".
                    <div className="trend-bar trend-bar-unset" title="Pemasukan belum diatur" />
                  )}
                  <div
                    className="trend-bar trend-bar-expense"
                    style={{ height: `${Math.max(2, (p.expense / max) * 100)}%` }}
                  />
                </div>
                <span className="trend-label">
                  <span className="num-full">{label(p.key)}</span>
                  <span className="num-compact">{shortLabel(p.key)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {points.length > 4 && <p className="chart-hint">↔ Geser grafik buat lihat periode lainnya</p>}

      <ChartTooltip anchor={anchor} />
    </div>
  )
}
