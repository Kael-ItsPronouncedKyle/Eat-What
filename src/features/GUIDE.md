# Feature build guide

Read this before building any screen. It is the contract between features and the rest of the app.

## Where things are

- `src/domain/*`: pure rules (see `src/domain/CONTRACTS.md`). Never reimplement a rule in a component; call the domain.
- `src/data/repository.ts`: the `Repository` interface. Features never import Dexie or Supabase.
- `src/data/provider.tsx`: `useRepo()`, `useCollection(table, householdId)`, `useCollections([...], householdId)` (live lists that refresh on change).
- `src/app/hooks/useHouseholdData.ts`: `useHouseholdData()` loads every table the engine needs plus `recipesWithIngredients` and `alwaysHave`.
- `src/app/hooks/useActions.ts`: `useUndoable().run(async (repo, actor) => mutation)` performs a write and shows the 5-second undo bar.
- `src/data/mutations.ts`: `replaceRow`, `insertRow`, `deleteRow`, `setItemStatus`, `cycleItemStatus`, `adjustItemQty`, `setItemQty`, `eatFreezerBlock`, `addListLine`, `dropListLine`. Every write goes through one of these (or a new helper in your feature folder built on `replaceRow`/`insertRow`) so the activity feed and undo work.
- `src/app/session.tsx`: `useSession()` gives `userId`, `household` (active), `households`, `switchHousehold`.
- `src/app/prefs.tsx`: `usePrefs()` gives text size, theme, hand, energy (`prefs.energy`, `setEnergy`).
- `src/design/components`: `Button`, `IconButton`, `Card`, `CardHeader`, `StatusChip`, `Chip`, `Badge`, `Segmented`, `Stepper`, `Sheet`, `useUndo`, `EmptyState`, `TextField`, `SelectField`, `TextArea`, `Toggle`, `ListRow`, `Icon`. Styles live in `src/design/components.css` and layout helpers in `src/design/base.css` (`.page`, `.page-title`, `.section`, `.stack`, `.row`, `.spread`, `.grid-2`, `.grid-3`, `.muted`, `.small`, `.num`).
- `src/integrations/retailers/adapters.ts`: `planSend(retailer, lines, opts)` returns the label, link, text, and method for a send. `src/integrations/share.ts`: `shareText`, `copyText`, `printText`.
- `src/app/Shell.tsx`: `BackHeader` for secondary screens. Cook mode is full screen: routes under `/cook/mode/...` render without the shell.

## Routing

Each feature owns a subtree and renders nested routes with `<Routes>` from `react-router` inside its page component:

| Feature | Base route | Sub-routes it owns |
| --- | --- | --- |
| home | `/` | none |
| pantry | `/pantry/*` | `/pantry`, `/pantry/item/:id`, `/pantry/freezer`, `/pantry/freezer/:id`, `/pantry/add`, `/pantry/scan` (placeholder) |
| cook | `/cook/*` | `/cook` (suggestions), `/cook/recipes`, `/cook/recipes/new`, `/cook/recipe/:id`, `/cook/plan`, `/cook/week` (cook-week builder), `/cook/week/:id`, `/cook/mode/:recipeId` (full screen) |
| shop | `/shop/*` | `/shop`, `/shop/ordered`, `/shop/prices`, `/shop/budget` |
| house | `/house/*` | `/house`, `/house/members`, `/house/rules`, `/house/retailers`, `/house/locations`, `/house/containers`, `/house/notifications`, `/house/activity`, `/house/export`, `/house/import`, `/house/display` |

Links between features use these paths. Do not edit `src/app/routes.tsx`; it already mounts each feature's page at its base.

## Rules every screen follows (spec: Accessibility, Interaction rules)

- Tap targets at least 48 px; primary card actions (Eat 1, Cook 1, Low, Out, Add to list) use `size="lg"` (64 px) and sit in the bottom third of a sheet or card.
- Undo, not confirm: status taps, Eat 1, Cook 1, add-to-list happen immediately and show the undo bar via `useUndoable`. Confirm sheets (`Sheet` with a footer button) only for sending money (Send to Instacart) and deleting data.
- Color is never the only signal: use `StatusChip` (text + icon) and `Badge`.
- Everything works at A++ (1.6x text) on a 360 px wide phone with no horizontal scroll. Prefer `.stack` and `.grid-2`; avoid fixed widths.
- Every control has an accessible name; icon-only buttons use `IconButton` with `label`. Live updates (counts, undo) use `role="status"`.
- Plain language, about sixth-grade level, one idea per sentence. No guilt: expired food reads "compost it"; a skipped cook is not mentioned again; over budget reads "over by $12".
- Prices show only when known. Starter estimates get a "starter" badge. Never render a guessed number.
- Empty states say what to do next, with one button.
- Energy: `usePrefs().prefs.energy` filters suggestions through `SuggestionContext.energy`. Home collapses to three big buttons when energy is `little`.
- Dates come from `useToday()` and `src/domain/dates.ts`. Never call `new Date()` in a component body for logic; it belongs in the domain through `today`.

## What each feature must include

See the per-feature prompt. Each feature ships: its screens, feature-local components under `src/features/<name>/`, any feature-specific mutation helpers (built on `replaceRow`/`insertRow`), and at least one Vitest render test with `@testing-library/react` using a `LocalRepository` seeded by `ensureDemoSeed` (see `src/data/local/LocalRepository.test.ts` for the setup; wrap in `PrefsProvider`, `UndoProvider`, `RepositoryProvider`, and a `MemoryRouter`).

## Ownership

Edit only inside your feature folder plus the files the prompt names. Shared changes you need (a new design component, a new mutation helper that others would reuse) go in your folder first; note them in your report so they can be promoted.
