import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import type { Batch, TimelineDay, TimelineEntryKind } from '@/domain/types'
import { buildTimeline, SHOP_LINK_TEXT } from '@/domain/cookweek'
import { formatDate } from '@/domain/dates'
import { planNeeds, subtractStock } from '@/domain/listing'
import { formatCents } from '@/domain/money'
import { formatQuantity } from '@/domain/units'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { PrintFrame } from './PrintFrame'

/** Row label per timeline kind, printed in front of each line. */
const KIND_LABEL: Record<TimelineEntryKind, string> = { shop: 'Shop', thaw: 'Thaw', note: 'Note', batch: 'Cook', sit: 'Sit', prep: 'Fill', label: 'Label', pop: 'Pop out', refill: 'Refill' }

/** One-page cook week: title and dates, the batch table, the day-by-day timeline, and the shopping list the batches need. */
export function PrintWeek() {
  const { id } = useParams()
  const data = useHouseholdData()
  const week = id ? (data.cook_weeks.find((w) => w.id === id) ?? null) : null
  const batches = useMemo(() => (week ? data.batches.filter((b) => b.cookWeekId === week.id && !b.deletedAt).sort((a, b) => (a.scheduledOn ?? '~').localeCompare(b.scheduledOn ?? '~') || a.createdAt.localeCompare(b.createdAt)) : []), [data.batches, week])
  const recipeOf = (b: Batch) => data.recipesWithIngredients.find((r) => r.id === b.recipeId) ?? null

  const timeline = useMemo<TimelineDay[]>(() => {
    if (!week) return []
    const maxStandingMinutes = (data.rules.find((r) => r.type === 'prep' && r.active)?.payload as { maxStandingMinutes?: number } | undefined)?.maxStandingMinutes
    const built = buildTimeline(week, batches, data.recipesWithIngredients, data.containers, data.freezer_blocks, { items: data.items, aliases: data.item_aliases, locations: data.locations, maxStandingMinutes })
    // A week saved before any batch had a day keeps its stored rows; the live build wins once a batch is scheduled.
    return built.length ? built : week.timeline ?? []
  }, [week, batches, data.recipesWithIngredients, data.containers, data.freezer_blocks, data.items, data.item_aliases, data.locations, data.rules])

  const shopping = useMemo(() => {
    if (!week) return []
    const needs = planNeeds([], batches, data.recipesWithIngredients, { items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave }, { from: week.startsOn, to: week.endsOn })
    return subtractStock(needs, data.items).filter((l) => l.buy !== null).sort((a, b) => a.need.name.localeCompare(b.need.name))
  }, [week, batches, data.recipesWithIngredients, data.items, data.item_aliases, data.alwaysHave])

  if (data.loading) return <div className="print-screen" aria-busy="true" />
  if (!week) {
    return (
      <PrintFrame title="cook week" backTo="/cook/week" backLabel="Back to cook weeks">
        <h1>Cook week</h1>
        <p className="paper-note">This cook week is not here any more. <Link to="/cook/week">Back to cook weeks</Link></p>
      </PrintFrame>
    )
  }

  const known = batches.filter((b) => b.estimatedCostCents !== null)
  const estimated = known.length ? known.reduce((n, b) => n + (b.estimatedCostCents ?? 0), 0) : null

  return (
    <PrintFrame title={week.name} backTo={`/cook/week/${week.id}`} backLabel="Back to the cook week">
      <h1>{week.name}</h1>
      <p className="paper-sub">
        {formatDate(week.startsOn, 'long')} to {formatDate(week.endsOn, 'long')}
        {estimated !== null ? ` · about ${formatCents(estimated)}${known.length < batches.length ? ` for ${known.length} of ${batches.length} batches` : ''}` : ''}
        {week.budgetTargetCents ? ` · target ${formatCents(week.budgetTargetCents)}` : ''}
      </p>

      <h2>Batches</h2>
      {batches.length === 0 ? (
        <p className="paper-note">No batches yet.</p>
      ) : (
        <table aria-label="Batches">
          <thead>
            <tr>
              <th>Recipe</th>
              <th className="num">Times</th>
              <th>Containers</th>
              <th>Cook</th>
              <th className="num">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const r = recipeOf(b)
              const cook = data.persons.find((p) => p.id === b.cookPersonId)?.name ?? 'Anyone'
              return (
                <tr key={b.id} data-testid="batch-row">
                  <td data-label="Recipe">
                    <strong>{r?.title ?? 'Recipe'}</strong>
                    {b.kind === 'dump_kit' ? <div className="small">raw dump kit</div> : null}
                    <div className="small">{b.scheduledOn ? formatDate(b.scheduledOn, 'weekday') : 'no day yet'}</div>
                  </td>
                  <td className="num" data-label="Times">×{b.multiplier}</td>
                  <td data-label="Containers">
                    {b.containerPlan.filter((l) => l.count > 0).map((l) => (
                      <div key={l.containerId}>
                        {l.count} × {l.portionLabel} ({data.containers.find((c) => c.id === l.containerId)?.name ?? 'container'})
                      </div>
                    ))}
                  </td>
                  <td data-label="Cook">{cook}</td>
                  <td className="num" data-label="Est. cost">{b.estimatedCostCents !== null ? formatCents(b.estimatedCostCents) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <h2>Day by day</h2>
      {timeline.length === 0 ? (
        <p className="paper-note">Give each batch a day and the plan fills in here.</p>
      ) : (
        timeline.map((d) => (
          <section key={d.date} className="day">
            <h3>{formatDate(d.date, 'long')}</h3>
            <ul>
              {d.entries.map((e, i) => (
                <li key={i}>
                  <span className="kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
                  <span>
                    {e.kind === 'shop' ? e.text.replace(`${SHOP_LINK_TEXT}.`, '').trim() : e.text}
                    {e.kind === 'batch' && e.minutes ? ` (${e.minutes} min)` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <h2>Shopping list</h2>
      {shopping.length === 0 ? (
        <p className="paper-note">{batches.some((b) => b.status === 'planned') ? 'The pantry covers every batch. Nothing to buy.' : 'Every batch is cooked, so there is nothing left to buy.'}</p>
      ) : (
        <ul className="shop-list" aria-label="Shopping list">
          {shopping.map((l, i) => (
            <li key={i}>
              <span className="box" aria-hidden="true" />
              <span>
                <strong>{l.buy ? `${formatQuantity(l.buy)} ` : ''}{l.need.name}</strong>
                <span className="small"> · {l.explanation}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="paper-note">Prices show only when the price book knows them. Quantities subtract what the pantry already has.</p>
    </PrintFrame>
  )
}
