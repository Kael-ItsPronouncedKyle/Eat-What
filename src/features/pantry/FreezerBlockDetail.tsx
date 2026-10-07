import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { FoodType } from '@/domain/types'
import { daysBetween, formatDate } from '@/domain/dates'
import { labelText, qualityUntil, reheatLine } from '@/domain/labels'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { copyText } from '@/integrations/share'
import { Badge, Button, Card, EmptyState, SelectField, Sheet, Stepper, TextField } from '@/design/components'
import { eatFreezerBlock } from '@/data/mutations'
import { removeBlock, updateBlock } from './mutations'

const FOOD_TYPES: { value: FoodType; label: string }[] = [
  { value: 'soup', label: 'Soup, stew, chili' },
  { value: 'cooked_meat', label: 'Cooked meat' },
  { value: 'raw_marinated', label: 'Raw dump kit' },
  { value: 'baked', label: 'Baked goods' },
  { value: 'sauce', label: 'Sauce' },
  { value: 'grain', label: 'Rice, beans, grains' },
  { value: 'vegetable', label: 'Vegetables' },
  { value: 'other', label: 'Other' },
]

export function FreezerBlockDetail() {
  const { id } = useParams()
  const data = useHouseholdData()
  const today = useToday()
  const navigate = useNavigate()
  const { run } = useUndoable()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const block = data.freezer_blocks.find((b) => b.id === id) ?? null
  if (data.loading) return <div className="page" aria-busy="true" />
  if (!block) {
    return (
      <div className="page">
        <BackHeader title="Freezer block" to="/pantry/freezer" />
        <EmptyState icon="snowflake" title="That block is gone" />
      </div>
    )
  }
  const person = data.persons.find((p) => p.id === block.personId) ?? null
  const recipe = data.recipes.find((r) => r.id === block.recipeId) ?? null
  const container = data.containers.find((c) => c.id === block.containerId) ?? null
  const daysLeft = block.qualityUntil ? daysBetween(today, block.qualityUntil) : null
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch {
      return fallback
    }
  }
  const labels = {
    tape: safe(() => labelText(block, { recipe, person, container, format: 'tape' }), block.title),
    bag: safe(() => labelText(block, { recipe, person, container, format: 'bag' }), block.title),
    sheet: safe(() => labelText(block, { recipe, person, container, format: 'sheet' }), block.title),
  }
  const reheat = safe(() => reheatLine(recipe, container), '')

  const copy = async (text: string, which: string) => {
    if (await copyText(text)) setCopied(which)
  }

  return (
    <div className="page">
      <BackHeader title={block.title} to="/pantry/freezer" />
      <Card tone={daysLeft !== null && daysLeft <= 14 ? 'low' : 'accent'}>
        <div className="stack">
          <span className="tape-label">{labels.tape}</span>
          <div className="row-wrap">
            {person ? <Badge tone="accent">{person.name}</Badge> : <Badge>Ours</Badge>}
            {block.portionLabel ? <Badge>{block.portionLabel}</Badge> : null}
            {container ? <Badge>{container.name}</Badge> : null}
            {block.freezerSpot ? <Badge>{block.freezerSpot}</Badge> : null}
          </div>
          <div className="spread">
            <div className="detail-stat">
              <span className="label">Blocks left</span>
              <span className="block-count num">{block.countRemaining}</span>
            </div>
            <Stepper label="Blocks left" size="lg" value={block.countRemaining} onChange={(n) => void run((repo, actor) => updateBlock(repo, block, { countRemaining: Math.max(0, Math.round(n)) }, actor, `${block.title}: ${Math.round(n)} left`))} />
          </div>
          <div className="small muted">
            {block.cookedOn ? `Cooked ${formatDate(block.cookedOn, 'weekday')}. ` : ''}
            {block.qualityUntil ? (daysLeft! < 0 ? `Past its best-by date (${formatDate(block.qualityUntil)}). Still safe frozen; eat it soon.` : `Best by ${formatDate(block.qualityUntil, 'weekday')}.`) : ''}
          </div>
          {reheat ? (
            <p>
              <strong>Reheat:</strong> {reheat}
            </p>
          ) : null}
          <Button variant="primary" size="lg" full icon="check" disabled={block.countRemaining === 0} onClick={() => void run((repo, actor) => eatFreezerBlock(repo, block, actor))}>
            Eat 1
          </Button>
          {recipe ? (
            <Button variant="secondary" size="md" full icon="cook" onClick={() => navigate(`/cook/recipe/${recipe.id}`)}>
              Open the recipe
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="section">
        <h3>Labels</h3>
        <p className="muted small">Sized for masking tape, a bag's white panel, or an address-label sheet. Copy, then write or print.</p>
        <div className="stack">
          {(['tape', 'bag', 'sheet'] as const).map((f) => (
            <Card key={f}>
              <div className="spread">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'inherit' }}>{labels[f]}</pre>
                <Button variant="secondary" icon="copy" onClick={() => void copy(labels[f], f)} aria-label={`Copy ${f} label`}>
                  {copied === f ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <BlockEditor block={block} />

      <div className="section">
        <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
          Remove from freezer
        </Button>
      </div>
      <Sheet
        open={confirmDelete}
        title={`Remove ${block.title}?`}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="danger" size="lg" full onClick={() => { setConfirmDelete(false); void run((repo, actor) => removeBlock(repo, block, actor)).then(() => navigate('/pantry/freezer')) }}>
              Remove
            </Button>
            <Button size="lg" full onClick={() => setConfirmDelete(false)}>Keep it</Button>
          </>
        }
      >
        <p>Use Eat 1 if you are eating it. Remove is for blocks that went bad or were given away.</p>
      </Sheet>
    </div>
  )
}

function BlockEditor({ block }: { block: NonNullable<ReturnType<typeof useHouseholdData>['freezer_blocks'][number]> }) {
  const data = useHouseholdData()
  const { run } = useUndoable()
  const [spot, setSpot] = useState(block.freezerSpot ?? '')
  const [personId, setPersonId] = useState(block.personId ?? '')
  const [foodType, setFoodType] = useState<FoodType>(block.foodType)
  const [cookedOn, setCookedOn] = useState(block.cookedOn ?? '')
  const dirty = spot !== (block.freezerSpot ?? '') || personId !== (block.personId ?? '') || foodType !== block.foodType || cookedOn !== (block.cookedOn ?? '')
  return (
    <div className="section">
      <h3>Details</h3>
      <div className="stack">
        <TextField label="Where it sits" placeholder="Door, top drawer, chest left" value={spot} onChange={(e) => setSpot(e.target.value)} />
        <SelectField label="For" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Ours</option>
          {data.persons.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </SelectField>
        <SelectField label="Food type (sets the best-by default)" value={foodType} onChange={(e) => setFoodType(e.target.value as FoodType)}>
          {FOOD_TYPES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </SelectField>
        <TextField label="Cooked on" type="date" value={cookedOn} onChange={(e) => setCookedOn(e.target.value)} />
        <Button
          variant="primary"
          disabled={!dirty}
          onClick={() => {
            let quality = block.qualityUntil
            try {
              if (cookedOn) quality = qualityUntil(cookedOn, foodType, null)
            } catch {
              /* keep existing */
            }
            void run((repo, actor) => updateBlock(repo, block, { freezerSpot: spot || null, personId: personId || null, foodType, cookedOn: cookedOn || null, qualityUntil: quality }, actor))
          }}
        >
          Save details
        </Button>
      </div>
    </div>
  )
}
