import { describe, it, expect } from 'vitest'
import {
  LABEL_SEPARATOR,
  REHEAT_LINE_DEFAULTS,
  formatLabelDate,
  guessFoodType,
  labelLines,
  labelText,
  qualityDays,
  qualityUntil,
  reheatLine,
} from './labels'
import { addDays } from './dates'
import { QUALITY_DAYS_DEFAULT } from './types'
import type { Container, ContainerKind, FoodType, FreezerBlock, Person, Recipe, TenantRow } from './types'

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

function recipe(patch: Partial<Recipe> = {}): Recipe {
  return {
    ...tenant('recipe-1'),
    libraryId: null,
    variantOfRecipeId: null,
    variantLabel: null,
    title: 'Brisket chili',
    description: null,
    cuisine: 'Midwestern comfort',
    mealType: 'dinner',
    baseYield: 8,
    yieldUnit: 'servings',
    steps: [],
    freezeNotes: null,
    reheatNotes: {},
    plateNotes: {},
    equipment: [],
    tags: [],
    activeMinutes: 30,
    standingMinutes: 10,
    totalMinutes: 60,
    dishesCount: 2,
    effortScore: null,
    nutrition: null,
    costPerServingCents: null,
    source: 'manual',
    sourceUrl: null,
    status: 'approved',
    imagePath: null,
    lastCookedAt: null,
    timesCooked: 0,
    ...patch,
  }
}

function person(patch: Partial<Person> = {}): Person {
  return {
    ...tenant('person-sarah'),
    name: 'Sarah',
    userId: null,
    plateProfile: {},
    color: null,
    sortOrder: 0,
    ...patch,
  }
}

function container(kind: ContainerKind, patch: Partial<Container> = {}): Container {
  return {
    ...tenant(`container-${kind}`),
    name: kind === 'bag' ? 'Quart bag' : kind === 'tray' ? 'Souper Cubes 1-cup' : `A ${kind}`,
    kind,
    capacityMl: 240,
    countOwned: 6,
    cavities: 1,
    disposable: kind === 'bag',
    ovenSafe: kind === 'pan',
    microwaveSafe: kind === 'tub',
    sortOrder: 0,
    ...patch,
  }
}

type LabelBlock = Pick<FreezerBlock, 'title' | 'portionLabel' | 'servingsPerBlock' | 'cookedOn' | 'qualityUntil' | 'foodType'>

function block(patch: Partial<LabelBlock> = {}): LabelBlock {
  return {
    title: 'Brisket chili',
    portionLabel: '1-cup',
    servingsPerBlock: 1,
    cookedOn: '2026-10-07',
    qualityUntil: '2027-01-05',
    foodType: 'soup',
    ...patch,
  }
}

const ALL_FOOD_TYPES: FoodType[] = ['soup', 'cooked_meat', 'raw_marinated', 'baked', 'sauce', 'grain', 'vegetable', 'other']
const ALL_CONTAINER_KINDS: ContainerKind[] = ['tray', 'bag', 'tub', 'pan', 'jar', 'muffin_tin', 'other']

/* ------------------------------------------------------------------------------------------------
   qualityUntil
   ------------------------------------------------------------------------------------------------ */

