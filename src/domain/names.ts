/* Canonical ingredient and item names.
   Pure string work: no I/O, no dates. Used by matching (alias, exact, fuzzy), allergy rules, and USDA lookups. */

/* ------------------------------------------------------------------------------------------------
   Word lists
   ------------------------------------------------------------------------------------------------ */

/** Words that describe freshness, size, or preparation but not the product itself. Removed anywhere in the name.
    Words that change the product (boneless, skinless, ground, dried, canned, smoked, sweet, red) are kept. */
const DESCRIPTORS = new Set<string>([
  // freshness and state
  'fresh', 'freshly', 'frozen', 'thawed', 'defrosted', 'ripe', 'raw', 'cooked', 'uncooked', 'precooked', 'leftover',
  'warm', 'warmed', 'chilled', 'cooled', 'room', 'temperature',
  // size
  'large', 'small', 'medium', 'big', 'jumbo', 'extra', 'huge', 'tiny', 'mini', 'thick', 'thin',
  // quality words that do not change the product
  'organic', 'whole', 'good', 'quality', 'best', 'nice', 'premium', 'store', 'bought', 'homemade',
  // knife and prep work
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'crushed', 'peeled', 'cubed', 'halved', 'quartered',
  'julienned', 'zested', 'juiced', 'seeded', 'deseeded', 'pitted', 'cored', 'stemmed', 'trimmed', 'rinsed', 'drained',
  'washed', 'torn', 'beaten', 'whisked', 'melted', 'softened', 'mashed', 'pureed', 'crumbled', 'toasted', 'cut',
  'divided', 'separated', 'thinly', 'thickly', 'finely', 'roughly', 'coarsely', 'lightly', 'well', 'very',
  'packed', 'heaping', 'scant', 'level', 'rounded', 'about', 'approximately', 'optional', 'removed', 'discarded',
  'reserved', 'needed', 'desired', 'preferably', 'ideally',
])

/** Words that mark a comma segment as a preparation note rather than part of the product name. */
const SEGMENT_TRIGGERS = new Set<string>([
  'for', 'to', 'plus', 'or', 'as', 'if', 'at', 'only', 'more', 'into', 'on', 'off', 'and', 'in', 'with', 'without',
  'from', 'such', 'like', 'etc', 'see', 'note', 'notes', 'taste', 'serving', 'garnish', 'dusting', 'greasing', 'frying',
  'brushing', 'drizzling', 'sprinkling', 'topping',
])

/** Phrases that never name a product. Stripped before tokenizing. */
const NOISE_PHRASES: RegExp[] = [
  /\bor\s+to\s+taste\b/g,
  /\bto\s+taste\b/g,
  /\bfor\s+(serving|garnish|garnishing|dusting|greasing|frying|brushing|drizzling|sprinkling|topping|the\s+pan)\b/g,
  /\bas\s+needed\b/g,
  /\bif\s+desired\b/g,
  /\bif\s+needed\b/g,
  /\bplus\s+(more|extra)\b/g,
  /\bor\s+more\b/g,
  /\bat\s+room\s+temperature\b/g,
]

/** Stop words that carry no meaning for matching. Removed by nameTokens, kept by canonicalName. */
const STOP_WORDS = new Set<string>([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'with', 'for', 'to', 'on', 'from', 'into', 'at', 'by', 'as', 'per',
  'some', 'any', 'your', 'our', 'my',
])

/** Words that end in s but are singular (or have no useful singular). Never changed. */
const INVARIANT = new Set<string>([
  'hummus', 'couscous', 'asparagus', 'molasses', 'lemongrass', 'watercress', 'cress', 'swiss', 'bass', 'grits',
  'brussels', 'bitters', 'citrus', 'haggis', 'tahini', 'series', 'species', 'news', 'chess', 'floss', 'moss', 'mass',
  'glass', 'plus', 'minus', 'gas', 'yes', 'this', 'its', 'his', 'is', 'us', 'as', 'has', 'was', 'edamame', 'mayonnaise',
])

/** Plurals the simple rules get wrong. */
const IRREGULAR: Record<string, string> = {
  cookies: 'cookie',
  brownies: 'brownie',
  veggies: 'veggie',
  hoagies: 'hoagie',
  smoothies: 'smoothie',
  calories: 'calorie',
  chilies: 'chili',
  chillies: 'chilli',
  chiles: 'chile',
  quiches: 'quiche',
  brioches: 'brioche',
  mousses: 'mousse',
  leaves: 'leaf',
  halves: 'half',
  loaves: 'loaf',
  calves: 'calf',
  shelves: 'shelf',
  knives: 'knife',
  lives: 'life',
  wolves: 'wolf',
  feet: 'foot',
  teeth: 'tooth',
  geese: 'goose',
  mice: 'mouse',
  children: 'child',
  people: 'person',
}

/* ------------------------------------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------------------------------------ */

