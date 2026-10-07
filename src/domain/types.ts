/* Domain types. These mirror supabase/migrations/0001_init.sql one to one, in camelCase.
   The domain layer never imports React or Supabase; the data layer maps rows to these shapes. */

export type Id = string

export type Role = 'owner' | 'editor' | 'viewer' | 'agent'
export type TrackMode = 'status' | 'count'
export type StockStatus = 'ok' | 'low' | 'out'
export type ItemCategory =
  | 'produce' | 'dairy' | 'meat' | 'seafood' | 'pantry' | 'frozen' | 'bakery' | 'beverage' | 'spice' | 'condiment'
  | 'cleaning' | 'paper' | 'pet' | 'pharmacy' | 'personal' | 'household' | 'other'
export type LocationKind = 'pantry' | 'fridge' | 'freezer' | 'cleaning' | 'garage' | 'bathroom' | 'custom'
export type ContainerKind = 'tray' | 'bag' | 'tub' | 'pan' | 'jar' | 'muffin_tin' | 'other'
export type FoodType = 'soup' | 'cooked_meat' | 'raw_marinated' | 'baked' | 'sauce' | 'grain' | 'vegetable' | 'other'
export type RecipeSource = 'bank' | 'ai' | 'url' | 'manual' | 'transfer' | 'import'
export type RecipeStatus = 'draft' | 'approved' | 'archived'
export type RecipeTag = 'one_pot' | 'no_chop' | 'sheet_pan' | 'freezer_safe' | 'cook_from_frozen' | 'microwave_only' | 'dump_kit' | 'seated_friendly' | 'crockpot' | 'grill'
export type Equipment = 'crockpot' | 'oven' | 'stovetop' | 'grill' | 'microwave' | 'air_fryer' | 'instant_pot' | 'sheet_pan' | 'blender' | 'souper_cubes' | 'ninja_woodfire'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'side' | 'dessert' | 'component'
export type PlanSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'batch'
export type PlanEntryKind = 'recipe' | 'freezer_block' | 'note' | 'batch'
export type PlanEntryStatus = 'planned' | 'cooked' | 'skipped' | 'moved'
export type BatchKind = 'cooked' | 'dump_kit'
export type BatchStatus = 'planned' | 'assembled' | 'cooked' | 'frozen' | 'skipped'
export type CookWeekStatus = 'draft' | 'confirmed' | 'done'
export type CookSessionStatus = 'in_progress' | 'proposed' | 'confirmed' | 'skipped'
export type RetailerKind = 'instacart' | 'heb' | 'walmart' | 'amazon' | 'kroger' | 'in_person' | 'other'
export type RoutingMatchKind = 'category' | 'item'
export type ListLineStatus = 'open' | 'ordered' | 'received' | 'dropped'
export type ListSendStatus = 'open' | 'ordered' | 'received' | 'cancelled'
export type PriceSource = 'receipt' | 'manual' | 'web' | 'starter' | 'instacart' | 'import'
export type SpendKind = 'estimated' | 'actual'
export type SpendCategory = 'groceries' | 'cleaning' | 'household' | 'pet' | 'pharmacy' | 'other'
export type RuleType = 'allergy' | 'prep' | 'diet' | 'cuisine'
export type ActivitySource = 'tap' | 'voice' | 'receipt' | 'scan' | 'sync' | 'import' | 'system' | 'agent'
export type PartnerTurnStatus = 'queued' | 'needs_confirm' | 'applied' | 'rejected' | 'failed'
export type Energy = 'little' | 'some' | 'plenty'
export type AliasSource = 'voice' | 'receipt' | 'instacart' | 'ingredient' | 'manual' | 'import'

/** Columns every tenant row carries. updated_at drives last-write-wins sync; deleted_at is the tombstone. */
export interface TenantRow {
  id: Id
  householdId: Id
  createdAt: string
  createdBy: Id | null
  updatedAt: string
  updatedBy: Id | null
  deletedAt: string | null
}

