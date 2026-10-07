import { describe, it, expect } from 'vitest'
import { canonicalName, containsIngredient, nameSimilarity, nameTokens, singularize } from './names'
import type { Item, RecipeIngredient, TenantRow } from './types'

/* ------------------------------------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------------------------------------ */

function tenant(id: string): TenantRow {
  return {
    id,
    householdId: 'hh-denton',
    createdAt: '2026-10-01T12:00:00Z',
    createdBy: 'user-liam',
    updatedAt: '2026-10-01T12:00:00Z',
    updatedBy: 'user-liam',
    deletedAt: null,
  }
}

function item(id: string, name: string, patch: Partial<Item> = {}): Item {
  return {
    ...tenant(id),
    name,
    canonicalName: canonicalName(name),
    category: 'pantry',
    locationId: null,
    trackMode: 'status',
    status: 'ok',
    qty: null,
    unit: null,
    par: null,
    useBy: null,
    barcode: null,
    imagePath: null,
    alwaysHave: false,
    autoList: true,
    personId: null,
    defaultShelfLifeDays: null,
    notes: null,
    sortOrder: 0,
    ...patch,
  }
}

function ingredient(id: string, ingredientName: string, patch: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    ...tenant(id),
    recipeId: 'recipe-1',
    position: 0,
    ingredientName,
    canonicalName: canonicalName(ingredientName),
    amount: null,
    unit: null,
    preparation: null,
    optional: false,
    groupLabel: null,
    substitute: null,
    itemId: null,
    matchConfidence: null,
    fdcId: null,
    grams: null,
    ...patch,
  }
}

/* ------------------------------------------------------------------------------------------------
   canonicalName
   ------------------------------------------------------------------------------------------------ */

describe('canonicalName: case, whitespace, punctuation', () => {
  it('lowercases and trims', () => {
    expect(canonicalName('  Olive Oil ')).toBe('olive oil')
    expect(canonicalName('CHICKEN')).toBe('chicken')
  })

  it('collapses inner whitespace', () => {
    expect(canonicalName('olive   oil')).toBe('olive oil')
    expect(canonicalName('olive\toil\n')).toBe('olive oil')
  })

  it('strips punctuation and apostrophes', () => {
    // Apostrophes vanish, then the regular plural rule runs, so both spellings land on one form.
    expect(canonicalName("confectioners' sugar")).toBe('confectioner sugar')
    expect(canonicalName("confectioner's sugar")).toBe('confectioner sugar')
    expect(canonicalName('salt & pepper!')).toBe('salt pepper')
    expect(canonicalName('Trader Joe’s hummus')).toBe('trader joe hummus')
  })

  it('turns hyphens into spaces', () => {
    expect(canonicalName('sun-dried tomatoes')).toBe('sun dried tomato')
    expect(canonicalName('half-and-half')).toBe('half and half')
    expect(canonicalName('bone-in chicken thighs')).toBe('bone in chicken thigh')
  })

  it('removes accents', () => {
    expect(canonicalName('jalapeño')).toBe('jalapeno')
    expect(canonicalName('crème fraîche')).toBe('creme fraiche')
  })

  it('returns empty for empty or whitespace input', () => {
    expect(canonicalName('')).toBe('')
    expect(canonicalName('   ')).toBe('')
    expect(canonicalName(' , ')).toBe('')
  })
})

describe('canonicalName: parenthetical notes', () => {
  it('drops parenthetical notes', () => {
    expect(canonicalName('chicken thighs (boneless, skinless)')).toBe('chicken thigh')
    expect(canonicalName('black beans (1 can, drained)')).toBe('black bean')
    expect(canonicalName('butter (unsalted)')).toBe('butter')
  })

  it('drops bracketed notes too', () => {
    expect(canonicalName('cilantro [see note]')).toBe('cilantro')
    expect(canonicalName('tomatoes {canned}')).toBe('tomato')
  })

  it('keeps the product when the note is in the middle', () => {
    expect(canonicalName('chicken (or turkey) thighs')).toBe('chicken thigh')
  })
})

