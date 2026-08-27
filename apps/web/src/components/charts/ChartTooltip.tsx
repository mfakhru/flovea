import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type TooltipAnchor = {
  /** Position within the chart wrapper, in pixels. */
  x: number
  y: number
  content: ReactNode
}

/**
 * Custom tooltip for the dashboard charts.
 *
 * Positioned inside the chart wrapper (which must be `position: relative`)
 * and clamped to its width, so a slice near the left or right edge doesn't
 * push the tooltip off screen on a phone.
 */
export default function ChartTooltip({ anchor }: { anchor: TooltipAnchor | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)

  const anchorX = anchor?.x
  // Depends on the coordinate, not the anchor object: the parent rebuilds
  // that object every render, which would re-run this effect on every frame.
  useEffect(() => {
    if (anchorX === undefined || !ref.current) return
    const tip = ref.current
    const parent = tip.offsetParent as HTMLElement | null
    if (!parent) return

    const half = tip.offsetWidth / 2
    const margin = 8
    const min = margin + half
    const max = parent.clientWidth - margin - half
    // When the chart is narrower than the tooltip, min > max; centring is
    // then the least-bad option rather than pinning to a nonsensical edge.
    const clamped = min > max ? parent.clientWidth / 2 : Math.min(Math.max(anchorX, min), max)
    setOffset(clamped - anchorX)
  }, [anchorX])

  if (!anchor) return null

  return (
    <div
      ref={ref}
      className="chart-tooltip"
      role="tooltip"
      style={{ left: `${anchor.x + offset}px`, top: `${anchor.y}px` }}
    >
      {anchor.content}
    </div>
  )
}

/**
 * Tracks which chart item is active for both pointer and touch.
 *
 * Touch devices have no hover: a tap selects an item and a tap anywhere else
 * clears it, which is why this lives outside the individual charts rather
 * than relying on `onMouseLeave` alone.
 */
export function useChartFocus<T>() {
  const [focused, setFocused] = useState<T | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focused === null) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setFocused(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocused(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [focused])

  return { focused, setFocused, wrapperRef }
}
