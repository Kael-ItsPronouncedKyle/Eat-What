import type { FreezerBlock, Item, ItemAlias, ItemCategory, ListLine, Price, RecipeStep, RecipeWithIngredients, StockStatus } from '../types'
import { canonicalName } from '../names'
import { normalizeUnit, parseQuantity } from '../units'
import { effortScore } from '../effort'
import { guessFoodType, qualityUntil } from '../labels'

export interface NeelixImportPlan {
  recipes: RecipeWithIngredients[]
  items: Item[]
  freezerBlocks: FreezerBlock[]
  listLines: ListLine[]
  prices: Price[]
  aliases: ItemAlias[]
  flagged: { recipeTitle: string; line: string; reason: string }[]
  unmapped: { path: string; sample: unknown }[]
  summary: string
}

export interface NeelixImportContext {
  householdId: string
  now: string
  today: string
  newId: () => string
  locationIds: { pantry: string | null; fridge: string | null; freezer: string | null; freezerShelf: string | null; cleaning: string | null }
  instacartRetailerId: string | null
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)
const pick = (o: Obj, keys: string[]): unknown => {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k] as const))
  for (const k of keys) {
    const real = lower.get(k.toLowerCase())
    if (real !== undefined && o[real] !== undefined && o[real] !== null) return o[real]
  }
  return undefined
}

const KEYS = {
  recipes: ['recipes', 'recipeBank', 'bank', 'recipeList'],
  pantry: ['pantry', 'staples', 'items', 'inventory', 'tracker', 'pantryTracker', 'stock'],
  freezer: ['freezer', 'cubes', 'blocks', 'souperCubes', 'shelf', 'freezerInventory', 'freezerBlocks'],
  list: ['list', 'shoppingList', 'shopping', 'cart', 'groceryList'],
  prices: ['prices', 'priceBook', 'priceList', 'pricebook'],
  aliases: ['aliases', 'quirks', 'instacartQuirks', 'searchTerms', 'autoMatch', 'krogerQuirks'],
}

/** Parse one free-text ingredient line into amount, unit, name, preparation. */
export function parseIngredientLine(line: string): { amount: number | null; unit: string | null; name: string; preparation: string | null; confidence: number } {
  let text = line.trim().replace(/\s+/g, ' ')
  if (!text) return { amount: null, unit: null, name: '', preparation: null, confidence: 0 }
  // Pull a parenthetical size note ("(15 oz)") out of the way.
  let sizeNote: string | null = null
  text = text.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    sizeNote = inner.trim()
    return ' '
  }).replace(/\s+/g, ' ').trim()
  // Preparation after the first comma.
  let preparation: string | null = null
  const comma = text.indexOf(',')
  if (comma > 0) {
    preparation = text.slice(comma + 1).trim() || null
    text = text.slice(0, comma).trim()
  }
  const toTaste = /\bto taste\b/i.test(line)
  const parsed = parseQuantity(text)
  if (parsed && parsed.rest) {
    const unit = parsed.unit
    const name = parsed.rest.replace(/^of\s+/i, '').trim()
    return { amount: parsed.amount, unit, name, preparation: sizeNote ? [sizeNote, preparation].filter(Boolean).join('; ') : preparation, confidence: unit || Number.isInteger(parsed.amount) ? 0.9 : 0.7 }
  }
  const name = text.replace(/\bto taste\b/i, '').replace(/^(a|an|some)\s+/i, '').trim()
  return { amount: null, unit: null, name: name || line.trim(), preparation, confidence: toTaste ? 0.4 : 0.5 }
}

function findArray(root: unknown, keys: string[], path: string): { value: unknown[]; path: string } | null {
  if (Array.isArray(root)) return null
  if (!isObj(root)) return null
  const v = pick(root, keys)
  if (Array.isArray(v)) return { value: v, path: `${path}.${keys[0]}` }
  if (isObj(v)) {
    // Object keyed by id or name -> values.
    const inner = pick(v, ['items', 'list', 'entries', 'rows'])
    if (Array.isArray(inner)) return { value: inner, path: `${path}.${keys[0]}` }
    const vals = Object.values(v)
    if (vals.length && vals.every(isObj)) return { value: vals.map((x, i) => ({ ...(x as Obj), __key: Object.keys(v)[i] })), path: `${path}.${keys[0]}` }
  }
  // One level down (state wrappers like { state: {...} } or { data: {...} }).
  for (const k of ['state', 'data', 'app', 'store', 'value']) {
    const nested = pick(root, [k])
    if (isObj(nested)) {
      const found = findArray(nested, keys, `${path}.${k}`)
      if (found) return found
    }
  }
  return null
}