describe('canonicalName: trailing preparation after a comma', () => {
  it('drops the preparation after the comma', () => {
    expect(canonicalName('cilantro, chopped')).toBe('cilantro')
    expect(canonicalName('Fresh cilantro, chopped')).toBe('cilantro')
    expect(canonicalName('onion, peeled and diced')).toBe('onion')
    expect(canonicalName('garlic, minced')).toBe('garlic')
    expect(canonicalName('butter, melted')).toBe('butter')
    expect(canonicalName('eggs, beaten')).toBe('egg')
    expect(canonicalName('lemon, zested and juiced')).toBe('lemon')
    expect(canonicalName('chicken breast, cut into bite-size pieces')).toBe('chicken breast')
  })

  it('drops "to taste", "for serving" and similar notes', () => {
    expect(canonicalName('salt, to taste')).toBe('salt')
    expect(canonicalName('salt to taste')).toBe('salt')
    expect(canonicalName('flour, for dusting')).toBe('flour')
    expect(canonicalName('lime wedges, for serving')).toBe('lime wedge')
    expect(canonicalName('olive oil for frying')).toBe('olive oil')
    expect(canonicalName('cilantro, plus more for garnish')).toBe('cilantro')
    expect(canonicalName('butter, at room temperature')).toBe('butter')
    expect(canonicalName('parsley, optional')).toBe('parsley')
    expect(canonicalName('cilantro, leaves only')).toBe('cilantro')
    expect(canonicalName('kale, stems removed')).toBe('kale')
  })

  it('keeps a comma segment that is part of the product name', () => {
    expect(canonicalName('boneless, skinless chicken thighs')).toBe('boneless skinless chicken thigh')
    expect(canonicalName('Boneless, Skinless Chicken Breasts')).toBe('boneless skinless chicken breast')
  })

  it('handles several commas', () => {
    expect(canonicalName('boneless, skinless chicken thighs, cut into cubes')).toBe('boneless skinless chicken thigh')
    expect(canonicalName('carrots, peeled, sliced')).toBe('carrot')
  })
})

describe('canonicalName: descriptors removed', () => {
  it.each([
    ['fresh basil', 'basil'],
    ['Fresh cilantro', 'cilantro'],
    ['frozen peas', 'pea'],
    ['chopped onion', 'onion'],
    ['diced tomatoes', 'tomato'],
    ['minced garlic', 'garlic'],
    ['sliced mushrooms', 'mushroom'],
    ['large eggs', 'egg'],
    ['small onion', 'onion'],
    ['medium carrots', 'carrot'],
    ['organic spinach', 'spinach'],
    ['ripe bananas', 'banana'],
    ['raw honey', 'honey'],
    ['cooked rice', 'rice'],
    ['whole chicken', 'chicken'],
    ['grated parmesan', 'parmesan'],
    ['shredded cheddar cheese', 'cheddar cheese'],
    ['freshly ground black pepper', 'ground black pepper'],
    ['thinly sliced red onion', 'red onion'],
    ['extra-virgin olive oil', 'virgin olive oil'],
    ['packed brown sugar', 'brown sugar'],
    ['leftover rice', 'rice'],
    ['store-bought pie crust', 'pie crust'],
  ])('%s -> %s', (input, expected) => {
    expect(canonicalName(input)).toBe(expected)
  })

  it('removes several descriptors at once', () => {
    expect(canonicalName('fresh organic large ripe tomatoes')).toBe('tomato')
    expect(canonicalName('2 large fresh eggs')).toBe('2 egg')
  })

  it('keeps words that change the product', () => {
    expect(canonicalName('boneless chicken thighs')).toBe('boneless chicken thigh')
    expect(canonicalName('Boneless skinless chicken thighs')).toBe('boneless skinless chicken thigh')
    expect(canonicalName('ground beef')).toBe('ground beef')
    expect(canonicalName('ground cumin')).toBe('ground cumin')
    expect(canonicalName('dried beans')).toBe('dried bean')
    expect(canonicalName('canned tomatoes')).toBe('canned tomato')
    expect(canonicalName('smoked paprika')).toBe('smoked paprika')
    expect(canonicalName('sweet potatoes')).toBe('sweet potato')
    expect(canonicalName('red onion')).toBe('red onion')
    expect(canonicalName('unsalted butter')).toBe('unsalted butter')
    expect(canonicalName('heavy cream')).toBe('heavy cream')
    expect(canonicalName('baby spinach')).toBe('baby spinach')
  })

  it('keeps hot, cold and cool because they name products', () => {
    expect(canonicalName('hot sauce')).toBe('hot sauce')
    expect(canonicalName('hot dogs')).toBe('hot dog')
    expect(canonicalName('cold brew')).toBe('cold brew')
    expect(canonicalName('Cool Whip')).toBe('cool whip')
  })

  it('keeps a name made only of descriptors instead of returning empty', () => {
    expect(canonicalName('fresh')).toBe('fresh')
    expect(canonicalName('Large')).toBe('large')
    expect(canonicalName('chopped, fresh')).toBe('chopped')
  })
})