describe('qualityUntil', () => {
  it('soups keep 3 months (90 days) by default', () => {
    expect(qualityUntil('2026-10-07', 'soup')).toBe('2027-01-05')
  })

  it('cooked meat keeps 3 months by default', () => {
    expect(qualityUntil('2026-10-07', 'cooked_meat')).toBe('2027-01-05')
  })

  it('raw marinated meat keeps 6 months (180 days) by default', () => {
    expect(qualityUntil('2026-10-07', 'raw_marinated')).toBe('2027-04-05')
  })

  it('baked goods keep 2 months (60 days) by default', () => {
    expect(qualityUntil('2026-10-07', 'baked')).toBe('2026-12-06')
  })

  it('every food type matches QUALITY_DAYS_DEFAULT when there are no overrides', () => {
    for (const ft of ALL_FOOD_TYPES) {
      expect(qualityUntil('2026-10-07', ft)).toBe(addDays('2026-10-07', QUALITY_DAYS_DEFAULT[ft]))
      expect(qualityUntil('2026-10-07', ft, null)).toBe(addDays('2026-10-07', QUALITY_DAYS_DEFAULT[ft]))
      expect(qualityUntil('2026-10-07', ft, {})).toBe(addDays('2026-10-07', QUALITY_DAYS_DEFAULT[ft]))
    }
  })

  it('uses the household override for that food type', () => {
    expect(qualityUntil('2026-10-07', 'soup', { qualityDays: { soup: 45 } })).toBe('2026-11-21')
  })

  it('an override for one food type leaves the others on the default', () => {
    expect(qualityUntil('2026-10-07', 'baked', { qualityDays: { soup: 45 } })).toBe('2026-12-06')
  })

  it('ignores overrides that are not positive finite numbers', () => {
    expect(qualityUntil('2026-10-07', 'soup', { qualityDays: { soup: 0 } })).toBe('2027-01-05')
    expect(qualityUntil('2026-10-07', 'soup', { qualityDays: { soup: -10 } })).toBe('2027-01-05')
    expect(qualityUntil('2026-10-07', 'soup', { qualityDays: { soup: Number.NaN } })).toBe('2027-01-05')
    expect(qualityUntil('2026-10-07', 'soup', { qualityDays: { soup: Number.POSITIVE_INFINITY } })).toBe('2027-01-05')
  })

  it('rolls across the year end', () => {
    expect(qualityUntil('2026-12-31', 'baked')).toBe('2027-03-01')
  })

  it('accepts an ISO timestamp and uses its date part', () => {
    expect(qualityUntil('2026-10-07T18:30:00Z', 'soup')).toBe('2027-01-05')
  })

  it('throws a plain message for a cook date it cannot read', () => {
    expect(() => qualityUntil('yesterday', 'soup')).toThrow('Cook date must be a date like 2026-10-07')
    expect(() => qualityUntil('2026-02-31', 'soup')).toThrow()
    expect(() => qualityUntil('', 'soup')).toThrow()
  })
})

describe('qualityDays', () => {
  it('returns the default days for every food type', () => {
    for (const ft of ALL_FOOD_TYPES) expect(qualityDays(ft)).toBe(QUALITY_DAYS_DEFAULT[ft])
  })

  it('rounds a fractional override to whole days', () => {
    expect(qualityDays('soup', { qualityDays: { soup: 44.6 } })).toBe(45)
  })
})

/* ------------------------------------------------------------------------------------------------
   reheatLine
   ------------------------------------------------------------------------------------------------ */

