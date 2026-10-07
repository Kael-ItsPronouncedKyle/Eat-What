import { describe, it, expect } from 'vitest'
import {
  KNOWN_UNITS,
  addQuantities,
  compareQuantities,
  convert,
  formatQuantity,
  isKnownUnit,
  itemQuantity,
  normalizeUnit,
  parseQuantity,
  unitDimension,
  unitLabel,
  type Comparison,
  type Quantity,
} from './units'
import type { Item, TenantRow } from './types'

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
    canonicalName: name.toLowerCase(),
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

function q(amount: number, unit: string | null = null): Quantity {
  return { amount, unit }
}

function surplusOf(c: Comparison): Quantity {
  if (c.result !== 'enough') throw new Error(`expected enough, got ${c.result}`)
  return c.surplus
}

function shortfallOf(c: Comparison): Quantity {
  if (c.result !== 'short') throw new Error(`expected short, got ${c.result}`)
  return c.shortfall
}

const VOLUME_UNITS = ['tsp', 'tbsp', 'fl oz', 'cup', 'pint', 'quart', 'gallon', 'ml', 'l', 'pinch', 'dash']
const MASS_UNITS = ['oz', 'lb', 'g', 'kg']
const COUNT_UNITS = [
  'each', 'dozen', 'can', 'bottle', 'bag', 'box', 'roll', 'pack', 'clove', 'slice', 'stick', 'head', 'bunch', 'jar', 'loaf',
  'piece', 'sprig', 'stalk', 'ear', 'carton', 'tub', 'tray', 'cube', 'scoop', 'sheet', 'pouch', 'case', 'fillet', 'link', 'serving',
]

/* ------------------------------------------------------------------------------------------------
   normalizeUnit
   ------------------------------------------------------------------------------------------------ */

describe('normalizeUnit: empty input', () => {
  it('returns null for null, undefined, empty and whitespace', () => {
    expect(normalizeUnit(null)).toBeNull()
    expect(normalizeUnit(undefined)).toBeNull()
    expect(normalizeUnit('')).toBeNull()
    expect(normalizeUnit('   ')).toBeNull()
    expect(normalizeUnit('.')).toBeNull()
  })
})

describe('normalizeUnit: volume spellings', () => {
  it.each([
    ['tsp', 'tsp'], ['tsps', 'tsp'], ['tsp.', 'tsp'], ['teaspoon', 'tsp'], ['Teaspoons', 'tsp'], ['t', 'tsp'], ['t.', 'tsp'], ['tea spoons', 'tsp'],
    ['tbsp', 'tbsp'], ['Tbsp.', 'tbsp'], ['TBSP', 'tbsp'], ['tbs', 'tbsp'], ['tbl', 'tbsp'], ['tblsp', 'tbsp'], ['tablespoon', 'tbsp'],
    ['tablespoons', 'tbsp'], ['T', 'tbsp'], ['T.', 'tbsp'], ['table spoon', 'tbsp'],
    ['fl oz', 'fl oz'], ['fl. oz.', 'fl oz'], ['FL OZ', 'fl oz'], ['floz', 'fl oz'], ['fluid ounce', 'fl oz'], ['fluid ounces', 'fl oz'], ['fl   oz', 'fl oz'],
    ['cup', 'cup'], ['cups', 'cup'], ['Cups', 'cup'], ['c', 'cup'], ['C', 'cup'],
    ['pint', 'pint'], ['pints', 'pint'], ['pt', 'pint'], ['pts', 'pint'],
    ['quart', 'quart'], ['quarts', 'quart'], ['qt', 'quart'], ['qts', 'quart'],
    ['gallon', 'gallon'], ['gallons', 'gallon'], ['gal', 'gallon'], ['gals', 'gallon'],
    ['ml', 'ml'], ['mL', 'ml'], ['mls', 'ml'], ['milliliter', 'ml'], ['milliliters', 'ml'], ['millilitre', 'ml'], ['cc', 'ml'],
    ['l', 'l'], ['L', 'l'], ['liter', 'l'], ['liters', 'l'], ['litre', 'l'], ['litres', 'l'], ['ltr', 'l'],
    ['pinch', 'pinch'], ['pinches', 'pinch'], ['dash', 'dash'], ['dashes', 'dash'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected)
  })
})

describe('normalizeUnit: mass spellings', () => {
  it.each([
    ['oz', 'oz'], ['ozs', 'oz'], ['Oz.', 'oz'], ['ounce', 'oz'], ['ounces', 'oz'], ['OUNCES', 'oz'],
    ['lb', 'lb'], ['lbs', 'lb'], ['LB', 'lb'], ['lbs.', 'lb'], ['pound', 'lb'], ['pounds', 'lb'], ['Pounds', 'lb'], ['#', 'lb'],
    ['g', 'g'], ['gm', 'g'], ['gms', 'g'], ['gr', 'g'], ['gram', 'g'], ['grams', 'g'],
    ['kg', 'kg'], ['kgs', 'kg'], ['kilo', 'kg'], ['kilos', 'kg'], ['kilogram', 'kg'], ['kilograms', 'kg'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected)
  })
})

describe('normalizeUnit: count spellings', () => {
  it.each([
    ['each', 'each'], ['ea', 'each'], ['ct', 'each'], ['count', 'each'], ['unit', 'each'], ['units', 'each'], ['item', 'each'], ['whole', 'each'],
    ['dozen', 'dozen'], ['dozens', 'dozen'], ['doz', 'dozen'], ['dz', 'dozen'],
    ['can', 'can'], ['cans', 'can'], ['Cans', 'can'], ['tin', 'can'], ['tins', 'can'],
    ['bottle', 'bottle'], ['bottles', 'bottle'], ['btl', 'bottle'], ['btls', 'bottle'],
    ['bag', 'bag'], ['bags', 'bag'],
    ['box', 'box'], ['boxes', 'box'],
    ['roll', 'roll'], ['rolls', 'roll'],
    ['pack', 'pack'], ['packs', 'pack'], ['pk', 'pack'], ['pkg', 'pack'], ['pkgs', 'pack'], ['package', 'pack'], ['packages', 'pack'], ['packet', 'pack'],
    ['clove', 'clove'], ['cloves', 'clove'],
    ['slice', 'slice'], ['slices', 'slice'],
    ['stick', 'stick'], ['sticks', 'stick'],
    ['head', 'head'], ['heads', 'head'],
    ['bunch', 'bunch'], ['bunches', 'bunch'],
    ['jar', 'jar'], ['jars', 'jar'],
    ['loaf', 'loaf'], ['loaves', 'loaf'],
    ['piece', 'piece'], ['pieces', 'piece'], ['pc', 'piece'], ['pcs', 'piece'],
    ['fillet', 'fillet'], ['filet', 'fillet'], ['filets', 'fillet'],
    ['serving', 'serving'], ['servings', 'serving'], ['portion', 'serving'],
    ['carton', 'carton'], ['cartons', 'carton'], ['tray', 'tray'], ['Trays', 'tray'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected)
  })
})

