import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Equipment, Recipe, RecipeTag, TenantRow } from '@/domain/types'
import { useUndoable } from '@/app/hooks/useActions'
import { useSession } from '@/app/session'
import { Badge, Button, Card, Sheet, TextArea, TextField } from '@/design/components'
import { generateRecipe, hasAiBackend, importRecipeFromUrl, NO_BACKEND, type AllergyHit, type ImportedRecipe } from '@/integrations/ai'
import { saveRecipe, type RecipeDraftIngredient } from './mutations'

/** Map the function's recipe shape onto the editor's draft so saveRecipe (and undo) does the rest. */
export function toRecipeDraft(r: ImportedRecipe, source: 'url' | 'ai', status: Recipe['status']): { draft: Omit<Recipe, keyof TenantRow | 'effortScore'>; ingredients: RecipeDraftIngredient[] } {
  return {
    draft: {
      libraryId: null,
      variantOfRecipeId: null,
      variantLabel: null,
      title: r.title,
      description: r.description,
      cuisine: r.cuisine,
      mealType: r.mealType,
      baseYield: r.baseYield > 0 ? r.baseYield : 4,
      yieldUnit: r.yieldUnit || 'servings',
      steps: r.steps.map((s) => (s.timerMinutes ? { text: s.text, timerMinutes: s.timerMinutes } : { text: s.text })),
      freezeNotes: null,
      reheatNotes: {},
      plateNotes: {},
      equipment: r.equipment as Equipment[],
      tags: r.tags as RecipeTag[],
      activeMinutes: r.activeMinutes,
      standingMinutes: r.standingMinutes,
      totalMinutes: r.totalMinutes,
      dishesCount: null,
      nutrition: null,
      costPerServingCents: null,
      source,
      sourceUrl: r.sourceUrl,
      status,
      imagePath: null,
      lastCookedAt: null,
      timesCooked: 0,
    },
    ingredients: r.ingredients.map((i) => ({ ingredientName: i.ingredientName, amount: i.amount, unit: i.unit, preparation: i.preparation, optional: i.optional })),
  }
}

function RecipePreview({ recipe, hits }: { recipe: ImportedRecipe; hits?: AllergyHit[] }) {
  const flagged = new Set((hits ?? []).map((h) => h.ingredient.toLowerCase()))
  const times = [recipe.activeMinutes ? `${recipe.activeMinutes} min active` : null, recipe.totalMinutes ? `${recipe.totalMinutes} min total` : null].filter(Boolean)
  return (
    <Card>
      <div className="row-title">{recipe.title}</div>
      <div className="small muted row-wrap">
        <span>{recipe.baseYield} {recipe.yieldUnit}</span>
        {recipe.cuisine ? <span>{recipe.cuisine}</span> : null}
        {times.map((t) => <span key={t}>{t}</span>)}
      </div>
      {recipe.description ? <p className="small">{recipe.description}</p> : null}
      <h3 className="small" style={{ marginBottom: 4 }}>Ingredients</h3>
      <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
        {recipe.ingredients.map((i, n) => (
          <li key={n}>
            {[i.amount, i.unit, i.ingredientName].filter((x) => x !== null && x !== undefined && x !== '').join(' ')}
            {i.preparation ? `, ${i.preparation}` : ''}
            {i.optional ? ' (optional)' : ''}
            {flagged.has(i.ingredientName.toLowerCase()) ? <> <Badge tone="out">allergy rule</Badge></> : null}
          </li>
        ))}
      </ul>
      {recipe.steps.length ? (
        <>
          <h3 className="small" style={{ margin: 'var(--space-3) 0 4px' }}>Steps</h3>
          <ol className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
            {recipe.steps.map((s, n) => <li key={n}>{s.text}</li>)}
          </ol>
        </>
      ) : null}
    </Card>
  )
}

function useSaveImported() {
  const { household } = useSession()
  const { run } = useUndoable()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const save = async (recipe: ImportedRecipe, source: 'url' | 'ai', status: Recipe['status'], onDone: () => void) => {
    if (!household || saving) return
    setSaving(true)
    try {
      const { draft, ingredients } = toRecipeDraft(recipe, source, status)
      const r = await run((repo, actor) => saveRecipe(repo, household.id, draft, ingredients, actor))
      onDone()
      navigate(`/cook/recipe/${r.recipe.id}`)
    } finally {
      setSaving(false)
    }
  }
  return { save, saving, householdId: household?.id ?? null }
}