describe('reheatLine', () => {
  it('bag default', () => {
    expect(reheatLine(null, container('bag'))).toBe('Thaw in fridge overnight, then heat on the stove')
  })

  it('tub default', () => {
    expect(reheatLine(null, container('tub'))).toBe('Microwave 3 to 4 min, stir halfway')
  })

  it('pan default', () => {
    expect(reheatLine(null, container('pan'))).toBe('Oven 350°F from frozen, covered, 45 to 60 min')
  })

  it('tray default', () => {
    expect(reheatLine(null, container('tray'))).toBe('Pop the block out, microwave or stovetop')
  })

  it('jar default', () => {
    expect(reheatLine(null, container('jar'))).toBe('Thaw in fridge; do not microwave the jar')
  })

  it('muffin tin and other kinds have a short plain default too', () => {
    for (const kind of ALL_CONTAINER_KINDS) {
      const line = reheatLine(undefined, container(kind))
      expect(line).toBe(REHEAT_LINE_DEFAULTS[kind])
      expect(line.length).toBeGreaterThan(10)
      expect(line.length).toBeLessThan(80)
      expect(line).not.toContain('\n')
    }
  })

  it('no container falls back to the generic line', () => {
    expect(reheatLine(null, null)).toBe(REHEAT_LINE_DEFAULTS.other)
    expect(reheatLine(recipe(), undefined)).toBe(REHEAT_LINE_DEFAULTS.other)
  })

  it("the recipe's note for that container kind wins over the default", () => {
    const r = recipe({ reheatNotes: { bag: { method: 'thaw_first', text: 'Thaw in the fridge, heat in a pot with a splash of water.' } } })
    expect(reheatLine(r, container('bag'))).toBe('Thaw in the fridge, heat in a pot with a splash of water.')
  })

  it("a note for a different container kind does not apply", () => {
    const r = recipe({ reheatNotes: { tray: { method: 'cook_from_frozen', text: 'Low heat with water, stir often.' } } })
    expect(reheatLine(r, container('bag'))).toBe(REHEAT_LINE_DEFAULTS.bag)
  })

  it('a blank note falls back to the default', () => {
    const r = recipe({ reheatNotes: { tub: { method: 'cook_from_frozen', text: '   ' } } })
    expect(reheatLine(r, container('tub'))).toBe(REHEAT_LINE_DEFAULTS.tub)
  })

  it('collapses line breaks inside a recipe note into one line', () => {
    const r = recipe({ reheatNotes: { tub: { method: 'cook_from_frozen', text: 'Microwave 50% power,\n5 to 7 min,  stir twice.' } } })
    expect(reheatLine(r, container('tub'))).toBe('Microwave 50% power, 5 to 7 min, stir twice.')
  })
})

/* ------------------------------------------------------------------------------------------------
   guessFoodType
   ------------------------------------------------------------------------------------------------ */

function guess(title: string, tags: Recipe['tags'] = [], mealType: Recipe['mealType'] = 'dinner'): FoodType {
  return guessFoodType({ title, tags, mealType })
}

