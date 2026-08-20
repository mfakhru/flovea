import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireUser } from '../lib/auth'
import {
  getExpensesByCategory,
  getExpensesByPeriod,
  getExpensesSummary,
  listPayPeriods,
} from '../lib/expenses'
import type { CategoryTotal, PeriodTotal } from '../lib/expenses'
import { formatPeriod, formatRupiah } from '../lib/format'

type HomeSearch = {
  period?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    period: search.period ? String(search.period) : undefined,
  }),
  beforeLoad: async () => {
    await requireUser()
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const payPeriods = await listPayPeriods()
    const activePeriod = deps.period ?? payPeriods[0]

    const [summary, byCategory, byPeriod] = await Promise.all([
      getExpensesSummary({ data: { pay_period: activePeriod } }),
      getExpensesByCategory({ data: { pay_period: activePeriod } }),
      getExpensesByPeriod({ data: { limit: 12 } }),
    ])
    return { payPeriods, activePeriod, summary, byCategory, byPeriod }
  },
  component: HomePage,
})

function HomePage() {
  const search = Route.useSearch()
  const { payPeriods, activePeriod, summary, byCategory, byPeriod } = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })

  const suamiTotal = summary.by_user.find((u) => u.display_name === 'Suami')?.total ?? 0
  const istriTotal = summary.by_user.find((u) => u.display_name === 'Istri')?.total ?? 0
  const maxCategory = Math.max(1, ...byCategory.map((c: CategoryTotal) => c.total))
  const maxPeriod = Math.max(1, ...byPeriod.map((p: PeriodTotal) => p.total))

  return (
    <main className="page container">
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p className="page-subtitle">Ringkasan &amp; visualisasi pengeluaran</p>
        </div>
        <div className="field" style={{ minWidth: '180px' }}>
          <select
            aria-label="Periode gajian"
            value={search.period ?? activePeriod ?? ''}
            onChange={(e) =>
              navigate({ search: { period: e.target.value || undefined } })
            }
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
        <div className="stat-card">
          <span className="stat-label">Total Suami</span>
          <span className="stat-value">{formatRupiah(suamiTotal)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Istri</span>
          <span className="stat-value">{formatRupiah(istriTotal)}</span>
        </div>
        {summary.pending_reimburse > 0 && (
          <div className="stat-card stat-card-warn">
            <span className="stat-label">Perlu dibayarkan</span>
            <span className="stat-value">{formatRupiah(summary.pending_reimburse)}</span>
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h2 className="card-title">
            Per Kategori{activePeriod ? ` · ${formatPeriod(activePeriod)}` : ''}
          </h2>
          {byCategory.length === 0 ? (
            <p className="muted">Belum ada data untuk periode ini.</p>
          ) : (
            <div className="bar-list">
              {byCategory.map((c: CategoryTotal) => (
                <div className="bar-row" key={c.category_id}>
                  <span className="bar-label">{c.category_name}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.max(4, (c.total / maxCategory) * 100)}%` }}
                    />
                  </div>
                  <span className="bar-value">{formatRupiah(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Tren per Periode Gajian</h2>
          {byPeriod.length === 0 ? (
            <p className="muted">Belum ada pengeluaran yang ditandai periode gajian.</p>
          ) : (
            <div className="trend-chart">
              {byPeriod.map((p: PeriodTotal) => (
                <div className="trend-col" key={p.pay_period}>
                  <span className="trend-value">{formatRupiah(p.total)}</span>
                  <div className="trend-bar-track">
                    <div
                      className="trend-bar-fill"
                      style={{ height: `${Math.max(4, (p.total / maxPeriod) * 100)}%` }}
                    />
                  </div>
                  <span className="trend-label">{formatPeriod(p.pay_period)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
