import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Item, ItemCategory, ListLine, Location, LocationKind, PartnerTurn } from '@/domain/types'
import { newId } from '@/domain/ids'
import { routeLine } from '@/domain/listing'
import { findItemByName } from '@/domain/matching'
import { deriveStatus } from '@/domain/status'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { addListLine, adjustItemQty, insertRow, setItemQty, setItemStatus, type Actor, type Undoable } from '@/data/mutations'
import { nowIso, type Repository } from '@/data/repository'
import { buildItem } from '@/features/pantry/mutations'
import { Badge, Button, Card, Chip, Icon, SelectField, Sheet, TextArea } from '@/design/components'
import { hasAiBackend, parseIntentRemote } from '@/integrations/ai'
import { fromRemoteIntents } from './remote'
import {
  CONFIDENCE,
  STATUS_WORD,
  capitalize,
  changeDetail,
  describeChange,
  parseUtterance,
  resolveQuantity,
  speakLowOut,
  type Change,
  type ParseContext,
  type ParseResult,
} from './intents'

/* ------------------------------------------------------------------------------------------------
   Web Speech API, typed locally: the DOM lib does not ship SpeechRecognition and Chrome prefixes it.
   ------------------------------------------------------------------------------------------------ */

interface RecognitionAlternative {
  transcript: string
  confidence: number
}
interface RecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}
interface RecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResultLike }
}
interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'
}

/** Speak through the device. Returns false when the device cannot, so the caller shows the words instead. */
function speak(text: string): boolean {
  if (!canSpeak()) return false
  try {
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
    return true
  } catch {
    return false
  }
}

const VOICE_NOTE = 'Voice works in Chrome on Android; type for now.'

const EXAMPLES = ["We're out of eggs and low on butter", 'Add Dawn to the list', 'Used a can of tomatoes', 'What can I make tonight?']

/** Which item a row applies to after the person tapped Fix: an item id, keep as new, or skip. */
type Fix = string | '__new__' | '__skip__'

const KIND_FOR_CATEGORY: Record<ItemCategory, LocationKind> = {
  produce: 'fridge', dairy: 'fridge', meat: 'freezer', seafood: 'freezer', pantry: 'pantry', frozen: 'freezer', bakery: 'pantry',
  beverage: 'pantry', spice: 'pantry', condiment: 'fridge', cleaning: 'cleaning', paper: 'cleaning', pet: 'garage', pharmacy: 'bathroom',
  personal: 'bathroom', household: 'garage', other: 'pantry',
}

export interface PartnerSheetProps {
  open: boolean
  onClose: () => void
  /** Lets the floating button pulse while the mic is live. */
  onListeningChange?: (listening: boolean) => void
}

