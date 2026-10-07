import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { Deduction, FreezerBlock, TenantRow } from '@/domain/types'
import { recipeAvailability } from '@/domain/matching'
import { applySubstitutions } from '@/domain/rules'
import { formatQuantity } from '@/domain/units'
import { guessFoodType, qualityUntil } from '@/domain/labels'
import { portionLabel } from '@/domain/containers'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { useSession } from '@/app/session'
import { usePrefs } from '@/app/prefs'
import { Badge, Button, Icon, IconButton, SelectField, Sheet, Stepper, TextField, Toggle } from '@/design/components'
import { finishCook } from './mutations'

interface StepView {
  text: string
  sit: boolean
  timerMinutes: number | null
  index: number
}

/** Full-screen guided cook: one step per screen, big type, wake lock, timers with vibration, voice next/back, sit breaks. */
export function CookMode() {
  const { recipeId } = useParams()
  const [params] = useSearchParams()
  const data = useHouseholdData()
  const today = useToday()
  const navigate = useNavigate()
  const { household } = useSession()
  const { prefs } = usePrefs()
  const recipe = data.recipesWithIngredients.find((r) => r.id === recipeId) ?? null
  const batch = data.batches.find((b) => b.id === params.get('batch')) ?? null
  const planEntry = data.plan_entries.find((e) => e.recipeId === recipeId && e.date === today && e.status === 'planned') ?? null
  const servings = Number(params.get('servings')) || (batch && recipe ? recipe.baseYield * batch.multiplier : recipe?.baseYield ?? 4)
  const scale = recipe ? servings / recipe.baseYield : 1
  const [i, setI] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [listening, setListening] = useState(false)
  const ruleCtx = useMemo(() => ({ rules: data.rules, persons: data.persons }), [data.rules, data.persons])
  const maxStanding = (data.rules.find((r) => r.type === 'prep' && r.active)?.payload as { maxStandingMinutes?: number } | undefined)?.maxStandingMinutes ?? null

  const steps = useMemo<StepView[]>(() => {
    if (!recipe) return []
    const out: StepView[] = []
    let standingRun = 0
    recipe.steps.forEach((s, index) => {
      const standing = s.standingMinutes ?? Math.round((s.minutes ?? 0) * 0.5)
      standingRun += standing
      const forcedSit = maxStanding !== null && standingRun > maxStanding
      if (s.sitBreak || forcedSit) {
        out.push({ text: s.sitBreak ? 'Sit here. The next step can wait a minute.' : `You have been standing about ${standingRun} minutes. Sit for a bit before the next step.`, sit: true, timerMinutes: null, index })
        standingRun = 0
      }
      out.push({ text: s.text, sit: false, timerMinutes: s.timerMinutes ?? null, index })
    })
    if (out.length === 0) out.push({ text: 'No steps written yet. Cook it your way, then tap Done to log it.', sit: false, timerMinutes: null, index: 0 })
    return out
  }, [recipe, maxStanding])

  const step = steps[Math.min(i, steps.length - 1)] ?? null
  const last = i >= steps.length - 1
  const next = useCallback(() => setI((x) => Math.min(steps.length - 1, x + 1)), [steps.length])
  const back = useCallback(() => setI((x) => Math.max(0, x - 1)), [])

  // Wake lock while cooking.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => undefined)
    return () => { void lock?.release() }
  }, [])

  // Read the step aloud when asked.
  useEffect(() => {
    if (!prefs.readAloud || !step || typeof speechSynthesis === 'undefined') return
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(step.text))
  }, [step, prefs.readAloud])

  // Voice: "next", "back", "repeat", "start a 20 minute timer".
  const recRef = useRef<{ stop: () => void } | null>(null)
  const [timerRequest, setTimerRequest] = useState<number | null>(null)
  const toggleVoice = () => {
    const w = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const text = Array.from(e.results).slice(-1)[0]?.[0]?.transcript?.toLowerCase() ?? ''
      if (/\b(next|forward|done with that)\b/.test(text)) next()
      else if (/\b(back|previous)\b/.test(text)) back()
      else if (/\b(repeat|again|read that)\b/.test(text) && typeof speechSynthesis !== 'undefined' && step) speechSynthesis.speak(new SpeechSynthesisUtterance(step.text))
      else {
        const m = /(\d+)\s*(?:minute|min)/.exec(text)
        if (m && /timer/.test(text)) setTimerRequest(Number(m[1]))
      }
    }
    rec.onend = () => setListening(false)
    rec.start()
    recRef.current = rec
    setListening(true)
  }
  useEffect(() => () => recRef.current?.stop(), [])

  if (data.loading) return <div className="cookmode" aria-busy="true" />
  if (!recipe || !step) {
    return (
      <div className="cookmode">
        <div className="cookmode-body"><p>That recipe is gone.</p><Button onClick={() => navigate('/cook')}>Back to Cook</Button></div>
      </div>
    )
  }
  const subs = applySubstitutions(recipe.ingredients, ruleCtx)
  const voiceAvailable = typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)

  return (
    <div className="cookmode">
      <div className="cookmode-top">
        <IconButton variant="bar" icon="close" label="Leave cook mode" onClick={() => navigate(-1)} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="truncate" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{recipe.title}</div>
          <div className="cookmode-progress" aria-label={`Step ${step.index + 1} of ${recipe.steps.length}`}><div style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        </div>
        {voiceAvailable ? <IconButton variant="bar" icon="mic" active={listening} label={listening ? 'Stop listening' : 'Listen for next and back'} onClick={toggleVoice} /> : null}
      </div>
      <div className="cookmode-body" aria-live="polite">
        {step.sit ? <div className="cookmode-sit"><Icon name="chair" size="1.6em" /> Sit here.</div> : null}
        <div className="small muted" style={{ marginBottom: 8 }}>{step.sit ? 'Break' : `Step ${step.index + 1} of ${recipe.steps.length}`} · {servings} {recipe.yieldUnit}</div>
        <p className="cookmode-step">{step.text}</p>
        {step.timerMinutes || timerRequest ? <Timer key={`${i}-${timerRequest}`} minutes={timerRequest ?? step.timerMinutes!} onClear={() => setTimerRequest(null)} /> : null}
        <details className="cookmode-ingredients">
          <summary>Ingredients for {servings} {recipe.yieldUnit}</summary>
          <ul>
            {subs.ingredients.map((ing) => (
              <li key={ing.id}>{ing.amount !== null ? formatQuantity({ amount: ing.amount * scale, unit: ing.unit }) : ''} {ing.ingredientName}{ing.preparation ? `, ${ing.preparation}` : ''}</li>
            ))}
          </ul>
          {subs.substitutions.length ? <p>Swaps: {subs.substitutions.map((s) => `${s.to} for ${s.from}`).join(', ')}.</p> : null}
        </details>
        {Object.keys(recipe.plateNotes).length && last ? (
          <div className="plate-notes" style={{ marginTop: 'var(--space-4)' }}>
            {Object.entries(recipe.plateNotes).map(([k, v]) => (
              <div key={k} className="plate-note"><div className="who">{data.persons.find((p) => p.id === k)?.name ?? (k === 'default' ? 'Everyone' : k)}</div><div>{v}</div></div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="cookmode-footer">
        <Button size="lg" icon="chevronLeft" onClick={back} disabled={i === 0} aria-label="Back">Back</Button>
        {last ? (
          <Button variant="primary" size="lg" icon="check" onClick={() => setFinishing(true)}>Done cooking</Button>
        ) : (
          <Button variant="primary" size="lg" iconRight="chevronRight" onClick={next}>Next</Button>
        )}
      </div>
      {finishing && household ? (
        <FinishSheet recipeId={recipe.id} servings={servings} scale={scale} batchId={batch?.id ?? null} planEntryId={planEntry?.id ?? null} onClose={() => setFinishing(false)} onDone={() => { setFinishing(false); navigate(batch ? '/cook/week' : '/pantry/freezer') }} />
      ) : null}
    </div>
  )
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function Timer({ minutes, onClear }: { minutes: number; onClear: () => void }) {
  const [left, setLeft] = useState(minutes * 60)
  const [running, setRunning] = useState(true)
  const done = left <= 0
  useEffect(() => {
    if (!running || done) return
    const id = window.setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000)
    return () => window.clearInterval(id)
  }, [running, done])
  useEffect(() => {
    if (!done) return
    try { navigator.vibrate?.([300, 150, 300, 150, 600]) } catch { /* no vibration */ }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.speak(new SpeechSynthesisUtterance('Timer done'))
  }, [done])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="cookmode-timer" role="timer" aria-live={done ? 'assertive' : 'off'}>
      <span className={`timer-display ${done ? 'is-done' : ''}`}>{done ? 'Done' : `${mm}:${ss}`}</span>
      {!done ? <Button size="md" icon={running ? 'pause' : 'play'} onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Resume'}</Button> : null}
      <Button size="md" variant="ghost" onClick={() => { setLeft(minutes * 60); setRunning(true) }}>Restart {minutes} min</Button>
      <Button size="md" variant="ghost" icon="close" aria-label="Clear timer" onClick={onClear} />
    </div>
  )
}

/** End of cook: how many portions went in, which container, where they sit, who they're for; then the depletion confirm. */
function FinishSheet({ recipeId, servings, scale, batchId, planEntryId, onClose, onDone }: { recipeId: string; servings: number; scale: number; batchId: string | null; planEntryId: string | null; onClose: () => void; onDone: () => void }) {
  const data = useHouseholdData()
  const today = useToday()
  const { household } = useSession()
  const { run } = useUndoable()
  const recipe = data.recipesWithIngredients.find((r) => r.id === recipeId)!
  const batch = data.batches.find((b) => b.id === batchId) ?? null
  const planEntry = data.plan_entries.find((e) => e.id === planEntryId) ?? null
  const [freeze, setFreeze] = useState(!!batch || recipe.tags.includes('freezer_safe'))
  const [lines, setLines] = useState<{ containerId: string; count: number }[]>(() => (batch ? batch.containerPlan.map((l) => ({ containerId: l.containerId, count: l.count })) : data.containers[0] ? [{ containerId: data.containers[0].id, count: 4 }] : []))
  const [spot, setSpot] = useState('')
  const [personId, setPersonId] = useState('')
  const [madeServings, setMadeServings] = useState(Math.round(servings))
  const availability = useMemo(() => recipeAvailability(recipe, { items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave }, today, scale), [recipe, data.items, data.item_aliases, data.alwaysHave, today, scale])
  const [deductions, setDeductions] = useState<Deduction[]>(() =>
    availability.ingredients
      .filter((a) => a.item)
      .map((a) => ({
        ingredientId: a.ingredient.id,
        itemId: a.item!.id,
        itemName: a.item!.name,
        amount: a.item!.trackMode === 'count' && a.ingredient.amount !== null ? Math.round(a.ingredient.amount * scale * 100) / 100 : null,
        unit: a.item!.trackMode === 'count' ? a.ingredient.unit : null,
        newStatus: a.item!.trackMode === 'status' ? a.item!.status : undefined,
        action: a.item!.alwaysHave ? 'skip' : 'apply',
      })),
  )

  const save = async () => {
    if (!household) return
    const foodType = guessFoodType(recipe)
    const blocks: Omit<FreezerBlock, keyof TenantRow>[] = freeze
      ? lines
          .filter((l) => l.count > 0)
          .map((l) => {
            const c = data.containers.find((x) => x.id === l.containerId) ?? null
            const ml = c?.capacityMl ?? 240
            return {
              recipeId: recipe.id,
              batchId: batch?.id ?? null,
              containerId: c?.id ?? null,
              locationId: data.locations.find((x) => x.isFreezerShelf)?.id ?? data.locations.find((x) => x.kind === 'freezer')?.id ?? null,
              title: recipe.title,
              portionLabel: portionLabel(ml, c),
              portionMl: ml,
              servingsPerBlock: ml >= 480 ? 2 : 1,
              countRemaining: l.count,
              countInitial: l.count,
              personId: personId || null,
              cookedOn: today,
              qualityUntil: qualityUntil(today, foodType, null),
              freezerSpot: spot.trim() || null,
              foodType,
              labelText: null,
              notes: null,
            }
          })
      : []
    await run((repo, actor) => finishCook(repo, household.id, { recipe, session: null, planEntry, batch, servingsMade: madeServings, deductions, items: data.items, blocks }, actor))
    onDone()
  }

  return (
    <Sheet open title="Done cooking" onClose={onClose} description="Say what went in the freezer, then confirm what came out of the pantry." footer={<Button variant="primary" size="lg" full icon="check" onClick={() => void save()}>Log it</Button>}>
      <div className="stack-lg">
        <div className="spread"><span>Servings made</span><Stepper label="Servings made" value={madeServings} min={0} onChange={(n) => setMadeServings(Math.round(n))} /></div>
        <Toggle label="Some of it went in the freezer" checked={freeze} onChange={setFreeze} />
        {freeze ? (
          <div className="stack">
            {data.containers.map((c) => {
              const l = lines.find((x) => x.containerId === c.id)
              return (
                <div key={c.id} className="spread">
                  <span>{c.name} <span className="small muted">({portionLabel(c.capacityMl, c)})</span></span>
                  <Stepper label={c.name} value={l?.count ?? 0} onChange={(n) => setLines([...lines.filter((x) => x.containerId !== c.id), ...(n > 0 ? [{ containerId: c.id, count: Math.round(n) }] : [])])} />
                </div>
              )
            })}
            <div className="finish-grid">
              <TextField label="Where it sits" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Top drawer" />
              <SelectField label="For" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Ours</option>
                {data.persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectField>
            </div>
          </div>
        ) : null}
        <div>
          <h3 style={{ marginBottom: 8 }}>From the pantry</h3>
          <p className="small muted">Confirm, edit, or skip each line.</p>
          {deductions.length === 0 ? <p className="muted small">No pantry items matched this recipe.</p> : null}
          {deductions.map((d, idx) => (
            <div key={d.ingredientId ?? idx} className="deduction-row">
              <div className="grow">
                <div>{d.itemName}</div>
                {d.amount !== null ? (
                  <div className="small muted">use {formatQuantity({ amount: d.amount, unit: d.unit })}</div>
                ) : (
                  <div className="row-wrap small" role="group" aria-label={`${d.itemName} still OK?`}>
                    <span className="muted">Still:</span>
                    {(['ok', 'low', 'out'] as const).map((s) => (
                      <button key={s} type="button" className={`chip chip-button chip-sm ${d.newStatus === s ? 'is-selected' : ''}`} aria-pressed={d.newStatus === s} onClick={() => setDeductions(deductions.map((x, j) => (j === idx ? { ...x, newStatus: s, action: 'apply' } : x)))}>{s === 'ok' ? 'OK' : s === 'low' ? 'Low' : 'Out'}</button>
                    ))}
                  </div>
                )}
              </div>
              {d.amount !== null ? <Stepper label={d.itemName} value={d.action === 'skip' ? 0 : d.amount} step={0.5} onChange={(n) => setDeductions(deductions.map((x, j) => (j === idx ? { ...x, amount: n, action: n > 0 ? 'apply' : 'skip' } : x)))} /> : null}
              <Button variant={d.action === 'skip' ? 'secondary' : 'ghost'} size="sm" onClick={() => setDeductions(deductions.map((x, j) => (j === idx ? { ...x, action: x.action === 'skip' ? 'apply' : 'skip' } : x)))}>{d.action === 'skip' ? 'Skipped' : 'Skip'}</Button>
              {d.action === 'skip' ? <Badge>skip</Badge> : null}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