/** Paste a link, preview what was read, save to the bank. Pages with recipe data need no model call. */
export function ImportUrlSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [result, setResult] = useState<{ recipe: ImportedRecipe; via: 'jsonld' | 'model' } | null>(null)
  const { save, saving, householdId } = useSaveImported()
  const backend = hasAiBackend()

  const close = () => {
    setUrl('')
    setNote(null)
    setResult(null)
    onClose()
  }
  const fetchIt = async () => {
    if (!householdId || !url.trim()) return
    setBusy(true)
    setNote(null)
    setResult(null)
    try {
      const r = await importRecipeFromUrl(householdId, url.trim())
      if (r.data) setResult(r.data)
      else setNote(r.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      title="Import from a link"
      onClose={close}
      description="Paste a recipe page. You see what was read before anything is saved."
      footer={result ? <Button variant="primary" size="lg" full icon="check" loading={saving} onClick={() => void save(result.recipe, 'url', 'approved', close)}>Save to bank</Button> : null}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void fetchIt()
        }}
      >
        <TextField label="Recipe link" type="url" inputMode="url" autoComplete="off" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        {!backend ? <p className="small muted" role="note">{NO_BACKEND} Add the recipe by hand with New.</p> : null}
        <Button type="submit" variant="primary" icon="link" loading={busy} disabled={!url.trim() || !backend}>Read the page</Button>
      </form>
      <div role="status" aria-live="polite">
        {note ? <p className="small muted">{note}</p> : null}
        {result ? (
          <div className="stack">
            <p className="small muted">{result.via === 'jsonld' ? 'Read from the page\'s own recipe data.' : 'Read from the page text.'}</p>
            <RecipePreview recipe={result.recipe} />
          </div>
        ) : null}
      </div>
    </Sheet>
  )
}

/** One text field, one preview, one save. Recipes that trip an allergy rule save as drafts. */
export function GenerateSheet({ open, onClose, initialRequest = '' }: { open: boolean; onClose: () => void; initialRequest?: string }) {
  const [request, setRequest] = useState(initialRequest)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [result, setResult] = useState<{ recipe: ImportedRecipe; allergyHits: AllergyHit[] } | null>(null)
  const { save, saving, householdId } = useSaveImported()
  const backend = hasAiBackend()

  const close = () => {
    setNote(null)
    setResult(null)
    onClose()
  }
  const ask = async () => {
    if (!householdId || !request.trim()) return
    setBusy(true)
    setNote(null)
    setResult(null)
    try {
      const r = await generateRecipe(householdId, request.trim())
      if (r.data) setResult(r.data)
      else setNote(r.error)
    } finally {
      setBusy(false)
    }
  }
  const hits = result?.allergyHits ?? []

  return (
    <Sheet
      open={open}
      title="Make me a recipe"
      onClose={close}
      description="Say what you want. The idea uses what you have in stock and follows the house rules. Nothing is saved until you say so."
      footer={result ? <Button variant="primary" size="lg" full icon="check" loading={saving} onClick={() => void save(result.recipe, 'ai', hits.length ? 'draft' : 'approved', close)}>{hits.length ? 'Save as draft' : 'Save to bank'}</Button> : null}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void ask()
        }}
      >
        <TextArea label="What do you want?" rows={3} placeholder="Cheap high-protein crockpot dinner for 6 using chicken thighs and black beans" value={request} onChange={(e) => setRequest(e.target.value)} />
        {!backend ? <p className="small muted" role="note">{NO_BACKEND} Try the suggestions under Cook instead.</p> : null}
        <Button type="submit" variant="primary" icon="sparkle" loading={busy} disabled={!request.trim() || !backend}>Make it</Button>
      </form>
      <div role="status" aria-live="polite">
        {note ? <p className="small muted">{note}</p> : null}
        {result ? (
          <div className="stack">
            {hits.length ? (
              <Card tone="out">
                <strong>Check this one.</strong> {hits.map((h) => `${h.ingredient} trips an allergy rule${h.substitute ? ` (try ${h.substitute})` : ''}`).join('. ')}. It saves as a draft so you can fix it first.
              </Card>
            ) : null}
            <RecipePreview recipe={result.recipe} hits={hits} />
          </div>
        ) : null}
      </div>
    </Sheet>
  )
}