export interface Household {
  id: Id
  name: string
  timezone: string
  zip: string | null
  currency: string
  budgetMonthlyCents: number | null
  budgetWarnPct: number
  quietFrom: string | null
  quietTo: string | null
  settings: HouseholdSettings
  createdBy: Id | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface HouseholdSettings {
  /** Which freezer kit preset the household picked at setup. */
  freezerKit?: 'souper_cubes' | 'cheapest' | 'basic' | 'custom'
  /** Default quality-date days by food type; falls back to QUALITY_DAYS_DEFAULT. */
  qualityDays?: Partial<Record<FoodType, number>>
  weeklyShopDay?: number
  weeklyShopTime?: string
  /** The optional weekly web price check (House > Price check). Off until an owner turns it on. */
  priceCheck?: { enabled?: boolean; lastRunAt?: string; lastRunWritten?: number; lastRunChecked?: number }
}

export interface Membership {
  id: Id
  householdId: Id
  userId: Id
  role: Role
  personId: Id | null
  energyLevel: Energy | null
  energySetOn: string | null
  createdAt: string
  deletedAt: string | null
}

export interface Profile {
  userId: Id
  displayName: string
  email: string | null
}

export interface PlateProfile {
  /** 1 = recipe's base serving. Liam 0.8 richer, Sarah 1.2 lighter higher-volume. */
  portionMultiplier?: number
  richness?: 'lighter' | 'standard' | 'richer'
  volume?: 'smaller' | 'standard' | 'larger'
  notes?: string
}

export interface Person extends TenantRow {
  name: string
  userId: Id | null
  plateProfile: PlateProfile
  color: string | null
  sortOrder: number
}

export type RulePayload =
  | { type: 'allergy'; ingredient: string; severity: 'avoid' | 'dislike' | 'severe'; substitute?: string }
  | { type: 'prep'; maxStandingMinutes?: number; seatedPreferred?: boolean; equipment?: Equipment[]; maxActiveMinutes?: number }
  | { type: 'diet'; sodiumMaxMg?: number; proteinMinG?: number; caloriesMin?: number; caloriesMax?: number }
  | { type: 'cuisine'; cuisine: string; weight: 'liked' | 'tolerated' | 'avoid' }

export interface Rule extends TenantRow {
  type: RuleType
  payload: Omit<Extract<RulePayload, { type: RuleType }>, 'type'> & Record<string, unknown>
  appliesToPersonId: Id | null
  active: boolean
}

export interface AllergyRule extends Rule {
  type: 'allergy'
  payload: { ingredient: string; severity: 'avoid' | 'dislike' | 'severe'; substitute?: string }
}
export interface PrepRule extends Rule {
  type: 'prep'
  payload: { maxStandingMinutes?: number; seatedPreferred?: boolean; equipment?: Equipment[]; maxActiveMinutes?: number }
}
export interface DietRule extends Rule {
  type: 'diet'
  payload: { sodiumMaxMg?: number; proteinMinG?: number; caloriesMin?: number; caloriesMax?: number }
}
export interface CuisineRule extends Rule {
  type: 'cuisine'
  payload: { cuisine: string; weight: 'liked' | 'tolerated' | 'avoid' }
}

export interface Location extends TenantRow {
  name: string
  kind: LocationKind
  parentId: Id | null
  isFreezerShelf: boolean
  sortOrder: number
}

export interface Container extends TenantRow {
  name: string
  kind: ContainerKind
  capacityMl: number
  countOwned: number
  disposable: boolean
  ovenSafe: boolean
  microwaveSafe: boolean
  sortOrder: number
}

export interface Item extends TenantRow {
  name: string
  canonicalName: string
  category: ItemCategory
  locationId: Id | null
  trackMode: TrackMode
  status: StockStatus
  qty: number | null
  unit: string | null
  par: number | null
  useBy: string | null
  barcode: string | null
  imagePath: string | null
  alwaysHave: boolean
  autoList: boolean
  personId: Id | null
  defaultShelfLifeDays: number | null
  notes: string | null
  sortOrder: number
}

export interface ItemAlias extends TenantRow {
  itemId: Id
  alias: string
  source: AliasSource
  retailerId: Id | null
}

export interface ItemRetailerLink extends TenantRow {
  itemId: Id
  retailerId: Id
  searchTerm: string | null
  externalId: string | null
  externalUrl: string | null
  lastPriceCents: number | null
}

export interface RecipeStep {
  text: string
  /** Minutes this step takes. */
  minutes?: number
  /** Minutes of standing during the step; the rest counts as seated. */
  standingMinutes?: number
  /** Timer to offer in cook mode. */
  timerMinutes?: number
  /** Cook mode inserts a "sit here" break before this step. */
  sitBreak?: boolean
}

export interface ReheatNote {
  method: 'thaw_first' | 'cook_from_frozen'
  text: string
}
export type ReheatNotes = Partial<Record<ContainerKind, ReheatNote>>

export interface Nutrition {
  calories: number
  proteinG: number
  carbsG: number
  fiberG: number
  fatG: number
  sodiumMg: number
  addedSugarG: number
  /** How much of the recipe mapped to USDA entries, 0..1. */
  coverage?: number
}

export interface Recipe extends TenantRow {
  libraryId: Id | null
  variantOfRecipeId: Id | null
  variantLabel: string | null
  title: string
  description: string | null
  cuisine: string | null
  mealType: MealType | null
  baseYield: number
  yieldUnit: string
  steps: RecipeStep[]
  freezeNotes: string | null
  reheatNotes: ReheatNotes
  /** Keyed by person id (or 'default'). */
  plateNotes: Record<string, string>
  equipment: Equipment[]
  tags: RecipeTag[]
  activeMinutes: number | null
  standingMinutes: number | null
  totalMinutes: number | null
  dishesCount: number | null
  effortScore: number | null
  nutrition: Nutrition | null
  costPerServingCents: number | null
  source: RecipeSource
  sourceUrl: string | null
  status: RecipeStatus
  imagePath: string | null
  lastCookedAt: string | null
  timesCooked: number
}

export interface RecipeIngredient extends TenantRow {
  recipeId: Id
  position: number
  ingredientName: string
  canonicalName: string
  amount: number | null
  unit: string | null
  preparation: string | null
  optional: boolean
  groupLabel: string | null
  substitute: string | null
  itemId: Id | null
  matchConfidence: number | null
  fdcId: number | null
  grams: number | null
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[]
}

export interface CookWeek extends TenantRow {
  name: string
  startsOn: string
  endsOn: string
  budgetTargetCents: number | null
  status: CookWeekStatus
  timeline: TimelineDay[]
}

export interface TimelineDay {
  date: string
  entries: { kind: 'batch' | 'prep' | 'sit' | 'note'; batchId?: Id; text: string; minutes?: number }[]
}

export interface ContainerPlanLine {
  containerId: Id
  count: number
  portionMl: number
  portionLabel: string
}

export interface Batch extends TenantRow {
  cookWeekId: Id | null
  recipeId: Id
  kind: BatchKind
  multiplier: number
  containerPlan: ContainerPlanLine[]
  cookPersonId: Id | null
  scheduledOn: string | null
  status: BatchStatus
  cookedAt: string | null
  estimatedCostCents: number | null
  notes: string | null
}

export interface FreezerBlock extends TenantRow {
  recipeId: Id | null
  batchId: Id | null
  containerId: Id | null
  locationId: Id | null
  title: string
  portionLabel: string | null
  portionMl: number | null
  servingsPerBlock: number
  countRemaining: number
  countInitial: number
  personId: Id | null
  cookedOn: string | null
  qualityUntil: string | null
  freezerSpot: string | null
  foodType: FoodType
  labelText: string | null
  notes: string | null
}

export interface PlanEntry extends TenantRow {
  date: string
  slot: PlanSlot
  kind: PlanEntryKind
  recipeId: Id | null
  freezerBlockId: Id | null
  batchId: Id | null
  personId: Id | null
  note: string | null
  servings: number | null
  position: number
  status: PlanEntryStatus
}

export interface Deduction {
  ingredientId: Id | null
  itemId: Id | null
  itemName: string
  /** For count items: amount in the item's unit. For status items: null. */
  amount: number | null
  unit: string | null
  /** Status items get a "still OK?" prompt instead. */
  newStatus?: StockStatus
  action: 'apply' | 'edit' | 'skip'
}

export interface CookSession extends TenantRow {
  recipeId: Id
  planEntryId: Id | null
  batchId: Id | null
  cookedBy: Id | null
  startedAt: string
  finishedAt: string | null
  servingsMade: number | null
  deductions: Deduction[]
  status: CookSessionStatus
}

export interface Retailer extends TenantRow {
  name: string
  kind: RetailerKind
  config: RetailerConfig
  isPrimaryGrocery: boolean
  isPrimaryOther: boolean
  sortOrder: number
}

export interface RetailerConfig {
  /** Instacart: retailer slug or store name used in the products link. */
  storeName?: string
  storeId?: string
  zip?: string
  /** Amazon: affiliate tag (not a secret). */
  affiliateTag?: string
  /** H-E-B / in person: aisle order for the printable list. */
  aisleOrder?: string[]
}

export interface RoutingRule extends TenantRow {
  matchKind: RoutingMatchKind
  matchValue: string
  retailerId: Id
  priority: number
}

export type ListReasonKind = 'low' | 'out' | 'plan' | 'batch' | 'manual' | 'voice' | 'almost_there' | 'stretch'
export interface ListReason {
  kind: ListReasonKind
  /** Plan entry, batch, recipe or item id behind the reason. */
  ref?: Id
  text?: string
  qty?: number
  unit?: string
}

export interface ListLine extends TenantRow {
  itemId: Id | null
  name: string
  qty: number | null
  unit: string | null
  reasons: ListReason[]
  retailerId: Id | null
  status: ListLineStatus
  listSendId: Id | null
  searchTerm: string | null
  priceCentsEst: number | null
  note: string | null
  position: number
}

export interface ListSend extends TenantRow {
  retailerId: Id | null
  sentBy: Id | null
  sentAt: string
  status: ListSendStatus
  estimatedTotalCents: number | null
  actualTotalCents: number | null
  externalUrl: string | null
  externalOrderRef: string | null
  receivedAt: string | null
  lineCount: number
}

export interface Price extends TenantRow {
  itemId: Id
  retailerId: Id | null
  priceCents: number
  unitQty: number | null
  unit: string | null
  source: PriceSource
  observedOn: string
  receiptId: Id | null
  note: string | null
}

export interface Spend extends TenantRow {
  retailerId: Id | null
  amountCents: number
  kind: SpendKind
  category: SpendCategory
  occurredOn: string
  listSendId: Id | null
  receiptId: Id | null
  note: string | null
}

export interface Receipt extends TenantRow {
  retailerId: Id | null
  uploadedBy: Id | null
  storagePath: string | null
  purchasedOn: string | null
  totalCents: number | null
  status: 'uploaded' | 'parsed' | 'reviewed' | 'purged'
  rawResult: unknown
  listSendId: Id | null
}

export interface ReceiptLine {
  id: Id
  householdId: Id
  receiptId: Id
  rawText: string
  qty: number | null
  unitPriceCents: number | null
  lineTotalCents: number | null
  itemId: Id | null
  status: 'matched' | 'unmatched' | 'ignored'
}

export interface PartnerTurn extends TenantRow {
  userId: Id | null
  utterance: string
  transcriptConfidence: number | null
  intents: Intent[]
  applied: unknown[]
  status: PartnerTurnStatus
  error: string | null
}

export interface ActivityEvent {
  id: Id
  householdId: Id
  actorUserId: Id | null
  entityType: string
  entityId: Id | null
  action: string
  summary: string
  before: unknown
  after: unknown
  source: ActivitySource
  partnerTurnId: Id | null
  cookSessionId: Id | null
  undoOfEventId: Id | null
  undoneByEventId: Id | null
  createdAt: string
}

export interface Invite {
  id: Id
  householdId: Id | null
  kind: 'member' | 'household'
  email: string | null
  role: Role
  newHouseholdName: string | null
  expiresAt: string
  maxUses: number
  usedCount: number
  createdBy: Id | null
  acceptedBy: Id | null
  acceptedAt: string | null
  createdAt: string
}

export interface NotificationPref {
  id: Id
  householdId: Id
  userId: Id
  type: NotificationType
  enabled: boolean
}
export type NotificationType =
  | 'low_out_daily' | 'expiring_2_days' | 'expired' | 'weekly_shop' | 'cook_week_prep' | 'price_book_stale' | 'budget_80' | 'budget_100' | 'list_sent'

/* ------------------------------------------------------------------------------------------------
   Partner intents (shared schema between the app, the edge function, and the Riker MCP server)
   ------------------------------------------------------------------------------------------------ */

export type Intent =
  | { kind: 'inventory.add'; confidence: number; items: { name: string; qty?: number; unit?: string; location?: string; category?: ItemCategory }[] }
  | { kind: 'inventory.set_status'; confidence: number; items: { name: string; status: StockStatus }[] }
  | { kind: 'inventory.consume'; confidence: number; items: { name: string; qty?: number; unit?: string }[] }
  | { kind: 'inventory.query'; confidence: number; query: string; itemNames?: string[] }
  | { kind: 'recipe.suggest'; confidence: number; filters?: SuggestionFilters }
  | { kind: 'recipe.generate'; confidence: number; brief: string }
  | { kind: 'plan.set'; confidence: number; date: string; slot?: PlanSlot; recipeTitle?: string; freezerBlockTitle?: string; person?: string; note?: string }
  | { kind: 'plan.cookweek'; confidence: number; batches?: number; budgetCents?: number; constraints?: string }
  | { kind: 'list.add'; confidence: number; items: { name: string; qty?: number; unit?: string; retailer?: string }[] }
  | { kind: 'list.route'; confidence: number; itemName: string; retailer: string; always?: boolean }
  | { kind: 'list.send'; confidence: number; retailer?: string }
  | { kind: 'rules.edit'; confidence: number; rule: RulePayload; person?: string }
  | { kind: 'cook.navigate'; confidence: number; action: 'next' | 'back' | 'repeat' | 'timer'; minutes?: number }
  | { kind: 'unknown'; confidence: number; clarify?: string }

export interface SuggestionFilters {
  mealType?: MealType
  cuisine?: string
  maxActiveMinutes?: number
  seatedFriendly?: boolean
  equipment?: Equipment[]
  tags?: RecipeTag[]
  personId?: Id
  freezerSafe?: boolean
  maxMissing?: 0 | 1 | 2
  cheapest?: boolean
  maxCalories?: number
  minProteinG?: number
  maxSodiumMg?: number
  energy?: Energy
  search?: string
}

/* ------------------------------------------------------------------------------------------------
   Defaults the spec names
   ------------------------------------------------------------------------------------------------ */

export const QUALITY_DAYS_DEFAULT: Record<FoodType, number> = {
  soup: 90,
  cooked_meat: 90,
  raw_marinated: 180,
  baked: 60,
  sauce: 90,
  grain: 90,
  vegetable: 90,
  other: 90,
}

export const SHELF_LIFE_DAYS_BY_CATEGORY: Partial<Record<ItemCategory, number>> = {
  produce: 7,
  dairy: 14,
  meat: 3,
  seafood: 2,
  bakery: 5,
  pantry: 730,
  frozen: 180,
  beverage: 180,
  spice: 365,
  condiment: 180,
}

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  produce: 'Produce',
  dairy: 'Dairy',
  meat: 'Meat',
  seafood: 'Seafood',
  pantry: 'Pantry',
  frozen: 'Frozen',
  bakery: 'Bakery',
  beverage: 'Drinks',
  spice: 'Spices',
  condiment: 'Condiments',
  cleaning: 'Cleaning',
  paper: 'Paper goods',
  pet: 'Pet',
  pharmacy: 'Pharmacy',
  personal: 'Personal care',
  household: 'Household',
  other: 'Other',
}

/** Categories that count as food for retailer routing. */
export const FOOD_CATEGORIES: ItemCategory[] = ['produce', 'dairy', 'meat', 'seafood', 'pantry', 'frozen', 'bakery', 'beverage', 'spice', 'condiment']

export const SPEND_CATEGORY_FOR_ITEM: Record<ItemCategory, SpendCategory> = {
  produce: 'groceries', dairy: 'groceries', meat: 'groceries', seafood: 'groceries', pantry: 'groceries', frozen: 'groceries',
  bakery: 'groceries', beverage: 'groceries', spice: 'groceries', condiment: 'groceries',
  cleaning: 'cleaning', paper: 'household', household: 'household', personal: 'household', pet: 'pet', pharmacy: 'pharmacy', other: 'other',
}
