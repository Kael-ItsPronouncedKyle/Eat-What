/* Demo seed for local mode: Denton (Liam and Sarah) and College Station (Em and her husband).
   Prices are STARTER ESTIMATES (source 'starter'), shown as such and treated as stale until a receipt or manual entry confirms them. */
import type {
  FreezerBlock, Household, Item, ItemCategory, ItemRetailerLink, ListLine, Membership, Person, PlanEntry, Price, Recipe, RecipeIngredient,
  Retailer, RoutingRule, Rule, Spend, StockStatus, TrackMode,
} from '@/domain/types'
import { newId } from '@/domain/ids'
import { addDays, today, weekRange } from '@/domain/dates'
import { canonicalName } from '@/domain/names'
import { effortScore } from '@/domain/effort'
import { qualityUntil } from '@/domain/labels'
import { nowIso, type Repository } from '../repository'
import { DEMO_USER_ID } from '../local/LocalRepository'
import { defaultLocations, kitContainers, tenantBase } from './defaults'
import { SEED_RECIPES, type SeedRecipe } from './recipes'

const SEED_VERSION = 'demo-v1'

interface StapleSpec {
  name: string
  category: ItemCategory
  location: 'pantry' | 'fridge' | 'freezer' | 'cleaning' | 'bathroom' | 'garage'
  mode?: TrackMode
  status?: StockStatus
  qty?: number
  unit?: string
  par?: number
  useByDays?: number
  alwaysHave?: boolean
  /** Starter price in cents per unit at the primary grocery retailer. */
  price?: number
  priceUnit?: string
}