describe('canonicalName: multi-word products stay intact', () => {
  it.each([
    ['olive oil', 'olive oil'],
    ['chicken thigh', 'chicken thigh'],
    ['black beans', 'black bean'],
    ['peanut butter', 'peanut butter'],
    ['chicken broth', 'chicken broth'],
    ['cream of mushroom soup', 'cream of mushroom soup'],
    ['half and half', 'half and half'],
    ['sour cream', 'sour cream'],
    ['red bell pepper', 'red bell pepper'],
    ['brussels sprouts', 'brussels sprout'],
    ['green onions', 'green onion'],
    ['crushed red pepper flakes', 'red pepper flake'],
  ])('%s -> %s', (input, expected) => {
    expect(canonicalName(input)).toBe(expected)
  })
})

describe('canonicalName: singular forms', () => {
  it.each([
    ['chicken thighs', 'chicken thigh'],
    ['tomatoes', 'tomato'],
    ['potatoes', 'potato'],
    ['mangoes', 'mango'],
    ['berries', 'berry'],
    ['strawberries', 'strawberry'],
    ['cherries', 'cherry'],
    ['anchovies', 'anchovy'],
    ['peaches', 'peach'],
    ['radishes', 'radish'],
    ['sandwiches', 'sandwich'],
    ['boxes', 'box'],
    ['eggs', 'egg'],
    ['peas', 'pea'],
    ['beans', 'bean'],
    ['oats', 'oat'],
    ['olives', 'olive'],
    ['cloves', 'clove'],
    ['chives', 'chive'],
    ['avocados', 'avocado'],
    ['jalapenos', 'jalapeno'],
    ['tortillas', 'tortilla'],
    ['sauces', 'sauce'],
    ['cheeses', 'cheese'],
    ['dates', 'date'],
    ['glasses', 'glass'],
  ])('%s -> %s', (input, expected) => {
    expect(canonicalName(input)).toBe(expected)
  })

  it('handles plurals whose singular ends in ie or f', () => {
    expect(canonicalName('cookies')).toBe('cookie')
    expect(canonicalName('brownies')).toBe('brownie')
    expect(canonicalName('pies')).toBe('pie')
    expect(canonicalName('veggies')).toBe('veggie')
    expect(canonicalName('bay leaves')).toBe('bay leaf')
    expect(canonicalName('loaves')).toBe('loaf')
    expect(canonicalName('chilies')).toBe('chili')
    expect(canonicalName('quiches')).toBe('quiche')
  })

  it('does not break words that only look plural', () => {
    expect(canonicalName('hummus')).toBe('hummus')
    expect(canonicalName('couscous')).toBe('couscous')
    expect(canonicalName('asparagus')).toBe('asparagus')
    expect(canonicalName('molasses')).toBe('molasses')
    expect(canonicalName('lemongrass')).toBe('lemongrass')
    expect(canonicalName('watercress')).toBe('watercress')
    expect(canonicalName('swiss cheese')).toBe('swiss cheese')
    expect(canonicalName('grits')).toBe('grits')
    expect(canonicalName('citrus')).toBe('citrus')
    expect(canonicalName('sea bass')).toBe('sea bass')
    expect(canonicalName('brussels sprouts')).toBe('brussels sprout')
  })

  it('leaves short words alone', () => {
    expect(canonicalName('gas')).toBe('gas')
    expect(canonicalName('yes')).toBe('yes')
    expect(canonicalName('is')).toBe('is')
  })

  it('leaves words that do not end in s alone', () => {
    expect(canonicalName('rice')).toBe('rice')
    expect(canonicalName('cheese')).toBe('cheese')
    expect(canonicalName('mayonnaise')).toBe('mayonnaise')
    expect(canonicalName('spinach')).toBe('spinach')
  })

  it('singularizes every word in the name', () => {
    expect(canonicalName('beans and tomatoes')).toBe('bean and tomato')
  })
})