describe('guessFoodType', () => {
  it('soup, stew, chili, broth -> soup', () => {
    expect(guess('Chicken tortilla soup')).toBe('soup')
    expect(guess('Slow cooker beef stew')).toBe('soup')
    expect(guess('Brisket chili')).toBe('soup')
    expect(guess('Bone broth')).toBe('soup')
  })

  it('sauce, gravy, marinara -> sauce', () => {
    expect(guess('Big-batch marinara')).toBe('sauce')
    expect(guess('Turkey gravy')).toBe('sauce')
    expect(guess('Enchilada sauce')).toBe('sauce')
  })

  it('rice, beans, grain, oatmeal -> grain', () => {
    expect(guess('Red beans and rice')).toBe('grain')
    expect(guess('Cooked white rice')).toBe('grain')
    expect(guess('Overnight oatmeal pucks')).toBe('grain')
    expect(guess('Ancient grain pilaf')).toBe('grain')
  })

  it('muffin, cookie, bread, bites -> baked', () => {
    expect(guess('Banana muffins')).toBe('baked')
    expect(guess('Chocolate chip cookies')).toBe('baked')
    expect(guess('Zucchini bread')).toBe('baked')
    expect(guess('Muffin-tin egg bites')).toBe('baked')
  })

  it('marinated or dump in the title -> raw_marinated, even with a meat word', () => {
    expect(guess('Marinated chicken thighs')).toBe('raw_marinated')
    expect(guess('Pot roast dump kit')).toBe('raw_marinated')
  })

  it('roasted vegetables -> vegetable', () => {
    expect(guess('Roasted vegetables')).toBe('vegetable')
    expect(guess('Roasted vegetable medley')).toBe('vegetable')
  })

  it('meat words -> cooked_meat', () => {
    expect(guess('Seasoned taco meat')).toBe('cooked_meat')
    expect(guess('Pulled pork')).toBe('cooked_meat')
    expect(guess('Baked salmon')).toBe('cooked_meat')
    expect(guess('Sheet-pan chicken thighs and vegetables')).toBe('cooked_meat')
  })

  it('anything else -> other', () => {
    expect(guess('Weeknight casserole')).toBe('other')
    expect(guess('')).toBe('other')
  })

  it('is not fooled by case or plurals', () => {
    expect(guess('BEEF STEW')).toBe('soup')
    expect(guess('Soups for the week')).toBe('soup')
    expect(guess('Meatballs')).toBe('cooked_meat')
  })

  it('a stew is soup before it is meat', () => {
    expect(guess('Beef stew')).toBe('soup')
  })

  it('a dump_kit tag makes a plain title raw, but does not override a stew', () => {
    expect(guess('Honey garlic crockpot bags', ['dump_kit'])).toBe('raw_marinated')
    expect(guess('Chicken thighs crockpot bags', ['dump_kit'])).toBe('raw_marinated')
    expect(guess('Slow cooker beef stew', ['dump_kit', 'crockpot'])).toBe('soup')
  })

  it('a dessert with no other clue counts as baked', () => {
    expect(guess('Chocolate pudding', [], 'dessert')).toBe('baked')
    expect(guess('Chocolate pudding', [], 'snack')).toBe('other')
  })

  it('agrees with the starter recipe bank', () => {
    const bank: [string, Recipe['tags'], Recipe['mealType'], FoodType][] = [
      ['Brisket chili', ['one_pot', 'freezer_safe'], 'dinner', 'soup'],
      ['Crockpot white chicken chili', ['one_pot', 'crockpot'], 'dinner', 'soup'],
      ['Broccoli cheddar soup', ['one_pot'], 'dinner', 'soup'],
      ['Chicken and sausage gumbo', ['freezer_safe'], 'dinner', 'soup'],
      ['Slow cooker beef stew', ['crockpot', 'dump_kit'], 'dinner', 'soup'],
      ['Chicken tortilla soup', ['one_pot'], 'dinner', 'soup'],
      ['Red beans and rice', ['one_pot'], 'dinner', 'grain'],
      ['Pot roast dump kit', ['dump_kit', 'cook_from_frozen'], 'dinner', 'raw_marinated'],
      ['Seasoned taco meat', ['cook_from_frozen'], 'component', 'cooked_meat'],
      ['Freezer breakfast burritos', ['microwave_only'], 'breakfast', 'baked'],
      ['Muffin-tin egg bites', ['cook_from_frozen'], 'breakfast', 'baked'],
      ['Big-batch marinara', ['one_pot'], 'component', 'sauce'],
      ['Sheet-pan chicken thighs and vegetables', ['sheet_pan'], 'dinner', 'cooked_meat'],
      ['Coconut curry chicken', ['one_pot'], 'dinner', 'soup'],
      ['Shrimp boil foil packets', ['cook_from_frozen', 'no_chop'], 'dinner', 'raw_marinated'],
    ]
    for (const [title, tags, mealType, expected] of bank) {
      expect(guess(title, tags, mealType), title).toBe(expected)
    }
  })
})

/* ------------------------------------------------------------------------------------------------
   formatLabelDate
   ------------------------------------------------------------------------------------------------ */

describe('formatLabelDate', () => {
  it('formats a date key as month and day with no leading zero', () => {
    expect(formatLabelDate('2026-10-07')).toBe('Oct 7')
    expect(formatLabelDate('2027-01-05')).toBe('Jan 5')
    expect(formatLabelDate('2026-12-31')).toBe('Dec 31')
  })

  it('reads the date part of an ISO timestamp', () => {
    expect(formatLabelDate('2026-10-07T23:59:00Z')).toBe('Oct 7')
  })

  it('returns null for missing or unreadable dates', () => {
    expect(formatLabelDate(null)).toBeNull()
    expect(formatLabelDate(undefined)).toBeNull()
    expect(formatLabelDate('')).toBeNull()
    expect(formatLabelDate('next week')).toBeNull()
    expect(formatLabelDate('2026-13-01')).toBeNull()
  })
})