describe('normalizeUnit: unknown units pass through', () => {
  it('lowercases, trims and singularizes an unknown unit so it still compares with itself', () => {
    expect(normalizeUnit('Widgets')).toBe('widget')
    expect(normalizeUnit('  Sachets ')).toBe('sachet')
    expect(normalizeUnit('glasses')).toBe('glass')
    expect(normalizeUnit('batches')).toBe('batch')
    expect(normalizeUnit('widget')).toBe('widget')
  })

  it('leaves short words and words that end in ss, us or is alone', () => {
    expect(normalizeUnit('gas')).toBe('gas')
    expect(normalizeUnit('octopus')).toBe('octopus')
    expect(normalizeUnit('basis')).toBe('basis')
  })

  it('collapses inner whitespace and drops periods', () => {
    expect(normalizeUnit('Souper   Cubes')).toBe('souper cube')
    expect(normalizeUnit('sachet.')).toBe('sachet')
  })
})

/* ------------------------------------------------------------------------------------------------
   KNOWN_UNITS, isKnownUnit, unitDimension
   ------------------------------------------------------------------------------------------------ */

describe('KNOWN_UNITS and isKnownUnit', () => {
  it('lists every canonical unit the task names', () => {
    for (const u of [...VOLUME_UNITS, ...MASS_UNITS, ...COUNT_UNITS]) expect(KNOWN_UNITS).toContain(u)
  })

  it('recognizes any spelling of a known unit', () => {
    expect(isKnownUnit('lbs')).toBe(true)
    expect(isKnownUnit('Tablespoons')).toBe(true)
    expect(isKnownUnit('ea')).toBe(true)
    expect(isKnownUnit('fl. oz.')).toBe(true)
  })

  it('is false for unknown, empty and null', () => {
    expect(isKnownUnit('widget')).toBe(false)
    expect(isKnownUnit('')).toBe(false)
    expect(isKnownUnit(null)).toBe(false)
    expect(isKnownUnit(undefined)).toBe(false)
  })
})

describe('unitDimension', () => {
  it.each(VOLUME_UNITS)('%s is volume', (u) => {
    expect(unitDimension(u)).toBe('volume')
  })

  it.each(MASS_UNITS)('%s is mass', (u) => {
    expect(unitDimension(u)).toBe('mass')
  })

  it.each(COUNT_UNITS)('%s is count', (u) => {
    expect(unitDimension(u)).toBe('count')
  })

  it('treats a null unit and an unknown unit as count', () => {
    expect(unitDimension(null)).toBe('count')
    expect(unitDimension('widget')).toBe('count')
  })

  it('normalizes spellings first', () => {
    expect(unitDimension('Lbs')).toBe('mass')
    expect(unitDimension('Tablespoons')).toBe('volume')
    expect(unitDimension('tins')).toBe('count')
  })
})

/* ------------------------------------------------------------------------------------------------
   convert
   ------------------------------------------------------------------------------------------------ */

describe('convert: same unit', () => {
  it('returns the amount unchanged with the normalized unit', () => {
    expect(convert(q(2, 'lbs'), 'pound')).toEqual({ amount: 2, unit: 'lb' })
    expect(convert(q(1.5, 'Cups'), 'cup')).toEqual({ amount: 1.5, unit: 'cup' })
  })

  it('works for a null unit and for an unknown unit that matches itself', () => {
    expect(convert(q(3, null), null)).toEqual({ amount: 3, unit: null })
    expect(convert(q(2, 'widget'), 'widgets')).toEqual({ amount: 2, unit: 'widget' })
  })
})

describe('convert: volume', () => {
  it.each([
    [3, 'tsp', 'tbsp', 1],
    [2, 'tbsp', 'fl oz', 1],
    [16, 'tbsp', 'cup', 1],
    [48, 'tsp', 'cup', 1],
    [8, 'fl oz', 'cup', 1],
    [2, 'cup', 'pint', 1],
    [2, 'pint', 'quart', 1],
    [4, 'quart', 'gallon', 1],
    [16, 'cup', 'gallon', 1],
    [1, 'l', 'ml', 1000],
    [250, 'ml', 'l', 0.25],
    [1, 'tsp', 'pinch', 16],
    [1, 'tsp', 'dash', 8],
    [1, 'gallon', 'quart', 4],
    [1, 'cup', 'tbsp', 16],
  ])('%s %s -> %s = %s', (amount, from, to, expected) => {
    expect(convert(q(amount, from), to)).toEqual({ amount: expected, unit: to })
  })

  it('converts US volume to metric with the standard factors', () => {
    expect(convert(q(1, 'tsp'), 'ml')?.amount).toBeCloseTo(4.929, 3)
    expect(convert(q(1, 'tbsp'), 'ml')?.amount).toBeCloseTo(14.787, 3)
    expect(convert(q(1, 'fl oz'), 'ml')?.amount).toBeCloseTo(29.574, 3)
    expect(convert(q(1, 'cup'), 'ml')?.amount).toBeCloseTo(236.588, 3)
    expect(convert(q(1, 'pint'), 'ml')?.amount).toBeCloseTo(473.176, 3)
    expect(convert(q(1, 'quart'), 'ml')?.amount).toBeCloseTo(946.353, 3)
    expect(convert(q(1, 'gallon'), 'l')?.amount).toBeCloseTo(3.785, 3)
    expect(convert(q(1, 'l'), 'cup')?.amount).toBeCloseTo(4.227, 3)
  })
})

describe('convert: mass', () => {
  it.each([
    [16, 'oz', 'lb', 1],
    [1, 'lb', 'oz', 16],
    [1, 'kg', 'g', 1000],
    [500, 'g', 'kg', 0.5],
    [2, 'lb', 'oz', 32],
  ])('%s %s -> %s = %s', (amount, from, to, expected) => {
    expect(convert(q(amount, from), to)).toEqual({ amount: expected, unit: to })
  })

  it('converts between US and metric mass', () => {
    expect(convert(q(1, 'oz'), 'g')?.amount).toBeCloseTo(28.35, 2)
    expect(convert(q(1, 'lb'), 'g')?.amount).toBeCloseTo(453.59, 2)
    expect(convert(q(1, 'kg'), 'lb')?.amount).toBeCloseTo(2.2046, 4)
    expect(convert(q(100, 'g'), 'oz')?.amount).toBeCloseTo(3.527, 3)
  })
})