const STAPLES: StapleSpec[] = [
  { name: 'Eggs', category: 'dairy', location: 'fridge', mode: 'count', qty: 8, unit: 'each', par: 6, useByDays: 21, price: 249, priceUnit: 'dozen' },
  { name: 'Milk', category: 'dairy', location: 'fridge', status: 'ok', useByDays: 7, price: 379, priceUnit: 'gallon' },
  { name: 'Half and half', category: 'dairy', location: 'fridge', status: 'ok', useByDays: 2, price: 299, priceUnit: 'quart' },
  { name: 'Butter', category: 'dairy', location: 'fridge', mode: 'count', qty: 2, unit: 'stick', par: 2, price: 449, priceUnit: 'lb' },
  { name: 'Sharp cheddar', category: 'dairy', location: 'fridge', status: 'ok', useByDays: 30, price: 399, priceUnit: 'lb' },
  { name: 'Cream cheese', category: 'dairy', location: 'fridge', status: 'low', useByDays: 20, price: 249, priceUnit: 'each' },
  { name: 'Sour cream', category: 'dairy', location: 'fridge', status: 'ok', useByDays: 14, price: 199, priceUnit: 'each' },
  { name: 'Boneless skinless chicken thighs', category: 'meat', location: 'freezer', mode: 'count', qty: 1, unit: 'lb', par: 3, price: 329, priceUnit: 'lb' },
  { name: 'Ground beef', category: 'meat', location: 'freezer', mode: 'count', qty: 2, unit: 'lb', par: 2, price: 599, priceUnit: 'lb' },
  { name: 'Andouille sausage', category: 'meat', location: 'freezer', mode: 'count', qty: 12, unit: 'oz', par: 12, price: 599, priceUnit: 'lb' },
  { name: 'Beef chuck roast', category: 'meat', location: 'freezer', status: 'out', price: 699, priceUnit: 'lb' },
  { name: 'Bacon', category: 'meat', location: 'fridge', status: 'ok', useByDays: 10, price: 649, priceUnit: 'lb' },
  { name: 'Yellow onion', category: 'produce', location: 'pantry', mode: 'count', qty: 3, unit: 'each', par: 2, price: 99, priceUnit: 'each' },
  { name: 'Garlic', category: 'produce', location: 'pantry', status: 'ok', price: 79, priceUnit: 'each' },
  { name: 'Carrot', category: 'produce', location: 'fridge', status: 'ok', useByDays: 14, price: 149, priceUnit: 'lb' },
  { name: 'Celery', category: 'produce', location: 'fridge', status: 'low', useByDays: 10, price: 199, priceUnit: 'each' },
  { name: 'Bell pepper', category: 'produce', location: 'fridge', mode: 'count', qty: 2, unit: 'each', par: 2, useByDays: 7, price: 129, priceUnit: 'each' },
  { name: 'Potato', category: 'produce', location: 'pantry', mode: 'count', qty: 6, unit: 'each', par: 4, price: 399, priceUnit: 'bag' },
  { name: 'Lime', category: 'produce', location: 'fridge', mode: 'count', qty: 3, unit: 'each', par: 2, useByDays: 14, price: 33, priceUnit: 'each' },
  { name: 'Broccoli', category: 'produce', location: 'fridge', status: 'ok', useByDays: 4, price: 199, priceUnit: 'head' },
  { name: 'Frozen broccoli', category: 'frozen', location: 'freezer', mode: 'count', qty: 2, unit: 'bag', par: 1, price: 149, priceUnit: 'bag' },
  { name: 'Frozen corn', category: 'frozen', location: 'freezer', status: 'ok', price: 129, priceUnit: 'bag' },
  { name: 'Frozen peas', category: 'frozen', location: 'freezer', status: 'ok', price: 129, priceUnit: 'bag' },
  { name: 'Crushed tomatoes', category: 'pantry', location: 'pantry', mode: 'count', qty: 2, unit: 'can', par: 2, price: 149, priceUnit: 'can' },
  { name: 'Diced tomatoes', category: 'pantry', location: 'pantry', mode: 'count', qty: 3, unit: 'can', par: 2, price: 109, priceUnit: 'can' },
  { name: 'Tomato paste', category: 'pantry', location: 'pantry', mode: 'count', qty: 1, unit: 'can', par: 1, price: 89, priceUnit: 'can' },
  { name: 'Kidney beans', category: 'pantry', location: 'pantry', mode: 'count', qty: 2, unit: 'can', par: 2, price: 99, priceUnit: 'can' },
  { name: 'Black beans', category: 'pantry', location: 'pantry', mode: 'count', qty: 4, unit: 'can', par: 2, price: 99, priceUnit: 'can' },
  { name: 'Great northern beans', category: 'pantry', location: 'pantry', mode: 'count', qty: 0, unit: 'can', par: 2, price: 109, priceUnit: 'can' },
  { name: 'Green chiles', category: 'pantry', location: 'pantry', mode: 'count', qty: 2, unit: 'can', par: 2, price: 119, priceUnit: 'can' },
  { name: 'Chicken broth', category: 'pantry', location: 'pantry', mode: 'count', qty: 8, unit: 'cup', par: 8, price: 249, priceUnit: 'carton' },
  { name: 'Beef broth', category: 'pantry', location: 'pantry', mode: 'count', qty: 4, unit: 'cup', par: 4, price: 249, priceUnit: 'carton' },
  { name: 'White rice', category: 'pantry', location: 'pantry', status: 'ok', price: 399, priceUnit: 'bag' },
  { name: 'Dried red beans', category: 'pantry', location: 'pantry', status: 'ok', price: 199, priceUnit: 'lb' },
  { name: 'All-purpose flour', category: 'pantry', location: 'pantry', status: 'ok', alwaysHave: true, price: 299, priceUnit: 'bag' },
  { name: 'Sugar', category: 'pantry', location: 'pantry', status: 'ok', alwaysHave: true, price: 349, priceUnit: 'bag' },
  { name: 'Cornstarch', category: 'pantry', location: 'pantry', status: 'ok', alwaysHave: true, price: 199, priceUnit: 'each' },
  { name: 'Vegetable oil', category: 'pantry', location: 'pantry', status: 'ok', alwaysHave: true, price: 449, priceUnit: 'bottle' },
  { name: 'Olive oil', category: 'pantry', location: 'pantry', status: 'ok', alwaysHave: true, price: 899, priceUnit: 'bottle' },
  { name: 'Salt', category: 'spice', location: 'pantry', status: 'ok', alwaysHave: true, price: 99, priceUnit: 'each' },
  { name: 'Black pepper', category: 'spice', location: 'pantry', status: 'ok', alwaysHave: true, price: 349, priceUnit: 'each' },
  { name: 'Chili powder', category: 'spice', location: 'pantry', status: 'ok', price: 299, priceUnit: 'each' },
  { name: 'Ground cumin', category: 'spice', location: 'pantry', status: 'low', price: 299, priceUnit: 'each' },
  { name: 'Dried oregano', category: 'spice', location: 'pantry', status: 'ok', price: 249, priceUnit: 'each' },
  { name: 'Paprika', category: 'spice', location: 'pantry', status: 'ok', price: 249, priceUnit: 'each' },
  { name: 'Garlic powder', category: 'spice', location: 'pantry', status: 'ok', price: 249, priceUnit: 'each' },
  { name: 'Cajun seasoning', category: 'spice', location: 'pantry', status: 'ok', price: 349, priceUnit: 'each' },
  { name: 'Dried thyme', category: 'spice', location: 'pantry', status: 'ok', price: 249, priceUnit: 'each' },
  { name: 'Bay leaf', category: 'spice', location: 'pantry', status: 'ok', price: 249, priceUnit: 'each' },
  { name: 'Worcestershire sauce', category: 'condiment', location: 'pantry', status: 'ok', price: 249, priceUnit: 'bottle' },
  { name: 'Lime juice', category: 'condiment', location: 'fridge', status: 'ok', price: 299, priceUnit: 'bottle' },
  { name: 'Salsa', category: 'condiment', location: 'fridge', status: 'ok', price: 299, priceUnit: 'jar' },
  { name: 'Tortilla chips', category: 'pantry', location: 'pantry', status: 'ok', price: 349, priceUnit: 'bag' },
  { name: 'Flour tortillas', category: 'bakery', location: 'fridge', status: 'ok', useByDays: 14, price: 299, priceUnit: 'pack' },
  { name: 'Bread', category: 'bakery', location: 'pantry', status: 'ok', useByDays: 5, price: 279, priceUnit: 'loaf' },
  { name: 'Coffee', category: 'beverage', location: 'pantry', status: 'low', price: 899, priceUnit: 'bag' },
  { name: 'Paper towels', category: 'paper', location: 'cleaning', mode: 'count', qty: 1, unit: 'roll', par: 4, price: 1899, priceUnit: 'pack' },
  { name: 'Toilet paper', category: 'paper', location: 'bathroom', mode: 'count', qty: 6, unit: 'roll', par: 6, price: 2199, priceUnit: 'pack' },
  { name: 'Dawn dish soap', category: 'cleaning', location: 'cleaning', status: 'low', price: 399, priceUnit: 'bottle' },
  { name: 'Laundry detergent', category: 'cleaning', location: 'cleaning', status: 'ok', price: 1299, priceUnit: 'bottle' },
  { name: 'Dishwasher pods', category: 'cleaning', location: 'cleaning', status: 'ok', price: 1499, priceUnit: 'box' },
  { name: 'Trash bags', category: 'household', location: 'garage', status: 'ok', price: 1299, priceUnit: 'box' },
  { name: 'Ibuprofen', category: 'pharmacy', location: 'bathroom', status: 'ok', price: 899, priceUnit: 'bottle' },
  { name: 'Dog food', category: 'pet', location: 'garage', status: 'low', price: 4499, priceUnit: 'bag' },
]