/** One lowercase word with no punctuation -> its singular form, using regular English rules.
    Words that end in "us" or "ss" and the invariant list are left alone so hummus, couscous, asparagus, molasses survive. */
export function singularize(word: string): string {
  const w = word.toLowerCase()
  if (w.length < 4 || INVARIANT.has(w)) return w
  const irregular = IRREGULAR[w]
  if (irregular !== undefined) return irregular
  if (!w.endsWith('s')) return w
  if (w.endsWith('ss') || w.endsWith('us') || w.endsWith('is')) return w
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`
  if (w.endsWith('sses') || w.endsWith('xes') || w.endsWith('ches') || w.endsWith('shes')) return w.slice(0, -2)
  if (w.endsWith('oes') && w.length > 4) return w.slice(0, -2)
  return w.slice(0, -1)
}

/** Lowercase, strip accents and punctuation, split on whitespace. Hyphens become spaces ("sun-dried" -> "sun dried"). */
function words(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
  return cleaned.split(/\s+/).filter((w) => w.length > 0)
}

function stripNoise(text: string): string {
  let out = text
  for (const re of NOISE_PHRASES) out = out.replace(re, ' ')
  return out
}

/** Does a comma segment after the first read as a preparation note ("chopped", "for serving") rather than a product? */
function isPrepSegment(tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const first = tokens[0]
  if (first !== undefined && SEGMENT_TRIGGERS.has(first)) return true
  return tokens.some((t) => DESCRIPTORS.has(t) || SEGMENT_TRIGGERS.has(t))
}

/* ------------------------------------------------------------------------------------------------
   Public API
   ------------------------------------------------------------------------------------------------ */

/** Canonical form used for aliases, allergy matching, and USDA lookups:
    lowercase, trimmed, punctuation stripped, simple plurals singularized, descriptors removed
    ("Fresh cilantro, chopped" -> "cilantro"; "Boneless skinless chicken thighs" -> "boneless skinless chicken thigh"). */
export function canonicalName(name: string): string {
  if (typeof name !== 'string') return ''
  let text = name.toLowerCase()
  // Parenthetical and bracketed notes never name the product.
  text = text.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
  text = stripNoise(text)

  // Segments after a comma are usually preparation ("cilantro, chopped"). Keep a later segment only when it reads
  // as part of the product name ("boneless, skinless chicken thighs").
  const segments = text.split(/[,;:]/)
  const kept: string[] = []
  segments.forEach((segment, index) => {
    const tokens = words(segment)
    if (index === 0 || !isPrepSegment(tokens)) kept.push(...tokens)
  })

  const singular = kept.map(singularize)
  const withoutDescriptors = singular.filter((w) => !DESCRIPTORS.has(w))
  // A name made only of descriptors ("fresh") keeps its words rather than vanishing.
  const result = withoutDescriptors.length > 0 ? withoutDescriptors : singular
  return result.join(' ')
}

/** Tokens of a canonical name with stop words removed. Unique, in order of first appearance. */
export function nameTokens(name: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of canonicalName(name).split(' ')) {
    if (token.length === 0 || STOP_WORDS.has(token) || seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

/** Whole-word phrase containment on canonical strings. */
function containsPhrase(haystack: string, needle: string): boolean {
  if (needle.length === 0 || haystack.length === 0) return false
  return ` ${haystack} `.includes(` ${needle} `)
}

/** 0..1 similarity: 1 for equal canonical names, high for containment ("chicken thigh" in "boneless chicken thigh"), token Jaccard otherwise.
    Containment scores 0.85 plus up to 0.15 for how much of the longer name the shorter one covers, so it never reaches 1.
    Jaccard runs over stop-word-free tokens; one shared generic word ("chicken") out of three or more scores 1/3 or less. */
export function nameSimilarity(a: string, b: string): number {
  const ca = canonicalName(a)
  const cb = canonicalName(b)
  if (ca === cb) return 1
  if (ca.length === 0 || cb.length === 0) return 0

  const [shorter, longer] = ca.length <= cb.length ? [ca, cb] : [cb, ca]
  if (containsPhrase(longer, shorter)) {
    const shortCount = shorter.split(' ').length
    const longCount = longer.split(' ').length
    const ratio = longCount > 0 ? shortCount / longCount : 0
    return Math.min(0.99, 0.85 + 0.15 * ratio)
  }

  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length === 0 || tb.length === 0) return 0
  const setB = new Set(tb)
  const union = new Set([...ta, ...tb])
  let shared = 0
  for (const t of ta) if (setB.has(t)) shared += 1
  return union.size === 0 ? 0 : shared / union.size
}

/** Does `haystack` contain `needle` as a whole word or phrase, after canonicalization? Used for allergy rules. */
export function containsIngredient(haystack: string, needle: string): boolean {
  const ch = canonicalName(haystack)
  const cn = canonicalName(needle)
  return containsPhrase(ch, cn)
}
