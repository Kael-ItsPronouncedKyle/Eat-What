import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { Item, PlanEntry } from '@/domain/types'
import { badDay, entriesForDay, type BadDayResult } from '@/domain/plan'
import { suggest, type ScoreTerm, type Suggestion, type SuggestionMode } from '@/domain/suggestions'
import { expiryHorizon, EXPIRY_LABEL } from '@/domain/status'
import { monthSummary } from '@/domain/budget'
import { formatCents } from '@/domain/money'
import { formatDate, monthKey, relativeDay } from '@/domain/dates'
import { useSession } from '@/app/session'
import { usePrefs, type Energy } from '@/app/prefs'
import { useHouseholdData, type HouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { eatFreezerBlock } from '@/data/mutations'
import { Badge, Button, Card, EmptyState, Icon, Segmented, Sheet, type IconName } from '@/design/components'
import { BudgetBar } from '@/features/shop/Budget'
import { applyBadDay } from './mutations'
import { costQuote, quoteFromSuggestion, type CostQuote } from './cost'
import { useHouseholdRow } from './useHouseholdRow'
import './home.css'

const ENERGY_OPTIONS: { value: Energy; label: string; description: string }[] = [
  { value: 'little', label: 'A little', description: 'Just the essentials' },
  { value: 'some', label: 'Some', description: 'Easy and medium recipes' },
  { value: 'plenty', label: 'Plenty', description: 'Everything' },
]
const ENERGY_QUESTION = 'How much energy today?'

const MODE_LABEL: Record<SuggestionMode, string> = { make_now: 'Make now', freezer_first: 'From the freezer', use_it_up: 'Use it up', almost_there: 'Almost there' }
const HOME_MODES = new Set<SuggestionMode>(['make_now', 'freezer_first', 'use_it_up'])
const EXPIRING_MAX = 5

type Horizon = 'expired' | 'two_days'
const HORIZON_RANK: Record<Horizon, number> = { expired: 0, two_days: 1 }

/** Home: today at a glance. Energy first; a little-energy day collapses to three big buttons. */
export function HomePage() {
  const { household } = useSession()
  const data = useHouseholdData()
  const today = useToday()
  const { prefs, setEnergy } = usePrefs()
  const { run } = useUndoable()
  const row = useHouseholdRow()
  const [badDayOpen, setBadDayOpen] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)

  const tonight = useMemo(() => entriesForDay(data.plan_entries, today).filter((e) => e.status === 'planned' || e.status === 'cooked'), [data.plan_entries, today])

  const suggestion = useMemo<Suggestion | null>(() => {
    if (data.loading || tonight.length > 0) return null
    try {
      const ranked = suggest({
        recipes: data.recipesWithIngredients,
        items: data.items,
        aliases: data.item_aliases,
        alwaysHave: data.alwaysHave,
        freezerBlocks: data.freezer_blocks,
        rules: data.rules,
        persons: data.persons,
        prices: data.prices,
        today,
        energy: prefs.energy,
        modes: HOME_MODES,
      })
      return ranked[0] ?? null
    } catch {
      return null
    }
  }, [data.loading, tonight.length, data.recipesWithIngredients, data.items, data.item_aliases, data.alwaysHave, data.freezer_blocks, data.rules, data.persons, data.prices, today, prefs.energy])

  const expiring = useMemo(() => {
    const out: { item: Item; horizon: Horizon }[] = []
    for (const item of data.items) {
      const h = expiryHorizon(item, today)
      if (h === 'expired' || h === 'two_days') out.push({ item, horizon: h })
    }
    return out.sort((a, b) => HORIZON_RANK[a.horizon] - HORIZON_RANK[b.horizon] || (a.item.useBy ?? '').localeCompare(b.item.useBy ?? '') || a.item.name.localeCompare(b.item.name))
  }, [data.items, today])

  const lowOut = useMemo(() => data.items.filter((i) => i.status !== 'ok').length, [data.items])

  const summary = useMemo(() => {
    if (!row) return null
    try {
      return monthSummary(data.spend, data.list_sends, row, monthKey(today))
    } catch {
      return null
    }
  }, [row, data.spend, data.list_sends, today])

  const badDayPlan = useMemo<BadDayResult | null>(() => {
    if (!badDayOpen || !household) return null
    try {
      return badDay(data.plan_entries, today, { freezerBlocks: data.freezer_blocks, recipes: data.recipesWithIngredients, householdId: household.id })
    } catch {
      return null
    }
  }, [badDayOpen, household, data.plan_entries, data.freezer_blocks, data.recipesWithIngredients, today])
  const badDayTitle = badDayPlan?.tonight ? entryTitle(badDayPlan.tonight, data) : null
  const badDayDoesSomething = !!badDayPlan && (badDayPlan.tonight !== null || badDayPlan.changes.length > 0)

  const doBadDay = async () => {
    if (!badDayPlan || !household) return
    setBadDayOpen(false)
    await run((repo, actor) => applyBadDay(repo, household.id, badDayPlan, actor, badDayTitle))
  }

  const greeting = (
    <div className="page-title home-greeting">
      <div>
        <h1>{household?.name ?? 'Home'}</h1>
        <p className="muted home-date">{formatDate(today, 'long')}</p>
      </div>
    </div>
  )

  const energy = (
    <section className="home-energy" aria-label="Energy today">
      <h2 className="home-question">{ENERGY_QUESTION}</h2>
      <Segmented label={ENERGY_QUESTION} value={prefs.energy} options={ENERGY_OPTIONS} onChange={setEnergy} size="lg" />
    </section>
  )

  if (prefs.energy === 'little') {
    return (
      <div className="page">
        {greeting}
        {energy}
        <section className="home-essentials" aria-label="Just the essentials">
          <p className="muted">Just the essentials today. Everything else can wait.</p>
          <nav className="big-three" aria-label="Essentials">
            <BigLink to="/cook" icon="cook">What can I make</BigLink>
            <BigLink to="/pantry/add" icon="plus">Add to pantry</BigLink>
            <BigLink to="/shop" icon="cart">Shopping list</BigLink>
          </nav>
          <Button variant="ghost" onClick={() => setEnergy('some')}>Show everything</Button>
        </section>
      </div>
    )
  }

  if (data.loading) {
    return (
      <div className="page" aria-busy="true">
        {greeting}
        {energy}
      </div>
    )
  }

  return (
    <div className="page">
      {greeting}
      {energy}

      <section className="section" aria-labelledby="tonight-heading">
        <div className="spread">
          <h2 id="tonight-heading">Tonight</h2>
          <Button variant="secondary" icon="chair" onClick={() => setBadDayOpen(true)}>Bad day</Button>
        </div>
        {tonight.length > 0 ? (
          <div className="stack">
            {tonight.map((e) => (
              <TonightEntry key={e.id} entry={e} data={data} today={today} />
            ))}
          </div>
        ) : suggestion ? (
          <SuggestionCard s={suggestion} data={data} today={today} onWhy={() => setWhyOpen(true)} />
        ) : (
          <EmptyState
            icon="cook"
            title="Nothing planned tonight"
            body="Pick something from what you have."
            action={
              <Link to="/cook" className="btn btn-primary btn-lg">
                What can I make
              </Link>
            }
          />
        )}
      </section>

      {expiring.length > 0 ? (
        <section className="section" aria-labelledby="expiring-heading">
          <div className="spread">
            <h2 id="expiring-heading">Expiring soon</h2>
            <Link to="/cook?mode=use_it_up" className="btn btn-ghost">
              <Icon name="leaf" /> <span className="btn-label">Use it up</span>
            </Link>
          </div>
          <div className="list">
            {expiring.slice(0, EXPIRING_MAX).map(({ item, horizon }) => (
              <Link key={item.id} to={`/pantry/item/${item.id}`} className={`list-row home-row tone-${horizon === 'expired' ? 'out' : 'low'}`}>
                <Icon name={horizon === 'expired' ? 'compost' : 'clock'} className="home-row-icon" />
                <div className="grow row-main">
                  <div className="row-title">{item.name}</div>
                  <div className="row-subtitle muted small">{expiryText(item, horizon, today)}</div>
                </div>
                <Icon name="chevronRight" className="row-chevron muted" />
              </Link>
            ))}
          </div>
          {expiring.length > EXPIRING_MAX ? (
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              And {expiring.length - EXPIRING_MAX} more in the <Link to="/pantry">pantry</Link>.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="section home-stats">
        <Link to="/pantry?view=low" className="home-link-card">
          <Card tone={lowOut > 0 ? 'low' : 'ok'} interactive>
            <div className="spread">
              <div className="row">
                <Icon name={lowOut > 0 ? 'alert' : 'check'} size="1.6em" className={`home-stat-icon ${lowOut > 0 ? 'is-low' : 'is-ok'}`} />
                <div>
                  <div className="card-title num" role="status">{lowOut === 0 ? 'Nothing low or out' : `${lowOut} low or out`}</div>
                  <div className="small muted">{lowOut > 0 ? 'Tap to see what to restock.' : 'The pantry is stocked.'}</div>
                </div>
              </div>
              <Icon name="chevronRight" className="muted" />
            </div>
          </Card>
        </Link>
        {summary ? (
          <Link to="/shop/budget" className="home-link-card">
            <BudgetBar summary={summary} compact />
          </Link>
        ) : null}
      </div>

      <Sheet
        open={badDayOpen}
        title="Bad day"
        description="No cooking tonight. That is fine."
        onClose={() => setBadDayOpen(false)}
        footer={
          badDayOpen && badDayPlan ? (
            badDayDoesSomething ? (
              <>
                <Button variant="primary" size="lg" full icon="check" onClick={() => void doBadDay()}>
                  Do it
                </Button>
                <Button size="lg" full onClick={() => setBadDayOpen(false)}>
                  Leave it
                </Button>
              </>
            ) : (
              <Button size="lg" full onClick={() => setBadDayOpen(false)}>
                OK
              </Button>
            )
          ) : null
        }
      >
        {badDayOpen && badDayPlan ? (
          <div className="stack">
            <p className="large">{badDayPlan.message}</p>
            {badDayPlan.changes.length > 0 ? (
              <ul className="bad-day-changes" aria-label="What moves">
                {badDayPlan.changes.map((c) => (
                  <li key={c.entry.id}>
                    <Icon name="arrowRight" size="1em" />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {badDayPlan.tonight && badDayTitle ? <p className="small muted">{badDayTitle} goes on tonight's plan. Undo is one tap if you change your mind.</p> : null}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={whyOpen && !!suggestion} title={suggestion ? `Why ${suggestion.recipe.title}` : 'Why this'} onClose={() => setWhyOpen(false)}>
        {whyOpen && suggestion ? (
          <ul className="why-list" aria-label="Score terms">
            {suggestion.terms.map((t) => (
              <li key={t.key}>
                <span>{t.label}</span>
                <span className="num muted">{termValue(t)}</span>
              </li>
            ))}
            <li>
              <strong>Score</strong>
              <strong className="num">{suggestion.score}</strong>
            </li>
          </ul>
        ) : null}
      </Sheet>
    </div>
  )
}

function BigLink({ to, icon, children }: { to: string; icon: IconName; children: string }) {
  return (
    <Link to={to} className="btn btn-primary btn-lg">
      <Icon name={icon} size="1.3em" />
      <span className="btn-label">{children}</span>
    </Link>
  )
}

function TonightEntry({ entry, data, today }: { entry: PlanEntry; data: HouseholdData; today: string }) {
  const { run } = useUndoable()
  const person = entry.personId ? (data.persons.find((p) => p.id === entry.personId) ?? null) : null
  const personBadge = person ? <Badge tone="accent">{person.name}</Badge> : null

  if (entry.kind === 'freezer_block') {
    const block = data.freezer_blocks.find((b) => b.id === entry.freezerBlockId) ?? null
    const recipe = block?.recipeId ? (data.recipes.find((r) => r.id === block.recipeId) ?? null) : null
    return (
      <Card tone="accent" className="tonight-card">
        <div>
          <div className="card-title">{block?.title ?? 'Something from the freezer'}</div>
          <div className="tonight-meta small muted">
            <Badge tone="accent">From the freezer</Badge>
            {block?.portionLabel ? <span>{block.portionLabel}</span> : null}
            {block ? <span className="num">{block.countRemaining} left</span> : null}
            {personBadge}
          </div>
        </div>
        {block && block.countRemaining > 0 ? (
          <div className="tonight-actions">
            <Button variant="primary" size="lg" icon="snowflake" onClick={() => void run((repo, actor) => eatFreezerBlock(repo, block, actor))}>
              Eat 1
            </Button>
            {recipe ? (
              <Link to={`/cook/recipe/${recipe.id}`} className="btn btn-ghost">
                Reheat notes
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="small muted">
            None left in the freezer. <Link to="/pantry/freezer">See the shelf</Link>
          </p>
        )}
      </Card>
    )
  }

  if (entry.kind === 'note') {
    return (
      <Card className="tonight-card">
        <div className="card-title">{entry.note ?? 'Note'}</div>
        {personBadge ? <div className="tonight-meta small muted">{personBadge}</div> : null}
      </Card>
    )
  }

  const recipe = data.recipesWithIngredients.find((r) => r.id === entry.recipeId) ?? null
  const quote = recipe ? costQuote(recipe, { items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave, prices: data.prices, today }) : null
  return (
    <Card tone="accent" className="tonight-card">
      <div>
        <div className="card-title">{recipe ? <Link to={`/cook/recipe/${recipe.id}`}>{recipe.title}</Link> : (entry.note ?? 'A recipe')}</div>
        <div className="tonight-meta small muted">
          {entry.kind === 'batch' ? <Badge tone="accent">Cook-week batch</Badge> : null}
          {entry.status === 'cooked' ? <Badge tone="ok">Cooked</Badge> : null}
          {recipe?.activeMinutes ? <span className="num">{recipe.activeMinutes} min active</span> : null}
          <CostChip quote={quote} />
          {personBadge}
        </div>
      </div>
      {recipe ? (
        <div className="tonight-actions">
          <Link to={`/cook/recipe/${recipe.id}`} className="btn btn-primary btn-lg">
            <Icon name="cook" /> <span className="btn-label">Open</span>
          </Link>
        </div>
      ) : null}
    </Card>
  )
}

function SuggestionCard({ s, data, today, onWhy }: { s: Suggestion; data: HouseholdData; today: string; onWhy: () => void }) {
  const quote = quoteFromSuggestion(s, data.prices, today)
  const expiringFirst = s.expiringUsed[0]
  return (
    <Card tone="accent" className="tonight-card">
      <div>
        <div className="tonight-lead">Nothing planned. Our pick from what you have:</div>
        <div className="card-title">
          <Link to={`/cook/recipe/${s.recipe.id}`}>{s.recipe.title}</Link>
        </div>
        <div className="tonight-meta small muted">
          <Badge tone="accent">{MODE_LABEL[s.mode]}</Badge>
          {s.freezerBlock ? <span className="num">{s.freezerBlock.countRemaining} in the freezer</span> : null}
          {s.effortScore !== null ? <span className="num">Effort {s.effortScore} of 5</span> : null}
          {expiringFirst ? <span>Uses the {expiringFirst.name.toLowerCase()}</span> : null}
          <CostChip quote={quote} />
        </div>
      </div>
      <div className="tonight-actions">
        <Link to={`/cook/recipe/${s.recipe.id}`} className="btn btn-primary btn-lg">
          <Icon name="cook" /> <span className="btn-label">Open</span>
        </Link>
        <Button variant="ghost" icon="info" onClick={onWhy}>
          Why this
        </Button>
      </div>
    </Card>
  )
}

/** Shows a price only when every required ingredient has one; starter estimates say so. */
function CostChip({ quote }: { quote: CostQuote | null }) {
  if (!quote) return null
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="num">{formatCents(quote.cents)} a serving</span>
      {quote.starter ? <Badge tone="low">starter</Badge> : null}
    </span>
  )
}

function entryTitle(entry: Pick<PlanEntry, 'kind' | 'recipeId' | 'freezerBlockId' | 'note'>, data: HouseholdData): string {
  if (entry.kind === 'freezer_block') return data.freezer_blocks.find((b) => b.id === entry.freezerBlockId)?.title ?? 'Something from the freezer'
  if (entry.recipeId) return data.recipes.find((r) => r.id === entry.recipeId)?.title ?? 'A recipe'
  return entry.note ?? 'Dinner'
}

function expiryText(item: Item, horizon: Horizon, today: string): string {
  if (horizon === 'expired' || !item.useBy) return EXPIRY_LABEL.expired
  const rel = relativeDay(item.useBy, today)
  if (rel === 'Today') return 'Use today'
  if (rel === 'Tomorrow') return 'Use by tomorrow'
  return `Use by ${rel}`
}

function termValue(t: ScoreTerm): string {
  if (t.op === '+') return `${t.value >= 0 ? '+' : ''}${t.value}`
  return `× ${t.value}`
}
