import type { Container, FoodType, FreezerBlock, HouseholdSettings, Person, Recipe } from './types'

export type LabelFormat = 'tape' | 'bag' | 'sheet'

/** Label text: recipe, portions, date, person, reheat line. Tape is one line, bag panel three lines, sheet five lines. */
export function labelText(
  _block: Pick<FreezerBlock, 'title' | 'portionLabel' | 'servingsPerBlock' | 'cookedOn' | 'qualityUntil' | 'foodType'>,
  _opts: { recipe?: Recipe | null; person?: Person | null; container?: Container | null; format: LabelFormat },
): string {
  throw new Error('not implemented: labelText')
}

/** Quality date from the cook date and food type, using household overrides, else QUALITY_DAYS_DEFAULT. */
export function qualityUntil(_cookedOn: string, _foodType: FoodType, _settings?: HouseholdSettings | null): string {
  throw new Error('not implemented: qualityUntil')
}

/** Reheat line for the container kind, from the recipe's reheat notes, else a sensible default per kind. */
export function reheatLine(_recipe: Recipe | null | undefined, _container: Container | null | undefined): string {
  throw new Error('not implemented: reheatLine')
}

/** Guess a food type from a recipe's title and tags (soup, stew, chili -> soup; etc.). */
export function guessFoodType(_recipe: Pick<Recipe, 'title' | 'tags' | 'mealType'>): FoodType {
  throw new Error('not implemented: guessFoodType')
}
