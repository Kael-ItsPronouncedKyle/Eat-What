import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Suggestion } from '@/domain/suggestions'
import { formatCents } from '@/domain/money'
import { formatQuantity } from '@/domain/units'
import { effortLabel } from '@/domain/effort'
import { routeLine } from '@/domain/listing'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useSession } from '@/app/session'
import { addListLine, eatFreezerBlock } from '@/data/mutations'
import { buildLine } from '@/features/shop/mutations'
import { Badge, Button, Card, Sheet } from '@/design/components'
import { MODE_LABEL } from './useSuggestions'

const MODE_TONE = { make_now: 'ok', almost_there: 'low', use_it_up: 'low', freezer_first: 'accent' } as const

export function SuggestionCard({ s, compact }: { s: Suggestion; compact?: boolean }) {
  const data = useHouseholdData()
  const { household } = useSession()
  const { run } = useUndoable()
  const navigate = useNavigate()
  const [why, setWhy] = useState(false)
  const r = s.recipe
  const missingText = s.missing.map((m) => (m.shortfall ? `${formatQuantity(m.shortfall)} ${m.ingredient.ingredientName}` : m.ingredient.ingredientName))
  const alreadyListed = (itemId: string | null, name: string) => data.list_lines.some((l) => l.status === 'open' && (itemId ? l.itemId === itemId : l.name.toLowerCase() === name.toLowerCase()))

  const addMissing = async () => {
    if (!household) return
    const open = data.list_lines.filter((l) => l.status === 'open')
    for (const m of s.missing) {
      if (alreadyListed(m.item?.id ?? null, m.ingredient.ingredientName)) continue
      const line = buildLine(household.id, { userId: '' }, { item: m.item, name: m.ingredient.ingredientName, qty: m.shortfall?.amount ?? m.ingredient.amount, unit: m.shortfall?.unit ?? m.ingredient.unit, reasons: [{ kind: 'almost_there', ref: r.id, text: r.title }], position: open.length })
      line.retailerId = routeLine(line, { items: data.items, retailers: data.retailers, routingRules: data.routing_rules, links: data.item_retailer_links })
      await run((repo, actor) => addListLine(repo, { ...line, createdBy: actor.userId, updatedBy: actor.userId }, actor), `Added ${missingText.length} ${missingText.length === 1 ? 'item' : 'items'} for ${r.title}`)
    }
  }

  return (
    <Card tone={MODE_TONE[s.mode]} className="suggestion-card">
      <div className="suggestion-head">
        <div className="grow">
          <Link to={`/cook/recipe/${r.id}`} className="suggestion-title">{r.title}</Link>
          <div className="suggestion-meta">
            <Badge tone={MODE_TONE[s.mode]}>{MODE_LABEL[s.mode]}</Badge>
            {r.cuisine ? <span>{r.cuisine}</span> : null}
            {r.activeMinutes ? <span>{r.activeMinutes} min active</span> : null}
            {s.effortScore !== null ? <span>{effortLabel(s.effortScore)}</span> : null}
            {s.costPerServingCents !== null ? <span className="num">{formatCents(s.costPerServingCents)}/serving</span> : null}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setWhy(true)} aria-label={`Why ${r.title}`}>Why this</Button>
      </div>
      {s.freezerBlock ? (
        <div className="small">
          <strong>{s.freezerBlock.countRemaining}</strong> {s.freezerBlock.portionLabel ?? ''} {s.freezerBlock.countRemaining === 1 ? 'block' : 'blocks'} in the freezer{s.freezerBlock.freezerSpot ? `, ${s.freezerBlock.freezerSpot.toLowerCase()}` : ''}. Zero prep.
        </div>
      ) : null}
      {s.expiringUsed.length ? <div className="small">Uses {s.expiringUsed.map((i) => i.name.toLowerCase()).join(', ')} before {s.expiringUsed.length === 1 ? 'it goes' : 'they go'}.</div> : null}
      {s.substitutions.length ? <div className="small">Swapped: {s.substitutions.map((x) => `${x.to} for ${x.from}`).join(', ')}{s.substitutions[0]?.personName ? ` (${s.substitutions[0].personName}'s rule)` : ''}.</div> : null}
      {s.missing.length && s.mode !== 'freezer_first' ? (
        <div className="missing-list" aria-label="Missing">
          {missingText.map((t) => (
            <Badge key={t} tone="out">need {t}</Badge>
          ))}
        </div>
      ) : null}
      {!compact ? (
        <div className="suggestion-actions">
          {s.mode === 'freezer_first' && s.freezerBlock ? (
            <Button variant="primary" size="lg" icon="check" onClick={() => void run((repo, actor) => eatFreezerBlock(repo, s.freezerBlock!, actor))}>Eat 1 tonight</Button>
          ) : (
            <Button variant="primary" size="lg" icon="cook" onClick={() => navigate(`/cook/mode/${r.id}`)}>Cook this</Button>
          )}
          {s.missing.length && s.mode !== 'freezer_first' ? <Button variant="secondary" size="lg" icon="cart" onClick={() => void addMissing()}>Add missing to list</Button> : null}
        </div>
      ) : null}
      <Sheet open={why} title={`Why ${r.title}`} onClose={() => setWhy(false)} description="Every term, nothing hidden. Terms marked × multiply; + adds.">
        <div className="why-score num">{s.score.toFixed(2)}</div>
        {s.terms.map((t, i) => (
          <div key={i} className="why-term">
            <span>{t.label}</span>
            <span className="num strong">{t.op === 'x' ? '×' : t.value >= 0 ? '+' : ''}{t.op === 'x' ? ` ${t.value.toFixed(2)}` : t.value.toFixed(2)}</span>
          </div>
        ))}
      </Sheet>
    </Card>
  )
}
