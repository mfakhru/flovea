import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number up to its value on mount / whenever it changes.
 *
 * Renders the final value on the server and on the first client paint, so
 * SSR markup matches hydration and the real figure is never hidden behind an
 * animation that failed to run. Respects prefers-reduced-motion by skipping
 * the animation entirely.
 */
export default function CountUp({
  value,
  format,
  formatCompact,
  duration = 750,
  className,
}: {
  value: number
  format: (value: number) => string
  /**
   * Optional shorter rendering for narrow screens. Both are emitted and CSS
   * picks one, rather than measuring the viewport in JS — that keeps the
   * server and client markup identical.
   */
  formatCompact?: (value: number) => string
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = useState(value)
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || duration <= 0 || value === 0) {
      setDisplay(value)
      return
    }

    const from = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      // ease-out cubic — fast at first, settles gently on the real figure
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  if (!formatCompact) {
    return <span className={className}>{format(display)}</span>
  }

  return (
    <span className={className}>
      <span className="num-full">{format(display)}</span>
      <span className="num-compact">{formatCompact(display)}</span>
    </span>
  )
}
