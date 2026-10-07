import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Item } from '@/domain/types'
import { formatCents } from '@/domain/money'
import { matchReceiptLines, sumLineTotals, type ParsedReceiptLine, type ReceiptMatch } from '@/domain/receipts'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { Badge, Button, Card, Icon, SelectField, TextArea, TextField } from '@/design/components'
import { hasAiBackend, lookupBarcode, parseReceipt, type BarcodeProduct } from '@/integrations/ai'
import { saveReceipt } from './mutations'
import { parseTypedLines, prefillName } from './scanParse'

/* ------------------------------------------------------------------------------------------------
   BarcodeDetector, typed locally: the DOM lib does not ship it and only Chromium phones have it.
   ------------------------------------------------------------------------------------------------ */

interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']

type Fix = string | '__none__' | '__skip__'

/** Pantry scan: a barcode (camera when the phone can, a typed code always) and a receipt photo or typed lines. */
export function Scan() {
  const data = useHouseholdData()
  const today = useToday()
  const navigate = useNavigate()
  const { run, repo } = useUndoable()
  const backend = hasAiBackend()

  /* ---- barcode ---- */
  const canDetect = useMemo(() => detectorCtor() !== null, [])
  const [code, setCode] = useState('')
  const [looking, setLooking] = useState(false)
  const [product, setProduct] = useState<BarcodeProduct | null>(null)
  const [barcodeNote, setBarcodeNote] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setScanning(false)
  }, [])
  useEffect(() => stopCamera, [stopCamera])

  const lookUp = useCallback(async (raw: string) => {
    setLooking(true)
    setProduct(null)
    setBarcodeNote(null)
    const r = await lookupBarcode(raw)
    setLooking(false)
    if (r.data) setProduct(r.data)
    else setBarcodeNote(r.error)
  }, [])

  const startCamera = async () => {
    const Ctor = detectorCtor()
    if (!Ctor || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setBarcodeNote('This browser cannot read barcodes from the camera. Type the numbers under the bars instead.')
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      stream.current = s
      setScanning(true)
      setBarcodeNote(null)
      const v = video.current
      if (v) {
        v.srcObject = s
        await v.play()
      }
      const detector = new Ctor({ formats: FORMATS })
      const tick = async () => {
        if (!stream.current || !video.current) return
        try {
          const found = await detector.detect(video.current)
          const hit = found.find((b) => b.rawValue)
          if (hit) {
            setCode(hit.rawValue)
            stopCamera()
            void lookUp(hit.rawValue)
            return
          }
        } catch {
          /* keep trying */
        }
        window.setTimeout(() => void tick(), 300)
      }
      void tick()
    } catch {
      setBarcodeNote('The camera is blocked or busy. Allow it in the browser, or type the code.')
    }
  }

  /* ---- receipt ---- */
  const [reading, setReading] = useState(false)
  const [receiptNote, setReceiptNote] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [lines, setLines] = useState<ReceiptMatch[] | null>(null)
  const [rawResult, setRawResult] = useState<unknown>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [retailerId, setRetailerId] = useState('')
  const [purchasedOn, setPurchasedOn] = useState('')
  const [total, setTotal] = useState('')
  const [fixes, setFixes] = useState<Record<string, Fix>>({})
  const [saving, setSaving] = useState(false)
  const matchCtx = useMemo(() => ({ items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave }), [data.items, data.item_aliases, data.alwaysHave])
  const itemsSorted = useMemo(() => data.items.filter((i) => !i.deletedAt).slice().sort((a, b) => a.name.localeCompare(b.name)), [data.items])
  const retailers = useMemo(() => data.retailers.filter((r) => !r.deletedAt).slice().sort((a, b) => a.sortOrder - b.sortOrder), [data.retailers])

  const review = (parsed: ParsedReceiptLine[], extra?: { retailerGuess?: string | null; purchasedOn?: string | null; totalCents?: number | null; raw?: unknown; path?: string | null }) => {
    setLines(matchReceiptLines(parsed, matchCtx))
    setFixes({})
    setRawResult(extra?.raw ?? null)
    setStoragePath(extra?.path ?? null)
    if (extra?.purchasedOn) setPurchasedOn(extra.purchasedOn)
    else if (!purchasedOn) setPurchasedOn(today)
    if (extra?.totalCents !== null && extra?.totalCents !== undefined) setTotal((extra.totalCents / 100).toFixed(2))
    const guess = extra?.retailerGuess?.toLowerCase()
    if (guess) {
      const hit = retailers.find((r) => guess.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(guess) || guess.replace(/[^a-z]/g, '').includes(r.kind))
      if (hit) setRetailerId(hit.id)
    }
  }

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !data.householdId) return
    if (!backend) {
      setReceiptNote('Reading a photo needs the Supabase backend. In local mode, type the lines below instead.')
      return
    }
    setReading(true)
    setReceiptNote(null)
    try {
      const path = await uploadFor(file, data.householdId)
      const r = path ? await parseReceipt(data.householdId, { storagePath: path }) : await parseReceipt(data.householdId, { imageBase64: await toBase64(file), mediaType: file.type || 'image/jpeg' })
      if (!r.data) {
        setReceiptNote(r.error ?? 'Could not read that receipt.')
        return
      }
      review(r.data.lines, { retailerGuess: r.data.retailerGuess, purchasedOn: r.data.purchasedOn, totalCents: r.data.totalCents, raw: r.data, path })
    } finally {
      setReading(false)
    }
  }
  const uploadFor = async (file: File, householdId: string): Promise<string | null> => {
    try {
      const p = await repo.uploadImage(householdId, 'receipts', file)
      return p.startsWith('blob:') ? null : p
    } catch {
      return null
    }
  }

  const useTyped = () => {
    const parsed = parseTypedLines(typed)
    if (parsed.length === 0) {
      setReceiptNote('Type one line per product, like "Eggs 2 @ 2.99" or "Milk 3.49".')
      return
    }
    setReceiptNote(null)
    review(parsed)
  }

  const effective = (l: ReceiptMatch): ReceiptMatch => {
    const f = fixes[l.key]
    if (f === undefined) return l
    if (f === '__skip__') return { ...l, ignored: true, auto: false }
    if (f === '__none__') return { ...l, itemId: null, ignored: false, auto: false }
    return { ...l, itemId: f, ignored: false, auto: false }
  }
  const reviewed = (lines ?? []).map(effective)
  const live = reviewed.filter((l) => !l.ignored)
  const matchedCount = live.filter((l) => l.itemId).length
  const lineSum = sumLineTotals(live)
  const totalCents = total.trim() ? Math.round(Number(total) * 100) : null
  const itemName = (id: string | null) => (id ? (data.items.find((i) => i.id === id)?.name ?? null) : null)

  const save = async () => {
    if (!data.householdId || !lines || saving) return
    const householdId = data.householdId
    const retailer = retailers.find((r) => r.id === retailerId) ?? null
    setSaving(true)
    try {
      await run((r, actor) =>
        saveReceipt(
          r,
          {
            householdId,
            retailerId: retailer?.id ?? null,
            retailerName: retailer?.name ?? null,
            purchasedOn: /^\d{4}-\d{2}-\d{2}$/.test(purchasedOn) ? purchasedOn : today,
            totalCents: totalCents !== null && Number.isFinite(totalCents) ? totalCents : null,
            storagePath,
            lines: reviewed,
            items: data.items,
            rawResult,
          },
          { ...actor, source: 'receipt' },
        ),
      )
      navigate('/pantry')
    } finally {
      setSaving(false)
    }
  }

  const matchBadge = (l: ReceiptMatch) => {
    if (l.ignored) return <Badge>skipped</Badge>
    if (!l.itemId) return <Badge tone="low">not in pantry</Badge>
    if (!l.auto) return <Badge tone="accent">fixed</Badge>
    return l.via === 'fuzzy' ? <Badge tone="accent">closest match</Badge> : null
  }

  return (
    <div className="page">
      <BackHeader title="Scan" to="/pantry" />
      <div className="stack">
        <section className="section" aria-labelledby="scan-barcode">
          <h2 id="scan-barcode">Barcode</h2>
          <p className="muted small">{canDetect ? 'Point the camera at the bars, or type the numbers under them.' : 'This browser cannot read barcodes from the camera. Type the numbers under the bars.'}</p>
          {scanning ? (
            <div className="stack">
              <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 'var(--radius)', background: '#000' }} aria-label="Camera view" />
              <Button icon="close" onClick={stopCamera}>Stop camera</Button>
            </div>
          ) : canDetect ? (
            <Button icon="camera" size="lg" onClick={() => void startCamera()}>Use the camera</Button>
          ) : null}
          <form
            className="row"
            style={{ alignItems: 'flex-end', gap: 'var(--space-2)' }}
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) void lookUp(code)
            }}
          >
            <TextField label="Barcode number" className="grow" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="0 12345 67890 5" />
            <Button type="submit" variant="primary" icon="search" loading={looking} disabled={!code.trim()}>Look up</Button>
          </form>
          <div role="status" aria-live="polite">
            {barcodeNote ? <p className="small muted">{barcodeNote}</p> : null}
            {product ? (
              <Card tone="ok">
                <div className="row-title">{product.name}</div>
                <div className="small muted">{[product.brand, product.quantity, `Code ${product.code}`].filter(Boolean).join(' · ')}</div>
                <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                  <Link to={`/pantry/add?name=${encodeURIComponent(prefillName(product))}`} className="btn btn-primary btn-lg">Add to pantry</Link>
                </div>
              </Card>
            ) : null}
          </div>
        </section>

        <section className="section" aria-labelledby="scan-receipt">
          <h2 id="scan-receipt">Receipt</h2>
          <p className="muted small">A photo of the receipt fills in prices and restocks what you bought. You check every line first, and one tap undoes it all.</p>
          <label className={`btn btn-secondary btn-lg ${reading ? 'is-loading' : ''}`} style={{ cursor: 'pointer' }}>
            <Icon name="receipt" /> <span className="btn-label">{reading ? 'Reading the receipt...' : 'Take a receipt photo'}</span>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => void onPhoto(e)} disabled={reading || !data.householdId} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} aria-label="Take a receipt photo" />
          </label>
          {!backend ? <p className="small muted" role="note">Reading a photo needs the Supabase backend. In local mode, type the lines instead.</p> : null}
          <TextArea label="Or type the lines" rows={4} placeholder={'Eggs 2 @ 2.99\nMilk 3.49\nPaper towels x2 12.99'} value={typed} onChange={(e) => setTyped(e.target.value)} hint="One product per line. The price goes at the end." />
          <Button icon="list" onClick={useTyped} disabled={!typed.trim()}>Check these lines</Button>
          {receiptNote ? <p className="small muted" role="status">{receiptNote}</p> : null}
        </section>

        {lines ? (
          <section className="section" aria-labelledby="scan-review">
            <h2 id="scan-review">Check the lines</h2>
            <p className="muted small" role="status">{matchedCount} of {live.length} lines match a pantry item. Fix any that look wrong.</p>
            <div className="grid-2">
              <SelectField label="Store" value={retailerId} onChange={(e) => setRetailerId(e.target.value)}>
                <option value="">Not sure</option>
                {retailers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </SelectField>
              <TextField label="Date" type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} />
            </div>
            <TextField label="Receipt total ($)" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} hint={lineSum ? `The lines add up to ${formatCents(lineSum)}.` : 'Leave blank to use the lines.'} />
            <ul className="scan-lines" aria-label="Receipt lines">
              {reviewed.map((l) => {
                const name = itemName(l.itemId)
                const price = l.unitPriceCents !== null ? formatCents(l.unitPriceCents) : l.totalCents !== null ? formatCents(l.totalCents) : null
                return (
                  <li key={l.key} className={`scan-line ${l.ignored ? 'is-skipped' : ''}`}>
                    <div className="grow">
                      <div className="scan-line-text">
                        <span>{l.name}</span>
                        {l.qty && l.qty !== 1 ? <span className="muted">x{l.qty}</span> : null}
                        {price ? <span className="num">{price}</span> : <span className="muted small">no price read</span>}
                        {matchBadge(l)}
                      </div>
                      <div className="small muted">{l.ignored ? 'Skipped.' : name ? `Pantry item: ${name}${price ? ', price saved' : ''}` : 'Not matched: the price is kept on the receipt only.'}</div>
                      <SelectField label={`Which item is "${l.name}"?`} value={fixes[l.key] ?? l.itemId ?? '__none__'} onChange={(e) => setFixes({ ...fixes, [l.key]: e.target.value })}>
                        <option value="__none__">Not in the pantry</option>
                        <option value="__skip__">Skip this line</option>
                        {itemsSorted.map((i: Item) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </SelectField>
                    </div>
                  </li>
                )
              })}
            </ul>
            <Button variant="primary" size="lg" full icon="check" loading={saving} disabled={live.length === 0 || !data.householdId} onClick={() => void save()}>
              Save receipt
            </Button>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? '').replace(/^data:[^;]+;base64,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}
