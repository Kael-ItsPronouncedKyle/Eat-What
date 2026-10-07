import { useMemo, useState } from 'react'
import type { Equipment, Rule, RuleType } from '@/domain/types'
import { describeRule } from '@/domain/rules'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { Badge, Button, Card, Segmented, SelectField, Sheet, TextField, Toggle } from '@/design/components'
import { addRule, removeRule, updateRule } from './mutations'

const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'crockpot', label: 'Crockpot' }, { value: 'oven', label: 'Oven' }, { value: 'stovetop', label: 'Stovetop' }, { value: 'grill', label: 'Grill' },
  { value: 'microwave', label: 'Microwave' }, { value: 'air_fryer', label: 'Air fryer' }, { value: 'instant_pot', label: 'Instant Pot' }, { value: 'sheet_pan', label: 'Sheet pan' },
  { value: 'blender', label: 'Blender' }, { value: 'souper_cubes', label: 'Souper Cubes' }, { value: 'ninja_woodfire', label: 'Ninja Woodfire' },
]

const TYPE_LABEL: Record<RuleType, string> = { allergy: 'Allergy or dislike', prep: 'Prep', diet: 'Diet', cuisine: 'Cuisine' }

/** Plain-language entry: "Sarah can't have coconut, swap lime juice" becomes a structured allergy row shown for confirm. */
export function parsePlainRule(text: string, persons: { id: string; name: string }[]): { type: 'allergy'; personId: string | null; ingredient: string; substitute: string | null; severity: 'avoid' | 'dislike' | 'severe' } | null {
  const t = text.trim()
  const m = /^(?:(.+?)\s+)?(?:can't|cannot|can not|doesn't|does not|won't|is allergic to|allergic to|no|hates?|dislikes?)\s+(?:have\s+|eat\s+)?(.+?)(?:[,;.]?\s+(?:swap|sub|substitute|use)(?: in)?\s+(.+))?$/i.exec(t)
  if (!m) return null
  const who = (m[1] ?? '').replace(/^my\s+/i, '').trim()
  const ingredient = (m[2] ?? '').trim().replace(/^(any|the)\s+/i, '')
  if (!ingredient) return null
  const person = who ? persons.find((p) => p.name.toLowerCase() === who.toLowerCase() || who.toLowerCase().includes(p.name.toLowerCase())) ?? null : null
  const severe = /allergic|severe|anaphyl/i.test(t)
  const dislike = /hate|dislike|doesn't like|does not like/i.test(t)
  return { type: 'allergy', personId: person?.id ?? null, ingredient: ingredient.toLowerCase(), substitute: m[3]?.trim() || null, severity: severe ? 'severe' : dislike ? 'dislike' : 'avoid' }
}

export function RulesEditor() {
  const { household } = useSession()
  const data = useHouseholdData()
  const { run } = useUndoable()
  const [plain, setPlain] = useState('')
  const [adding, setAdding] = useState<RuleType | null>(null)
  const ctx = useMemo(() => ({ rules: data.rules, persons: data.persons }), [data.rules, data.persons])
  const parsed = useMemo(() => (plain.trim() ? parsePlainRule(plain, data.persons) : null), [plain, data.persons])

  const describe = (r: Rule) => {
    try {
      return describeRule(r, ctx)
    } catch {
      return `${TYPE_LABEL[r.type]}: ${JSON.stringify(r.payload)}`
    }
  }
  const grouped = (['allergy', 'prep', 'diet', 'cuisine'] as RuleType[]).map((t) => ({ type: t, rules: data.rules.filter((r) => r.type === t) }))

  return (
    <div className="page">
      <BackHeader title="Rules" to="/house" />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        Every suggestion, plan, and list runs through these before it reaches the screen.
      </p>

      <Card tone="accent">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (!parsed || !household) return
            const who = data.persons.find((p) => p.id === parsed.personId)
            void run((repo, actor) =>
              addRule(repo, household.id, { type: 'allergy', payload: { ingredient: parsed.ingredient, severity: parsed.severity, substitute: parsed.substitute ?? undefined }, appliesToPersonId: parsed.personId, active: true }, actor, `${who ? who.name : 'Everyone'}: no ${parsed.ingredient}${parsed.substitute ? `, swap ${parsed.substitute}` : ''}`),
            )
            setPlain('')
          }}
        >
          <TextField label="Say it plainly" placeholder="Sarah can't have coconut, swap lime juice" value={plain} onChange={(e) => setPlain(e.target.value)} />
          {parsed ? (
            <div className="row-wrap" role="status">
              <Badge tone="accent">{data.persons.find((p) => p.id === parsed.personId)?.name ?? 'Everyone'}</Badge>
              <Badge tone="out">no {parsed.ingredient}</Badge>
              {parsed.substitute ? <Badge tone="ok">swap {parsed.substitute}</Badge> : null}
              <Badge>{parsed.severity}</Badge>
            </div>
          ) : plain.trim() ? (
            <p className="small muted">Try "Liam is allergic to shellfish" or "no cilantro, use scallion greens".</p>
          ) : null}
          <Button type="submit" variant="primary" disabled={!parsed}>
            Add this rule
          </Button>
        </form>
      </Card>

      {grouped.map((g) => (
        <div key={g.type} className="section">
          <div className="spread" style={{ marginBottom: 'var(--space-2)' }}>
            <h3>{TYPE_LABEL[g.type]}</h3>
            <Button variant="ghost" size="sm" icon="plus" onClick={() => setAdding(g.type)}>
              Add
            </Button>
          </div>
          {g.rules.length === 0 ? <p className="muted small">None yet.</p> : null}
          <div className="stack">
            {g.rules.map((r) => (
              <Card key={r.id} tone={r.active ? (r.type === 'allergy' ? 'out' : 'neutral') : 'neutral'}>
                <div className="rule-card">
                  <div className="grow rule-text">{describe(r)}</div>
                  <Toggle label={r.active ? 'On' : 'Off'} checked={r.active} onChange={(v) => void run((repo, actor) => updateRule(repo, r, { active: v }, actor, `${v ? 'Turned on' : 'Turned off'}: ${describe(r)}`))} />
                  <Button variant="ghost" size="sm" icon="trash" aria-label="Remove rule" onClick={() => void run((repo, actor) => removeRule(repo, r, actor, `Removed rule: ${describe(r)}`))} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {adding && household ? (
        <RuleSheet
          type={adding}
          persons={data.persons}
          onClose={() => setAdding(null)}
          onSave={(payload, personId, summary) => {
            void run((repo, actor) => addRule(repo, household.id, { type: adding, payload, appliesToPersonId: personId, active: true }, actor, summary))
            setAdding(null)
          }}
        />
      ) : null}
    </div>
  )
}

function RuleSheet({ type, persons, onClose, onSave }: { type: RuleType; persons: { id: string; name: string }[]; onClose: () => void; onSave: (payload: Rule['payload'], personId: string | null, summary: string) => void }) {
  const [personId, setPersonId] = useState('')
  const [ingredient, setIngredient] = useState('')
  const [substitute, setSubstitute] = useState('')
  const [severity, setSeverity] = useState<'avoid' | 'dislike' | 'severe'>('avoid')
  const [maxStanding, setMaxStanding] = useState('20')
  const [seated, setSeated] = useState(true)
  const [equipment, setEquipment] = useState<Equipment[]>(['oven', 'stovetop', 'microwave'])
  const [sodium, setSodium] = useState('')
  const [protein, setProtein] = useState('')
  const [calMax, setCalMax] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [weight, setWeight] = useState<'liked' | 'tolerated' | 'avoid'>('liked')
  const who = persons.find((p) => p.id === personId)?.name ?? 'Everyone'

  const save = () => {
    if (type === 'allergy') onSave({ ingredient: ingredient.trim().toLowerCase(), severity, substitute: substitute.trim() || undefined }, personId || null, `${who}: no ${ingredient.trim()}`)
    if (type === 'prep') onSave({ maxStandingMinutes: Number(maxStanding) || undefined, seatedPreferred: seated, equipment }, personId || null, `Prep rule: ${maxStanding} min standing`)
    if (type === 'diet') onSave({ sodiumMaxMg: sodium ? Number(sodium) : undefined, proteinMinG: protein ? Number(protein) : undefined, caloriesMax: calMax ? Number(calMax) : undefined }, personId || null, `Diet rule for ${who}`)
    if (type === 'cuisine') onSave({ cuisine: cuisine.trim(), weight }, null, `${cuisine.trim()}: ${weight}`)
  }
  const valid = type === 'allergy' ? !!ingredient.trim() : type === 'cuisine' ? !!cuisine.trim() : true

  return (
    <Sheet open title={`Add ${TYPE_LABEL[type].toLowerCase()} rule`} onClose={onClose} footer={<Button variant="primary" size="lg" full disabled={!valid} onClick={save}>Save rule</Button>}>
      <div className="rule-form">
        {type !== 'cuisine' ? (
          <SelectField label="Applies to" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Everyone</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </SelectField>
        ) : null}
        {type === 'allergy' ? (
          <>
            <TextField label="Ingredient" value={ingredient} onChange={(e) => setIngredient(e.target.value)} placeholder="coconut" />
            <TextField label="Preferred substitute" value={substitute} onChange={(e) => setSubstitute(e.target.value)} placeholder="lime juice" />
            <Segmented label="How serious" value={severity} onChange={setSeverity} options={[{ value: 'dislike', label: 'Dislike' }, { value: 'avoid', label: 'Avoid' }, { value: 'severe', label: 'Allergy' }]} />
          </>
        ) : null}
        {type === 'prep' ? (
          <>
            <TextField label="Max standing minutes" inputMode="numeric" value={maxStanding} onChange={(e) => setMaxStanding(e.target.value)} />
            <Toggle label="Seated prep preferred" checked={seated} onChange={setSeated} />
            <div className="field">
              <span className="field-label">Equipment you have</span>
              <div className="row-wrap">
                {EQUIPMENT.map((e) => (
                  <button key={e.value} type="button" className={`chip chip-button ${equipment.includes(e.value) ? 'is-selected' : ''}`} aria-pressed={equipment.includes(e.value)} onClick={() => setEquipment(equipment.includes(e.value) ? equipment.filter((x) => x !== e.value) : [...equipment, e.value])}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {type === 'diet' ? (
          <>
            <TextField label="Sodium cap per serving (mg)" inputMode="numeric" value={sodium} onChange={(e) => setSodium(e.target.value)} placeholder="700" />
            <TextField label="Protein floor per serving (g)" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="25" />
            <TextField label="Calories cap per serving" inputMode="numeric" value={calMax} onChange={(e) => setCalMax(e.target.value)} placeholder="600" />
          </>
        ) : null}
        {type === 'cuisine' ? (
          <>
            <TextField label="Cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Mexican" />
            <Segmented label="How you feel about it" value={weight} onChange={setWeight} options={[{ value: 'liked', label: 'Liked' }, { value: 'tolerated', label: 'Tolerated' }, { value: 'avoid', label: 'Avoid' }]} />
          </>
        ) : null}
      </div>
    </Sheet>
  )
}
