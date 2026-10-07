import type { FreezerBlock, Item, ItemAlias, ListLine, Price, RecipeWithIngredients } from '../types'

/** What a Neelix's Kitchen export (localStorage key freezer-partner-state-v1) turns into. Shapes are tolerant:
    the importer looks for arrays named like recipes, pantry/staples/items, freezer/cubes/blocks, list/shopping, prices/priceBook, aliases/quirks,
    and keeps anything it cannot map in `unmapped` for a manual pass. */
export interface NeelixImportPlan {
  recipes: RecipeWithIngredients[]
  items: Item[]
  freezerBlocks: FreezerBlock[]
  listLines: ListLine[]
  prices: Price[]
  aliases: ItemAlias[]
  /** Ingredient rows whose amount or unit could not be parsed; the UI flags them for a quick fix. */
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

/** Parse a Neelix export object (already JSON.parsed). Never throws on shape problems; reports them. */
export function parseNeelixExport(_data: unknown, _ctx: NeelixImportContext): NeelixImportPlan {
  throw new Error('not implemented: parseNeelixExport')
}

/** Parse one free-text ingredient line ("2 cans (15 oz) black beans, drained") into amount, unit, name, preparation. */
export function parseIngredientLine(_line: string): { amount: number | null; unit: string | null; name: string; preparation: string | null; confidence: number } {
  throw new Error('not implemented: parseIngredientLine')
}