describe('convert: count', () => {
  it('converts dozen and each both ways', () => {
    expect(convert(q(1, 'dozen'), 'each')).toEqual({ amount: 12, unit: 'each' })
    expect(convert(q(24, 'each'), 'dozen')).toEqual({ amount: 2, unit: 'dozen' })
    expect(convert(q(0.5, 'doz'), 'ea')).toEqual({ amount: 6, unit: 'each' })
  })

  it('never converts one count unit into a different one', () => {
    expect(convert(q(1, 'can'), 'bottle')).toBeNull()
    expect(convert(q(1, 'can'), 'each')).toBeNull()
    expect(convert(q(1, 'each'), 'can')).toBeNull()
    expect(convert(q(1, 'dozen'), 'box')).toBeNull()
    expect(convert(q(1, 'bag'), 'pack')).toBeNull()
  })

  it('converts a count unit to itself under any spelling', () => {
    expect(convert(q(2, 'cans'), 'tin')).toEqual({ amount: 2, unit: 'can' })
  })
})

describe('convert: incompatible', () => {
  it('returns null across dimensions', () => {
    expect(convert(q(1, 'lb'), 'cup')).toBeNull()
    expect(convert(q(1, 'oz'), 'fl oz')).toBeNull()
    expect(convert(q(1, 'cup'), 'each')).toBeNull()
    expect(convert(q(1, 'g'), 'ml')).toBeNull()
    expect(convert(q(1, 'can'), 'lb')).toBeNull()
  })

  it('treats a null unit as its own thing: it only matches null', () => {
    expect(convert(q(1, null), 'each')).toBeNull()
    expect(convert(q(1, 'each'), null)).toBeNull()
    expect(convert(q(1, null), 'can')).toBeNull()
    expect(convert(q(1, 'cup'), null)).toBeNull()
  })

  it('returns null for an unknown unit against anything but itself', () => {
    expect(convert(q(1, 'widget'), 'each')).toBeNull()
    expect(convert(q(1, 'each'), 'widget')).toBeNull()
    expect(convert(q(1, 'widget'), 'gadget')).toBeNull()
  })

  it('rounds away floating-point noise', () => {
    expect(convert(q(3, 'tsp'), 'tbsp')?.amount).toBe(1)
    expect(convert(q(0.1, 'kg'), 'g')?.amount).toBe(100)
    expect(convert(q(0.3, 'l'), 'ml')?.amount).toBe(300)
  })
})

/* ------------------------------------------------------------------------------------------------
   compareQuantities
   ------------------------------------------------------------------------------------------------ */

describe('compareQuantities: the spec example', () => {
  it('need 3 lb thighs, have 1 lb, buy 2 lb', () => {
    const c = compareQuantities(q(1, 'lb'), q(3, 'lb'))
    expect(c).toEqual({ result: 'short', shortfall: { amount: 2, unit: 'lb' } })
    expect(formatQuantity(shortfallOf(c))).toBe('2 lb')
  })
})

describe('compareQuantities: same unit', () => {
  it('reports surplus when there is enough', () => {
    expect(compareQuantities(q(5, 'can'), q(3, 'can'))).toEqual({ result: 'enough', surplus: { amount: 2, unit: 'can' } })
  })

  it('reports an exact match as enough with zero surplus', () => {
    expect(compareQuantities(q(3, 'can'), q(3, 'can'))).toEqual({ result: 'enough', surplus: { amount: 0, unit: 'can' } })
  })

  it('reports shortfall when there is not enough', () => {
    expect(compareQuantities(q(1, 'can'), q(3, 'can'))).toEqual({ result: 'short', shortfall: { amount: 2, unit: 'can' } })
  })

  it('handles having none at all', () => {
    expect(compareQuantities(q(0, 'lb'), q(2, 'lb'))).toEqual({ result: 'short', shortfall: { amount: 2, unit: 'lb' } })
  })

  it('normalizes spellings on both sides and answers in the need unit', () => {
    expect(compareQuantities(q(2, 'lbs'), q(1, 'pound'))).toEqual({ result: 'enough', surplus: { amount: 1, unit: 'lb' } })
    expect(compareQuantities(q(1, 'Cups'), q(2, 'cups'))).toEqual({ result: 'short', shortfall: { amount: 1, unit: 'cup' } })
  })

  it('works with decimals', () => {
    expect(compareQuantities(q(1.5, 'lb'), q(2.25, 'lb'))).toEqual({ result: 'short', shortfall: { amount: 0.75, unit: 'lb' } })
    expect(compareQuantities(q(0.1, 'lb'), q(0.3, 'lb'))).toEqual({ result: 'short', shortfall: { amount: 0.2, unit: 'lb' } })
  })
})

describe('compareQuantities: converts the have into the need unit', () => {
  it('16 oz covers 1 lb exactly', () => {
    expect(compareQuantities(q(16, 'oz'), q(1, 'lb'))).toEqual({ result: 'enough', surplus: { amount: 0, unit: 'lb' } })
  })

  it('2 cups cover 1 pint; 1 pint is short of 3 cups by 1 cup', () => {
    expect(compareQuantities(q(2, 'cup'), q(1, 'pint'))).toEqual({ result: 'enough', surplus: { amount: 0, unit: 'pint' } })
    expect(compareQuantities(q(1, 'pint'), q(3, 'cup'))).toEqual({ result: 'short', shortfall: { amount: 1, unit: 'cup' } })
  })

  it('1 kg against 3 lb is short by about 0.8 lb', () => {
    const c = compareQuantities(q(1, 'kg'), q(3, 'lb'))
    const s = shortfallOf(c)
    expect(s.unit).toBe('lb')
    expect(s.amount).toBeCloseTo(0.7954, 3)
  })

  it('8 oz against 1 lb is short by half a pound', () => {
    expect(compareQuantities(q(8, 'oz'), q(1, 'lb'))).toEqual({ result: 'short', shortfall: { amount: 0.5, unit: 'lb' } })
  })

  it('1 l against 2 cups has surplus in cups', () => {
    const s = surplusOf(compareQuantities(q(1, 'l'), q(2, 'cup')))
    expect(s.unit).toBe('cup')
    expect(s.amount).toBeCloseTo(2.227, 3)
  })

  it('1 dozen covers 6 each with 6 to spare; 6 each is half a dozen short of 1 dozen', () => {
    expect(compareQuantities(q(1, 'dozen'), q(6, 'each'))).toEqual({ result: 'enough', surplus: { amount: 6, unit: 'each' } })
    expect(compareQuantities(q(6, 'each'), q(1, 'dozen'))).toEqual({ result: 'short', shortfall: { amount: 0.5, unit: 'dozen' } })
  })
})

