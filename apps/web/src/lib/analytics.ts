/**
 * Pure calculation helpers for the Home dashboard.
 *
 * Everything here derives from data the API already returns — no extra
 * endpoint, no invented figures. Kept free of React so the maths stays
 * testable and the chart components stay about drawing.
 */
import type { CategoryTotal, PeriodTotal } from './expenses'
import type { Income } from './incomes'

/**
 * Categorical palette for the donut. Picked to stay distinguishable next to
 * each other on a light surface; the semantic income/expense colours live in
 * styles.css and deliberately aren't reused here, so a category slice is
 * never mistaken for a "pemasukan" or "pengeluaran" cue.
 */
export const CATEGORY_COLORS = [
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#fb7185', // rose
  '#a78bfa', // violet
  '#38bdf8', // sky
  '#84cc16', // lime
  '#fb923c', // orange
]

export function categoryColor(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
}

export type Delta = {
  /** Percent change vs the previous period, rounded to one decimal. */
  percent: number
  direction: 'up' | 'down' | 'flat'
  previous: number
}

/**
 * Percent change from `previous` to `current`.
 *
 * Returns null when there's no previous figure to compare against — a jump
 * from 0 has no meaningful percentage, and showing "+∞%" or "+100%" there
 * would be inventing a trend that doesn't exist. Callers render a plain
 * "periode pertama" instead.
 */
export function computeDelta(current: number, previous: number): Delta | null {
  if (previous <= 0) return null
  const raw = ((current - previous) / previous) * 100
  const percent = Math.round(raw * 10) / 10
  return {
    percent,
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
    previous,
  }
}

/** Share of `total` as a percentage, guarded against a zero total. */
export function share(value: number, total: number) {
  if (total <= 0) return 0
  return (value / total) * 100
}

/** "12,4%" — one decimal, Indonesian comma, trailing ",0" dropped. */
export function formatPercent(value: number, withSign = false) {
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded)
    ? String(Math.abs(rounded))
    : Math.abs(rounded).toFixed(1).replace('.', ',')
  const sign = withSign ? (rounded > 0 ? '+' : rounded < 0 ? '−' : '') : ''
  return `${sign}${text}%`
}

/**
 * The period immediately before `active` **that actually has data**, taken
 * from the API's pay-period list (sorted newest first). Using the list rather
 * than subtracting a month means a gap in the data doesn't produce a
 * comparison against an empty period.
 */
export function previousPeriod(payPeriods: string[], active: string | undefined) {
  if (!active) return undefined
  const index = payPeriods.indexOf(active)
  if (index < 0) return undefined
  return payPeriods[index + 1]
}

export type DonutSlice = {
  id: number
  label: string
  value: number
  percent: number
  color: string
  path: string
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

function slicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  const o1 = polar(cx, cy, rOuter, startAngle)
  const o2 = polar(cx, cy, rOuter, endAngle)
  const i2 = polar(cx, cy, rInner, endAngle)
  const i1 = polar(cx, cy, rInner, startAngle)
  return [
    `M ${o1.x.toFixed(3)} ${o1.y.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${o2.x.toFixed(3)} ${o2.y.toFixed(3)}`,
    `L ${i2.x.toFixed(3)} ${i2.y.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${i1.x.toFixed(3)} ${i1.y.toFixed(3)}`,
    'Z',
  ].join(' ')
}

/**
 * Turns category totals into ready-to-draw donut slices.
 *
 * `gap` leaves a hairline between slices so adjacent colours stay readable.
 * A lone 100% category would make start and end angles coincide (drawing
 * nothing at all), so a full sweep is capped just short of 360°.
 */
export function buildDonutSlices(
  categories: CategoryTotal[],
  options: { cx: number; cy: number; rOuter: number; rInner: number; gap?: number },
): DonutSlice[] {
  const { cx, cy, rOuter, rInner, gap = 1.5 } = options
  const total = categories.reduce((sum, c) => sum + c.total, 0)
  if (total <= 0) return []

  let angle = 0
  return categories.map((category, index) => {
    const sweep = (category.total / total) * 360
    const start = angle
    const end = Math.min(angle + sweep, 359.99)
    angle += sweep
    // Skip the gap on slivers that are thinner than the gap itself, which
    // would otherwise invert into a backwards arc.
    const inset = sweep > gap * 2 ? gap / 2 : 0
    return {
      id: category.category_id,
      label: category.category_name,
      value: category.total,
      percent: share(category.total, total),
      color: categoryColor(index),
      path: slicePath(cx, cy, rOuter, rInner, start + inset, end - inset),
    }
  })
}

export type TrendPoint = {
  key: string
  income: number
  expense: number
}

/**
 * Pairs each expense period with its recorded income.
 *
 * In yearly mode `/expenses/by-period` already rolls periods up to `YYYY`,
 * but incomes are always stored per `YYYY-MM` — so they're summed by year
 * here to line the two series up. Periods with no income recorded yet come
 * through as 0 and are drawn as an empty slot, never as a guess.
 */
export function buildTrend(
  byPeriod: PeriodTotal[],
  incomes: Income[],
  byYear: boolean,
): TrendPoint[] {
  const incomeByKey = new Map<string, number>()
  for (const income of incomes) {
    const key = byYear ? income.pay_period.slice(0, 4) : income.pay_period
    incomeByKey.set(key, (incomeByKey.get(key) ?? 0) + income.amount)
  }
  return byPeriod.map((period) => ({
    key: period.pay_period,
    income: incomeByKey.get(period.pay_period) ?? 0,
    expense: period.total,
  }))
}
