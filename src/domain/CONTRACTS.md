# Domain layer contracts

Every module in `src/domain` is pure TypeScript: no React, no Supabase, no I/O, no `Date.now()` inside logic (callers pass `today`). Each module ships with a `*.test.ts` next to it. The functions below are the public API that features and the data layer call; implementations must keep these signatures. `types.ts` is the source of truth for shapes.

Spec rules each module owns (section names refer to `docs/spec.md`):

- `units.ts`: unit normalization and conversion (mass, volume, count), quantity parsing from text ("2 cans black beans"), comparison with shortfall, formatting.
- `names.ts`: canonical ingredient and item names (lowercase, trimmed, singular, descriptors like "fresh", "chopped", "large" removed), token similarity.
- `matching.ts`: ingredient to item resolution (resolved item_id, then alias, then exact canonical name, then fuzzy above 0.8), availability per ingredient. Status-mode item: OK and Low count as have, Out is missing. Count-mode: compare quantities; incompatible units count as have when qty > 0 but flagged `assumed`. Optional ingredients never block. Always-have list (spec: Suggestion modes, item 1) counts as `assumed`.
- `status.ts`: count mode derives status (qty <= 0 is Out; par set and qty < par is Low; else OK); status mode cycles OK, Low, Out; expiry horizons 2 days / this week / expired (spec: Expiry).
- `rules.ts`: allergy violations by canonical name containment, substitution application with a visible badge, cuisine weights (liked 1.2, tolerated 1.0, avoid 0.6, unknown 1.0), prep fit (seated bonus 1.1 when the recipe's standing minutes fit the household max), diet flags (sodium cap, protein floor), energy gate (little: effort <= 2, some: <= 3.5, plenty: all).
- `effort.ts`: effort score 1 to 5 from active minutes, standing minutes, step count, dishes (spec: Filters).
- `suggestions.ts`: the four modes and the ranking formula with explainable terms (spec: Suggestion modes, Ranking, Filters). Score = completeness x ruleFit x cuisineWeight + expiryUrgency (0 to 0.3) + freshnessPenalty (-0.2 if cooked in the last 10 days). Allergy fail sets ruleFit to 0 unless a substitution fixes it.
- `listing.ts`: plan needs, stock subtraction shown line by line (spec: From plan to list), merge into one line per item with both reasons (spec: List behaviors), routing (item override, then category rule, then primary grocery for food and primary other for everything else, then null), price estimates (never guessed), low/out auto-add.
- `containers.ts`: container math (spec: Cook-week batches). Yield in ml from base yield and yield unit (servings 360 ml, cups 240, quarts 946, pints 473, liters 1000, ml); multiplier from target containers; warnings when a day's batches exceed what is owned; freeze-then-refill order for reusable trays; "buy a box of bags" line for disposables.
- `labels.ts`: label text for tape, bag panel, address-label sheet; quality dates by food type (spec: Quality dates, Labels).
- `plan.ts`: Bad day (today's cook moves forward one day and cascades until a free day; tonight becomes the oldest fitting freezer block or a no-cook recipe), auto-fill proposals, cheap week (spec: Weekly dinners).
- `budget.ts`: month summary (spent actual, committed estimated-not-received, remaining, 80% warn, 100% red, never block), latest price with 7-day stale flag, cost per serving (null if any required ingredient has no price).
- `nutrition.ts`: per-serving nutrition from grams and per-100g nutrients, per-plate rows from plate profiles, coverage flag. Built-in fallback table of common staples per 100 g (labeled estimate).
- `importers/neelix.ts`: tolerant mapping of a Neelix's Kitchen export (localStorage key `freezer-partner-state-v1`) into domain rows, flagging anything it could not parse.
