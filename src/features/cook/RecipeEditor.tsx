import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { Equipment, MealType, RecipeStep, RecipeTag } from '@/domain/types'
import { parseIngredientLine } from '@/domain/importers/neelix'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useSession } from '@/app/session'
import { Button, Chip, SelectField, TextArea, TextField, Toggle } from '@/design/components'
import { saveRecipe, type RecipeDraftIngredient } from './mutations'

const TAGS: { value: RecipeTag; label: string }[] = [
  { value: 'one_pot', label: 'One pot' }, { value: 'no_chop', label: 'No chop' }, { value: 'sheet_pan', label: 'Sheet pan' }, { value: 'freezer_safe', label: 'Freezer safe' },
  { value: 'cook_from_frozen', label: 'Cook from frozen' }, { value: 'microwave_only', label: 'Microwave only' }, { value: 'dump_kit', label: 'Dump kit' }, { value: 'seated_friendly', label: 'Seated friendly' },
]
const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'crockpot', label: 'Crockpot' }, { value: 'oven', label: 'Oven' }, { value: 'stovetop', label: 'Stovetop' }, { value: 'grill', label: 'Grill' }, { value: 'microwave', label: 'Microwave' },
  { value: 'sheet_pan', label: 'Sheet pan' }, { value: 'instant_pot', label: 'Instant Pot' }, { value: 'air_fryer', label: 'Air fryer' }, { value: 'souper_cubes', label: 'Souper Cubes' }, { value: 'ninja_woodfire', label: 'Ninja Woodfire' },
]