describe('canonicalName: stability', () => {
  it('is idempotent', () => {
    const inputs = [
      'Fresh cilantro, chopped',
      'Boneless skinless chicken thighs',
      'sun-dried tomatoes',
      'cream of mushroom soup',
      'brussels sprouts',
      'hummus',
      'extra-virgin olive oil',
      'cookies',
    ]
    for (const input of inputs) {
      const once = canonicalName(input)
      expect(canonicalName(once)).toBe(once)
    }
  })

  it('matches the examples in the stub comment', () => {
    expect(canonicalName('Fresh cilantro, chopped')).toBe('cilantro')
    expect(canonicalName('Boneless skinless chicken thighs')).toBe('boneless skinless chicken thigh')
  })

  it('gives an item and a recipe ingredient the same canonical name for the same product', () => {
    const stock = item('item-1', 'Chicken Thighs')
    const needed = ingredient('ing-1', 'chicken thighs, trimmed')
    expect(stock.canonicalName).toBe('chicken thigh')
    expect(needed.canonicalName).toBe(stock.canonicalName)
  })
})

/* ------------------------------------------------------------------------------------------------
   singularize
   ------------------------------------------------------------------------------------------------ */

describe('singularize', () => {
  it('applies regular rules', () => {
    expect(singularize('thighs')).toBe('thigh')
    expect(singularize('tomatoes')).toBe('tomato')
    expect(singularize('berries')).toBe('berry')
    expect(singularize('peaches')).toBe('peach')
    expect(singularize('dishes')).toBe('dish')
    expect(singularize('mixes')).toBe('mix')
  })

  it('leaves invariant and short words alone', () => {
    expect(singularize('hummus')).toBe('hummus')
    expect(singularize('molasses')).toBe('molasses')
    expect(singularize('bus')).toBe('bus')
    expect(singularize('egg')).toBe('egg')
  })

  it('lowercases its input', () => {
    expect(singularize('Thighs')).toBe('thigh')
  })
})

/* ------------------------------------------------------------------------------------------------
   nameTokens
   ------------------------------------------------------------------------------------------------ */

describe('nameTokens', () => {
  it('splits the canonical name into tokens', () => {
    expect(nameTokens('Fresh Chicken Thighs')).toEqual(['chicken', 'thigh'])
    expect(nameTokens('boneless skinless chicken thighs')).toEqual(['boneless', 'skinless', 'chicken', 'thigh'])
  })

  it('removes stop words', () => {
    expect(nameTokens('cream of mushroom soup')).toEqual(['cream', 'mushroom', 'soup'])
    expect(nameTokens('salt and pepper')).toEqual(['salt', 'pepper'])
    expect(nameTokens('juice of a lemon')).toEqual(['juice', 'lemon'])
  })

  it('returns unique tokens in order of first appearance', () => {
    expect(nameTokens('half and half')).toEqual(['half'])
    expect(nameTokens('chicken chicken broth')).toEqual(['chicken', 'broth'])
  })

  it('returns an empty list for empty names', () => {
    expect(nameTokens('')).toEqual([])
    expect(nameTokens('   ')).toEqual([])
    expect(nameTokens('of the')).toEqual([])
  })

  it('applies descriptor removal and singular forms', () => {
    expect(nameTokens('2 large fresh eggs')).toEqual(['2', 'egg'])
    expect(nameTokens('sun-dried tomatoes, chopped')).toEqual(['sun', 'dried', 'tomato'])
  })
})

/* ------------------------------------------------------------------------------------------------
   nameSimilarity
   ------------------------------------------------------------------------------------------------ */