/** The partner drawer: say or type what changed, see what was understood, tap once to apply. Read-only asks answer at once. */
export function PartnerSheet({ open, onClose, onListeningChange }: PartnerSheetProps) {
  const data = useHouseholdData()
  const today = useToday()
  const navigate = useNavigate()
  const { run } = useUndoable()

  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [utterance, setUtterance] = useState('')
  const [source, setSource] = useState<'typed' | 'voice'>('typed')
  const [transcriptConfidence, setTranscriptConfidence] = useState<number | null>(null)
  const [fixes, setFixes] = useState<Record<string, Fix>>({})
  const [fixing, setFixing] = useState<Record<string, boolean>>({})
  const [spokenFallback, setSpokenFallback] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const recognition = useRef<RecognitionLike | null>(null)
  const canListen = useMemo(() => recognitionCtor() !== null, [])

  const ctx = useMemo<ParseContext>(
    () => ({ items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave, retailers: data.retailers, locations: data.locations, today }),
    [data.items, data.item_aliases, data.alwaysHave, data.retailers, data.locations, today],
  )
  const openLines = useMemo(() => data.list_lines.filter((l) => l.status === 'open'), [data.list_lines])
  const routeCtx = useMemo(
    () => ({ items: data.items, retailers: data.retailers, routingRules: data.routing_rules, links: data.item_retailer_links }),
    [data.items, data.retailers, data.routing_rules, data.item_retailer_links],
  )
  const itemsSorted = useMemo(() => data.items.filter((i) => !i.deletedAt).slice().sort((a, b) => a.name.localeCompare(b.name)), [data.items])

  const reset = useCallback(() => {
    setText('')
    setInterim('')
    setResult(null)
    setUtterance('')
    setFixes({})
    setFixing({})
    setSpokenFallback(null)
    setTranscriptConfidence(null)
    setVoiceNote(null)
    setAnsweredBy(null)
    setServerNote(null)
  }, [])

  const close = useCallback(() => {
    recognition.current?.abort()
    recognition.current = null
    if (canSpeak()) window.speechSynthesis.cancel()
    setListening(false)
    onListeningChange?.(false)
    reset()
    onClose()
  }, [onClose, onListeningChange, reset])

  useEffect(
    () => () => {
      recognition.current?.abort()
      recognition.current = null
    },
    [],
  )

  // Which parser answered: the server one when a backend exists and it understood, else the rules on this phone.
  const [answeredBy, setAnsweredBy] = useState<'server' | 'local' | null>(null)
  const [serverNote, setServerNote] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const understand = useCallback(
    async (raw: string, from: 'typed' | 'voice') => {
      const said = raw.trim()
      if (!said) return
      setUtterance(said)
      setSource(from)
      setFixes({})
      setFixing({})
      setSpokenFallback(null)
      setServerNote(null)
      let r: ParseResult | null = null
      let by: 'server' | 'local' = 'local'
      if (hasAiBackend() && data.householdId) {
        setThinking(true)
        try {
          const remote = await parseIntentRemote(data.householdId, said, today)
          if (remote.data) {
            const outcome = fromRemoteIntents(remote.data.intents, ctx)
            if (outcome.kind === 'generate') {
              setThinking(false)
              navigate(`/cook/recipes?generate=${encodeURIComponent(outcome.brief)}`)
              close()
              return
            }
            if (outcome.kind === 'changes') {
              r = outcome.result
              by = 'server'
            }
          } else if (remote.error) setServerNote(remote.error)
        } finally {
          setThinking(false)
        }
      }
      if (!r) r = parseUtterance(said, ctx)
      setAnsweredBy(by)
      setResult(r)
      const first = r.intents[0]
      if (first?.kind === 'recipe.suggest') {
        navigate('/cook')
        close()
        return
      }
      if ((first?.kind === 'inventory.query' || first?.kind === 'unknown') && from === 'voice') speak(r.summary.join('. '))
    },
    [ctx, data.householdId, today, navigate, close],
  )
  // The mic's onend fires after a render or two; read the latest parser through a ref set outside render.
  const understandRef = useRef(understand)
  useEffect(() => {
    understandRef.current = understand
  }, [understand])

  const toggleListening = () => {
    if (listening) {
      recognition.current?.stop()
      return
    }
    const Ctor = recognitionCtor()
    if (!Ctor) {
      setVoiceNote(VOICE_NOTE)
      return
    }
    const rec = new Ctor()
    rec.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    let finalText = ''
    let confidence: number | null = null
    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i]
        const alt = res?.[0]
        if (!res || !alt) continue
        if (res.isFinal) {
          finalText += alt.transcript
          confidence = alt.confidence
        } else live += alt.transcript
      }
      setInterim(live || finalText)
    }
    rec.onerror = (e) => {
      setVoiceNote(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'The mic is blocked. Allow it in the browser, or type for now.' : 'Could not hear that. Try again, or type.')
    }
    rec.onend = () => {
      recognition.current = null
      setListening(false)
      onListeningChange?.(false)
      setInterim('')
      const said = finalText.trim()
      if (said) {
        setTranscriptConfidence(confidence)
        setText(said)
        void understandRef.current(said, 'voice')
      }
    }
    recognition.current = rec
    setVoiceNote(null)
    setInterim('')
    setListening(true)
    onListeningChange?.(true)
    try {
      rec.start()
    } catch {
      recognition.current = null
      setListening(false)
      onListeningChange?.(false)
      setVoiceNote('Could not start the mic. Type for now.')
    }
  }

  const readPantry = () => {
    const sentence = speakLowOut(data.items)
    const r = parseUtterance('read my pantry', ctx)
    setUtterance('read my pantry')
    setSource('typed')
    setResult(r)
    setAnsweredBy('local')
    setFixes({})
    setFixing({})
    setSpokenFallback(speak(sentence) ? null : 'Reading aloud is not available here, so here it is in writing.')
  }

  const effective = (c: Change): Change & { skip: boolean } => {
    const f = fixes[c.key]
    if (f === undefined) return { ...c, skip: false }
    if (f === '__skip__') return { ...c, skip: true }
    if (f === '__new__') return { ...c, itemId: null, skip: false }
    return { ...c, itemId: f, skip: false }
  }

  const changes = result?.changes ?? []
  const active = changes.map(effective).filter((c) => !c.skip)
  const first = result?.intents[0] ?? null

  const listDetail = (c: Change): string => {
    const item = c.itemId ? (data.items.find((i) => i.id === c.itemId) ?? null) : null
    if (item && openLines.some((l) => l.itemId === item.id)) return 'Already on the list, so nothing to add.'
    if (c.retailerName) return `Goes to ${c.retailerName}.`
    const routed = safe(() => routeLine({ itemId: item?.id ?? null, name: item?.name ?? c.name }, routeCtx), null)
    const store = routed ? (data.retailers.find((r) => r.id === routed)?.name ?? null) : null
    return `Goes to ${store ?? 'the in-person list'}.`
  }

  const apply = async () => {
    if (!result || !data.householdId || active.length === 0) return
    const householdId = data.householdId
    const rows = active.map((c) => describeChange(c, ctx))
    const headline = rows.length <= 2 ? rows.join(', ') : `${rows[0]} and ${rows.length - 1} more`
    setApplying(true)
    try {
      await run(async (repo, base) => {
        const actor: Actor = { ...base, source: 'voice' }
        const done: Undoable[] = []
        const applied: { key: string; kind: Change['kind']; itemId: string | null; summary: string }[] = []
        for (const c of active) {
          const r = await applyChange(repo, c, actor, { householdId, items: data.items, locations: data.locations, openLines, routeCtx, today })
          if (r) {
            done.push(r)
            applied.push({ key: c.key, kind: c.kind, itemId: c.itemId, summary: r.event.summary })
          }
        }
        const now = nowIso()
        const turn: PartnerTurn = {
          id: newId(),
          householdId,
          createdAt: now,
          createdBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
          deletedAt: null,
          userId: actor.userId,
          utterance,
          transcriptConfidence: source === 'voice' ? transcriptConfidence : null,
          intents: result.intents,
          applied,
          status: 'applied',
          error: null,
        }
        const logged = await insertRow(repo, 'partner_turns', turn, actor, `Quartermaster: ${headline}`)
        for (const d of done) await repo.table('activity_events').patch(d.event.id, { partnerTurnId: turn.id })
        return {
          event: logged.event,
          undo: async () => {
            for (const d of done.slice().reverse()) await d.undo()
            await repo.table('partner_turns').patch(turn.id, { status: 'rejected' })
          },
        }
      }, headline)
      close()
    } finally {
      setApplying(false)
    }
  }

  const missingNames =
    first?.kind === 'inventory.query' && first.itemNames
      ? first.itemNames.filter((n) => !safe(() => findItemByName(n, { items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave }).itemId, null))
      : []

  const footer =
    changes.length > 0 ? (
      <Button variant="primary" size="lg" full icon="check" loading={applying} disabled={active.length === 0 || !data.householdId} onClick={() => void apply()}>
        Apply {active.length === 1 ? '1 change' : `${active.length} changes`}
      </Button>
    ) : null

  return (
    <Sheet
      open={open}
      title="Talk to Quartermaster"
      onClose={close}
      description="Say or type what changed. Every change shows here first and has undo after. The partner never sends a list and never deletes anything."
      footer={footer}
    >
      <form
        className="partner-form"
        aria-busy={data.loading || undefined}
        onSubmit={(e) => {
          e.preventDefault()
          if (!data.loading) void understand(text, 'typed')
        }}
      >
        <TextArea
          label="Say or type what changed"
          className="partner-input"
          placeholder="We're out of eggs and low on butter"
          rows={3}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!data.loading) void understand(text, 'typed')
            }
          }}
        />
        <div className="partner-controls">
          <button
            type="button"
            className={`btn partner-mic ${listening ? 'is-listening' : ''}`}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            title={listening ? 'Stop listening' : 'Start listening'}
            onClick={toggleListening}
          >
            <Icon name="mic" size="1.6em" />
          </button>
          <Button type="submit" variant="primary" size="lg" className="grow" iconRight="arrowRight" loading={thinking} disabled={!text.trim() || listening || data.loading || thinking}>
            Go
          </Button>
          <Button variant="ghost" className="partner-read" icon="volume" onClick={readPantry} disabled={data.loading}>
            Read my pantry
          </Button>
        </div>
        <div className="partner-transcript" role="status" aria-live="polite">
          {listening ? (interim ? `Hearing: "${interim}"` : 'Listening...') : thinking ? 'Asking the server...' : (voiceNote ?? (canListen ? '' : VOICE_NOTE))}
        </div>
      </form>

      {!result && !text ? (
        <div className="partner-examples" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <Chip
              key={ex}
              disabled={data.loading}
              onClick={() => {
                setText(ex)
                void understand(ex, 'typed')
              }}
            >
              {ex}
            </Chip>
          ))}
        </div>
      ) : null}

      {result && answeredBy ? (
        <p className="small muted partner-answered-by" role="status">
          <Badge tone={answeredBy === 'server' ? 'accent' : undefined}>{answeredBy === 'server' ? 'Understood by the server' : 'Understood on this phone'}</Badge>
          {serverNote ? <span> {serverNote}</span> : null}
        </p>
      ) : null}

      {result && first?.kind === 'unknown' ? (
        <Card tone="low" className="partner-guard" role="status">
          <strong>{first.clarify ?? result.summary[0]}</strong>
        </Card>
      ) : null}

      {result && first?.kind === 'inventory.query' ? (
        <div className="partner-answer" role="status" aria-live="polite" aria-label="Answer">
          {spokenFallback ? <p className="small muted">{spokenFallback}</p> : null}
          {result.summary.map((row, i) => (
            <div key={i} className="partner-answer-row">
              <Icon name="info" className="muted" />
              <span className="grow">{row}</span>
            </div>
          ))}
          {missingNames.map((n) => (
            <Link key={n} to={`/pantry/add?name=${encodeURIComponent(capitalize(n))}`} className="btn btn-secondary btn-lg" onClick={close}>
              Add {capitalize(n)} to the pantry
            </Link>
          ))}
        </div>
      ) : null}

      {changes.length > 0 ? (
        <ul className="partner-changes" aria-label="Changes to apply">
          {changes.map((c) => {
            const e = effective(c)
            const row = describeChange(e, ctx)
            const detail = e.skip ? 'Skipped.' : (changeDetail(e, ctx) ?? (e.kind === 'list_add' ? listDetail(e) : null))
            const untouched = fixes[c.key] === undefined
            return (
              <li key={c.key} className={`partner-change ${e.skip ? 'is-skipped' : ''}`}>
                <div className="grow">
                  <div className="partner-change-text">
                    <span>{row}</span>
                    {untouched && c.confidence < CONFIDENCE.exact ? <Badge tone={c.itemId ? 'accent' : 'low'}>{c.itemId ? 'closest match' : 'new'}</Badge> : null}
                  </div>
                  {detail ? <div className="small muted">{detail}</div> : null}
                  {fixing[c.key] ? (
                    <SelectField
                      label={`Which item is "${capitalize(c.name)}"?`}
                      value={fixes[c.key] ?? c.itemId ?? '__new__'}
                      onChange={(ev) => setFixes({ ...fixes, [c.key]: ev.target.value })}
                    >
                      {c.kind !== 'consume' ? (
                        <option value="__new__">{c.kind === 'list_add' ? `Keep "${capitalize(c.name)}" as written` : `Add "${capitalize(c.name)}" as a new item`}</option>
                      ) : null}
                      <option value="__skip__">Skip this one</option>
                      {itemsSorted.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                </div>
                <Button variant="ghost" icon="edit" aria-label={`Fix: ${row}`} aria-expanded={!!fixing[c.key]} onClick={() => setFixing({ ...fixing, [c.key]: !fixing[c.key] })}>
                  Fix
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Sheet>
  )
}

/* ------------------------------------------------------------------------------------------------
   Applying one change. Every branch goes through src/data/mutations so the activity feed and undo work.
   ------------------------------------------------------------------------------------------------ */

interface ApplyEnv {
  householdId: string
  items: Item[]
  locations: Location[]
  openLines: ListLine[]
  routeCtx: Parameters<typeof routeLine>[1]
  today: string
}

async function applyChange(repo: Repository, c: Change, actor: Actor, env: ApplyEnv): Promise<Undoable | null> {
  const item = c.itemId ? (env.items.find((i) => i.id === c.itemId && !i.deletedAt) ?? null) : null
  const q = resolveQuantity(c, item)
  switch (c.kind) {
    case 'add': {
      if (item) {
        if (item.trackMode === 'count') return adjustItemQty(repo, item, q?.amount ?? 1, actor)
        if (deriveStatus(item) === 'ok') return null
        return setItemStatus(repo, item, 'ok', actor)
      }
      const built = buildItem(
        {
          householdId: env.householdId,
          name: capitalize(c.name),
          category: c.category ?? 'pantry',
          locationId: pickLocation(c, env.locations),
          trackMode: q ? 'count' : 'status',
          qty: q?.amount ?? null,
          unit: q?.unit ?? null,
          today: env.today,
        },
        actor.userId,
      )
      return insertRow(repo, 'items', built, actor, `Added ${built.name}`)
    }
    case 'set_status': {
      const status = c.status ?? 'out'
      if (item) {
        if (item.trackMode === 'count') {
          if (status === 'out') return (item.qty ?? 0) === 0 ? null : setItemQty(repo, item, 0, actor)
          if (status === 'ok' && (item.qty ?? 0) <= 0) return setItemQty(repo, item, item.par ?? 1, actor)
        }
        if (deriveStatus(item) === status) return null
        return setItemStatus(repo, item, status, actor)
      }
      const built = buildItem(
        { householdId: env.householdId, name: capitalize(c.name), category: c.category ?? 'pantry', locationId: pickLocation(c, env.locations), trackMode: 'status', today: env.today },
        actor.userId,
      )
      built.status = status
      return insertRow(repo, 'items', built, actor, `Added ${built.name}: ${STATUS_WORD[status]}`)
    }
    case 'consume': {
      if (!item) return null
      if (item.trackMode === 'count') return adjustItemQty(repo, item, -(q?.amount ?? 1), actor)
      if (item.status !== 'ok') return null
      return setItemStatus(repo, item, 'low', actor)
    }
    case 'list_add': {
      if (item && env.openLines.some((l) => l.itemId === item.id)) return null
      const now = nowIso()
      const line: ListLine = {
        id: newId(),
        householdId: env.householdId,
        createdAt: now,
        createdBy: actor.userId,
        updatedAt: now,
        updatedBy: actor.userId,
        deletedAt: null,
        itemId: item?.id ?? null,
        name: item?.name ?? capitalize(c.name),
        qty: q?.amount ?? null,
        unit: q?.unit ?? item?.unit ?? null,
        reasons: [{ kind: 'voice' }],
        retailerId: null,
        status: 'open',
        listSendId: null,
        searchTerm: null,
        priceCentsEst: null,
        note: null,
        position: env.openLines.length,
      }
      line.retailerId = c.retailerId ?? safe(() => routeLine(line, env.routeCtx), null)
      return addListLine(repo, line, actor)
    }
  }
}

/** Where a new item goes: the place the person named, else the usual spot for its category, else the first location. */
function pickLocation(c: Change, locations: Location[]): string | null {
  const live = locations.filter((l) => !l.deletedAt && !l.isFreezerShelf).sort((a, b) => a.sortOrder - b.sortOrder)
  if (c.location) {
    const word = c.location.toLowerCase()
    const byName = live.find((l) => l.name.toLowerCase() === word) ?? live.find((l) => l.name.toLowerCase().includes(word))
    if (byName) return byName.id
    const byKind = live.find((l) => l.kind === word)
    if (byKind) return byKind.id
  }
  const kind = KIND_FOR_CATEGORY[c.category ?? 'pantry']
  return live.find((l) => l.kind === kind)?.id ?? live[0]?.id ?? null
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}