/** New or edit recipe. Ingredients are typed one per line and parsed into structured rows ("2 cans black beans, drained"). */
export function RecipeEditor() {
  const { id } = useParams()
  const data = useHouseholdData()
  const { household } = useSession()
  const { run } = useUndoable()
  const navigate = useNavigate()
  const existing = id ? (data.recipesWithIngredients.find((r) => r.id === id) ?? null) : null
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [cuisine, setCuisine] = useState(existing?.cuisine ?? '')
  const [mealType, setMealType] = useState<MealType>(existing?.mealType ?? 'dinner')
  const [yieldN, setYieldN] = useState(String(existing?.baseYield ?? 4))
  const [yieldUnit, setYieldUnit] = useState(existing?.yieldUnit ?? 'servings')
  const [ingredientsText, setIngredientsText] = useState(existing ? existing.ingredients.map((i) => `${i.amount ?? ''} ${i.unit ?? ''} ${i.ingredientName}${i.preparation ? `, ${i.preparation}` : ''}${i.optional ? ' (optional)' : ''}`.replace(/\s+/g, ' ').trim()).join('\n') : '')
  const [stepsText, setStepsText] = useState(existing ? existing.steps.map((s) => s.text).join('\n') : '')
  const [active, setActive] = useState(String(existing?.activeMinutes ?? ''))
  const [standing, setStanding] = useState(String(existing?.standingMinutes ?? ''))
  const [total, setTotal] = useState(String(existing?.totalMinutes ?? ''))
  const [dishes, setDishes] = useState(String(existing?.dishesCount ?? ''))
  const [tags, setTags] = useState<RecipeTag[]>(existing?.tags ?? [])
  const [equipment, setEquipment] = useState<Equipment[]>(existing?.equipment ?? [])
  const [freezeNotes, setFreezeNotes] = useState(existing?.freezeNotes ?? '')
  const [plateRich, setPlateRich] = useState(existing ? Object.values(existing.plateNotes)[0] ?? '' : '')
  const [plateLight, setPlateLight] = useState(existing ? Object.values(existing.plateNotes)[1] ?? '' : '')
  const [draft, setDraft] = useState(existing?.status === 'draft')
  const [saving, setSaving] = useState(false)

  const parsedIngredients: RecipeDraftIngredient[] = ingredientsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const optional = /\(optional\)/i.test(l)
    const p = parseIngredientLine(l.replace(/\(optional\)/i, '').trim())
    return { ingredientName: p.name, amount: p.amount, unit: p.unit, preparation: p.preparation, optional }
  })
  const steps: RecipeStep[] = stepsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((text) => {
    const timer = /(\d+)\s*(?:min|minute)/i.exec(text)
    return { text, timerMinutes: timer ? Number(timer[1]) : undefined, sitBreak: /\bsit\b/i.test(text) }
  })
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const save = async () => {
    if (!household || !title.trim()) return
    setSaving(true)
    try {
      const persons = data.persons
      const richer = persons.find((p) => p.plateProfile.richness === 'richer')?.id ?? 'richer'
      const lighter = persons.find((p) => p.plateProfile.richness === 'lighter')?.id ?? 'lighter'
      const plateNotes: Record<string, string> = {}
      if (plateRich.trim()) plateNotes[richer] = plateRich.trim()
      if (plateLight.trim()) plateNotes[lighter] = plateLight.trim()
      const r = await run((repo, actor) =>
        saveRecipe(
          repo,
          household.id,
          {
            libraryId: existing?.libraryId ?? null,
            variantOfRecipeId: existing?.variantOfRecipeId ?? null,
            variantLabel: existing?.variantLabel ?? null,
            title: title.trim(),
            description: description.trim() || null,
            cuisine: cuisine.trim() || null,
            mealType,
            baseYield: Number(yieldN) > 0 ? Number(yieldN) : 4,
            yieldUnit: yieldUnit.trim() || 'servings',
            steps,
            freezeNotes: freezeNotes.trim() || null,
            reheatNotes: existing?.reheatNotes ?? {},
            plateNotes,
            equipment,
            tags,
            activeMinutes: active ? Number(active) : null,
            standingMinutes: standing ? Number(standing) : null,
            totalMinutes: total ? Number(total) : null,
            dishesCount: dishes ? Number(dishes) : null,
            nutrition: null,
            costPerServingCents: null,
            source: existing?.source ?? 'manual',
            sourceUrl: existing?.sourceUrl ?? null,
            status: draft ? 'draft' : 'approved',
            imagePath: existing?.imagePath ?? null,
            lastCookedAt: existing?.lastCookedAt ?? null,
            timesCooked: existing?.timesCooked ?? 0,
          },
          parsedIngredients,
          actor,
          existing,
        ),
      )
      navigate(`/cook/recipe/${r.recipe.id}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <BackHeader title={existing ? `Edit ${existing.title}` : 'New recipe'} to={existing ? `/cook/recipe/${existing.id}` : '/cook/recipes'} />
      <form className="stack-lg" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        <TextField label="One line about it" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid-2">
          <TextField label="Cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Mexican" />
          <SelectField label="Meal" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
            {(['breakfast', 'lunch', 'dinner', 'snack', 'side', 'dessert', 'component'] as MealType[]).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </SelectField>
        </div>
        <div className="grid-2">
          <TextField label="Makes" inputMode="decimal" value={yieldN} onChange={(e) => setYieldN(e.target.value)} />
          <TextField label="Unit" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} placeholder="servings, cups, quarts" />
        </div>
        <TextArea label="Ingredients, one per line" rows={8} value={ingredientsText} onChange={(e) => setIngredientsText(e.target.value)} placeholder={'2 lb boneless skinless chicken thighs\n2 cans black beans, drained\n1/4 cup cilantro (optional)'} hint={parsedIngredients.length ? `${parsedIngredients.length} ingredients: ${parsedIngredients.slice(0, 3).map((i) => `${i.amount ?? ''} ${i.unit ?? ''} ${i.ingredientName}`.replace(/\s+/g, ' ').trim()).join('; ')}${parsedIngredients.length > 3 ? '; ...' : ''}` : 'Amount, unit, name, then a comma for prep.'} />
        <TextArea label="Steps, one per line" rows={8} value={stepsText} onChange={(e) => setStepsText(e.target.value)} placeholder={'Brown the beef, 10 minutes.\nSimmer 2 hours. Sit for this.'} hint={'Write "sit" in a step and cook mode adds a break. A number of minutes becomes a timer.'} />
        <div className="grid-2">
          <TextField label="Active minutes" inputMode="numeric" value={active} onChange={(e) => setActive(e.target.value)} />
          <TextField label="Standing minutes" inputMode="numeric" value={standing} onChange={(e) => setStanding(e.target.value)} />
          <TextField label="Total minutes" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
          <TextField label="Dishes used" inputMode="numeric" value={dishes} onChange={(e) => setDishes(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">Tags</span>
          <div className="row-wrap">
            {TAGS.map((t) => <Chip key={t.value} selected={tags.includes(t.value)} onClick={() => setTags(toggle(tags, t.value))}>{t.label}</Chip>)}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Equipment</span>
          <div className="row-wrap">
            {EQUIPMENT.map((t) => <Chip key={t.value} selected={equipment.includes(t.value)} onClick={() => setEquipment(toggle(equipment, t.value))}>{t.label}</Chip>)}
          </div>
        </div>
        <TextArea label="Freeze notes" rows={2} value={freezeNotes} onChange={(e) => setFreezeNotes(e.target.value)} placeholder="Freeze in 2-cup blocks; reheat low with a splash of water." />
        <div className="grid-2">
          <TextField label="Richer plate note" value={plateRich} onChange={(e) => setPlateRich(e.target.value)} placeholder="Full ladle, cheese, cornbread" />
          <TextField label="Lighter plate note" value={plateLight} onChange={(e) => setPlateLight(e.target.value)} placeholder="Smaller ladle over rice" />
        </div>
        <Toggle label="Keep as a draft" hint="Drafts stay out of suggestions until approved." checked={draft} onChange={setDraft} />
        <div className="sticky-actions">
          <Button type="submit" variant="primary" size="lg" disabled={!title.trim() || saving} loading={saving}>{existing ? 'Save changes' : 'Save recipe'}</Button>
        </div>
      </form>
    </div>
  )
}