describe('nameSimilarity: equal names', () => {
  it('returns 1 for identical strings', () => {
    expect(nameSimilarity('chicken thigh', 'chicken thigh')).toBe(1)
  })

  it('returns 1 when the canonical names are equal', () => {
    expect(nameSimilarity('Chicken Thighs', 'chicken thigh')).toBe(1)
    expect(nameSimilarity('Fresh cilantro, chopped', 'cilantro')).toBe(1)
    expect(nameSimilarity('diced tomatoes', 'Tomato')).toBe(1)
    expect(nameSimilarity('sun-dried tomatoes', 'sun dried tomato')).toBe(1)
  })

  it('returns 1 for two empty names and 0 when only one is empty', () => {
    expect(nameSimilarity('', '')).toBe(1)
    expect(nameSimilarity('', 'apple')).toBe(0)
    expect(nameSimilarity('apple', '   ')).toBe(0)
  })
})

describe('nameSimilarity: containment', () => {
  it('scores at least 0.85 when one name contains the other as whole words', () => {
    expect(nameSimilarity('chicken thigh', 'boneless chicken thigh')).toBeGreaterThanOrEqual(0.85)
    expect(nameSimilarity('chicken thigh', 'boneless skinless chicken thighs')).toBeGreaterThanOrEqual(0.85)
    expect(nameSimilarity('black beans', 'black bean soup')).toBeGreaterThanOrEqual(0.85)
    expect(nameSimilarity('olive oil', 'extra virgin olive oil')).toBeGreaterThanOrEqual(0.85)
  })

  it('never reaches 1 for containment', () => {
    expect(nameSimilarity('chicken thigh', 'boneless chicken thigh')).toBeLessThan(1)
    expect(nameSimilarity('oil', 'olive oil')).toBeLessThan(1)
  })

  it('is symmetric', () => {
    expect(nameSimilarity('chicken thigh', 'boneless chicken thigh')).toBe(nameSimilarity('boneless chicken thigh', 'chicken thigh'))
  })

  it('scores higher when the shorter name covers more of the longer one', () => {
    const twoOfThree = nameSimilarity('chicken thigh', 'boneless chicken thigh')
    const oneOfFour = nameSimilarity('thigh', 'boneless skinless chicken thigh')
    expect(twoOfThree).toBeGreaterThan(oneOfFour)
    expect(twoOfThree).toBeCloseTo(0.85 + 0.15 * (2 / 3), 5)
    expect(oneOfFour).toBeCloseTo(0.85 + 0.15 * (1 / 4), 5)
  })

  it('requires whole words, not substrings', () => {
    // "egg" is inside "eggplant" as letters, not as a word.
    expect(nameSimilarity('egg', 'eggplant')).toBe(0)
    expect(nameSimilarity('nut', 'coconut')).toBe(0)
  })

  it('requires the words to sit together', () => {
    // "red pepper" is not a phrase inside "red bell pepper", so this falls to Jaccard (2 of 3).
    expect(nameSimilarity('red pepper', 'red bell pepper')).toBeCloseTo(2 / 3, 5)
  })
})

describe('nameSimilarity: token Jaccard', () => {
  it('uses Jaccard over tokens with stop words removed', () => {
    expect(nameSimilarity('chicken thigh', 'chicken broth')).toBeCloseTo(1 / 3, 5)
    expect(nameSimilarity('olive oil', 'vegetable oil')).toBeCloseTo(1 / 3, 5)
    expect(nameSimilarity('red bell pepper', 'green bell pepper')).toBeCloseTo(2 / 4, 5)
  })

  it('scores 0 when nothing is shared', () => {
    expect(nameSimilarity('apple', 'orange')).toBe(0)
    expect(nameSimilarity('ground beef', 'olive oil')).toBe(0)
  })

  it('keeps a single shared generic token at 0.6 or below', () => {
    const chickenThings = ['chicken thigh', 'chicken broth', 'chicken breast', 'chicken stock', 'chicken wings']
    for (const a of chickenThings) {
      for (const b of chickenThings) {
        if (a === b) continue
        expect(nameSimilarity(a, b)).toBeLessThanOrEqual(0.6)
      }
    }
    expect(nameSimilarity('chicken thigh', 'chicken broth')).toBeLessThanOrEqual(0.6)
    expect(nameSimilarity('coconut milk', 'coconut oil')).toBeLessThanOrEqual(0.6)
    expect(nameSimilarity('peanut butter', 'almond butter')).toBeLessThanOrEqual(0.6)
  })

  it('ignores stop words and word order', () => {
    // Same tokens in a different order: Jaccard is 1 even though the canonical strings differ.
    expect(nameSimilarity('soup of mushroom', 'mushroom soup')).toBe(1)
  })

  it('is symmetric', () => {
    expect(nameSimilarity('chicken thigh', 'chicken broth')).toBe(nameSimilarity('chicken broth', 'chicken thigh'))
  })

  it('returns 0 when a name has only stop words', () => {
    expect(nameSimilarity('of the', 'chicken')).toBe(0)
  })
})