function guessCategory(name: string): ItemCategory {
  const n = name.toLowerCase()
  if (/paper towel|toilet|tissue|napkin|foil|wrap|bag/.test(n)) return 'paper'
  if (/dawn|soap|detergent|bleach|cleaner|sponge|pods|wipes/.test(n)) return 'cleaning'
  if (/dog|cat|pet|litter/.test(n)) return 'pet'
  if (/ibuprofen|tylenol|advil|vitamin|allergy|medicine/.test(n)) return 'pharmacy'
  if (/chicken|beef|pork|brisket|sausage|bacon|turkey|steak|roast|ground/.test(n)) return 'meat'
  if (/shrimp|salmon|fish|tuna|crab/.test(n)) return 'seafood'
  if (/milk|cheese|butter|cream|yogurt|egg|half and half/.test(n)) return 'dairy'
  if (/frozen|cubes?$/.test(n)) return 'frozen'
  if (/onion|garlic|carrot|celery|pepper|potato|tomato$|lettuce|lime|lemon|apple|banana|broccoli|spinach|cilantro|herb/.test(n)) return 'produce'
  if (/bread|tortilla|bun|roll$|loaf/.test(n)) return 'bakery'
  if (/coffee|tea|soda|juice|water/.test(n)) return 'beverage'
  if (/salt|pepper$|cumin|paprika|chili powder|oregano|thyme|cinnamon|seasoning|spice/.test(n)) return 'spice'
  if (/sauce|ketchup|mustard|mayo|salsa|dressing|vinegar|soy/.test(n)) return 'condiment'
  return 'pantry'
}

function statusOf(v: unknown): StockStatus {
  const s = String(v ?? '').toLowerCase()
  if (/out|none|empty|0/.test(s)) return 'out'
  if (/low|running/.test(s)) return 'low'
  return 'ok'
}

