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


## Status against the readiness review

`docs/spec-review.md` lists the blockers and majors. What the build does about each, as of this delivery:

| Review item | Status |
| --- | --- |
| Phase 1 scope widened to freezer shelf, week plan, cook-week builder with container math, plan-to-list, labels | Done. All ship in local mode. Bad day, week fill, cheap week and low-energy Home are built too, ahead of the review's Phase 2 placement. |
| Neelix export undocumented | Tolerant importer (`src/domain/importers/neelix.ts`) with a fixture-based test; the versioned `qm-import-v1` contract waits for the real export. Owner action: export `freezer-partner-state-v1` from Neelix. |
| No Supabase project, hosting, keep-alive | Migrations and a keep-alive GitHub Actions workflow (inert until secrets exist) are ready; the project and hosting target wait on the owner's org decision (review section 2). |
| Instacart production key and adapter | Adapter ships the search-plus-copy plan. The `instacart-link` edge function is built (`supabase/functions/instacart-link`, environment chosen by `INSTACART_ENV`) and the Shop send asks it for a real link when a backend exists, falling back to search-plus-copy. It needs the Instacart development key as a function secret; untested against Instacart. |
| Sign-in, invites, first run | Done: email one-time-code sign-in, `/join/:token` acceptance (held through sign-in), and a first-run household screen when the user has no membership. The RPCs are SQL-tested. Untested against a live project. |
| RLS recursion, bootstrap, role matrix, child-table household_id, audit columns, invites table | Done in the migrations and tested (`npm run db:test`). |
| Ingredient link and unit model | Done (`matching.ts`, `units.ts`); the recipe card's "fix" link writes `item_id`. |
| Satisfied rule, ranking terms, use-it-up, freshness, effort, energy, allergy whole-word matching | Done in `src/domain` with tests; the SQL `check_allergies` now matches whole words too. Allergy aliases are done: `src/domain/allergens.ts` holds the family table (nuts, tree nuts, peanuts, shellfish, dairy, gluten/wheat, eggs, soy, sesame, fish) plus a small exception list (coconut milk is not dairy, peanut butter is not butter), `rules.ts` uses it, and `0005_allergy_aliases.sql` seeds the same table into `app.allergen_aliases` and recreates `check_allergies` to use it, with `supabase/tests/002_allergy_aliases.sql`. |
| Depletion review, cook sessions, activity log | Done: end-of-cook sheet writes freezer blocks, confirmed deductions, a cook session, and one undoable event. |
| Container model with cavities | Done. `count_owned` is trays (or bags, tubs, jars) owned and `cavities` (migration `0006_container_cavities.sql`, default 1) is portions per tray, so blocks at once = `count_owned * cavities`. Souper Cubes presets carry 4, 6 and 8 cavities; Denton owns 2 trays of 2-cup, 2 of 1-cup, 1 of 1/2-cup. Container math, suggestions and the cook-week availability warning count blocks against trays times cavities, and the Freezer kit screen shows "N trays x M cavities = K blocks" with a cavities stepper. |
| Dump-kit batches | Done. Recipe steps carry an optional `phase` (`assemble` or `cook`, absent means cook; `src/domain/steps.ts`), picked per step in the recipe editor. Cooking a `dump_kit` batch from the cook week walks only the assemble steps and the finish sheet writes raw (`raw_marinated`) kits, which stay out of freezer-first and bad day. A raw block shows a 64 px "Cook 1" beside "Eat 1" on the shelf and block detail; it opens cook mode at the cook steps (`?block=<id>`), and logging it takes one kit off the block, records a cook session and offers no new blocks by default, all in one undoable event. The crockpot chili, slow-cooker stew and pot-roast dump kit seed recipes carry assemble steps. |
| Cook-week timeline rows (shop, thaw, label, pop, refill) | Done: `src/domain/cookweek.ts` `buildTimeline` is pure and tested (two-batch week reusing the 2-cup trays). Rows per day in order thaw, note, shop, batch, sit, fill, label, pop, refill: shop the day before the first batch with an "Open the list" link, thaw the evening before any batch whose ingredients match meat or seafood kept in a freezer location or shelf, batch with recipe minutes, sit from the standing cap, fill per container line, one label row per batch from `labels.ts`, pop the morning after a tray batch ("refill trays" when the same tray cooks again), a refill row naming the next day that needs it, and a note when a day needs more tray blocks than fit at once. The builder renders each kind with its own icon and prints from the same rows (`timelineText`). Confirming the week saves the rows on the cook week. |
| list_sends, received flow, merged lines | Done. |
| College Station starter prices, PriceProvider off by default | Done. Starter rows carry a visible chip. The weekly web check is built: `supabase/functions/price-check` asks Claude with web search for shelf prices per retailer near the household ZIP, keeps only sourced, confident, fresh, plausible answers (`src/integrations/prices/quotes.ts`, unit-tested), writes them as `web` prices with the page URL, and logs each call to `ai_usage`. Off per household until the owner turns it on under House > Price check; the Monday schedule is `.github/workflows/price-check.yml`. Needs `ANTHROPIC_API_KEY` on the function and the Supabase secrets on the repo. Not yet run against a live project. Seed spot check: eggs, milk, chicken thighs and ground beef moved toward BLS and H-E-B published figures; still estimates. |
| Nutrition rough estimate | Done, labeled "estimate" with coverage. FDC lookup is Phase 2. |
| Offline outbox, patch-only writes, delta ops, apply_ops RPC | Done. `SyncedRepository` wraps the Supabase adapter with an IndexedDB mirror, an outbox that flushes in order when online, patch-only updates for existing rows, a full per-household pull on open and on focus, realtime invalidation, and a header chip with a retry tap ("N changes waiting"). Counters are delta ops: `Collection.adjust(id, field, delta)` (items.qty and freezer_blocks.countRemaining only) applies to the mirror at once and queues `{ field, delta, base }`; `adjustItemQty` and `eatFreezerBlock` use it, with undo as the opposite delta, so two phones that each ate one block offline both land. `public.apply_ops` (migration `0007_apply_ops.sql`, security invoker so RLS still applies) takes a batch of patch, delta and softDelete ops, adds deltas on the server clamped at 0 (re-deriving item status in count mode), and writes a `sync_events` row (`base_mismatch`) when the value it found differs from the sender's base; the flush sends consecutive ops for one household as one call when the remote has `applyOps` and falls back to one at a time otherwise. Not done: surfacing sync events in the activity feed, and incremental pulls. |
| Hard deletes | Replacements and most undos soft-delete. `remove()` still backs the undo of rows an action just created (freezer blocks and the session from a cook, plan entries from a week fill, list lines from add-missing, the send and spend from a receive), so the editor delete grant in RLS stays for now. Withdrawing it is a follow-up once those undos tombstone too. |
| Exit path | PocketBase dropped; any Postgres host. |
| Hand toggle mirrors only edge controls | Done: tabs and header no longer reverse. |
| Print route for labels and the cook week | Done: `/print/labels?week=<id>` or `?blocks=<id,...>` prints a sheet of 2 x 4 inch label boxes (title, portion, cooked on, best by, who it is for, reheat line, household) and `/print/week/:id` prints the cook week on one page (batch table, day-by-day rows from the domain timeline, shopping list after stock subtraction). Both render without the shell, preview the paper on a phone, and use `src/design/print.css` (`@page` letter, 0.5in margins). Plain-text `printText` stays as the fallback for retailer lists. |
| Push notifications | Done end to end, untested against a live project. Client: `vite-plugin-pwa` now uses `injectManifest` with our own `src/sw.ts` (precache, app-shell navigation, `push` shows the title and body, `notificationclick` focuses or opens the deep link); `src/integrations/push.ts` subscribes with the PushManager and stores the endpoint and keys in `push_subscriptions` through the Repository (per user; local mode keeps it on the device and says push needs the backend); House > Notifications has a "Notifications on this phone" toggle with a plain status (not supported, blocked, not set up, on). Server: `supabase/functions/notify` runs hourly from `.github/workflows/notify.yml` with the service role key, computes what is due per household in its own timezone with the pure, unit-tested rules in `src/domain/notifications.ts` (low/out batched at 5 pm, expiring and expired at 8 am with expired once per item, weekly shop on the household's day and time, stale prices weekly with it, budget 80 and 100 once a month on crossing), records every dedupe key in `notification_queue` (migration `0008_notify_queue.sql`, unique per household and key, so a doubled or late hour sends nothing twice), drains the queue (a trigger on `list_sends` queues "list sent" for everyone but the sender), honors quiet hours and each person's toggles, sends with `web-push` and VAPID, and deletes phones that answer 404 or 410. Needs `npx web-push generate-vapid-keys`: `VITE_VAPID_PUBLIC_KEY` in the app and the three VAPID secrets on the function. Not built: `cook_week_prep` (needs the cook tag on cook weeks). |

## What the owner still decides

See `docs/spec-review.md`, section "Decisions only the owner can make". The build runs on defaults until then.