describe('nameSimilarity: range and matching use', () => {
  it('always stays within 0 and 1', () => {
    const names = ['chicken thigh', 'boneless skinless chicken thighs', 'chicken broth', 'olive oil', 'extra-virgin olive oil', '', 'Fresh cilantro, chopped', 'hummus', 'black beans']
    for (const a of names) {
      for (const b of names) {
        const s = nameSimilarity(a, b)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(1)
      }
    }
  })

  it('clears the fuzzy threshold for the stub example and not for a different product', () => {
    const stock = item('item-1', 'Chicken Thighs')
    const needed = ingredient('ing-1', 'boneless skinless chicken thighs')
    const other = ingredient('ing-2', 'chicken broth')
    expect(nameSimilarity(stock.canonicalName, needed.canonicalName)).toBeGreaterThanOrEqual(0.8)
    expect(nameSimilarity(stock.canonicalName, other.canonicalName)).toBeLessThan(0.8)
  })
})

/* ------------------------------------------------------------------------------------------------
   containsIngredient
   ------------------------------------------------------------------------------------------------ */

describe('containsIngredient', () => {
  it('finds the ingredient as a whole word', () => {
    expect(containsIngredient('coconut milk', 'coconut')).toBe(true)
    expect(containsIngredient('peanut butter', 'peanut')).toBe(true)
    expect(containsIngredient('fresh cilantro, chopped', 'cilantro')).toBe(true)
  })

  it('canonicalizes both sides (plurals, case, descriptors, hyphens)', () => {
    expect(containsIngredient('Coconuts', 'coconut')).toBe(true)
    expect(containsIngredient('coconut', 'Coconuts')).toBe(true)
    expect(containsIngredient('sun-dried tomatoes', 'tomato')).toBe(true)
    expect(containsIngredient('chicken thighs', 'chicken thigh')).toBe(true)
    expect(containsIngredient('Fresh Cilantro', 'cilantro, chopped')).toBe(true)
  })

  it('matches multi-word phrases only when the words sit together', () => {
    expect(containsIngredient('unsweetened coconut milk', 'coconut milk')).toBe(true)
    expect(containsIngredient('coconut cream', 'coconut milk')).toBe(false)
    expect(containsIngredient('milk with coconut', 'coconut milk')).toBe(false)
  })

  it('does not match inside another word', () => {
    expect(containsIngredient('eggplant', 'egg')).toBe(false)
    expect(containsIngredient('coconut', 'nut')).toBe(false)
    expect(containsIngredient('buttermilk', 'milk')).toBe(false)
    expect(containsIngredient('peanuts', 'nut')).toBe(false)
  })

  it('does not match a needle longer than the haystack', () => {
    expect(containsIngredient('limes', 'lime juice')).toBe(false)
    expect(containsIngredient('coconut', 'coconut milk')).toBe(false)
  })

  it('returns false for empty input', () => {
    expect(containsIngredient('', 'coconut')).toBe(false)
    expect(containsIngredient('coconut', '')).toBe(false)
    expect(containsIngredient('', '')).toBe(false)
    expect(containsIngredient('coconut', 'fresh, chopped')).toBe(false)
  })

  it('supports the Denton seed allergy rules', () => {
    const recipe = ['chicken thighs', 'coconut milk', 'fresh cilantro, chopped', 'lime juice', 'scallion greens']
    const hasCoconut = recipe.filter((n) => containsIngredient(n, 'coconut'))
    const hasCilantro = recipe.filter((n) => containsIngredient(n, 'cilantro'))
    expect(hasCoconut).toEqual(['coconut milk'])
    expect(hasCilantro).toEqual(['fresh cilantro, chopped'])
    // The substitutes do not trip the rules.
    expect(containsIngredient('lime juice', 'coconut')).toBe(false)
    expect(containsIngredient('scallion greens', 'cilantro')).toBe(false)
  })
})
