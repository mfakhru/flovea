import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireUser } from '../lib/auth'
import {
  getExpensesByCategory,
  getExpensesByPeriod,
  getExpensesSummary,
  listPayPeriods,
} from '../lib/expenses'
import type { CategoryTotal } from '../lib/expenses'
import { getIncome, listIncomes } from '../lib/incomes'
import { buildTrend, computeDelta, formatPercent, previousPeriod, share } from '../lib/analytics'
import { formatPeriod, formatRupiah, formatRupiahCompact } from '../lib/format'
import CountUp from '../components/CountUp'
import DeltaBadge from '../components/DeltaBadge'
import StatCard from '../components/StatCard'
import IncomeCard from '../components/IncomeCard'
import DonutChart from '../components/charts/DonutChart'
import TrendChart from '../components/charts/TrendChart'

type HomeSearch = {
  period?: string
  trend?: 'year'
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    period: search.period ? String(search.period) : undefined,
    trend: search.trend === 'year' ? 'year' : undefined,
  }),
  beforeLoad: async () => {
    await requireUser()
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const payPeriods = await listPayPeriods()
    const activePeriod = deps.period ?? payPeriods[0]
    const byYear = deps.trend === 'year'
    // The previous period with actual data — used for every "vs periode lalu"
    // comparison on this page.
    const prevPeriod = previousPeriod(payPeriods, activePeriod)

    const [summary, byCategory, byPeriod, incomes, income, prevSummary, prevByCategory] =
      await Promise.all([
        getExpensesSummary({ data: { pay_period: activePeriod } }),
        getExpensesByCategory({ data: { pay_period: activePeriod } }),
        // 12 keeps the monthly view readable on a phone; the yearly roll-up
        // is only a handful of bars, so it can show every year on record.
        getExpensesByPeriod({ data: { limit: byYear ? 20 : 12, group: byYear ? 'year' : 'month' } }),
        listIncomes(),
        activePeriod ? getIncome({ data: { pay_period: activePeriod } }) : { amount: 0 },
        prevPeriod
          ? getExpensesSummary({ data: { pay_period: prevPeriod } })
          : null,
        prevPeriod
          ? getExpensesByCategory({ data: { pay_period: prevPeriod } })
          : null,
      ])

    return {
      payPeriods,
      activePeriod,
      prevPeriod,
      summary,
      byCategory,
      byPeriod,
      incomes,
      income: income.amount,
      prevSummary,
      prevByCategory,
      byYear,
    }
  },
  component: HomePage,
})

/** Total outgoings for a period: both users plus the special-case bucket,
 * which `/expenses/summary` deliberately keeps out of either user's total. */
function totalSpend(summary: { by_user: Array<{ total: number }>; special_case_total: number }) {
  return summary.by_user.reduce((sum, u) => sum + u.total, 0) + summary.special_case_total
}