describe('compareQuantities: count units are their own dimension', () => {
  it('a can only compares with a can', () => {
    expect(compareQuantities(q(2, 'can'), q(1, 'can'))).toEqual({ result: 'enough', surplus: { amount: 1, unit: 'can' } })
    expect(compareQuantities(q(2, 'can'), q(1, 'bottle'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
    expect(compareQuantities(q(2, 'bag'), q(1, 'box'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
  })

  it('a count unit does not compare with each', () => {
    expect(compareQuantities(q(2, 'can'), q(1, 'each'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
    expect(compareQuantities(q(2, 'each'), q(1, 'can'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
  })

  it('a household unit the table does not know compares with itself only', () => {
    expect(compareQuantities(q(2, 'souper cube'), q(1, 'Souper Cubes'))).toEqual({ result: 'enough', surplus: { amount: 1, unit: 'souper cube' } })
    expect(compareQuantities(q(2, 'souper cube'), q(1, 'tray'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
  })
})

describe('compareQuantities: null units', () => {
  it('null compares with null', () => {
    expect(compareQuantities(q(3, null), q(2, null))).toEqual({ result: 'enough', surplus: { amount: 1, unit: null } })
    expect(compareQuantities(q(1, null), q(2, null))).toEqual({ result: 'short', shortfall: { amount: 1, unit: null } })
  })

  it('null compares only with null', () => {
    expect(compareQuantities(q(3, null), q(2, 'each'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
    expect(compareQuantities(q(3, 'each'), q(2, null))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
    expect(compareQuantities(q(3, null), q(2, 'can'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
    expect(compareQuantities(q(3, 'lb'), q(2, null))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
  })

  it('treats an empty-string unit as null', () => {
    expect(compareQuantities(q(3, ''), q(2, null))).toEqual({ result: 'enough', surplus: { amount: 1, unit: null } })
  })
})

describe('compareQuantities: unknown results', () => {
  it('is unknown across dimensions', () => {
    expect(compareQuantities(q(2, 'lb'), q(1, 'cup'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
    expect(compareQuantities(q(2, 'oz'), q(1, 'fl oz'))).toEqual({ result: 'unknown', reason: 'incompatible_units' })
  })

  it('is unknown when an amount is missing', () => {
    expect(compareQuantities(q(Number.NaN, 'lb'), q(1, 'lb'))).toEqual({ result: 'unknown', reason: 'no_amount' })
    expect(compareQuantities(q(1, 'lb'), q(Number.NaN, 'lb'))).toEqual({ result: 'unknown', reason: 'no_amount' })
    expect(compareQuantities(q(Number.POSITIVE_INFINITY, 'lb'), q(1, 'lb'))).toEqual({ result: 'unknown', reason: 'no_amount' })
  })

  it('checks the amount before the units', () => {
    expect(compareQuantities(q(Number.NaN, 'lb'), q(1, 'cup'))).toEqual({ result: 'unknown', reason: 'no_amount' })
  })
})

/* ------------------------------------------------------------------------------------------------
   addQuantities
   ------------------------------------------------------------------------------------------------ */

describe('addQuantities', () => {
  it('adds in the first quantity unit', () => {
    expect(addQuantities(q(1, 'cup'), q(2, 'cup'))).toEqual({ amount: 3, unit: 'cup' })
    expect(addQuantities(q(1, 'cup'), q(8, 'fl oz'))).toEqual({ amount: 2, unit: 'cup' })
    expect(addQuantities(q(1, 'lb'), q(8, 'oz'))).toEqual({ amount: 1.5, unit: 'lb' })
    expect(addQuantities(q(1, 'dozen'), q(6, 'each'))).toEqual({ amount: 1.5, unit: 'dozen' })
  })

  it('normalizes the first unit', () => {
    expect(addQuantities(q(1, 'lbs'), q(16, 'ounces'))).toEqual({ amount: 2, unit: 'lb' })
  })

  it('adds bare counts', () => {
    expect(addQuantities(q(2, null), q(3, null))).toEqual({ amount: 5, unit: null })
  })

  it('returns null for incompatible units', () => {
    expect(addQuantities(q(1, 'can'), q(1, 'bottle'))).toBeNull()
    expect(addQuantities(q(1, 'lb'), q(1, 'cup'))).toBeNull()
    expect(addQuantities(q(1, null), q(1, 'each'))).toBeNull()
    expect(addQuantities(q(1, 'each'), q(1, null))).toBeNull()
  })

  it('rounds away floating-point noise', () => {
    expect(addQuantities(q(0.1, 'lb'), q(0.2, 'lb'))).toEqual({ amount: 0.3, unit: 'lb' })
  })
})

/* ------------------------------------------------------------------------------------------------
   itemQuantity
   ------------------------------------------------------------------------------------------------ */

describe('itemQuantity', () => {
  it('is null for a status-mode item even when it carries a qty', () => {
    expect(itemQuantity(item('i1', 'Milk'))).toBeNull()
    expect(itemQuantity(item('i2', 'Milk', { trackMode: 'status', qty: 2, unit: 'gallon' }))).toBeNull()
  })

  it('returns the count with a normalized unit', () => {
    expect(itemQuantity(item('i3', 'Black beans', { trackMode: 'count', qty: 3, unit: 'cans' }))).toEqual({ amount: 3, unit: 'can' })
    expect(itemQuantity(item('i4', 'Chicken thighs', { trackMode: 'count', qty: 1.5, unit: 'lbs' }))).toEqual({ amount: 1.5, unit: 'lb' })
  })

  it('keeps a null unit as a bare count', () => {
    expect(itemQuantity(item('i5', 'Eggs', { trackMode: 'count', qty: 8, unit: null }))).toEqual({ amount: 8, unit: null })
  })

  it('is null for a count item with no number yet', () => {
    expect(itemQuantity(item('i6', 'Eggs', { trackMode: 'count', qty: null, unit: 'each' }))).toBeNull()
    expect(itemQuantity(item('i7', 'Eggs', { trackMode: 'count', qty: Number.NaN, unit: 'each' }))).toBeNull()
  })

  it('keeps zero as zero so Out can be derived', () => {
    expect(itemQuantity(item('i8', 'Beans', { trackMode: 'count', qty: 0, unit: 'can' }))).toEqual({ amount: 0, unit: 'can' })
  })
})

/* ------------------------------------------------------------------------------------------------
   formatQuantity and unitLabel
   ------------------------------------------------------------------------------------------------ */

describe('formatQuantity: the task examples', () => {
  it.each([
    [0.5, 'tsp', '1/2 tsp'],
    [1.5, 'cup', '1 1/2 cups'],
    [2, 'lb', '2 lb'],
    [3, null, '3'],
  ])('%s %s -> %s', (amount, unit, expected) => {
    expect(formatQuantity(q(amount, unit))).toBe(expected)
  })
})

describe('formatQuantity: cooking fractions', () => {
  it.each([
    [0.125, 'tsp', '1/8 tsp'],
    [0.25, 'cup', '1/4 cup'],
    [1 / 3, 'cup', '1/3 cup'],
    [0.375, 'cup', '3/8 cup'],
    [0.5, 'cup', '1/2 cup'],
    [0.625, 'cup', '5/8 cup'],
    [2 / 3, 'cup', '2/3 cup'],
    [0.75, 'cup', '3/4 cup'],
    [0.875, 'cup', '7/8 cup'],
    [1.25, 'cup', '1 1/4 cups'],
    [1.75, 'tbsp', '1 3/4 tbsp'],
    [2.25, 'can', '2 1/4 cans'],
    [2.5, 'lb', '2 1/2 lb'],
    [12.5, 'lb', '12 1/2 lb'],
    [1.5, null, '1 1/2'],
    [0.5, null, '1/2'],
  ])('%s %s -> %s', (amount, unit, expected) => {
    expect(formatQuantity(q(amount, unit))).toBe(expected)
  })

  it('snaps amounts that are close to a fraction', () => {
    expect(formatQuantity(q(0.33, 'cup'))).toBe('1/3 cup')
    expect(formatQuantity(q(0.66, 'cup'))).toBe('2/3 cup')
    expect(formatQuantity(q(0.51, 'cup'))).toBe('1/2 cup')
    expect(formatQuantity(q(1.333, 'cup'))).toBe('1 1/3 cups')
  })

  it('falls back to a short decimal when no cooking fraction is close', () => {
    expect(formatQuantity(q(0.3, 'cup'))).toBe('0.3 cup')
    expect(formatQuantity(q(0.1, 'cup'))).toBe('0.1 cup')
    expect(formatQuantity(q(1.6, 'lb'))).toBe('1.6 lb')
    expect(formatQuantity(q(1.2, 'lb'))).toBe('1.2 lb')
    expect(formatQuantity(q(1.44, 'lb'))).toBe('1.44 lb')
    expect(formatQuantity(q(0.2, 'tsp'))).toBe('0.2 tsp')
  })

  it('shows an amount within the tolerance as the nearest cooking fraction', () => {
    expect(formatQuantity(q(1.234, 'lb'))).toBe('1 1/4 lb')
  })
})

describe('formatQuantity: whole numbers', () => {
  it('shows whole amounts without a decimal point', () => {
    expect(formatQuantity(q(1, 'cup'))).toBe('1 cup')
    expect(formatQuantity(q(2, 'cup'))).toBe('2 cups')
    expect(formatQuantity(q(2.0, 'cup'))).toBe('2 cups')
    expect(formatQuantity(q(12, 'each'))).toBe('12 each')
    expect(formatQuantity(q(1000, 'g'))).toBe('1000 g')
  })

  it('rounds floating-point noise to the whole number', () => {
    expect(formatQuantity(q(0.999, 'cup'))).toBe('1 cup')
    expect(formatQuantity(q(1.001, 'cup'))).toBe('1 cup')
    expect(formatQuantity(q(2.9999999, 'lb'))).toBe('3 lb')
    expect(formatQuantity(q(2.001, 'can'))).toBe('2 cans')
  })

  it('picks singular or plural from the amount people see', () => {
    expect(formatQuantity(q(1.01, 'can'))).toBe('1 can')
    expect(formatQuantity(q(1.004, 'kg'))).toBe('1 kg')
    expect(formatQuantity(q(0.51, 'can'))).toBe('1/2 can')
    expect(formatQuantity(q(1.26, 'can'))).toBe('1 1/4 cans')
  })

  it('shows zero', () => {
    expect(formatQuantity(q(0, null))).toBe('0')
    expect(formatQuantity(q(0, 'cup'))).toBe('0 cups')
  })
})

describe('formatQuantity: metric stays decimal', () => {
  it.each([
    [250, 'ml', '250 ml'],
    [0.5, 'l', '0.5 l'],
    [0.25, 'l', '0.25 l'],
    [1.5, 'kg', '1.5 kg'],
    [2.5, 'g', '2.5 g'],
    [2.5, 'ml', '2.5 ml'],
    [0.005, 'g', '0.005 g'],
    [1, 'l', '1 l'],
  ])('%s %s -> %s', (amount, unit, expected) => {
    expect(formatQuantity(q(amount, unit))).toBe(expected)
  })
})

describe('formatQuantity: plural and singular unit words', () => {
  it.each([
    [1, 'can', '1 can'],
    [2, 'can', '2 cans'],
    [0.5, 'can', '1/2 can'],
    [1, 'box', '1 box'],
    [3, 'box', '3 boxes'],
    [2, 'loaf', '2 loaves'],
    [2, 'bunch', '2 bunches'],
    [2, 'pinch', '2 pinches'],
    [2, 'dash', '2 dashes'],
    [2, 'dozen', '2 dozen'],
    [2, 'fl oz', '2 fl oz'],
    [2, 'oz', '2 oz'],
    [2, 'tbsp', '2 tbsp'],
    [2, 'tsp', '2 tsp'],
    [2, 'pint', '2 pints'],
    [2, 'quart', '2 quarts'],
    [2, 'gallon', '2 gallons'],
    [2, 'bottle', '2 bottles'],
    [2, 'bag', '2 bags'],
    [2, 'roll', '2 rolls'],
    [2, 'pack', '2 packs'],
    [2, 'clove', '2 cloves'],
    [2, 'slice', '2 slices'],
    [2, 'stick', '2 sticks'],
    [2, 'head', '2 heads'],
    [2, 'jar', '2 jars'],
    [2, 'kg', '2 kg'],
  ])('%s %s -> %s', (amount, unit, expected) => {
    expect(formatQuantity(q(amount, unit))).toBe(expected)
  })

  it('normalizes the spelling before rendering', () => {
    expect(formatQuantity(q(2, 'lbs'))).toBe('2 lb')
    expect(formatQuantity(q(1, 'Cups'))).toBe('1 cup')
    expect(formatQuantity(q(2, 'tablespoons'))).toBe('2 tbsp')
    expect(formatQuantity(q(2, 'tins'))).toBe('2 cans')
  })

  it('pluralizes an unknown unit with plain English rules', () => {
    expect(formatQuantity(q(1, 'widget'))).toBe('1 widget')
    expect(formatQuantity(q(2, 'widget'))).toBe('2 widgets')
    expect(formatQuantity(q(2, 'batch'))).toBe('2 batches')
    expect(formatQuantity(q(2, 'glass'))).toBe('2 glasses')
    expect(formatQuantity(q(1.5, 'widget'))).toBe('1 1/2 widgets')
  })
})

describe('unitLabel', () => {
  it('is singular up to one and plural above', () => {
    expect(unitLabel('cup', 0.5)).toBe('cup')
    expect(unitLabel('cup', 1)).toBe('cup')
    expect(unitLabel('cup', 1.5)).toBe('cups')
    expect(unitLabel('cup', 2)).toBe('cups')
    expect(unitLabel('cup', 0)).toBe('cups')
  })

  it('uses the table plural for irregular words', () => {
    expect(unitLabel('box', 2)).toBe('boxes')
    expect(unitLabel('loaf', 2)).toBe('loaves')
    expect(unitLabel('dozen', 3)).toBe('dozen')
    expect(unitLabel('fl oz', 3)).toBe('fl oz')
  })

  it('is empty for a null unit and pluralizes an unknown one', () => {
    expect(unitLabel(null, 2)).toBe('')
    expect(unitLabel('', 2)).toBe('')
    expect(unitLabel('widget', 2)).toBe('widgets')
    expect(unitLabel('Widgets', 1)).toBe('widget')
  })
})

/* ------------------------------------------------------------------------------------------------
   parseQuantity
   ------------------------------------------------------------------------------------------------ */

describe('parseQuantity: the task examples', () => {
  it.each([
    ['2 cans black beans', { amount: 2, unit: 'can', rest: 'black beans' }],
    ['a bottle of Dawn', { amount: 1, unit: 'bottle', rest: 'Dawn' }],
    ['1/2 lb thighs', { amount: 0.5, unit: 'lb', rest: 'thighs' }],
    ['1 1/2 cups rice', { amount: 1.5, unit: 'cup', rest: 'rice' }],
    ['12-pack of paper towels', { amount: 12, unit: 'pack', rest: 'paper towels' }],
    ['two bags of rice', { amount: 2, unit: 'bag', rest: 'rice' }],
  ])('%s', (input, expected) => {
    expect(parseQuantity(input)).toEqual(expected)
  })

  it('returns null for a bare name', () => {
    expect(parseQuantity('eggs')).toBeNull()
  })

  it('parses both halves of the spec voice example', () => {
    expect(parseQuantity('two cans of black beans')).toEqual({ amount: 2, unit: 'can', rest: 'black beans' })
    expect(parseQuantity('a bottle of Dawn')).toEqual({ amount: 1, unit: 'bottle', rest: 'Dawn' })
  })
})

describe('parseQuantity: number words', () => {
  it.each([
    ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6],
    ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10], ['eleven', 11], ['twelve', 12],
  ])('%s eggs', (word, amount) => {
    expect(parseQuantity(`${word} eggs`)).toEqual({ amount, unit: null, rest: 'eggs' })
  })

  it('reads number words with a unit and in any case', () => {
    expect(parseQuantity('three cans of tomatoes')).toEqual({ amount: 3, unit: 'can', rest: 'tomatoes' })
    expect(parseQuantity('Two Bags Of Rice')).toEqual({ amount: 2, unit: 'bag', rest: 'Rice' })
    expect(parseQuantity('TWELVE EGGS')).toEqual({ amount: 12, unit: null, rest: 'EGGS' })
  })

  it('treats a and an as one', () => {
    expect(parseQuantity('an onion')).toEqual({ amount: 1, unit: null, rest: 'onion' })
    expect(parseQuantity('a dozen eggs')).toEqual({ amount: 1, unit: 'dozen', rest: 'eggs' })
    expect(parseQuantity('A Bottle Of Dawn')).toEqual({ amount: 1, unit: 'bottle', rest: 'Dawn' })
    expect(parseQuantity('a bunch of cilantro')).toEqual({ amount: 1, unit: 'bunch', rest: 'cilantro' })
    expect(parseQuantity('a can of tomatoes')).toEqual({ amount: 1, unit: 'can', rest: 'tomatoes' })
  })

  it('does not invent a number for "a few", "a little", "a lot", "a bit"', () => {
    expect(parseQuantity('a few eggs')).toBeNull()
    expect(parseQuantity('a little salt')).toBeNull()
    expect(parseQuantity('a lot of rice')).toBeNull()
    expect(parseQuantity('a bit of butter')).toBeNull()
  })

  it('reads a couple as two', () => {
    expect(parseQuantity('a couple of eggs')).toEqual({ amount: 2, unit: null, rest: 'eggs' })
    expect(parseQuantity('a couple eggs')).toEqual({ amount: 2, unit: null, rest: 'eggs' })
    expect(parseQuantity('couple of cans of beans')).toEqual({ amount: 2, unit: 'can', rest: 'beans' })
  })

  it('reads half', () => {
    expect(parseQuantity('half a cup of sugar')).toEqual({ amount: 0.5, unit: 'cup', rest: 'sugar' })
    expect(parseQuantity('a half cup sugar')).toEqual({ amount: 0.5, unit: 'cup', rest: 'sugar' })
    expect(parseQuantity('half dozen eggs')).toEqual({ amount: 0.5, unit: 'dozen', rest: 'eggs' })
    expect(parseQuantity('half a dozen eggs')).toEqual({ amount: 0.5, unit: 'dozen', rest: 'eggs' })
    expect(parseQuantity('half an onion')).toEqual({ amount: 0.5, unit: null, rest: 'onion' })
    expect(parseQuantity('half of a lime')).toEqual({ amount: 0.5, unit: null, rest: 'lime' })
  })

  it('reads "and a half", "and a quarter", "and a third"', () => {
    expect(parseQuantity('one and a half cups rice')).toEqual({ amount: 1.5, unit: 'cup', rest: 'rice' })
    expect(parseQuantity('2 and a quarter lb')).toEqual({ amount: 2.25, unit: 'lb', rest: '' })
    expect(parseQuantity('two and a half lbs of thighs')).toEqual({ amount: 2.5, unit: 'lb', rest: 'thighs' })
    const third = parseQuantity('one and a third cups flour')
    expect(third?.unit).toBe('cup')
    expect(third?.amount).toBeCloseTo(1.333, 3)
  })

  it('reads a number word that is the whole text', () => {
    expect(parseQuantity('two')).toEqual({ amount: 2, unit: null, rest: '' })
  })
})

describe('parseQuantity: digits, decimals and fractions', () => {
  it.each([
    ['3 eggs', { amount: 3, unit: null, rest: 'eggs' }],
    ['1.5 lbs ground beef', { amount: 1.5, unit: 'lb', rest: 'ground beef' }],
    ['.5 cup milk', { amount: 0.5, unit: 'cup', rest: 'milk' }],
    ['500g rice', { amount: 500, unit: 'g', rest: 'rice' }],
    ['2.5kg flour', { amount: 2.5, unit: 'kg', rest: 'flour' }],
    ['0 cans beans', { amount: 0, unit: 'can', rest: 'beans' }],
    ['3/4 cup sugar', { amount: 0.75, unit: 'cup', rest: 'sugar' }],
    ['1/4 tsp salt', { amount: 0.25, unit: 'tsp', rest: 'salt' }],
    ['1-1/2 cups rice', { amount: 1.5, unit: 'cup', rest: 'rice' }],
    ['2 1/4 lb chicken', { amount: 2.25, unit: 'lb', rest: 'chicken' }],
    ['½ cup sugar', { amount: 0.5, unit: 'cup', rest: 'sugar' }],
    ['1½ cups rice', { amount: 1.5, unit: 'cup', rest: 'rice' }],
    ['1 ½ cups rice', { amount: 1.5, unit: 'cup', rest: 'rice' }],
    ['¼ tsp salt', { amount: 0.25, unit: 'tsp', rest: 'salt' }],
    ['¾ lb thighs', { amount: 0.75, unit: 'lb', rest: 'thighs' }],
    ['2', { amount: 2, unit: null, rest: '' }],
    ['12', { amount: 12, unit: null, rest: '' }],
  ])('%s', (input, expected) => {
    expect(parseQuantity(input)).toEqual(expected)
  })

  it('reads a third as a repeating decimal', () => {
    const r = parseQuantity('1/3 cup oil')
    expect(r?.unit).toBe('cup')
    expect(r?.rest).toBe('oil')
    expect(r?.amount).toBeCloseTo(1 / 3, 6)
  })

  it('takes the low end of a range', () => {
    expect(parseQuantity('2-3 cloves garlic')).toEqual({ amount: 2, unit: 'clove', rest: 'garlic' })
    expect(parseQuantity('2 to 3 cups broth')).toEqual({ amount: 2, unit: 'cup', rest: 'broth' })
    expect(parseQuantity('2–3 lb chicken')).toEqual({ amount: 2, unit: 'lb', rest: 'chicken' })
    expect(parseQuantity('1.5 - 2 lb chicken')).toEqual({ amount: 1.5, unit: 'lb', rest: 'chicken' })
  })

  it('keeps a second number that is not a fraction in the name', () => {
    expect(parseQuantity('1 12 oz can tomatoes')).toEqual({ amount: 1, unit: null, rest: '12 oz can tomatoes' })
  })

  it('treats x as a multiplier sign', () => {
    expect(parseQuantity('2x paper towels')).toEqual({ amount: 2, unit: null, rest: 'paper towels' })
    expect(parseQuantity('2 x paper towels')).toEqual({ amount: 2, unit: null, rest: 'paper towels' })
    expect(parseQuantity('3 x cans of corn')).toEqual({ amount: 3, unit: 'can', rest: 'corn' })
  })
})

describe('parseQuantity: unit spellings', () => {
  it.each([
    ['2 Tbsp. olive oil', { amount: 2, unit: 'tbsp', rest: 'olive oil' }],
    ['1 T butter', { amount: 1, unit: 'tbsp', rest: 'butter' }],
    ['1 T. butter', { amount: 1, unit: 'tbsp', rest: 'butter' }],
    ['1 t salt', { amount: 1, unit: 'tsp', rest: 'salt' }],
    ['2 teaspoons vanilla', { amount: 2, unit: 'tsp', rest: 'vanilla' }],
    ['2 tea spoons sugar', { amount: 2, unit: 'tsp', rest: 'sugar' }],
    ['2 c flour', { amount: 2, unit: 'cup', rest: 'flour' }],
    ['2 C flour', { amount: 2, unit: 'cup', rest: 'flour' }],
    ['4 oz. cream cheese', { amount: 4, unit: 'oz', rest: 'cream cheese' }],
    ['2 fl oz vanilla', { amount: 2, unit: 'fl oz', rest: 'vanilla' }],
    ['2 fl. oz. vanilla', { amount: 2, unit: 'fl oz', rest: 'vanilla' }],
    ['2 fluid ounces of milk', { amount: 2, unit: 'fl oz', rest: 'milk' }],
    ['2# ground beef', { amount: 2, unit: 'lb', rest: 'ground beef' }],
    ['3 lbs', { amount: 3, unit: 'lb', rest: '' }],
    ['1 lb. thighs', { amount: 1, unit: 'lb', rest: 'thighs' }],
    ['2 pounds of thighs', { amount: 2, unit: 'lb', rest: 'thighs' }],
    ['1 qt broth', { amount: 1, unit: 'quart', rest: 'broth' }],
    ['1 pt cream', { amount: 1, unit: 'pint', rest: 'cream' }],
    ['1 gal milk', { amount: 1, unit: 'gallon', rest: 'milk' }],
    ['250 ml cream', { amount: 250, unit: 'ml', rest: 'cream' }],
    ['2 L water', { amount: 2, unit: 'l', rest: 'water' }],
    ['1 kilo rice', { amount: 1, unit: 'kg', rest: 'rice' }],
    ['12 ea eggs', { amount: 12, unit: 'each', rest: 'eggs' }],
    ['12 ct eggs', { amount: 12, unit: 'each', rest: 'eggs' }],
    ['2 doz eggs', { amount: 2, unit: 'dozen', rest: 'eggs' }],
    ['2 tins tuna', { amount: 2, unit: 'can', rest: 'tuna' }],
    ['1 pkg tortillas', { amount: 1, unit: 'pack', rest: 'tortillas' }],
    ['2 pcs chicken', { amount: 2, unit: 'piece', rest: 'chicken' }],
    ['2 filets salmon', { amount: 2, unit: 'fillet', rest: 'salmon' }],
  ])('%s', (input, expected) => {
    expect(parseQuantity(input)).toEqual(expected)
  })

  it('reads every count unit the task names', () => {
    expect(parseQuantity('3 rolls paper towels')).toEqual({ amount: 3, unit: 'roll', rest: 'paper towels' })
    expect(parseQuantity('2 boxes of tissues')).toEqual({ amount: 2, unit: 'box', rest: 'tissues' })
    expect(parseQuantity('5 loaves bread')).toEqual({ amount: 5, unit: 'loaf', rest: 'bread' })
    expect(parseQuantity('2 heads of lettuce')).toEqual({ amount: 2, unit: 'head', rest: 'lettuce' })
    expect(parseQuantity('1 bunch cilantro')).toEqual({ amount: 1, unit: 'bunch', rest: 'cilantro' })
    expect(parseQuantity('2 jars salsa')).toEqual({ amount: 2, unit: 'jar', rest: 'salsa' })
    expect(parseQuantity('4 cloves garlic')).toEqual({ amount: 4, unit: 'clove', rest: 'garlic' })
    expect(parseQuantity('3 slices bread')).toEqual({ amount: 3, unit: 'slice', rest: 'bread' })
    expect(parseQuantity('2 sticks butter')).toEqual({ amount: 2, unit: 'stick', rest: 'butter' })
    expect(parseQuantity('2 bottles of Dawn')).toEqual({ amount: 2, unit: 'bottle', rest: 'Dawn' })
    expect(parseQuantity('1 bag of rice')).toEqual({ amount: 1, unit: 'bag', rest: 'rice' })
    expect(parseQuantity('2 packs of gum')).toEqual({ amount: 2, unit: 'pack', rest: 'gum' })
    expect(parseQuantity('6 each apples')).toEqual({ amount: 6, unit: 'each', rest: 'apples' })
  })

  it('returns the canonical unit, not the spelling it saw', () => {
    expect(parseQuantity('2 Cans beans')?.unit).toBe('can')
    expect(parseQuantity('2 CUPS rice')?.unit).toBe('cup')
  })
})

describe('parseQuantity: the rest of the text', () => {
  it('drops "of" and leading punctuation but keeps the name as typed', () => {
    expect(parseQuantity('2 cans of black beans')).toEqual({ amount: 2, unit: 'can', rest: 'black beans' })
    expect(parseQuantity('2 cans, black beans')).toEqual({ amount: 2, unit: 'can', rest: 'black beans' })
    expect(parseQuantity('2 cups: rice')).toEqual({ amount: 2, unit: 'cup', rest: 'rice' })
    expect(parseQuantity('2 lb - chicken')).toEqual({ amount: 2, unit: 'lb', rest: 'chicken' })
    expect(parseQuantity('2 cans Rotel')).toEqual({ amount: 2, unit: 'can', rest: 'Rotel' })
    expect(parseQuantity('2 cans.')).toEqual({ amount: 2, unit: 'can', rest: '' })
  })

  it('collapses extra whitespace', () => {
    expect(parseQuantity('  2   cans   beans  ')).toEqual({ amount: 2, unit: 'can', rest: 'beans' })
    expect(parseQuantity('2\tcans\nbeans')).toEqual({ amount: 2, unit: 'can', rest: 'beans' })
  })

  it('keeps a word that only looks like a unit when it is part of the name', () => {
    expect(parseQuantity('2 of them')).toEqual({ amount: 2, unit: null, rest: 'them' })
  })
})

describe('parseQuantity: hyphenated numbers', () => {
  it('joins a number to a unit with a hyphen', () => {
    expect(parseQuantity('12-pack of paper towels')).toEqual({ amount: 12, unit: 'pack', rest: 'paper towels' })
    expect(parseQuantity('a 12-pack of paper towels')).toEqual({ amount: 12, unit: 'pack', rest: 'paper towels' })
    expect(parseQuantity('12 pack paper towels')).toEqual({ amount: 12, unit: 'pack', rest: 'paper towels' })
    expect(parseQuantity('6-pack sparkling water')).toEqual({ amount: 6, unit: 'pack', rest: 'sparkling water' })
    expect(parseQuantity('2-lb bag of rice')).toEqual({ amount: 2, unit: 'lb', rest: 'bag of rice' })
  })

  it('treats a number hyphenated to a non-unit as part of the name', () => {
    expect(parseQuantity('2-ply paper towels')).toBeNull()
    expect(parseQuantity('3-in-1 shampoo')).toBeNull()
  })
})

describe('parseQuantity: a unit with no number', () => {
  it('counts as one when "of" follows it', () => {
    expect(parseQuantity('can of tomatoes')).toEqual({ amount: 1, unit: 'can', rest: 'tomatoes' })
    expect(parseQuantity('bottle of Dawn')).toEqual({ amount: 1, unit: 'bottle', rest: 'Dawn' })
    expect(parseQuantity('stick of butter')).toEqual({ amount: 1, unit: 'stick', rest: 'butter' })
    expect(parseQuantity('Bag of Rice')).toEqual({ amount: 1, unit: 'bag', rest: 'Rice' })
  })

  it('counts a dozen as one dozen even without "of"', () => {
    expect(parseQuantity('dozen eggs')).toEqual({ amount: 1, unit: 'dozen', rest: 'eggs' })
  })

  it('stays a name when "of" does not follow', () => {
    expect(parseQuantity('can opener')).toBeNull()
    expect(parseQuantity('cup noodles')).toBeNull()
    expect(parseQuantity('stick butter')).toBeNull()
    expect(parseQuantity('bag')).toBeNull()
    expect(parseQuantity('box fan')).toBeNull()
  })
})

describe('parseQuantity: bare names and empty input', () => {
  it.each(['eggs', 'black beans', 'paper towels', 'Dawn dish soap', 'chicken thighs', 'Rotel', 'olive oil'])('%s -> null', (input) => {
    expect(parseQuantity(input)).toBeNull()
  })

  it('returns null for empty or whitespace-only text', () => {
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('   ')).toBeNull()
  })
})

/* ------------------------------------------------------------------------------------------------
   Round trips
   ------------------------------------------------------------------------------------------------ */

describe('parse then format', () => {
  it.each([
    ['1 1/2 cups rice', '1 1/2 cups'],
    ['1/2 lb thighs', '1/2 lb'],
    ['2 cans black beans', '2 cans'],
    ['a bottle of Dawn', '1 bottle'],
    ['12-pack of paper towels', '12 packs'],
    ['two bags of rice', '2 bags'],
    ['3 eggs', '3'],
    ['250 ml cream', '250 ml'],
    ['one and a half cups rice', '1 1/2 cups'],
  ])('%s -> %s', (input, expected) => {
    const parsed = parseQuantity(input)
    expect(parsed).not.toBeNull()
    if (parsed !== null) expect(formatQuantity({ amount: parsed.amount, unit: parsed.unit })).toBe(expected)
  })
})

describe('list subtraction line, end to end', () => {
  it('builds "need 3 lb thighs, have 1 lb, buy 2 lb" from the item and the need', () => {
    const thighs = item('thighs', 'Boneless skinless chicken thighs', { trackMode: 'count', qty: 1, unit: 'lb' })
    const have = itemQuantity(thighs)
    expect(have).not.toBeNull()
    if (have === null) return
    const need = q(3, 'lb')
    const c = compareQuantities(have, need)
    const line = `need ${formatQuantity(need)} thighs, have ${formatQuantity(have)}, buy ${formatQuantity(shortfallOf(c))}`
    expect(line).toBe('need 3 lb thighs, have 1 lb, buy 2 lb')
  })

  it('shows the shortfall in the need unit even when the pantry counts differently', () => {
    const butter = item('butter', 'Butter', { trackMode: 'count', qty: 8, unit: 'oz' })
    const have = itemQuantity(butter)
    expect(have).not.toBeNull()
    if (have === null) return
    const c = compareQuantities(have, q(1, 'lb'))
    expect(formatQuantity(shortfallOf(c))).toBe('1/2 lb')
  })
})
