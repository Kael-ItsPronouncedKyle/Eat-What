import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { PlanEntry } from '@/domain/types'
import { addDays, formatDate, weekRange } from '@/domain/dates'
import { autoFill, entriesForDay } from '@/domain/plan'
import { mergeIntoList, planNeeds, routeLine, subtractStock } from '@/domain/listing'
import { formatCents } from '@/domain/money'
import { formatQuantity } from '@/domain/units'
import { newId } from '@/domain/ids'
import { BackHeader } from '@/app/Shell'
import { usePrefs } from '@/app/prefs'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { useSession } from '@/app/session'
import { logEvent } from '@/data/mutations'
import { nowIso } from '@/data/repository'
import { Badge, Button, Icon, SelectField, Sheet, TextField } from '@/design/components'
import { addEntry, buildEntry, removeEntry, updateEntry } from './mutations'
import { ALL_MODES, useSuggestions } from './useSuggestions'

/** One calendar: dinners by day, with freezer blocks and notes; auto-fill, cheap week, and plan-to-list. */
export function WeekPlan() {
  const data = useHouseholdData()
  const today = useToday()
  const { household } = useSession()
  const { prefs } = usePrefs()
  const { run, repo } = useUndoable()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [weekStart, setWeekStart] = useState(() => weekRange(today, 1).from)
  const [picking, setPicking] = useState<{ date: string; personId: string | null } | null>(() => (params.get('add') ? { date: today, personId: null } : null))
  const [fillOpen, setFillOpen] = useState(false)
  const [fillFreezer, setFillFreezer] = useState('2')
  const [fillBudget, setFillBudget] = useState('')
  const [listPreview, setListPreview] = useState(false)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const suggestions = useSuggestions(data, useMemo(() => new Set(ALL_MODES), []))
  const addRecipeId = params.get('add')

  const recipeTitle = (id: string | null) => data.recipes.find((r) => r.id === id)?.title ?? 'Recipe'
  const blockTitle = (id: string | null) => data.freezer_blocks.find((b) => b.id === id)?.title ?? 'Freezer block'
  const personName = (id: string | null) => data.persons.find((p) => p.id === id)?.name ?? null

  const addToDay = async (date: string, kind: PlanEntry['kind'], ref: { recipeId?: string; freezerBlockId?: string; note?: string }, personId: string | null) => {
    if (!household) return
    const e = buildEntry(household.id, { userId: '' }, { date, kind, recipeId: ref.recipeId ?? null, freezerBlockId: ref.freezerBlockId ?? null, note: ref.note ?? null, personId, position: entriesForDay(data.plan_entries, date).length })
    const label = kind === 'recipe' ? recipeTitle(e.recipeId) : kind === 'freezer_block' ? blockTitle(e.freezerBlockId) : (ref.note ?? 'Note')
    await run((r, actor) => addEntry(r, { ...e, createdBy: actor.userId, updatedBy: actor.userId }, actor, `${label} on ${formatDate(date, 'weekday')}${personId ? ` for ${personName(personId)}` : ''}`))
    setPicking(null)
    if (addRecipeId) setParams({})
  }

  const fill = async () => {
    if (!household) return
    const budgetCents = fillBudget.trim() ? Math.round(Number(fillBudget) * 100) : null
    const proposal = autoFill(suggestions, data.plan_entries, data.freezer_blocks, { days, freezerNights: Number(fillFreezer) || 0, budgetCents, energy: prefs.energy })
    const toAdd = proposal.slots.filter((s) => s.suggestion || s.freezerBlock)
    if (!toAdd.length) return
    const entries = toAdd.map((s, i) => buildEntry(household.id, { userId: '' }, { date: s.date, kind: s.freezerBlock ? 'freezer_block' : 'recipe', recipeId: s.suggestion?.recipe.id ?? s.freezerBlock?.recipeId ?? null, freezerBlockId: s.freezerBlock?.id ?? null, position: i }))
    await repo.table('plan_entries').putMany(entries)
    await run(async (r, actor) => {
      const event = await logEvent(r, household.id, actor, { entityType: 'plan_entries', entityId: null, action: 'autofill', summary: `Planned ${entries.length} ${entries.length === 1 ? 'dinner' : 'dinners'}${proposal.estimatedCents !== null ? ` (about ${formatCents(proposal.estimatedCents)})` : ''}` })
      return { event, undo: async () => { for (const e of entries) await r.table('plan_entries').remove(e.id) } }
    })
    setFillOpen(false)
  }

  const needs = useMemo(() => {
    if (!household) return []
    try {
      return subtractStock(planNeeds(data.plan_entries, data.batches, data.recipesWithIngredients, { items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave }, { from: days[0]!, to: days[6]! }), data.items)
    } catch {
      return []
    }
  }, [household, data.plan_entries, data.batches, data.recipesWithIngredients, data.items, data.item_aliases, data.alwaysHave, days])
  const toBuy = needs.filter((n) => n.buy !== null)

  const sendToList = async () => {
    if (!household) return
    const open = data.list_lines.filter((l) => l.status === 'open')
    const merged = mergeIntoList(open, needs, { householdId: household.id, now: nowIso(), newId })
    for (const l of merged.added) l.retailerId = routeLine(l, { items: data.items, retailers: data.retailers, routingRules: data.routing_rules, links: data.item_retailer_links })
    const before = open.map((l) => ({ ...l }))
    await repo.table('list_lines').putMany([...merged.added, ...merged.updated])
    await run(async (r, actor) => {
      const event = await logEvent(r, household.id, actor, { entityType: 'list_lines', entityId: null, action: 'plan_to_list', summary: `Added ${merged.added.length} and updated ${merged.updated.length} list ${merged.added.length + merged.updated.length === 1 ? 'line' : 'lines'} from the plan` })
      return { event, undo: async () => { for (const l of merged.added) await r.table('list_lines').remove(l.id); await r.table('list_lines').putMany(before) } }
    })
    setListPreview(false)
    navigate('/shop')
  }

  return (
    <div className="page">
      <BackHeader title="Plan" to="/cook" right={<Link to="/cook/week" className="btn btn-ghost"><Icon name="snowflake" /> <span className="btn-label">Cook week</span></Link>} />
      <div className="week-nav">
        <Button variant="ghost" icon="chevronLeft" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} />
        <strong>{formatDate(days[0]!)} to {formatDate(days[6]!)}</strong>
        <Button variant="ghost" icon="chevronRight" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} />
      </div>
      <div className="plan-tools">
        <Button variant="primary" icon="sparkle" onClick={() => setFillOpen(true)}>Fill the week</Button>
        <Button variant="secondary" icon="cart" onClick={() => setListPreview(true)} disabled={needs.length === 0}>Plan to list{toBuy.length ? ` (${toBuy.length})` : ''}</Button>
      </div>

      {days.map((date) => {
        const entries = entriesForDay(data.plan_entries, date)
        return (
          <section key={date} className={`day ${date === today ? 'is-today' : ''}`} aria-label={formatDate(date, 'long')}>
            <div className="day-head">
              <h3>{date === today ? 'Today, ' : ''}{formatDate(date, 'weekday')}</h3>
              <Button variant="ghost" size="sm" icon="plus" aria-label={`Add to ${formatDate(date, 'weekday')}`} onClick={() => setPicking({ date, personId: null })}>Add</Button>
            </div>
            <div className="slot">
              {entries.length === 0 ? (
                <button type="button" className="slot-empty" onClick={() => setPicking({ date, personId: null })}>Nothing planned</button>
              ) : (
                entries.map((e) => (
                  <div key={e.id} className={`slot-entry ${e.status === 'cooked' ? 'is-cooked' : ''} ${e.kind === 'freezer_block' ? 'is-block' : ''}`}>
                    <Icon name={e.kind === 'freezer_block' ? 'snowflake' : e.kind === 'note' ? 'edit' : 'cook'} />
                    <div className="grow">
                      {e.kind === 'recipe' && e.recipeId ? <Link to={`/cook/recipe/${e.recipeId}`}>{recipeTitle(e.recipeId)}</Link> : e.kind === 'freezer_block' ? blockTitle(e.freezerBlockId) : e.note}
                      {e.personId ? <Badge tone="accent">{personName(e.personId)}</Badge> : null}
                      {e.servings ? <span className="small muted"> · {e.servings} servings</span> : null}
                    </div>
                    {e.status === 'planned' ? (
                      <>
                        <Button variant="ghost" size="sm" icon="chevronRight" aria-label="Move to the next day" onClick={() => void run((r, actor) => updateEntry(r, e, { date: addDays(e.date, 1) }, actor, `${e.kind === 'recipe' ? recipeTitle(e.recipeId) : e.kind === 'freezer_block' ? blockTitle(e.freezerBlockId) : 'Note'} moved to ${formatDate(addDays(e.date, 1), 'weekday')}`))} />
                        <Button variant="ghost" size="sm" icon="close" aria-label="Remove from the plan" onClick={() => void run((r, actor) => removeEntry(r, e, actor, `Removed ${e.kind === 'recipe' ? recipeTitle(e.recipeId) : e.kind === 'freezer_block' ? blockTitle(e.freezerBlockId) : 'note'} from ${formatDate(e.date, 'weekday')}`))} />
                      </>
                    ) : <Badge tone="ok">cooked</Badge>}
                  </div>
                ))
              )}
            </div>
          </section>
        )
      })}

      <Sheet open={!!picking} title={picking ? `Add to ${formatDate(picking.date, 'weekday')}` : ''} onClose={() => { setPicking(null); if (addRecipeId) setParams({}) }}>
        {picking ? <Picker date={picking.date} preselect={addRecipeId} onPick={(kind, ref, personId) => void addToDay(picking.date, kind, ref, personId)} /> : null}
      </Sheet>

      <Sheet open={fillOpen} title="Fill the open nights" onClose={() => setFillOpen(false)} description="Proposes from what you have; freezer nights take the oldest blocks. You can swap any night after." footer={<Button variant="primary" size="lg" full onClick={() => void fill()}>Fill</Button>}>
        <div className="stack">
          <TextField label="Freezer nights" inputMode="numeric" value={fillFreezer} onChange={(e) => setFillFreezer(e.target.value)} />
          <TextField label="Cheap week: dollar target (optional)" inputMode="decimal" value={fillBudget} onChange={(e) => setFillBudget(e.target.value)} hint="Favors stock on hand, freezer blocks, and the lowest cost per serving." />
          <p className="small muted">Energy today is "{prefs.energy}", so heavier recipes stay out.</p>
        </div>
      </Sheet>

      <Sheet open={listPreview} title="From plan to list" onClose={() => setListPreview(false)} description="The plan's needs minus what is in stock. Trust it or override on the list." footer={<Button variant="primary" size="lg" full icon="cart" disabled={toBuy.length === 0} onClick={() => void sendToList()}>Add {toBuy.length} {toBuy.length === 1 ? 'line' : 'lines'} to the list</Button>}>
        <div className="list">
          {needs.map((n, i) => (
            <div key={i} className={`list-row ${n.buy ? '' : 'muted'}`}>
              <div className="grow row-main">
                <div className="row-title">{n.need.name}</div>
                <div className="row-subtitle small muted">{n.explanation}</div>
              </div>
              <div className="num strong">{n.buy ? formatQuantity(n.buy) : <Icon name="check" />}</div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function Picker({ date, preselect, onPick }: { date: string; preselect: string | null; onPick: (kind: PlanEntry['kind'], ref: { recipeId?: string; freezerBlockId?: string; note?: string }, personId: string | null) => void }) {
  const data = useHouseholdData()
  const [tab, setTab] = useState<'recipe' | 'freezer' | 'note'>(preselect ? 'recipe' : 'recipe')
  const [q, setQ] = useState(preselect ? (data.recipes.find((r) => r.id === preselect)?.title ?? '') : '')
  const [personId, setPersonId] = useState('')
  const [note, setNote] = useState('')
  const recipes = data.recipes.filter((r) => r.status === 'approved' && (!q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 30)
  const blocks = data.freezer_blocks.filter((b) => b.countRemaining > 0).sort((a, b) => (a.cookedOn ?? '').localeCompare(b.cookedOn ?? ''))
  return (
    <div className="stack">
      <div className="row-wrap" role="group" aria-label="Kind">
        <Button variant={tab === 'recipe' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('recipe')}>Recipe</Button>
        <Button variant={tab === 'freezer' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('freezer')}>Freezer block</Button>
        <Button variant={tab === 'note' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('note')}>Note</Button>
      </div>
      {data.persons.length > 1 ? (
        <SelectField label="For" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Everyone</option>
          {data.persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectField>
      ) : null}
      {tab === 'recipe' ? (
        <>
          <TextField label="Find a recipe" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="list">
            {recipes.map((r) => (
              <button key={r.id} type="button" className="list-row list-row-button" onClick={() => onPick('recipe', { recipeId: r.id }, personId || null)}>
                <div className="grow row-main"><div className="row-title">{r.title}</div><div className="row-subtitle small muted">{r.cuisine ?? ''}</div></div>
                <Icon name="plus" />
              </button>
            ))}
          </div>
        </>
      ) : tab === 'freezer' ? (
        <div className="list">
          {blocks.length === 0 ? <div className="list-row muted">Nothing in the freezer.</div> : null}
          {blocks.map((b) => (
            <button key={b.id} type="button" className="list-row list-row-button" onClick={() => onPick('freezer_block', { freezerBlockId: b.id }, personId || b.personId)}>
              <div className="grow row-main"><div className="row-title">{b.title}</div><div className="row-subtitle small muted">{b.countRemaining} left · {b.portionLabel ?? ''}{b.personId ? ` · ${data.persons.find((p) => p.id === b.personId)?.name}` : ''}</div></div>
              <Icon name="plus" />
            </button>
          ))}
        </div>
      ) : (
        <>
          <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leftovers, out, order in" autoFocus />
          <Button variant="primary" disabled={!note.trim()} onClick={() => onPick('note', { note: note.trim() }, personId || null)}>Add note to {formatDate(date, 'weekday')}</Button>
        </>
      )}
    </div>
  )
}

