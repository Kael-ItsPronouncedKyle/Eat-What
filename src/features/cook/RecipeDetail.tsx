import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { RecipeIngredient } from '@/domain/types'
import { recipeAvailability, type IngredientAvailability } from '@/domain/matching'
import { allergyViolations, applySubstitutions, dietFlags } from '@/domain/rules'
import { costPerServingCents } from '@/domain/budget'
import { recipeNutrition, plateNutrition, nutritionLine } from '@/domain/nutrition'
import { effortLabel, standingMinutes } from '@/domain/effort'
import { formatQuantity } from '@/domain/units'
import { formatCents } from '@/domain/money'
import { routeLine } from '@/domain/listing'
import { reheatLine } from '@/domain/labels'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { useSession } from '@/app/session'
import { addListLine } from '@/data/mutations'
import { buildLine } from '@/features/shop/mutations'
import { Badge, Button, Card, EmptyState, Icon, SelectField, Sheet, Stepper } from '@/design/components'
import { approveRecipe, archiveRecipe, linkIngredient } from './mutations'

const MARK: Record<IngredientAvailability['status'], { cls: string; icon: 'check' | 'alert' | 'close' | 'minus'; text: string }> = {
  have: { cls: 'is-have', icon: 'check', text: 'have' },
  assumed: { cls: 'is-assumed', icon: 'check', text: 'assumed' },
  short: { cls: 'is-short', icon: 'alert', text: 'short' },
  missing: { cls: 'is-missing', icon: 'close', text: 'missing' },
  optional_missing: { cls: 'is-optional', icon: 'minus', text: 'optional' },
}

