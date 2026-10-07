import { useMemo } from 'react'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useToday } from '@/app/hooks/useToday'
import { useCollection } from '@/data/provider'
import { monthSummary, monthsBack, type MonthSummary } from '@/domain/budget'
import { formatCents } from '@/domain/money'
import { monthKey } from '@/domain/dates'
import { BackHeader } from '@/app/Shell'
import { Card, EmptyState } from '@/design/components'
import { Link } from 'react-router'

const CATS: { key: MonthSummary['byCategory'] extends Record<infer K, number> ? K : never; label: string }[] = [
  { key: 'groceries', label: 'Groceries' }, { key: 'cleaning', label: 'Cleaning' }, { key: 'household', label: 'Household' }, { key: 'pet', label: 'Pet' }, { key: 'pharmacy', label: 'Pharmacy' }, { key: 'other', label: 'Other' },
]

export function BudgetBar({ summary, compact }: { summary: MonthSummary; compact?: boolean }) {
  const cap = summary.capCents
  const spentPct = cap ? Math.min(100, (summary.spentCents / cap) * 100) : 0
  const committedPct = cap ? Math.min(100 - spentPct, (summary.committedCents / cap) * 100) : 0
  const cls = summary.level === 'over' ? 'is-over' : summary.level === 'warn' ? 'is-warn' : ''
  return (
    <Card tone={summary.level === 'over' ? 'out' : summary.level === 'warn' ? 'low' : 'ok'} aria-label="Budget this month">
      <div className="spread">
        <strong>Budget this month</strong>
        <span className="small muted num">
          {cap === null ? 'No cap set' : summary.level === 'over' ? `Over by ${formatCents(summary.spentCents + summary.committedCents - cap)}` : `${formatCents(summary.remainingCents)} left`}
        </span>
      </div>
      {cap !== null ? (
        <div className="budget-bar" style={{ marginTop: 8 }} role="img" aria-label={`${Math.round(spentPct)}% spent, ${Math.round(committedPct)}% committed`}>
          <div className="budget-stack">
            <div className={`budget-fill ${cls}`} style={{ width: `${spentPct}%` }} />
            <div className="budget-fill is-committed" style={{ width: `${committedPct}%` }} />
          </div>
        </div>
      ) : null}
      {!compact ? (
        <div className="budget-numbers">
          <div><div className="label">Spent</div><div className="value num">{formatCents(summary.spentCents)}</div></div>
          <div><div className="label">Committed</div><div className="value num">{formatCents(summary.committedCents)}</div></div>
          <div><div className="label">Remaining</div><div className="value num">{cap === null ? '—' : formatCents(summary.remainingCents)}</div></div>
        </div>
      ) : null}
    </Card>
  )
}

export function Budget() {
  const { household } = useSession()
  const data = useHouseholdData()
  const today = useToday()
  const households = useCollection('households', household?.id)
  const row = households.rows.find((h) => h.id === household?.id) ?? null
  const month = monthKey(today)
  const months = useMemo(() => {
    try {
      return monthsBack(month, 12)
    } catch {
      return [month]
    }
  }, [month])
  const summaries = useMemo(() => {
    if (!row) return []
    return months.map((m) => {
      try {
        return monthSummary(data.spend, data.list_sends, row, m)
      } catch {
        return null
      }
    })
  }, [months, data.spend, data.list_sends, row])
  const current = summaries[summaries.length - 1] ?? null
  const max = Math.max(1, ...summaries.map((s) => (s ? s.spentCents + s.committedCents : 0)), row?.budgetMonthlyCents ?? 0)

  if (!row || !current) return <div className="page" aria-busy="true"><BackHeader title="Budget" to="/shop" /></div>

  return (
    <div className="page">
      <BackHeader title="Budget" to="/shop" />
      <BudgetBar summary={current} />
      <p className="small muted" style={{ marginTop: 8 }}>
        Spent is from receipts and received orders. Committed is sent but not received, at the estimate. {current.driftCents !== 0 ? `Estimates have drifted ${current.driftCents > 0 ? 'high' : 'low'} by ${formatCents(Math.abs(current.driftCents))} this month.` : ''}
        {row.budgetMonthlyCents === null ? ' Set a cap under House.' : ''}
      </p>

      <div className="section">
        <h3>By category</h3>
        <Card>
          <div className="stack">
            {CATS.map((c) => {
              const v = current.byCategory[c.key] ?? 0
              const total = Math.max(1, current.spentCents)
              return (
                <div key={c.key} className="cat-row">
                  <span style={{ minWidth: '9ch' }}>{c.label}</span>
                  <div className="cat-bar"><div className="cat-fill" style={{ width: `${Math.min(100, (v / total) * 100)}%` }} /></div>
                  <span className="num small" style={{ minWidth: '7ch', textAlign: 'right' }}>{formatCents(v)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <div className="section">
        <h3>Twelve months</h3>
        {summaries.every((s) => !s || s.spentCents + s.committedCents === 0) ? (
          <EmptyState icon="dollar" title="No spend yet" body="Sent lists and receipts fill this in." />
        ) : (
          <Card>
            <div className="month-bars" role="img" aria-label="Monthly spend, oldest to newest">
              {summaries.map((s, i) => (
                <div key={months[i]} className={`month-bar ${i === summaries.length - 1 ? 'is-current' : ''}`} style={{ height: `${s ? Math.max(2, ((s.spentCents + s.committedCents) / max) * 100) : 2}%` }} title={`${months[i]}: ${formatCents(s ? s.spentCents + s.committedCents : 0)}`} />
              ))}
            </div>
            <div className="month-labels">
              {months.map((m) => (
                <span key={m}>{m.slice(5)}</span>
              ))}
            </div>
            {row.budgetMonthlyCents ? <p className="small muted" style={{ marginTop: 8 }}>Cap {formatCents(row.budgetMonthlyCents)} a month.</p> : null}
          </Card>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 'var(--space-4)' }}>
        Nothing here keeps score against you. <Link to="/house">Change the cap under House.</Link>
      </p>
    </div>
  )
}
