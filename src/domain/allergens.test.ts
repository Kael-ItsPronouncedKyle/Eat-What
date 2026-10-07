import { describe, it, expect } from 'vitest'
import { ALLERGEN_FAMILIES, ALLERGEN_FAMILY_NAMES, expandAllergen, ingredientHasAllergen } from './allergens'

describe('expandAllergen', () => {
  it('returns the name itself first, then the family members, canonicalized', () => {
    expect(expandAllergen('Nuts')).toEqual(['nut', 'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'pine nut', 'peanut'])
    expect(expandAllergen('tree nuts')).not.toContain('peanut')
    expect(expandAllergen('tree nuts')).toContain('almond')
    expect(expandAllergen('peanuts')).toEqual(['peanut'])
    expect(expandAllergen('Eggs')).toEqual(['egg', 'mayonnaise'])
  })
  it('unknown names expand to just themselves; blank to nothing', () => {
    expect(expandAllergen('cilantro')).toEqual(['cilantro'])
    expect(expandAllergen('  ')).toEqual([])
  })
  it('wheat and gluten share one list and every family is listed', () => {
    expect(ALLERGEN_FAMILIES.wheat).toEqual(ALLERGEN_FAMILIES.gluten)
    expect(ALLERGEN_FAMILY_NAMES).toContain('shellfish')
    expect(ALLERGEN_FAMILY_NAMES).toContain('sesame')
  })
})

describe('ingredientHasAllergen', () => {
  const yes = (ing: string, allergen: string) => expect(ingredientHasAllergen(ing, allergen), `${ing} should match ${allergen}`).toBe(true)
  const no = (ing: string, allergen: string) => expect(ingredientHasAllergen(ing, allergen), `${ing} should not match ${allergen}`).toBe(false)

  it('nuts cover every nut, peanuts included; tree nuts leave peanuts out', () => {
    for (const n of ['sliced almonds', 'walnut halves', 'pecans', 'roasted cashews', 'pistachios', 'hazelnuts', 'macadamia nuts', 'pine nuts', 'peanuts', 'peanut butter']) yes(n, 'nuts')
    for (const n of ['sliced almonds', 'walnut halves', 'pine nuts']) yes(n, 'tree nuts')
    no('peanuts', 'tree nuts')
    no('peanut butter', 'tree nuts')
    yes('peanut butter', 'peanut')
    no('almonds', 'peanuts')
  })
  it('no "nut" inside coconut, nutmeg, butternut or doughnut, and no "egg" inside eggplant', () => {
    no('coconut', 'nuts')
    no('coconut milk', 'nuts')
    no('nutmeg', 'nuts')
    no('butternut squash', 'nuts')
    no('doughnuts', 'nuts')
    no('water chestnuts', 'nuts')
    no('eggplant', 'eggs')
    no('1 large eggplant, cubed', 'egg')
    yes('2 eggs', 'eggs')
    yes('egg noodles', 'eggs')
    yes('mayonnaise', 'eggs')
  })
  it('shellfish', () => {
    for (const n of ['shrimp, peeled', 'prawns', 'crab meat', 'lobster tail', 'crawfish', 'sea scallops', 'clams', 'mussels', 'oysters', 'oyster sauce']) yes(n, 'shellfish')
    no('oyster mushrooms', 'shellfish')
    no('crab apples', 'shellfish')
    no('salmon', 'shellfish')
  })
  it('dairy, with plant milks and nut butters left out', () => {
    for (const n of ['whole milk', 'cheddar cheese', 'unsalted butter', 'heavy cream', 'half and half', 'greek yogurt', 'whey protein', 'ghee', 'cheddar', 'fresh mozzarella', 'grated parmesan', 'feta']) yes(n, 'dairy')
    for (const n of ['coconut milk', 'almond milk', 'oat milk', 'soy milk', 'peanut butter', 'almond butter', 'cocoa butter', 'coconut cream', 'cream of tartar', 'olive oil']) no(n, 'dairy')
    // An exception phrase does not hide a real match elsewhere in the same line.
    yes('coconut milk and whole milk', 'dairy')
    // A repeated exception phrase is still only the exception.
    no('coconut milk, coconut milk', 'dairy')
    no('coconut milk coconut cream', 'dairy')
  })
  it('gluten and wheat', () => {
    for (const n of ['wheat berries', 'flour', 'all-purpose flour', 'bread flour', 'cake flour', 'sourdough bread', 'pasta', 'couscous', 'pearl barley', 'rye', 'seitan', 'soy sauce']) {
      yes(n, 'gluten')
      yes(n, 'wheat')
    }
    no('buckwheat', 'wheat')
    yes('buckwheat flour', 'wheat') // flour is flour; the cook can swap it in the recipe
    no('rice', 'gluten')
    no('cornstarch', 'gluten')
  })
  it('soy, sesame, fish', () => {
    for (const n of ['soy sauce', 'firm tofu', 'edamame', 'tempeh', 'white miso', 'soy milk']) yes(n, 'soy')
    no('soybean oil free dressing', 'sesame')
    yes('tahini', 'sesame')
    yes('sesame seeds', 'sesame')
    for (const n of ['salmon fillet', 'canned tuna', 'cod', 'tilapia', 'anchovies', 'fish sauce', 'white fish']) yes(n, 'fish')
    no('shrimp', 'fish')
    no('oyster mushrooms', 'fish')
  })
  it('a plain rule still matches by whole word only', () => {
    yes('fresh cilantro', 'cilantro')
    no('rice', 'cilantro')
    no('', 'nuts')
  })
})