/** H-E-B tends to run a little under Kroger on store brands; still estimates.
    Spot check, Oct 2026: BLS US city average (Feb 2026) eggs $2.50/dozen, whole milk $4.03/gal, ground beef about $6.70/lb;
    H-E-B San Antonio (KSAT, Jun 2026) milk $3.66, eggs $1.47, store-brand ground beef $5.49/lb. The seed sits between them.
    None of these are College Station or Denton shelf prices; the weekly web check or a receipt replaces every starter row. */
const CS_PRICE_FACTOR = 0.93

interface HouseholdSeed {
  household: Household
  persons: Person[]
  memberships: Membership[]
  rules: Rule[]
  retailers: Retailer[]
  routing: RoutingRule[]
  items: Item[]
  links: ItemRetailerLink[]
  recipes: Recipe[]
  ingredients: RecipeIngredient[]
  freezerBlocks: FreezerBlock[]
  planEntries: PlanEntry[]
  listLines: ListLine[]
  prices: Price[]
  spend: Spend[]
}

function buildRecipe(seed: SeedRecipe, householdId: string, plateKeys: { richer: string | null; lighter: string | null }, includePlateNotes: boolean): { recipe: Recipe; ingredients: RecipeIngredient[] } {
  const base = tenantBase(householdId)
  const plateNotes: Record<string, string> = {}
  if (includePlateNotes) {
    if (plateKeys.richer) plateNotes[plateKeys.richer] = seed.plateNotes.richer
    if (plateKeys.lighter) plateNotes[plateKeys.lighter] = seed.plateNotes.lighter
  } else {
    plateNotes.default = seed.plateNotes.lighter
  }
  const recipe: Recipe = {
    ...base,
    libraryId: null,
    variantOfRecipeId: null,
    variantLabel: null,
    title: seed.title,
    description: seed.description,
    cuisine: seed.cuisine,
    mealType: seed.mealType,
    baseYield: seed.baseYield,
    yieldUnit: seed.yieldUnit,
    steps: seed.steps,
    freezeNotes: seed.freezeNotes,
    reheatNotes: seed.reheatNotes,
    plateNotes,
    equipment: seed.equipment,
    tags: seed.tags,
    activeMinutes: seed.activeMinutes,
    standingMinutes: seed.standingMinutes,
    totalMinutes: seed.totalMinutes,
    dishesCount: seed.dishesCount,
    effortScore: safeEffort(seed),
    nutrition: null,
    costPerServingCents: null,
    source: 'bank',
    sourceUrl: null,
    status: 'approved',
    imagePath: null,
    lastCookedAt: null,
    timesCooked: 0,
  }
  const ingredients: RecipeIngredient[] = seed.ingredients.map((ing, i) => ({
    ...tenantBase(householdId),
    recipeId: recipe.id,
    position: i,
    ingredientName: ing.name,
    canonicalName: safeCanonical(ing.name),
    amount: ing.amount,
    unit: ing.unit,
    preparation: ing.preparation ?? null,
    optional: ing.optional ?? false,
    groupLabel: null,
    substitute: ing.substitute ?? null,
    itemId: null,
    matchConfidence: null,
    fdcId: null,
    grams: null,
  }))
  return { recipe, ingredients }
}