export function RecipeDetail() {
  const { id } = useParams()
  const data = useHouseholdData()
  const today = useToday()
  const navigate = useNavigate()
  const { household } = useSession()
  const { run } = useUndoable()
  const [servings, setServings] = useState<number | null>(null)
  const [fixing, setFixing] = useState<RecipeIngredient | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const recipe = data.recipesWithIngredients.find((r) => r.id === id) ?? null
  const ruleCtx = useMemo(() => ({ rules: data.rules, persons: data.persons }), [data.rules, data.persons])
  const matchCtx = useMemo(() => ({ items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave }), [data.items, data.item_aliases, data.alwaysHave])
  const scale = recipe ? (servings ?? recipe.baseYield) / recipe.baseYield : 1
  const availability = useMemo(() => (recipe ? recipeAvailability(recipe, matchCtx, today, scale) : null), [recipe, matchCtx, today, scale])
  const subs = useMemo(() => (recipe ? applySubstitutions(recipe.ingredients, ruleCtx) : null), [recipe, ruleCtx])
  const violations = useMemo(() => (recipe ? allergyViolations(recipe.ingredients, ruleCtx) : []), [recipe, ruleCtx])
  const cost = useMemo(() => (recipe && availability ? costPerServingCents(availability.ingredients, recipe.baseYield * scale, data.prices, today) : null), [recipe, availability, data.prices, today, scale])
  const nutrition = useMemo(() => (recipe ? (recipe.nutrition ?? recipeNutrition(recipe.ingredients, recipe.baseYield, new Map())) : null), [recipe])
  const flags = useMemo(() => dietFlags(nutrition, ruleCtx), [nutrition, ruleCtx])
  const blocks = data.freezer_blocks.filter((b) => b.recipeId === id && b.countRemaining > 0)

  if (data.loading) return <div className="page" aria-busy="true" />
  if (!recipe || !availability) {
    return (
      <div className="page">
        <BackHeader title="Recipe" to="/cook/recipes" />
        <EmptyState icon="cook" title="That recipe is gone" />
      </div>
    )
  }
  const addMissing = async () => {
    if (!household) return
    const open = data.list_lines.filter((l) => l.status === 'open')
    for (const m of availability.missing) {
      if (open.some((l) => (m.item ? l.itemId === m.item.id : l.name.toLowerCase() === m.ingredient.ingredientName.toLowerCase()))) continue
      const line = buildLine(household.id, { userId: '' }, { item: m.item, name: m.ingredient.ingredientName, qty: m.shortfall?.amount ?? (m.ingredient.amount !== null ? m.ingredient.amount * scale : null), unit: m.shortfall?.unit ?? m.ingredient.unit, reasons: [{ kind: 'almost_there', ref: recipe.id, text: recipe.title }], position: open.length })
      line.retailerId = routeLine(line, { items: data.items, retailers: data.retailers, routingRules: data.routing_rules, links: data.item_retailer_links })
      await run((repo, actor) => addListLine(repo, { ...line, createdBy: actor.userId, updatedBy: actor.userId }, actor), `Added ${availability.missing.length} ${availability.missing.length === 1 ? 'item' : 'items'} for ${recipe.title}`)
    }
  }
  const standing = standingMinutes(recipe)

  return (
    <div className="page">
      <BackHeader title={recipe.title} to="/cook/recipes" right={<Link to={`/cook/recipe/${recipe.id}/edit`} className="btn btn-ghost"><Icon name="edit" /> <span className="btn-label">Edit</span></Link>} />
      {recipe.status === 'draft' ? (
        <Card tone="low" style={{ marginBottom: 'var(--space-3)' }}>
          <div className="spread">
            <span><strong>Draft.</strong> It stays out of suggestions until you approve it.</span>
            <Button variant="primary" onClick={() => void run((repo, actor) => approveRecipe(repo, recipe, actor))}>Approve</Button>
          </div>
        </Card>
      ) : null}
      {recipe.description ? <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>{recipe.description}</p> : null}
      <div className="row-wrap" style={{ marginBottom: 'var(--space-3)' }}>
        {recipe.cuisine ? <Badge>{recipe.cuisine}</Badge> : null}
        {recipe.activeMinutes ? <Badge>{recipe.activeMinutes} min active</Badge> : null}
        <Badge>{standing} min standing</Badge>
        <Badge>{effortLabel(recipe.effortScore)}</Badge>
        {recipe.tags.map((t) => <Badge key={t} tone="accent">{t.replace(/_/g, ' ')}</Badge>)}
        {violations.length ? <Badge tone="out">{violations[0]!.personName ? `${violations[0]!.personName}: ${violations[0]!.ingredientRule}` : `no ${violations[0]!.ingredientRule}`}</Badge> : null}
      </div>

      <Card tone={availability.completeness === 1 ? 'ok' : availability.missing.length <= 2 ? 'low' : 'out'}>
        <div className="stack">
          <div className="scale-row">
            <strong>{availability.completeness === 1 ? 'You can make this now.' : `Missing ${availability.missing.length} ${availability.missing.length === 1 ? 'thing' : 'things'}.`}</strong>
            <div className="grow" />
            <Stepper label="Servings" value={servings ?? recipe.baseYield} min={1} onChange={(n) => setServings(Math.max(1, Math.round(n)))} unit={recipe.yieldUnit} />
          </div>
          <div className="suggestion-actions">
            <Button variant="primary" size="lg" icon="cook" onClick={() => navigate(`/cook/mode/${recipe.id}${servings ? `?servings=${servings}` : ''}`)}>Cook this</Button>
            {availability.missing.length ? <Button variant="secondary" size="lg" icon="cart" onClick={() => void addMissing()}>Add missing to list</Button> : null}
            <Button variant="secondary" size="lg" icon="calendar" onClick={() => navigate(`/cook/plan?add=${recipe.id}`)}>Plan it</Button>
          </div>
          {blocks.length ? <p className="small"><Icon name="snowflake" /> {blocks.reduce((n, b) => n + b.countRemaining, 0)} blocks already in the freezer. <Link to="/pantry/freezer">Open the shelf</Link>.</p> : null}
        </div>
      </Card>

      <div className="section">
        <div className="spread"><h3>Ingredients</h3><span className="small muted">for {servings ?? recipe.baseYield} {recipe.yieldUnit}</span></div>
        <Card>
          {availability.ingredients.map((a) => {
            const m = MARK[a.status]
            const sub = subs?.substitutions.find((s) => s.ingredientId === a.ingredient.id)
            const amt = a.ingredient.amount !== null ? formatQuantity({ amount: a.ingredient.amount * scale, unit: a.ingredient.unit }) : ''
            return (
              <div key={a.ingredient.id} className="ingredient-row">
                <span className={`ingredient-mark ${m.cls}`} aria-label={m.text}><Icon name={m.icon} size="1em" /></span>
                <span className="ingredient-amount num">{amt}</span>
                <span className="grow">
                  {sub ? <><s className="muted">{a.ingredient.ingredientName}</s> <strong>{sub.to}</strong> <Badge tone="ok">swap</Badge></> : a.ingredient.ingredientName}
                  {a.ingredient.preparation ? <span className="muted small">, {a.ingredient.preparation}</span> : null}
                  {a.ingredient.optional ? <span className="muted small"> (optional)</span> : null}
                  {a.item && a.status === 'short' && a.shortfall ? <div className="small muted">have {a.item.qty !== null ? formatQuantity({ amount: a.item.qty, unit: a.item.unit }) : 'some'}, short {formatQuantity(a.shortfall)}</div> : null}
                  {a.item && a.low && a.status === 'have' ? <div className="small muted">running low</div> : null}
                </span>
                <Button variant="ghost" size="sm" aria-label={`Fix match for ${a.ingredient.ingredientName}`} onClick={() => setFixing(a.ingredient)}>{a.match.via === 'fuzzy' ? <Badge tone="low">~{a.item?.name}</Badge> : a.item ? <span className="small muted">{a.item.name === a.ingredient.ingredientName ? '' : a.item.name}</span> : <span className="small muted">link</span>}</Button>
              </div>
            )
          })}
        </Card>
      </div>

      <div className="section">
        <h3>Per serving</h3>
        <Card>
          <div className="stack">
            <div className="row-wrap">
              <span><strong>{nutrition ? nutritionLine(nutrition) : 'No nutrition estimate yet'}</strong></span>
              {nutrition ? <Badge>estimate{nutrition.coverage !== undefined && nutrition.coverage < 0.8 ? `, ${Math.round(nutrition.coverage * 100)}% mapped` : ''}</Badge> : null}
            </div>
            {data.persons.filter((p) => p.plateProfile.portionMultiplier && p.plateProfile.portionMultiplier !== 1).map((p) => (
              <div key={p.id} className="small muted">{p.name}'s plate: {nutrition ? nutritionLine(plateNutrition(nutrition, p.plateProfile)) : ''}</div>
            ))}
            {flags.map((f) => <Badge key={f.kind} tone="low">{f.text}</Badge>)}
            <div className="row-wrap">
              <span>Cost per serving: <strong className="num">{cost !== null ? formatCents(cost) : 'unknown'}</strong></span>
              {cost === null ? <span className="small muted">A price is missing; see the price book.</span> : null}
            </div>
          </div>
        </Card>
      </div>

      {Object.keys(recipe.plateNotes).length ? (
        <div className="section">
          <h3>Two plates</h3>
          <div className="plate-notes">
            {Object.entries(recipe.plateNotes).map(([k, v]) => (
              <div key={k} className="plate-note">
                <div className="who">{data.persons.find((p) => p.id === k)?.name ?? (k === 'default' ? 'Everyone' : k)}</div>
                <div>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section">
        <h3>Steps</h3>
        <div className="steps">
          {recipe.steps.map((s, i) => (
            <div key={i} className={`step ${s.sitBreak ? 'is-sit' : ''}`}>
              <div className="grow">
                {s.sitBreak ? <div className="small strong" style={{ color: 'var(--ok)' }}>Sit here.</div> : null}
                <div>{s.text}</div>
                {s.minutes ? <div className="small muted">{s.minutes} min{s.timerMinutes ? ` · timer ${s.timerMinutes} min` : ''}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {recipe.freezeNotes || Object.keys(recipe.reheatNotes).length ? (
        <div className="section">
          <h3>Freeze and reheat</h3>
          <Card>
            <div className="stack">
              {recipe.freezeNotes ? <p>{recipe.freezeNotes}</p> : null}
              {data.containers.map((c) => (
                <div key={c.id} className="small"><strong>{c.name}:</strong> {reheatLine(recipe, c)}</div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="section">
        <Button variant="danger" icon="trash" onClick={() => setConfirmRemove(true)}>Remove recipe</Button>
      </div>
      <Sheet open={confirmRemove} title={`Remove ${recipe.title}?`} onClose={() => setConfirmRemove(false)} footer={<><Button variant="danger" size="lg" full onClick={() => { setConfirmRemove(false); void run((repo, actor) => archiveRecipe(repo, recipe, actor)).then(() => navigate('/cook/recipes')) }}>Remove</Button><Button size="lg" full onClick={() => setConfirmRemove(false)}>Keep it</Button></>}>
        <p>It leaves suggestions and the bank. Freezer blocks made from it stay on the shelf.</p>
      </Sheet>

      <Sheet open={!!fixing} title={fixing ? `What is "${fixing.ingredientName}" in your pantry?` : ''} onClose={() => setFixing(null)} description="The fix is remembered for this household.">
        {fixing ? (
          <div className="stack">
            <SelectField label="Pantry item" value={fixing.itemId ?? ''} onChange={(e) => { const itemId = e.target.value || null; const name = data.items.find((i) => i.id === itemId)?.name ?? ''; void run((repo, actor) => linkIngredient(repo, fixing, itemId, actor, name)); setFixing(null) }}>
              <option value="">Not in the pantry</option>
              {data.items.slice().sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </SelectField>
            <Link to={`/pantry/add?name=${encodeURIComponent(fixing.ingredientName)}`} className="btn btn-secondary">Add it to the pantry</Link>
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