/** Parse a Neelix export object (already JSON.parsed). Never throws on shape problems; reports them. */
export function parseNeelixExport(data: unknown, ctx: NeelixImportContext): NeelixImportPlan {
  const plan: NeelixImportPlan = { recipes: [], items: [], freezerBlocks: [], listLines: [], prices: [], aliases: [], flagged: [], unmapped: [], summary: '' }
  const base = () => ({ id: ctx.newId(), householdId: ctx.householdId, createdAt: ctx.now, createdBy: null, updatedAt: ctx.now, updatedBy: null, deletedAt: null })
  let root: unknown = data
  if (typeof root === 'string') {
    try {
      root = JSON.parse(root)
    } catch {
      plan.summary = 'That is not JSON.'
      return plan
    }
  }
  if (Array.isArray(root)) root = { recipes: root }
  if (!isObj(root)) {
    plan.summary = 'Nothing recognizable in that file.'
    return plan
  }

  // Recipes
  const recipesArr = findArray(root, KEYS.recipes, '$')
  const titleToRecipe = new Map<string, RecipeWithIngredients>()
  if (recipesArr) {
    for (const raw of recipesArr.value) {
      if (!isObj(raw)) {
        plan.unmapped.push({ path: `${recipesArr.path}[]`, sample: raw })
        continue
      }
      const title = str(pick(raw, ['title', 'name', 'recipe']))
      if (!title) {
        plan.unmapped.push({ path: `${recipesArr.path}[] (no title)`, sample: raw })
        continue
      }
      const b = base()
      const ingRaw = pick(raw, ['ingredients', 'ingredientList', 'items'])
      const ingredients: RecipeWithIngredients['ingredients'] = []
      const ingList: unknown[] = Array.isArray(ingRaw) ? ingRaw : typeof ingRaw === 'string' ? ingRaw.split(/\r?\n/).filter((l) => l.trim()) : []
      ingList.forEach((ing, i) => {
        let amount: number | null = null
        let unit: string | null = null
        let name = ''
        let preparation: string | null = null
        let confidence = 1
        let lineText = ''
        if (typeof ing === 'string') {
          lineText = ing
          const p = parseIngredientLine(ing)
          amount = p.amount
          unit = p.unit
          name = p.name
          preparation = p.preparation
          confidence = p.confidence
        } else if (isObj(ing)) {
          name = str(pick(ing, ['name', 'ingredient', 'item', 'text'])) ?? ''
          amount = num(pick(ing, ['amount', 'qty', 'quantity']))
          unit = normalizeUnit(str(pick(ing, ['unit', 'units', 'measure'])))
          preparation = str(pick(ing, ['preparation', 'prep', 'note', 'notes']))
          lineText = [amount, unit, name].filter((x) => x !== null && x !== '').join(' ')
          if (!name && typeof pick(ing, ['text']) === 'string') {
            const p = parseIngredientLine(String(pick(ing, ['text'])))
            amount = p.amount
            unit = p.unit
            name = p.name
            confidence = p.confidence
          }
          if (amount === null && name) {
            const p = parseIngredientLine(name)
            if (p.amount !== null) {
              amount = p.amount
              unit = p.unit
              name = p.name
            }
            confidence = p.confidence
          }
        } else {
          plan.unmapped.push({ path: `${recipesArr.path}[${title}].ingredients[${i}]`, sample: ing })
          return
        }
        if (!name) {
          plan.flagged.push({ recipeTitle: title, line: lineText, reason: 'no ingredient name' })
          return
        }
        if (confidence < 0.6) plan.flagged.push({ recipeTitle: title, line: lineText || name, reason: amount === null ? 'no amount' : 'unsure of the unit' })
        ingredients.push({ ...base(), recipeId: b.id, position: i, ingredientName: name, canonicalName: canonicalName(name), amount, unit, preparation, optional: /optional|to taste/i.test(lineText), groupLabel: null, substitute: null, itemId: null, matchConfidence: null, fdcId: null, grams: null })
      })
      const stepsRaw = pick(raw, ['steps', 'instructions', 'directions', 'method'])
      const stepList: unknown[] = Array.isArray(stepsRaw) ? stepsRaw : typeof stepsRaw === 'string' ? stepsRaw.split(/\r?\n+/).filter((l) => l.trim()) : []
      const steps: RecipeStep[] = stepList
        .map((s) => (typeof s === 'string' ? { text: s.trim() } : isObj(s) ? { text: str(pick(s, ['text', 'step', 'instruction', 'description'])) ?? '', minutes: num(pick(s, ['minutes', 'time'])) ?? undefined } : null))
        .filter((s): s is RecipeStep => !!s && !!s.text)
      const plateRaw = pick(raw, ['plateNotes', 'twoPlate', 'plates', 'plating', 'twoPlateNotes'])
      const plateNotes: Record<string, string> = {}
      if (isObj(plateRaw)) for (const [k, v] of Object.entries(plateRaw)) if (typeof v === 'string') plateNotes[k.toLowerCase()] = v
      else if (typeof plateRaw === 'string') plateNotes.default = plateRaw
      const active = num(pick(raw, ['activeMinutes', 'active', 'prepMinutes', 'prep']))
      const total = num(pick(raw, ['totalMinutes', 'total', 'time', 'minutes']))
      const standing = num(pick(raw, ['standingMinutes', 'standing']))
      const tagsRaw = pick(raw, ['tags', 'labels'])
      const tags = Array.isArray(tagsRaw) ? (tagsRaw.filter((t) => typeof t === 'string') as string[]).map((t) => t.toLowerCase().replace(/[\s-]+/g, '_')) : []
      const freezeNotes = str(pick(raw, ['freezeNotes', 'freeze', 'freezing', 'freezerNotes']))
      const reheat = str(pick(raw, ['reheatNotes', 'reheat', 'reheating']))
      const recipe: RecipeWithIngredients = {
        ...b,
        libraryId: null,
        variantOfRecipeId: null,
        variantLabel: null,
        title,
        description: str(pick(raw, ['description', 'summary', 'notes'])),
        cuisine: str(pick(raw, ['cuisine'])),
        mealType: (str(pick(raw, ['mealType', 'meal', 'course'])) as RecipeWithIngredients['mealType']) ?? 'dinner',
        baseYield: num(pick(raw, ['yield', 'servings', 'serves', 'baseYield'])) ?? 4,
        yieldUnit: str(pick(raw, ['yieldUnit'])) ?? 'servings',
        steps,
        freezeNotes,
        reheatNotes: reheat ? { tray: { method: 'cook_from_frozen', text: reheat }, bag: { method: 'thaw_first', text: reheat } } : {},
        plateNotes,
        equipment: [],
        tags: [...new Set([...(tags as RecipeWithIngredients['tags']), ...((freezeNotes || reheat) ? (['freezer_safe'] as const) : [])])],
        activeMinutes: active,
        standingMinutes: standing,
        totalMinutes: total,
        dishesCount: num(pick(raw, ['dishes', 'dishesCount'])),
        effortScore: null,
        nutrition: null,
        costPerServingCents: null,
        source: 'import',
        sourceUrl: str(pick(raw, ['url', 'source', 'link'])),
        status: 'approved',
        imagePath: null,
        lastCookedAt: null,
        timesCooked: 0,
        ingredients,
      }
      try {
        recipe.effortScore = effortScore(recipe)
      } catch {
        recipe.effortScore = null
      }
      plan.recipes.push(recipe)
      titleToRecipe.set(title.toLowerCase(), recipe)
    }
  }

  // Pantry
  const pantryArr = findArray(root, KEYS.pantry, '$')
  const nameToItem = new Map<string, Item>()
  if (pantryArr) {
    for (const raw of pantryArr.value) {
      let name: string | null = null
      let status: StockStatus = 'ok'
      if (typeof raw === 'string') name = raw
      else if (isObj(raw)) {
        name = str(pick(raw, ['name', 'item', 'label', 'title', '__key']))
        status = statusOf(pick(raw, ['status', 'state', 'level', 'stock']))
      }
      if (!name) {
        plan.unmapped.push({ path: `${pantryArr.path}[]`, sample: raw })
        continue
      }
      const category = guessCategory(name)
      const location = category === 'cleaning' || category === 'paper' ? ctx.locationIds.cleaning : category === 'dairy' || category === 'produce' || category === 'meat' ? ctx.locationIds.fridge : category === 'frozen' ? ctx.locationIds.freezer : ctx.locationIds.pantry
      const item: Item = { ...base(), name, canonicalName: canonicalName(name), category, locationId: location, trackMode: 'status', status, qty: null, unit: null, par: null, useBy: null, barcode: null, imagePath: null, alwaysHave: false, autoList: true, personId: null, defaultShelfLifeDays: null, notes: null, sortOrder: plan.items.length }
      plan.items.push(item)
      nameToItem.set(item.canonicalName, item)
    }
  }

  // Freezer
  const freezerArr = findArray(root, KEYS.freezer, '$')
  if (freezerArr) {
    for (const raw of freezerArr.value) {
      if (!isObj(raw)) {
        plan.unmapped.push({ path: `${freezerArr.path}[]`, sample: raw })
        continue
      }
      const title = str(pick(raw, ['title', 'recipe', 'name', 'label']))
      if (!title) {
        plan.unmapped.push({ path: `${freezerArr.path}[] (no title)`, sample: raw })
        continue
      }
      const sizeText = str(pick(raw, ['size', 'portion', 'cup', 'cups', 'tray', 'traySize'])) ?? ''
      const cups = num(sizeText) ?? (/(\d+(?:\.\d+)?|\d\/\d)\s*-?\s*cup/i.exec(sizeText) ? fraction(/(\d+(?:\.\d+)?|\d\/\d)/.exec(sizeText)?.[1] ?? '1') : /half|½/i.test(sizeText) ? 0.5 : 1)
      const count = num(pick(raw, ['count', 'qty', 'quantity', 'blocks', 'remaining'])) ?? 1
      const cookedOn = str(pick(raw, ['date', 'cookedOn', 'frozenOn', 'made', 'cooked']))?.slice(0, 10) ?? null
      const recipe = titleToRecipe.get(title.toLowerCase()) ?? null
      const foodType = recipe ? guessFoodType(recipe) : guessFoodType({ title, tags: [], mealType: null })
      const validDate = cookedOn && /^\d{4}-\d{2}-\d{2}$/.test(cookedOn) ? cookedOn : null
      plan.freezerBlocks.push({
        ...base(),
        recipeId: recipe?.id ?? null,
        batchId: null,
        containerId: null,
        locationId: ctx.locationIds.freezerShelf ?? ctx.locationIds.freezer,
        title,
        portionLabel: cups === 0.5 ? '1/2-cup' : `${cups}-cup`,
        portionMl: cups * 240,
        servingsPerBlock: cups >= 2 ? 2 : 1,
        countRemaining: Math.max(0, Math.round(count)),
        countInitial: Math.max(0, Math.round(count)),
        personId: null,
        cookedOn: validDate,
        qualityUntil: validDate ? qualityUntil(validDate, foodType) : null,
        freezerSpot: str(pick(raw, ['spot', 'location', 'where'])),
        foodType,
        labelText: null,
        notes: str(pick(raw, ['person', 'for', 'notes'])),
      })
    }
  }

  // Shopping list
  const listArr = findArray(root, KEYS.list, '$')
  if (listArr) {
    for (const raw of listArr.value) {
      let name: string | null = null
      let qty: number | null = null
      let unit: string | null = null
      if (typeof raw === 'string') {
        const p = parseQuantity(raw)
        name = p?.rest || raw
        qty = p?.amount ?? null
        unit = p?.unit ?? null
      } else if (isObj(raw)) {
        name = str(pick(raw, ['name', 'item', 'text', 'label']))
        qty = num(pick(raw, ['qty', 'quantity', 'amount']))
        unit = normalizeUnit(str(pick(raw, ['unit'])))
        if (pick(raw, ['done', 'checked', 'purchased']) === true) continue
      }
      if (!name) {
        plan.unmapped.push({ path: `${listArr.path}[]`, sample: raw })
        continue
      }
      const item = nameToItem.get(canonicalName(name)) ?? null
      plan.listLines.push({ ...base(), itemId: item?.id ?? null, name: item?.name ?? name, qty, unit, reasons: [{ kind: 'manual', text: 'From Neelix' }], retailerId: ctx.instacartRetailerId, status: 'open', listSendId: null, searchTerm: null, priceCentsEst: null, note: null, position: plan.listLines.length })
    }
  }

  // Prices
  const priceArr = findArray(root, KEYS.prices, '$')
  if (priceArr) {
    for (const raw of priceArr.value) {
      if (!isObj(raw)) {
        plan.unmapped.push({ path: `${priceArr.path}[]`, sample: raw })
        continue
      }
      const name = str(pick(raw, ['name', 'item', '__key']))
      const dollars = num(pick(raw, ['price', 'dollars', 'amount', 'cost']))
      const cents = num(pick(raw, ['cents', 'priceCents']))
      if (!name || (dollars === null && cents === null)) {
        plan.unmapped.push({ path: `${priceArr.path}[]`, sample: raw })
        continue
      }
      let item = nameToItem.get(canonicalName(name)) ?? null
      if (!item) {
        item = { ...base(), name, canonicalName: canonicalName(name), category: guessCategory(name), locationId: ctx.locationIds.pantry, trackMode: 'status', status: 'ok', qty: null, unit: null, par: null, useBy: null, barcode: null, imagePath: null, alwaysHave: false, autoList: true, personId: null, defaultShelfLifeDays: null, notes: 'Added from the Neelix price book', sortOrder: plan.items.length }
        plan.items.push(item)
        nameToItem.set(item.canonicalName, item)
      }
      const observed = str(pick(raw, ['date', 'observedOn', 'checked', 'updated']))?.slice(0, 10)
      plan.prices.push({ ...base(), itemId: item.id, retailerId: ctx.instacartRetailerId, priceCents: cents ?? Math.round((dollars ?? 0) * 100), unitQty: 1, unit: normalizeUnit(str(pick(raw, ['unit', 'per']))), source: 'web', observedOn: observed && /^\d{4}-\d{2}-\d{2}$/.test(observed) ? observed : ctx.today, receiptId: null, note: 'Neelix price book (76207)' })
    }
  }

  // Aliases / Instacart quirks
  const aliasArr = findArray(root, KEYS.aliases, '$')
  if (aliasArr) {
    for (const raw of aliasArr.value) {
      if (!isObj(raw)) {
        plan.unmapped.push({ path: `${aliasArr.path}[]`, sample: raw })
        continue
      }
      const name = str(pick(raw, ['item', 'name', '__key']))
      const alias = str(pick(raw, ['searchAs', 'search', 'alias', 'term', 'query', 'value']))
      if (!name || !alias) {
        plan.unmapped.push({ path: `${aliasArr.path}[]`, sample: raw })
        continue
      }
      const item = nameToItem.get(canonicalName(name))
      if (!item) {
        plan.flagged.push({ recipeTitle: 'Instacart quirks', line: `${name} -> ${alias}`, reason: 'no matching pantry item' })
        continue
      }
      plan.aliases.push({ ...base(), itemId: item.id, alias, source: 'instacart', retailerId: ctx.instacartRetailerId })
    }
  }

  if (!recipesArr && !pantryArr && !freezerArr && !listArr && !priceArr && !aliasArr) {
    plan.unmapped.push({ path: '$', sample: Object.keys(root).slice(0, 20) })
    plan.summary = 'No recipes, pantry, freezer, list, prices, or quirks found. Check that this is the Neelix export.'
    return plan
  }
  const parts = [
    `${plan.recipes.length} recipes`,
    `${plan.items.length} pantry items`,
    `${plan.freezerBlocks.length} freezer blocks`,
    `${plan.listLines.length} list lines`,
    `${plan.prices.length} prices`,
    `${plan.aliases.length} store names`,
  ]
  plan.summary = `${parts.join(', ')}.${plan.flagged.length ? ` ${plan.flagged.length} lines need a look.` : ''}`
  return plan
}

function fraction(s: string): number {
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number)
    return b ? (a ?? 0) / b : 1
  }
  return Number(s) || 1
}