/* ------------------------------------------------------------------------------------------------
   labelText: tape
   ------------------------------------------------------------------------------------------------ */

describe('labelText tape', () => {
  it('matches the spec example: recipe, portion, date, person on one line', () => {
    expect(labelText(block(), { person: person(), format: 'tape' })).toBe('Brisket chili · 1-cup · Oct 7 · Sarah')
  })

  it('uses the middle dot separator', () => {
    expect(LABEL_SEPARATOR).toBe(' · ')
  })

  it('leaves the person off when there is none', () => {
    expect(labelText(block(), { format: 'tape' })).toBe('Brisket chili · 1-cup · Oct 7')
    expect(labelText(block(), { person: null, format: 'tape' })).toBe('Brisket chili · 1-cup · Oct 7')
  })

  it('falls back to servings when the block has no portion label', () => {
    expect(labelText(block({ portionLabel: null, servingsPerBlock: 2 }), { format: 'tape' })).toBe('Brisket chili · 2 servings · Oct 7')
    expect(labelText(block({ portionLabel: null, servingsPerBlock: 1 }), { format: 'tape' })).toBe('Brisket chili · 1 serving · Oct 7')
  })

  it('leaves the date off when the cook date is unknown', () => {
    expect(labelText(block({ cookedOn: null }), { person: person(), format: 'tape' })).toBe('Brisket chili · 1-cup · Sarah')
  })

  it('is always one line, even with the full set of options', () => {
    const text = labelText(block(), { recipe: recipe(), person: person(), container: container('tray'), format: 'tape' })
    expect(text).not.toContain('\n')
    expect(labelLines(block(), { format: 'tape' })).toHaveLength(1)
  })

  it('does not put the reheat line or best-by date on tape', () => {
    const text = labelText(block(), { recipe: recipe(), container: container('bag'), format: 'tape' })
    expect(text).not.toContain('Best by')
    expect(text).not.toContain('Thaw')
  })
})

/* ------------------------------------------------------------------------------------------------
   labelText: bag panel
   ------------------------------------------------------------------------------------------------ */

describe('labelText bag', () => {
  it('is three lines: title and portion, cook date and best by, reheat', () => {
    const text = labelText(block(), { recipe: recipe(), person: person(), container: container('bag'), format: 'bag' })
    expect(text.split('\n')).toEqual([
      'Brisket chili · 1-cup · Sarah',
      'Cooked Oct 7 · Best by Jan 5',
      'Thaw in fridge overnight, then heat on the stove',
    ])
  })

  it('drops the person from line one when there is none', () => {
    const lines = labelLines(block(), { container: container('bag'), format: 'bag' })
    expect(lines[0]).toBe('Brisket chili · 1-cup')
    expect(lines).toHaveLength(3)
  })

  it("uses the recipe's own reheat note for the container kind", () => {
    const r = recipe({ reheatNotes: { bag: { method: 'cook_from_frozen', text: 'Straight from the freezer into the crockpot, low 9 hours.' } } })
    const lines = labelLines(block(), { recipe: r, container: container('bag'), format: 'bag' })
    expect(lines[2]).toBe('Straight from the freezer into the crockpot, low 9 hours.')
  })

  it('uses the container kind default when the block is in a tub', () => {
    const lines = labelLines(block(), { container: container('tub'), format: 'bag' })
    expect(lines[2]).toBe('Microwave 3 to 4 min, stir halfway')
  })

  it('works out best by from the cook date and food type when the block has none stored', () => {
    const lines = labelLines(block({ qualityUntil: null, foodType: 'baked' }), { format: 'bag' })
    expect(lines[1]).toBe('Cooked Oct 7 · Best by Dec 6')
  })

  it('prefers the stored quality date over a computed one', () => {
    const lines = labelLines(block({ qualityUntil: '2026-11-21' }), { format: 'bag' })
    expect(lines[1]).toBe('Cooked Oct 7 · Best by Nov 21')
  })

  it('leaves blanks to write in when no dates are known', () => {
    const lines = labelLines(block({ cookedOn: null, qualityUntil: null }), { format: 'bag' })
    expect(lines[1]).toBe('Cooked ____ · Best by ____')
    expect(lines).toHaveLength(3)
  })

  it('still shows a stored best-by date when the cook date is missing', () => {
    const lines = labelLines(block({ cookedOn: null }), { format: 'bag' })
    expect(lines[1]).toBe('Cooked ____ · Best by Jan 5')
  })
})

