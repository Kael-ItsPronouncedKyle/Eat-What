# Quartermaster: implementation plan

Companion to `docs/spec.md` (the technical spec) and `docs/spec-review.md` (the readiness review). This document says how the app is built, in what order, and which decisions the build makes on the owner's behalf until told otherwise.

## Decisions taken for the build

| Decision | Choice | Why | How hard to change |
| --- | --- | --- | --- |
| Name | Quartermaster, short form QM | The spec's working title; fits voice ("QM, we're out of eggs") | One constant and the manifest; trivial |
| Visual direction | 1, Ship's Stores, with direction 2's masking-tape labels on the freezer shelf | The spec's own lean for a whole-house, two-household scope | Tokens live in one CSS file; swapping palette and type is an afternoon |
| Dyslexia-friendly font | Atkinson Hyperlegible (free, on Google Fonts) | OpenDyslexic is not on a CDN we can rely on; Atkinson is designed for low vision and reads well | One font-family token |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) | Per spec | Schema is plain SQL; see exit plan in spec |
| Client | Vite 8, React 19, TypeScript, React Router 8, Dexie for the offline mirror | Per spec; current stable versions | n/a |
| Data access | One `Repository` interface with two adapters: `LocalRepository` (IndexedDB, runs with no backend) and `SupabaseRepository` | Spec build rule: nothing depends on Supabase beyond auth and RLS; the local adapter is also the offline mirror and the demo mode | n/a |
| Sign-in | Email one-time code (6 digits), sign-ups off, accounts created by invite | Magic links break in installed PWAs on iOS; passwords fight the accessibility goals | Supabase Auth setting |
| Supabase project | Not created yet | Creating one is a billing decision for the owner (5 projects already exist on the org) | `npm run db:apply` once the project exists |

## Architecture

```
src/
  app/        shell, routing, providers (prefs, session, repository), route error page
  design/     tokens.css, base.css, components.css, components/ (Button, Card, Chip, Sheet, UndoBar, ...)
  domain/     pure TypeScript, no React, no Supabase: types, units, matching, rules, suggestions,
              list subtraction, container math, effort, labels, plan operations, budget math
  data/       Repository interface; local/ (Dexie) and supabase/ adapters; seed/ (Denton, College Station)
  features/   home, pantry, cook (suggestions, recipes, plan, cook-week, cook mode), shop, house, import, partner
  integrations/ retailer adapters (instacart, amazon, walmart, heb, in-person list), open food facts, claude client
supabase/
  migrations/ 0001_init (tables), 0002_rls (policies), 0003_functions (RPCs), 0004_realtime
  tests/      SQL tests run against a throwaway local Postgres (npm run db:test)
  functions/  edge functions (Phase 3: parse-intent, receipt-parse, url-import, recipe-generate)
e2e/          Playwright smoke and accessibility checks
```

Rules the code follows:

1. The domain layer owns every rule in the spec (status from par, match completeness, ranking, subtraction, container math, bad day, quality dates). It is unit tested with Vitest and has no I/O.
2. Features talk to the `Repository` only. The `Repository` returns domain types, never database rows.
3. Writes are optimistic and immediate with a 5-second undo (spec "Undo, not confirm"). Confirm sheets are reserved for sending money and deleting data.
4. Every change writes an `activity_events` row with before and after, which powers the activity feed and undo.
5. Prices are never guessed. A price is shown only when the price book has one; seeded starter prices are labeled "starter estimate" and flagged stale until a receipt or manual entry confirms them.
6. Allergy rules are enforced in code (domain `rules.ts`) and in SQL (`check_allergies`), not only in a prompt.

## Data model changes versus the spec

The review found the spec's data model had drifted from its feature sections. The migrations adopt these resolutions (details in `docs/spec-review.md`):

- Standard audit and sync columns on every tenant table: `id, household_id, created_at, created_by, updated_at, updated_by, deleted_at`.
- `household_id` on every child table (`item_aliases`, `recipe_ingredients`, `activity_events`) with composite foreign keys so a child can never point at another household's parent.
- `recipe_ingredients.item_id`, `canonical_name`, `match_confidence`, `fdc_id`, `grams`: the resolved mapping that make-it-now, plan-to-list and depletion need.
- `list_sends` (an order group with estimated and actual totals), `list_lines.name` for free-text lines, one open line per item enforced by a unique index.
- `containers` as its own table; `freezer_blocks` defined as one row per group of identical blocks with `count_remaining` and `portion_label`.
- `cook_weeks`, `cook_sessions`, `receipts`, `receipt_lines`, `item_retailer_links`, `invites`, `user_prefs`, `push_subscriptions`, `ai_usage`, `recipe_transfers`, global `recipe_library` and `product_cache`.
- Budget lives on `households` (`budget_monthly_cents`, `budget_warn_pct`); plating lives on `persons.plate_profile`; `rules.type` is `allergy | prep | diet | cuisine`.
- Roles are `owner | editor | viewer | agent`. Agent (Riker) may draft but never send or delete; a trigger enforces it.
- RLS uses `SECURITY DEFINER` helpers (`app.user_household_ids`, `app.has_role`) so the membership policy does not recurse. Households and memberships are created only through `create_household` and `accept_invite`.

## Build order

Phase 1 (this delivery) in the order the pieces depend on each other:

1. Toolchain, design tokens, component library, shell (done).
2. Schema, RLS, RPCs, SQL tests on local Postgres (done).
3. Domain layer with unit tests: units and matching, status rules, suggestion engine (make it now, almost there, use it up, freezer first), ranking with explainable terms, list subtraction and merge, routing, container math, effort score, labels, bad day, budget math, Neelix import mapping.
4. Data layer: `Repository` interface; local Dexie adapter with seeds for Denton (Souper Cubes kit, staples, starter recipes, Kroger/Instacart price book for 76207) and College Station (H-E-B, cheapest kit, starter price book for 77840); Supabase adapter over the generated types.
5. Features: Pantry (locations, staples grid, item cards, freezer shelf), Cook (suggestion feed with why, recipe bank, recipe detail with stock mapping, week plan, cook-week builder with container math, cook mode), Shop (list by destination, send per retailer, ordered section, price book, budget bar), House (members, rules, retailers, routing, locations, containers, notifications, export), Home (energy, bad day, tonight's pick, expiring, low/out, budget), Import (Neelix JSON).
6. Verification: typecheck, unit tests, build, Playwright smoke at A and A++, tap-target audit, adversarial code review.

Phase 2 to 4 follow the spec's roadmap. The schema already carries what they need (invites, agent role, receipts, push subscriptions, transfers) so nothing is rebuilt.

## Testing

- `npm test`: Vitest unit tests for the domain layer and the local adapter (fake IndexedDB).
- `npm run db:test`: applies all migrations to a throwaway Postgres and runs the SQL tenancy and role tests.
- `npm run test:e2e`: Playwright on a Pixel 7 profile: navigation, text size persistence, no horizontal scroll at A++, 48 px tap targets.
- `npm run typecheck`, `npm run lint`, `npm run build`.

## What the owner still decides

See `docs/spec-review.md`, section "Decisions only the owner can make". The build runs on defaults until then.
