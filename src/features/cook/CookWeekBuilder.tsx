import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Batch, ContainerPlanLine, CookWeek, TimelineEntryKind } from '@/domain/types'
import { capacityText, containerAvailability, planContainers, portionLabel, recipeYieldMl, suggestContainerPlan } from '@/domain/containers'
import { addDays, formatDate, today as todayKey } from '@/domain/dates'
import { recipeAvailability } from '@/domain/matching'
import { costPerServingCents } from '@/domain/budget'
import { formatCents } from '@/domain/money'
import { buildTimeline, SHOP_LINK_TEXT } from '@/domain/cookweek'
import { labelText, guessFoodType, qualityUntil } from '@/domain/labels'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { useSession } from '@/app/session'
import { copyText } from '@/integrations/share'
import { Badge, Button, Card, EmptyState, Icon, SelectField, Sheet, Stepper, TextField } from '@/design/components'
import type { IconName } from '@/design/components/Icon'
import { addBatch, addCookWeek, removeBatch, updateBatch, updateCookWeek } from './mutations'

/** Cook-week builder: batches with container math, availability warnings, a day-by-day timeline, labels, and a printable plan. */
export function CookWeekBuilder() {
  const { id } = useParams()
  const data = useHouseholdData()
  const today = useToday()
  const { household } = useSession()
  const { run } = useUndoable()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const weeks = data.cook_weeks.filter((w) => w.status !== 'done').sort((a, b) => b.startsOn.localeCompare(a.startsOn))
  const week = id ? (data.cook_weeks.find((w) => w.id === id) ?? null) : (weeks[0] ?? null)
  const batches = useMemo(() => data.batches.filter((b) => week && b.cookWeekId === week.id), [data.batches, week])

  const startWeek = async () => {
    if (!household) return
    const starts = addDays(today, (3 - new Date(today + 'T12:00:00').getDay() + 7) % 7 || 7)
    const r = await run((repo, actor) => addCookWeek(repo, household.id, { name: `Cook week of ${formatDate(starts)}`, startsOn: starts, endsOn: addDays(starts, 5), budgetTargetCents: null, status: 'draft', timeline: [] }, actor))
    navigate(`/cook/week/${(r.event.entityId as string) ?? ''}`, { replace: true })
  }

  const estimated = batches.reduce<number | null>((acc, b) => (acc === null || b.estimatedCostCents === null ? (acc === null && b.estimatedCostCents !== null ? b.estimatedCostCents : acc) : acc + b.estimatedCostCents), null)
  const timeline = useMemo(() => {
    if (!week) return []
    const maxStandingMinutes = (data.rules.find((r) => r.type === 'prep' && r.active)?.payload as { maxStandingMinutes?: number } | undefined)?.maxStandingMinutes
    return buildTimeline(week, batches, data.recipesWithIngredients, data.containers, data.freezer_blocks, { items: data.items, aliases: data.item_aliases, locations: data.locations, maxStandingMinutes })
  }, [week, batches, data.recipesWithIngredients, data.containers, data.freezer_blocks, data.items, data.item_aliases, data.locations, data.rules])

  if (data.loading) return <div className="page" aria-busy="true" />
  if (!week) {
    return (
      <div className="page">
        <BackHeader title="Cook week" to="/cook/plan" />
        <EmptyState icon="snowflake" title="No cook week yet" body="Pick batches, the app does the container math, and one list covers the lot." action={<Button variant="primary" size="lg" icon="plus" onClick={() => void startWeek()}>Start a cook week</Button>} />
      </div>
    )
  }
  const avail = containerAvailability(batches, data.containers)

  return (
    <div className="page">
      <BackHeader title={week.name} to="/cook/plan" right={<Link to={`/print/week/${week.id}`} className="btn btn-ghost" aria-label="Print the plan"><Icon name="print" /> <span className="btn-label">Print</span></Link>} />
      <div className="row-wrap" style={{ marginBottom: 'var(--space-3)' }}>
        <Badge>{formatDate(week.startsOn)} to {formatDate(week.endsOn)}</Badge>
        <Badge tone={week.status === 'confirmed' ? 'ok' : 'low'}>{week.status}</Badge>
        {estimated !== null ? <Badge>~{formatCents(estimated)}</Badge> : null}
        {week.budgetTargetCents ? <Badge tone={estimated !== null && estimated > week.budgetTargetCents ? 'out' : 'ok'}>target {formatCents(week.budgetTargetCents)}</Badge> : null}
        {weeks.length > 1 ? <Link to="/cook/week" className="small">Other weeks</Link> : null}
      </div>

      <div className="stack">
        {batches.map((b) => (
          <BatchCard key={b.id} batch={b} week={week} />
        ))}
        <Button variant="primary" size="lg" icon="plus" onClick={() => setAdding(true)}>Add a batch</Button>
      </div>

      {avail.some((a) => a.short > 0) ? (
        <Card tone="low" style={{ marginTop: 'var(--space-4)' }}>
          <strong>Containers are tight.</strong>
          <ul className="small" style={{ marginTop: 6 }}>
            {avail.filter((a) => a.short > 0).map((a) => <li key={a.container.id}>{a.container.name}: need {a.needed} blocks, fit {a.cavities > 1 ? `${a.trays} ${a.trays === 1 ? 'tray' : 'trays'} x ${a.cavities} cavities = ${a.owned}` : a.owned} at once. {a.container.disposable ? 'Add a box to the list.' : 'Freeze, pop out, refill.'}</li>)}
          </ul>
        </Card>
      ) : null}

      {timeline.length ? (
        <div className="section">
          <h3>Timeline</h3>
          {timeline.map((d) => (
            <div key={d.date} className="timeline-day">
              <h4>{formatDate(d.date, 'long')}</h4>
              {d.entries.map((e, i) => (
                <div key={i} className={`timeline-entry timeline-${e.kind} ${e.kind === 'sit' ? 'is-sit' : ''}`}>
                  <Icon name={TIMELINE_ICON[e.kind]} size="1em" title={TIMELINE_LABEL[e.kind]} />
                  <span>
                    {e.kind === 'shop' ? <>{e.text.replace(`${SHOP_LINK_TEXT}.`, '').trim()} <Link to="/shop">{SHOP_LINK_TEXT}</Link></> : e.text}
                    {e.kind === 'batch' && e.minutes ? <span className="small muted"> · {e.minutes} min</span> : null}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="section row-wrap">
        {week.status === 'draft' ? <Button variant="primary" icon="check" onClick={() => void run((repo, actor) => updateCookWeek(repo, week, { status: 'confirmed', timeline }, actor, `Confirmed ${week.name}`))}>Confirm the week</Button> : null}
        <Link to="/cook/plan" className="btn btn-secondary"><Icon name="cart" /> <span className="btn-label">Plan to list</span></Link>
        {week.status !== 'done' ? <Button variant="ghost" onClick={() => void run((repo, actor) => updateCookWeek(repo, week, { status: 'done' }, actor, `Finished ${week.name}`))}>Mark done</Button> : null}
      </div>
      <p className="small muted" style={{ marginTop: 'var(--space-3)' }}>Plan to list subtracts stock for every batch in the week, so one Instacart send covers it. Labels come from each batch's Cook.</p>

      {adding && household ? <AddBatchSheet week={week} onClose={() => setAdding(false)} /> : null}
    </div>
  )
}

/** One icon per timeline row kind (names from src/design/components/Icon.tsx). */
const TIMELINE_ICON: Record<TimelineEntryKind, IconName> = { shop: 'cart', thaw: 'snowflake', note: 'info', batch: 'cook', sit: 'chair', prep: 'snowflake', label: 'edit', pop: 'bag', refill: 'swap' }
const TIMELINE_LABEL: Record<TimelineEntryKind, string> = { shop: 'Shop', thaw: 'Thaw', note: 'Note', batch: 'Cook', sit: 'Sit', prep: 'Fill', label: 'Label', pop: 'Pop out', refill: 'Refill' }

function BatchCard({ batch, week }: { batch: Batch; week: CookWeek }) {
  const data = useHouseholdData()
  const { run } = useUndoable()
  const navigate = useNavigate()
  const r = data.recipesWithIngredients.find((x) => x.id === batch.recipeId) ?? null
  if (!r) return null
  const math = planContainers(r, batch.containerPlan.map((l) => ({ containerId: l.containerId, count: l.count, portionMl: l.portionMl })), data.containers)
  const copyLabels = async () => {
    const lines = batch.containerPlan.map((line) => {
      const c = data.containers.find((x) => x.id === line.containerId) ?? null
      const date = batch.scheduledOn ?? todayKey()
      return `${labelText({ title: r.title, portionLabel: line.portionLabel, servingsPerBlock: line.portionMl >= 480 ? 2 : 1, cookedOn: date, qualityUntil: qualityUntil(date, guessFoodType(r)), foodType: guessFoodType(r) }, { recipe: r, container: c, format: 'tape' })} × ${line.count}`
    })
    await copyText(lines.join('\n'))
  }
  return (
    <Card tone={batch.status === 'frozen' ? 'ok' : 'accent'} className="batch-card">
      <div className="spread">
        <div>
          <Link to={`/cook/recipe/${r.id}`} className="card-title" style={{ textDecoration: 'none', color: 'inherit' }}>{r.title}</Link>
          <div className="small muted">×{batch.multiplier} · {batch.kind === 'dump_kit' ? 'raw dump kit' : 'cooked'} · {batch.scheduledOn ? formatDate(batch.scheduledOn, 'weekday') : 'unscheduled'}{batch.estimatedCostCents !== null ? ` · ~${formatCents(batch.estimatedCostCents)}` : ''}</div>
        </div>
        <Badge tone={batch.status === 'frozen' ? 'ok' : 'neutral'}>{batch.status}</Badge>
      </div>
      <div className="container-plan">
        {batch.containerPlan.map((line) => (
          <div key={line.containerId} className="container-line small">
            <Icon name="snowflake" size="1em" /> {line.count} × {line.portionLabel} ({data.containers.find((c) => c.id === line.containerId)?.name ?? 'container'})
          </div>
        ))}
        {math.warnings.map((w, i) => <div key={i} className="small" style={{ color: 'var(--low)' }}>{w.text}</div>)}
      </div>
      <div className="row-wrap">
        <SelectField label="Day" value={batch.scheduledOn ?? ''} onChange={(e) => void run((repo, actor) => updateBatch(repo, batch, { scheduledOn: e.target.value || null }, actor, `${r.title} scheduled for ${e.target.value ? formatDate(e.target.value, 'weekday') : 'no day'}`))}>
          <option value="">No day</option>
          {Array.from({ length: 7 }, (_, i) => addDays(week.startsOn, i)).map((d) => <option key={d} value={d}>{formatDate(d, 'weekday')}</option>)}
        </SelectField>
        <SelectField label="Cook" value={batch.cookPersonId ?? ''} onChange={(e) => void run((repo, actor) => updateBatch(repo, batch, { cookPersonId: e.target.value || null }, actor, `${r.title}: cook set`))}>
          <option value="">Anyone</option>
          {data.persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectField>
      </div>
      <div className="suggestion-actions">
        {batch.status === 'planned' ? <Button variant="primary" icon="cook" onClick={() => navigate(`/cook/mode/${r.id}?batch=${batch.id}`)}>Cook this batch</Button> : null}
        <Button variant="secondary" icon="copy" onClick={() => void copyLabels()}>Copy labels</Button>
        <Button variant="ghost" icon="trash" aria-label="Remove batch" onClick={() => void run((repo, actor) => removeBatch(repo, batch, actor, `Removed ${r.title} from the cook week`))} />
      </div>
    </Card>
  )
}

function AddBatchSheet({ week, onClose }: { week: CookWeek; onClose: () => void }) {
  const data = useHouseholdData()
  const today = useToday()
  const { household } = useSession()
  const { run } = useUndoable()
  const [recipeId, setRecipeId] = useState('')
  const [kind, setKind] = useState<Batch['kind']>('cooked')
  const [targets, setTargets] = useState<{ containerId: string; count: number }[]>([])
  const [day, setDay] = useState(week.startsOn)
  const [q, setQ] = useState('')
  const recipe = data.recipesWithIngredients.find((r) => r.id === recipeId) ?? null
  const freezerRecipes = data.recipes.filter((r) => r.status === 'approved' && (r.tags.includes('freezer_safe') || r.tags.includes('dump_kit') || r.freezeNotes)).filter((r) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.title.localeCompare(b.title))
  const math = recipe ? planContainers(recipe, targets, data.containers) : null
  const yieldMl = recipe ? recipeYieldMl(recipe) : null

  const suggestDefault = (rid: string) => {
    const r = data.recipes.find((x) => x.id === rid)
    const ml = r ? recipeYieldMl(r) : null
    if (!ml) return setTargets([])
    setTargets(suggestContainerPlan(ml * 1.5, data.containers).map((t) => ({ containerId: t.containerId, count: t.count })))
  }

  const save = async () => {
    if (!household || !recipe || !math) return
    const plan: ContainerPlanLine[] = math.plan
    const av = recipeAvailability(recipe, { items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave }, today, math.multiplier)
    const perServing = costPerServingCents(av.ingredients, recipe.baseYield, data.prices, today)
    const estimated = perServing !== null ? Math.round(perServing * recipe.baseYield * math.multiplier) : null
    await run((repo, actor) => addBatch(repo, household.id, { cookWeekId: week.id, recipeId: recipe.id, kind, multiplier: math.multiplier, containerPlan: plan, cookPersonId: null, scheduledOn: day || null, status: 'planned', cookedAt: null, estimatedCostCents: estimated, notes: null }, actor, `Added ${recipe.title} ×${math.multiplier} to ${week.name}`))
    onClose()
  }

  return (
    <Sheet open title="Add a batch" onClose={onClose} footer={<Button variant="primary" size="lg" full disabled={!recipe || targets.length === 0} onClick={() => void save()}>Add{math ? ` (×${math.multiplier})` : ''}</Button>}>
      <div className="stack">
        {!recipe ? (
          <>
            <TextField label="Freezer-safe recipes" value={q} onChange={(e) => setQ(e.target.value)} placeholder="chili" autoFocus />
            <div className="list">
              {freezerRecipes.map((r) => (
                <button key={r.id} type="button" className="list-row list-row-button" onClick={() => { setRecipeId(r.id); setKind(r.tags.includes('dump_kit') ? 'dump_kit' : 'cooked'); suggestDefault(r.id) }}>
                  <div className="grow row-main"><div className="row-title">{r.title}</div><div className="row-subtitle small muted">makes {r.baseYield} {r.yieldUnit}{r.tags.includes('dump_kit') ? ' · dump kit' : ''}</div></div>
                  <Icon name="chevronRight" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="spread"><strong>{recipe.title}</strong><Button variant="ghost" size="sm" onClick={() => { setRecipeId(''); setTargets([]) }}>Change</Button></div>
            <p className="small muted">One batch makes {recipe.baseYield} {recipe.yieldUnit}{yieldMl ? ` (about ${portionLabel(yieldMl).replace('-cup', ' cups')})` : ''}. Pick how many of each container to fill; the multiplier follows.</p>
            {data.containers.map((c) => {
              const t = targets.find((x) => x.containerId === c.id)
              return (
                <div key={c.id} className="spread">
                  <span>{c.name} <span className="small muted">({portionLabel(c.capacityMl, c)}, {capacityText(c)})</span></span>
                  <Stepper label={c.name} value={t?.count ?? 0} onChange={(n) => setTargets([...targets.filter((x) => x.containerId !== c.id), ...(n > 0 ? [{ containerId: c.id, count: Math.round(n) }] : [])])} />
                </div>
              )
            })}
            {math ? (
              <Card tone={math.warnings.length ? 'low' : 'ok'}>
                <div><strong>Multiplier ×{math.multiplier}</strong> for {Math.round(math.totalMl / 240)} cups total.</div>
                {math.warnings.map((w, i) => <div key={i} className="small">{w.text}</div>)}
                {math.freezeThenRefill.map((f, i) => <div key={i} className="small">{f.text}</div>)}
              </Card>
            ) : null}
            <SelectField label="Day" value={day} onChange={(e) => setDay(e.target.value)}>
              {Array.from({ length: 7 }, (_, i) => addDays(week.startsOn, i)).map((d) => <option key={d} value={d}>{formatDate(d, 'weekday')}</option>)}
            </SelectField>
          </>
        )}
      </div>
    </Sheet>
  )
}