function HomePage() {
  const search = Route.useSearch()
  const {
    payPeriods,
    activePeriod,
    prevPeriod,
    summary,
    byCategory,
    byPeriod,
    incomes,
    income,
    prevSummary,
    prevByCategory,
    byYear,
  } = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })

  const suamiTotal = summary.by_user.find((u) => u.display_name === 'Suami')?.total ?? 0
  const istriTotal = summary.by_user.find((u) => u.display_name === 'Istri')?.total ?? 0
  const spend = totalSpend(summary)
  const remaining = income - spend

  const spendDelta = computeDelta(spend, prevSummary ? totalSpend(prevSummary) : 0)
  const incomeForPeriod = (period: string | undefined) =>
    incomes.find((i) => i.pay_period === period)?.amount ?? 0
  const incomeDelta = computeDelta(income, incomeForPeriod(prevPeriod))

  const top: CategoryTotal | undefined = byCategory[0]
  const topShare = top ? share(top.total, spend) : 0
  const topPrev = top ? prevByCategory?.find((c) => c.category_id === top.category_id) : undefined
  const topDelta = top ? computeDelta(top.total, topPrev?.total ?? 0) : null

  const trend = buildTrend(byPeriod, incomes, byYear)

  return (
    <main className="page container">
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p className="page-subtitle">Ringkasan &amp; visualisasi keuangan rumah tangga</p>
        </div>
        <div className="field period-picker">
          <select
            aria-label="Periode gajian"
            value={search.period ?? activePeriod ?? ''}
            onChange={(e) => navigate({ search: { period: e.target.value || undefined } })}
          >
            {!activePeriod && <option value="">Belum ada periode</option>}
            {payPeriods.map((p: string) => (
              <option key={p} value={p}>
                {formatPeriod(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="stat-row">
        <IncomeCard
          payPeriod={activePeriod}
          amount={income}
          footer={
            income > 0 ? (
              <DeltaBadge delta={incomeDelta} goodDirection="up" />
            ) : (
              <span className="delta delta-empty">Belum diatur untuk periode ini</span>
            )
          }
        />
        <StatCard
          tone="expense"
          icon="🛒"
          label="Pengeluaran"
          value={spend}
          footer={<DeltaBadge delta={spendDelta} goodDirection="down" />}
        />
        <StatCard
          // With no income recorded the balance is unknown, not negative —
          // showing "−Rp 3,5 jt" there would invent a deficit.
          tone={income <= 0 ? 'neutral' : remaining < 0 ? 'warn' : 'balance'}
          icon={income <= 0 ? '🏦' : remaining < 0 ? '⚠️' : '🏦'}
          label="Sisa"
          value={remaining}
          placeholder={income <= 0 ? '—' : undefined}
          footer={
            income > 0 ? (
              <span className="delta delta-neutral">
                {remaining < 0
                  ? `Lebih besar ${formatPercent(share(Math.abs(remaining), income))} dari pemasukan`
                  : `${formatPercent(share(remaining, income))} dari pemasukan tersisa`}
              </span>
            ) : (
              <span className="delta delta-empty">Isi pemasukan dulu</span>
            )
          }
        />
        {summary.pending_reimburse > 0 && (
          <StatCard
            tone="warn"
            icon="🔁"
            label="Perlu dibayarkan"
            value={summary.pending_reimburse}
            footer={
              <span className="delta delta-neutral">{summary.pending_count} transaksi menunggu</span>
            }
          />
        )}
      </div>

      <div className="split-row">
        <div className="mini-stat">
          <span className="mini-label">Suami</span>
          <span className="mini-value">
            <span className="num-full">{formatRupiah(suamiTotal)}</span>
            <span className="num-compact">{formatRupiahCompact(suamiTotal)}</span>
          </span>
          <span className="mini-bar">
            <span style={{ width: `${share(suamiTotal, spend)}%` }} />
          </span>
        </div>
        <div className="mini-stat">
          <span className="mini-label">Istri</span>
          <span className="mini-value">
            <span className="num-full">{formatRupiah(istriTotal)}</span>
            <span className="num-compact">{formatRupiahCompact(istriTotal)}</span>
          </span>
          <span className="mini-bar">
            <span style={{ width: `${share(istriTotal, spend)}%` }} />
          </span>
        </div>
        <div className="mini-stat">
          <span className="mini-label">Special Case</span>
          <span className="mini-value">
            <span className="num-full">{formatRupiah(summary.special_case_total)}</span>
            <span className="num-compact">{formatRupiahCompact(summary.special_case_total)}</span>
          </span>
          <span className="mini-bar">
            <span style={{ width: `${share(summary.special_case_total, spend)}%` }} />
          </span>
        </div>
      </div>

      {top && (
        <div className="highlight-card">
          <span className="highlight-icon" aria-hidden="true">
            🔥
          </span>
          <div className="highlight-body">
            <span className="highlight-label">Pengeluaran terbesar periode ini</span>
            <h2 className="highlight-title">{top.category_name}</h2>
            <p className="highlight-meta">
              <CountUp className="highlight-amount" value={top.total} format={formatRupiah} /> ·{' '}
              {formatPercent(topShare)} dari total pengeluaran
            </p>
          </div>
          <div className="highlight-delta">
            <DeltaBadge
              delta={topDelta}
              goodDirection="down"
              emptyLabel="Kategori baru periode ini"
            />
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">
              Per Kategori{activePeriod ? ` · ${formatPeriod(activePeriod)}` : ''}
            </h2>
          </div>
          <DonutChart data={byCategory} />
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">{byYear ? 'Tren per Tahun' : 'Tren per Periode Gajian'}</h2>
            <div className="segmented">
              <button
                type="button"
                className={byYear ? 'secondary btn-sm' : 'btn-sm is-active'}
                onClick={() => navigate({ search: (prev) => ({ ...prev, trend: undefined }) })}
              >
                12 Bulan
              </button>
              <button
                type="button"
                className={byYear ? 'btn-sm is-active' : 'secondary btn-sm'}
                onClick={() => navigate({ search: (prev) => ({ ...prev, trend: 'year' }) })}
              >
                Per Tahun
              </button>
            </div>
          </div>
          <TrendChart points={trend} byYear={byYear} />
        </section>
      </div>
    </main>
  )
}