/* ------------------------------------------------------------------------------------------------
   labelText: address-label sheet
   ------------------------------------------------------------------------------------------------ */

describe('labelText sheet', () => {
  it('is five lines: title, portion and servings, dates, person, reheat', () => {
    const text = labelText(block({ servingsPerBlock: 2 }), { recipe: recipe(), person: person(), container: container('tray'), format: 'sheet' })
    expect(text.split('\n')).toEqual([
      'Brisket chili',
      '1-cup · 2 servings',
      'Cooked Oct 7 · Best by Jan 5',
      'For Sarah',
      'Pop the block out, microwave or stovetop',
    ])
  })

  it('says "For anyone" when no person is tagged', () => {
    const lines = labelLines(block(), { format: 'sheet' })
    expect(lines[3]).toBe('For anyone')
    expect(lines).toHaveLength(5)
  })

  it('shows servings alone when there is no portion label', () => {
    expect(labelLines(block({ portionLabel: null, servingsPerBlock: 3 }), { format: 'sheet' })[1]).toBe('3 servings')
  })

  it('leaves a blank portion line to write in when nothing is known', () => {
    expect(labelLines(block({ portionLabel: null, servingsPerBlock: 0 }), { format: 'sheet' })[1]).toBe('Portion ____')
  })

  it('uses the generic reheat line when the block has no container', () => {
    expect(labelLines(block(), { format: 'sheet' })[4]).toBe(REHEAT_LINE_DEFAULTS.other)
  })
})

/* ------------------------------------------------------------------------------------------------
   labelText: shared behavior
   ------------------------------------------------------------------------------------------------ */

describe('labelText shared behavior', () => {
  it('falls back to the recipe title, then "Freezer meal", when the block title is blank', () => {
    expect(labelText(block({ title: '   ' }), { recipe: recipe({ title: 'Chicken tortilla soup' }), format: 'tape' })).toBe('Chicken tortilla soup · 1-cup · Oct 7')
    expect(labelText(block({ title: '' }), { format: 'tape' })).toBe('Freezer meal · 1-cup · Oct 7')
  })

  it('collapses stray whitespace and line breaks in names', () => {
    const text = labelText(block({ title: '  Brisket\n chili ', portionLabel: ' 1-cup\t' }), { person: person({ name: ' Sarah\n' }), format: 'tape' })
    expect(text).toBe('Brisket chili · 1-cup · Oct 7 · Sarah')
  })

  it('labelText is labelLines joined with newlines for every format', () => {
    const opts = { recipe: recipe(), person: person(), container: container('bag') }
    for (const format of ['tape', 'bag', 'sheet'] as const) {
      expect(labelText(block(), { ...opts, format })).toBe(labelLines(block(), { ...opts, format }).join('\n'))
    }
  })

  it('never uses expiry or guilt words; a quality date is a best-by date', () => {
    for (const format of ['tape', 'bag', 'sheet'] as const) {
      const text = labelText(block(), { recipe: recipe(), person: person(), container: container('jar'), format }).toLowerCase()
      expect(text).not.toMatch(/expir|spoil|waste|throw/)
    }
  })

  it('a half serving is shown to one decimal', () => {
    expect(labelLines(block({ portionLabel: null, servingsPerBlock: 1.5 }), { format: 'sheet' })[1]).toBe('1.5 servings')
  })
})