function safeEffort(seed: SeedRecipe): number | null {
  try {
    return effortScore({ activeMinutes: seed.activeMinutes, standingMinutes: seed.standingMinutes, totalMinutes: seed.totalMinutes, dishesCount: seed.dishesCount, steps: seed.steps, tags: seed.tags })
  } catch {
    return null
  }
}

function safeCanonical(name: string): string {
  try {
    return canonicalName(name)
  } catch {
    return name.toLowerCase().trim()
  }
}

function safeQuality(cookedOn: string, foodType: FreezerBlock['foodType']): string {
  try {
    return qualityUntil(cookedOn, foodType)
  } catch {
    return addDays(cookedOn, 90)
  }
}

function buildHousehold(opts: {
  name: string
  zip: string
  kit: 'souper_cubes' | 'cheapest'
  budgetCents: number
  people: { name: string; userId: string | null; role: Membership['role']; plate: Person['plateProfile'] }[]
  rules: (persons: Person[]) => Omit<Rule, keyof ReturnType<typeof tenantBase>>[]
  retailers: Omit<Retailer, keyof ReturnType<typeof tenantBase>>[]
  primaryGroceryKind: Retailer['kind']
  priceFactor: number
  includePlateNotes: boolean
  recipeKeys: string[]
  stockOverrides?: Partial<Record<string, Partial<StapleSpec>>>
}): HouseholdSeed {
  const now = nowIso()
  const td = today()
  const household: Household = {
    id: newId(),
    name: opts.name,
    timezone: 'America/Chicago',
    zip: opts.zip,
    currency: 'USD',
    budgetMonthlyCents: opts.budgetCents,
    budgetWarnPct: 80,
    quietFrom: '21:00',
    quietTo: '07:00',
    settings: { freezerKit: opts.kit, weeklyShopDay: 6, weeklyShopTime: '09:00' },
    createdBy: DEMO_USER_ID,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  const hid = household.id
  const persons: Person[] = opts.people.map((p, i) => ({ ...tenantBase(hid), name: p.name, userId: p.userId, plateProfile: p.plate, color: null, sortOrder: i }))
  const memberships: Membership[] = opts.people
    .filter((p) => p.userId)
    .map((p, i) => ({
      id: newId(),
      householdId: hid,
      userId: p.userId!,
      role: p.role,
      personId: persons[i]?.id ?? null,
      energyLevel: null,
      energySetOn: null,
      createdAt: now,
      deletedAt: null,
    }))
  const rules: Rule[] = opts.rules(persons).map((r) => ({ ...tenantBase(hid), ...r }))
  const retailers: Retailer[] = opts.retailers.map((r) => ({ ...tenantBase(hid), ...r }))
  const grocery = retailers.find((r) => r.isPrimaryGrocery)!
  const other = retailers.find((r) => r.isPrimaryOther)!
  const walmart = retailers.find((r) => r.kind === 'walmart') ?? other
  const routing: RoutingRule[] = [
    { ...tenantBase(hid), matchKind: 'category', matchValue: 'paper', retailerId: other.id, priority: 0 },
    { ...tenantBase(hid), matchKind: 'category', matchValue: 'cleaning', retailerId: walmart.id, priority: 0 },
    { ...tenantBase(hid), matchKind: 'category', matchValue: 'household', retailerId: other.id, priority: 0 },
    { ...tenantBase(hid), matchKind: 'category', matchValue: 'pet', retailerId: other.id, priority: 0 },
    { ...tenantBase(hid), matchKind: 'category', matchValue: 'pharmacy', retailerId: other.id, priority: 0 },
  ]
  const locations = defaultLocations(hid)
  const locByKind = (k: StapleSpec['location']) => locations.find((l) => l.kind === k && !l.isFreezerShelf)?.id ?? null
  const items: Item[] = []
  const prices: Price[] = []
  const links: ItemRetailerLink[] = []
  for (const s of STAPLES) {
    const spec = { ...s, ...(opts.stockOverrides?.[s.name] ?? {}) }
    const mode: TrackMode = spec.mode ?? 'status'
    const item: Item = {
      ...tenantBase(hid),
      name: spec.name,
      canonicalName: safeCanonical(spec.name),
      category: spec.category,
      locationId: locByKind(spec.location),
      trackMode: mode,
      status: mode === 'count' ? (spec.qty! <= 0 ? 'out' : spec.par !== undefined && spec.qty! < spec.par ? 'low' : 'ok') : (spec.status ?? 'ok'),
      qty: mode === 'count' ? (spec.qty ?? 0) : null,
      unit: mode === 'count' ? (spec.unit ?? null) : null,
      par: mode === 'count' ? (spec.par ?? null) : null,
      useBy: spec.useByDays !== undefined ? addDays(td, spec.useByDays) : null,
      barcode: null,
      imagePath: null,
      alwaysHave: spec.alwaysHave ?? false,
      autoList: true,
      personId: null,
      defaultShelfLifeDays: null,
      notes: null,
      sortOrder: items.length,
    }
    items.push(item)
    if (spec.price !== undefined) {
      const retailer = ['cleaning', 'paper', 'household', 'pet', 'pharmacy'].includes(spec.category) ? other : grocery
      prices.push({
        ...tenantBase(hid),
        itemId: item.id,
        retailerId: retailer.id,
        priceCents: Math.round(spec.price * (retailer === grocery ? opts.priceFactor : 1)),
        unitQty: 1,
        unit: spec.priceUnit ?? null,
        source: 'starter',
        observedOn: addDays(td, -3),
        receiptId: null,
        note: 'Starter estimate. Confirm with a receipt.',
      })
    }
  }
  const byName = (n: string) => items.find((i) => i.name === n)!
  if (grocery.kind === 'instacart') {
    links.push({ ...tenantBase(hid), itemId: byName('Boneless skinless chicken thighs').id, retailerId: grocery.id, searchTerm: 'boneless skinless chicken thighs value pack', externalId: null, externalUrl: null, lastPriceCents: null })
    links.push({ ...tenantBase(hid), itemId: byName('Half and half').id, retailerId: grocery.id, searchTerm: 'Kroger half and half quart', externalId: null, externalUrl: null, lastPriceCents: null })
  }
  links.push({ ...tenantBase(hid), itemId: byName('Paper towels').id, retailerId: other.id, searchTerm: 'Bounty paper towels 12 rolls', externalId: 'B07Z1PQBQQ', externalUrl: null, lastPriceCents: null })

  const plateKeys = { richer: persons.find((p) => p.plateProfile.richness === 'richer')?.id ?? null, lighter: persons.find((p) => p.plateProfile.richness === 'lighter')?.id ?? null }
  const recipes: Recipe[] = []
  const ingredients: RecipeIngredient[] = []
  for (const key of opts.recipeKeys) {
    const seed = SEED_RECIPES.find((r) => r.key === key)
    if (!seed) continue
    const built = buildRecipe(seed, hid, plateKeys, opts.includePlateNotes)
    recipes.push(built.recipe)
    ingredients.push(...built.ingredients)
  }
  const recipeByKey = (key: string) => recipes.find((r) => r.title === SEED_RECIPES.find((s) => s.key === key)?.title) ?? null
  const containers = kitContainers(hid, opts.kit)
  const shelf = locations.find((l) => l.isFreezerShelf)?.id ?? null
  const block = (key: string, portionLabel: string, portionMl: number, count: number, daysAgo: number, person: Person | null, spot: string, foodType: FreezerBlock['foodType']): FreezerBlock => {
    const r = recipeByKey(key)
    const cookedOn = addDays(td, -daysAgo)
    const container = containers.find((c) => Math.abs(c.capacityMl - portionMl) < 1) ?? containers[0] ?? null
    return {
      ...tenantBase(hid),
      recipeId: r?.id ?? null,
      batchId: null,
      containerId: container?.id ?? null,
      locationId: shelf,
      title: r?.title ?? key,
      portionLabel,
      portionMl,
      servingsPerBlock: portionMl >= 480 ? 2 : 1,
      countRemaining: count,
      countInitial: count,
      personId: person?.id ?? null,
      cookedOn,
      qualityUntil: safeQuality(cookedOn, foodType),
      freezerSpot: spot,
      foodType,
      labelText: null,
      notes: null,
    }
  }
  const lighter = persons.find((p) => p.plateProfile.richness === 'lighter') ?? null
  const freezerBlocks: FreezerBlock[] =
    opts.kit === 'souper_cubes'
      ? [
          block('brisket-chili', '2-cup', 480, 4, 18, null, 'Top drawer', 'soup'),
          block('broccoli-cheddar-soup', '1-cup', 240, 5, 12, lighter, 'Door', 'soup'),
          block('white-chicken-chili', '2-cup', 480, 2, 40, null, 'Top drawer', 'soup'),
          block('taco-meat', '1-cup', 240, 6, 25, null, 'Chest, left', 'cooked_meat'),
          block('marinara', 'quart bag', 950, 3, 60, null, 'Chest, right', 'sauce'),
        ]
      : [
          block('marinara', 'quart bag', 950, 2, 9, null, 'Door', 'sauce'),
          block('egg-bites', 'bag', 950, 1, 5, null, 'Top shelf', 'baked'),
          block('taco-meat', 'quart bag', 950, 2, 15, null, 'Top shelf', 'cooked_meat'),
        ]

  const { from } = weekRange(td, 1)
  const entry = (offset: number, kind: PlanEntry['kind'], ref: { recipeKey?: string; blockIndex?: number; note?: string }, person: Person | null = null): PlanEntry => ({
    ...tenantBase(hid),
    date: addDays(from, offset),
    slot: 'dinner',
    kind,
    recipeId: ref.recipeKey ? recipeByKey(ref.recipeKey)?.id ?? null : null,
    freezerBlockId: ref.blockIndex !== undefined ? freezerBlocks[ref.blockIndex]?.id ?? null : null,
    batchId: null,
    personId: person?.id ?? null,
    note: ref.note ?? null,
    servings: null,
    position: 0,
    status: 'planned',
  })
  const planEntries: PlanEntry[] =
    opts.kit === 'souper_cubes'
      ? [
          entry(0, 'recipe', { recipeKey: 'sheet-pan-chicken-veg' }),
          entry(1, 'freezer_block', { blockIndex: 1 }, lighter),
          entry(1, 'freezer_block', { blockIndex: 0 }, persons.find((p) => p.plateProfile.richness === 'richer') ?? null),
          entry(3, 'recipe', { recipeKey: 'chicken-tortilla-soup' }),
          entry(4, 'note', { note: 'Leftovers' }),
          entry(5, 'recipe', { recipeKey: 'red-beans-rice' }),
        ]
      : [entry(0, 'recipe', { recipeKey: 'sheet-pan-chicken-veg' }), entry(2, 'freezer_block', { blockIndex: 2 }), entry(4, 'recipe', { recipeKey: 'chicken-tortilla-soup' })]

  const line = (name: string, qty: number | null, unit: string | null, reasons: ListLine['reasons'], retailer: Retailer | null): ListLine => {
    const item = items.find((i) => i.name === name) ?? null
    return {
      ...tenantBase(hid),
      itemId: item?.id ?? null,
      name,
      qty,
      unit,
      reasons,
      retailerId: retailer?.id ?? null,
      status: 'open',
      listSendId: null,
      searchTerm: null,
      priceCentsEst: null,
      note: null,
      position: 0,
    }
  }
  const listLines: ListLine[] = [
    line('Paper towels', 1, 'pack', [{ kind: 'low', text: 'Down to 1 roll' }], other),
    line('Boneless skinless chicken thighs', 2, 'lb', [{ kind: 'low', text: 'Have 1 lb, par 3' }], grocery),
    line('Great northern beans', 2, 'can', [{ kind: 'out' }], grocery),
    line('Dawn dish soap', 1, 'bottle', [{ kind: 'low' }], walmart),
  ]

  const month = td.slice(0, 7)
  const spend: Spend[] = [
    { ...tenantBase(hid), retailerId: grocery.id, amountCents: Math.round(16240 * opts.priceFactor), kind: 'actual', category: 'groceries', occurredOn: `${month}-02`, listSendId: null, receiptId: null, note: 'Weekly shop' },
    { ...tenantBase(hid), retailerId: other.id, amountCents: 3420, kind: 'actual', category: 'household', occurredOn: `${month}-03`, listSendId: null, receiptId: null, note: null },
    { ...tenantBase(hid), retailerId: grocery.id, amountCents: Math.round(14875 * opts.priceFactor), kind: 'actual', category: 'groceries', occurredOn: `${month}-05`, listSendId: null, receiptId: null, note: 'Weekly shop' },
  ]

  return { household, persons, memberships, rules, retailers, routing, items, links, recipes, ingredients, freezerBlocks, planEntries, listLines, prices, spend }
}

export function buildDemoSeed(): { denton: HouseholdSeed; collegeStation: HouseholdSeed } {
  const allKeys = SEED_RECIPES.map((r) => r.key)
  const denton = buildHousehold({
    name: 'Denton',
    zip: '76207',
    kit: 'souper_cubes',
    budgetCents: 90000,
    people: [
      { name: 'Liam', userId: DEMO_USER_ID, role: 'owner', plate: { portionMultiplier: 0.8, richness: 'richer', volume: 'smaller', notes: 'Smaller, richer plate.' } },
      { name: 'Sarah', userId: null, role: 'editor', plate: { portionMultiplier: 1.2, richness: 'lighter', volume: 'larger', notes: 'Lighter, higher-volume plate.' } },
    ],
    rules: (persons) => {
      const sarah = persons.find((p) => p.name === 'Sarah')?.id ?? null
      return [
        { type: 'allergy', payload: { ingredient: 'coconut', severity: 'avoid', substitute: 'lime juice' }, appliesToPersonId: sarah, active: true },
        { type: 'allergy', payload: { ingredient: 'cilantro', severity: 'dislike', substitute: 'scallion greens' }, appliesToPersonId: sarah, active: true },
        { type: 'prep', payload: { maxStandingMinutes: 20, seatedPreferred: true, equipment: ['souper_cubes', 'crockpot', 'ninja_woodfire', 'oven', 'stovetop', 'microwave', 'sheet_pan'] }, appliesToPersonId: null, active: true },
        { type: 'cuisine', payload: { cuisine: 'Midwestern comfort', weight: 'liked' }, appliesToPersonId: null, active: true },
        { type: 'cuisine', payload: { cuisine: 'Asian', weight: 'liked' }, appliesToPersonId: null, active: true },
        { type: 'cuisine', payload: { cuisine: 'Mexican', weight: 'liked' }, appliesToPersonId: null, active: true },
        { type: 'cuisine', payload: { cuisine: 'Italian', weight: 'liked' }, appliesToPersonId: null, active: true },
        { type: 'cuisine', payload: { cuisine: 'Cajun', weight: 'liked' }, appliesToPersonId: null, active: true },
        { type: 'cuisine', payload: { cuisine: 'Mediterranean', weight: 'tolerated' }, appliesToPersonId: null, active: true },
      ]
    },
    retailers: [
      { name: 'Instacart (Kroger)', kind: 'instacart', config: { storeName: 'Kroger', zip: '76207' }, isPrimaryGrocery: true, isPrimaryOther: false, sortOrder: 0 },
      { name: 'Amazon', kind: 'amazon', config: {}, isPrimaryGrocery: false, isPrimaryOther: true, sortOrder: 1 },
      { name: 'Walmart', kind: 'walmart', config: { zip: '76207' }, isPrimaryGrocery: false, isPrimaryOther: false, sortOrder: 2 },
      { name: 'In person', kind: 'in_person', config: { aisleOrder: ['produce', 'meat', 'dairy', 'frozen', 'pantry', 'spice', 'condiment', 'bakery', 'beverage', 'cleaning', 'paper', 'household', 'pet', 'pharmacy'] }, isPrimaryGrocery: false, isPrimaryOther: false, sortOrder: 3 },
    ],
    primaryGroceryKind: 'instacart',
    priceFactor: 1,
    includePlateNotes: true,
    recipeKeys: allKeys.filter((k) => k !== 'shrimp-boil-bags'),
  })
  const collegeStation = buildHousehold({
    name: 'College Station',
    zip: '77840',
    kit: 'cheapest',
    budgetCents: 60000,
    people: [
      { name: 'Em', userId: DEMO_USER_ID, role: 'owner', plate: {} },
      { name: 'Partner', userId: null, role: 'editor', plate: {} },
    ],
    rules: (persons) => {
      const partner = persons.find((p) => p.name === 'Partner')?.id ?? null
      return [
        { type: 'allergy', payload: { ingredient: 'shellfish', severity: 'severe' }, appliesToPersonId: partner, active: true },
        { type: 'allergy', payload: { ingredient: 'shrimp', severity: 'severe' }, appliesToPersonId: partner, active: true },
        { type: 'cuisine', payload: { cuisine: 'Mexican', weight: 'liked' }, appliesToPersonId: null, active: true },
        { type: 'cuisine', payload: { cuisine: 'Italian', weight: 'liked' }, appliesToPersonId: null, active: true },
      ]
    },
    retailers: [
      { name: 'H-E-B', kind: 'heb', config: { storeName: 'H-E-B College Station', zip: '77840', aisleOrder: ['produce', 'bakery', 'meat', 'seafood', 'dairy', 'frozen', 'pantry', 'spice', 'condiment', 'beverage', 'cleaning', 'paper', 'household', 'pet', 'pharmacy'] }, isPrimaryGrocery: true, isPrimaryOther: false, sortOrder: 0 },
      { name: 'Amazon', kind: 'amazon', config: {}, isPrimaryGrocery: false, isPrimaryOther: true, sortOrder: 1 },
      { name: 'Walmart', kind: 'walmart', config: { zip: '77840' }, isPrimaryGrocery: false, isPrimaryOther: false, sortOrder: 2 },
    ],
    primaryGroceryKind: 'heb',
    priceFactor: CS_PRICE_FACTOR,
    includePlateNotes: false,
    recipeKeys: allKeys,
    stockOverrides: { 'Half and half': { status: 'out' }, 'Andouille sausage': { qty: 0 }, 'Beef chuck roast': { status: 'ok' } },
  })
  return { denton, collegeStation }
}

async function writeSeed(repo: Repository, s: HouseholdSeed): Promise<void> {
  await repo.table('households').put(s.household)
  await repo.table('persons').putMany(s.persons)
  await repo.table('memberships').putMany(s.memberships)
  await repo.table('rules').putMany(s.rules)
  await repo.table('locations').putMany(defaultLocationsFor(s))
  await repo.table('containers').putMany(kitContainers(s.household.id, (s.household.settings.freezerKit as 'souper_cubes' | 'cheapest' | 'basic') ?? 'basic'))
  await repo.table('retailers').putMany(s.retailers)
  await repo.table('routing_rules').putMany(s.routing)
  await repo.table('items').putMany(s.items)
  await repo.table('item_retailer_links').putMany(s.links)
  await repo.table('recipes').putMany(s.recipes)
  await repo.table('recipe_ingredients').putMany(s.ingredients)
  await repo.table('freezer_blocks').putMany(s.freezerBlocks)
  await repo.table('plan_entries').putMany(s.planEntries)
  await repo.table('list_lines').putMany(s.listLines)
  await repo.table('prices').putMany(s.prices)
  await repo.table('spend').putMany(s.spend)
}

// Locations were generated inside buildHousehold; regenerate deterministically from the items' location ids.
function defaultLocationsFor(s: HouseholdSeed) {
  const locs = defaultLocations(s.household.id)
  // Re-point item and block location ids to this fresh set by kind so the seed stays consistent.
  const kindOf = new Map<string, string>()
  for (const l of locs) kindOf.set(l.kind + (l.isFreezerShelf ? ':shelf' : ''), l.id)
  for (const item of s.items) {
    const spec = STAPLES.find((x) => x.name === item.name)
    item.locationId = spec ? (kindOf.get(spec.location) ?? null) : null
  }
  for (const b of s.freezerBlocks) b.locationId = kindOf.get('freezer:shelf') ?? null
  return locs
}

/** Seed both households once per browser (local mode only). */
export async function ensureDemoSeed(repo: Repository): Promise<boolean> {
  if (repo.mode !== 'local') return false
  const local = repo as unknown as { db: { meta: { get: (k: string) => Promise<{ value: unknown } | undefined>; put: (v: { key: string; value: unknown }) => Promise<unknown> } } }
  const done = await local.db.meta.get('seedVersion')
  if (done?.value === SEED_VERSION) return false
  const existing = await repo.session()
  if (existing.households.length > 0) {
    await local.db.meta.put({ key: 'seedVersion', value: SEED_VERSION })
    return false
  }
  await repo.table('profiles').put({ userId: DEMO_USER_ID, displayName: 'Liam', email: null })
  const { denton, collegeStation } = buildDemoSeed()
  await writeSeed(repo, denton)
  await writeSeed(repo, collegeStation)
  await local.db.meta.put({ key: 'seedVersion', value: SEED_VERSION })
  await repo.setActiveHousehold(denton.household.id)
  return true
}
