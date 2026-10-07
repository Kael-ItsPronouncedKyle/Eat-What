# Household Pantry, Meals and Shopping App: Technical Spec

Oct 7, 2026 · @Liam Gent

## Product summary

A voice-first, multi-household app that knows what is in the house (food, cleaning, paper goods, pet supplies, OTC meds), tells you what you can cook from it, plans the week and the freezer batches, and pushes the gaps to Instacart, H-E-B, Walmart, Amazon, or a plain list. It replaces Neelix's Kitchen outright and carries over its 262-recipe bank, Souper Cubes freezer tracking, price book, and Instacart cart flow.

2 households on day one: Liam and Sarah in Denton, and your daughter and her husband in College Station. Each household sets its own rules (allergies, plating, prep constraints, diet, budget) and sees only its own data. The product ships as a PWA now, wrapped native later, on Supabase.

What "done" looks like for a normal week:

1. Monday: say "we're out of paper towels and low on chicken thighs." Both items update. Paper towels land on the Amazon list, thighs on Instacart or a shopping list to bring to the store, customized to the store we are shopping at.&#32;
2. Wednesday: ask "what can I make tonight." You get three recipes you can cook right now, two more that need one item each, and a flag that the half-and-half expires Friday.
3. Saturday: open the cook-week plan, confirm four Souper Cubes batches, and send one Instacart cart for the lot. The price book estimates the total against this month's budget before you tap send.
4. Sunday: mark the batches cooked. Stock drops with a confirm step, the freezer shelf fills, and next week's dinners are already on the calendar.

Non-goals for v1: nutrition tracking beyond household rules, a public recipe community, and receipt-level accounting for taxes.

## Name options

Working title in this spec is **Quartermaster**. It covers food and cleaning without sounding like a recipe app, it fits the Star Trek framing of Riker and the Neelix lineage without borrowing a character name, and the short form "QM" works for voice ("QM, we're out of eggs"). Pick one, or send a different direction and I'll regenerate.

| Name | Why it fits | Watch out |
| --- | --- | --- |
| Quartermaster | Ship's stores officer; food, supplies, and provisioning in one word; voice-friendly short form QM | Generic enough that domain and app-store names may be taken; check before committing |
| Larder | Old word for the cold pantry; warm, single-syllable-ish, easy to say to a speaker | Reads food-only; cleaning and meds feel out of place under it |
| Stores | What a ship or a house keeps on hand; plainest option, neutral across households | Too common for search; needs a qualifier like "House Stores" |

Domain and store-listing checks are a to-do, not done here.

## Households, users and roles

Every row in the database belongs to exactly one household, and a user can belong to more than one. That single rule gives you two households now and any number later without a second codebase.

| Concept | Definition | Example |
| --- | --- | --- |
| Household | The tenant. Owns inventory, recipes, plans, lists, rules, budget | Denton (Liam, Sarah); College Station (daughter, son-in-law) |
| Member | A user inside a household, with a role | Liam is owner of Denton; Sarah is editor |
| Role: owner | Everything, plus invite/remove members, delete household, change retailer connections | One per household minimum |
| Role: editor | Add/edit/consume inventory, recipes, plans, lists; send shopping lists | Default for a spouse or partner |
| Role: viewer | Read-only; useful for a guest cook or a kid | Optional |
| Person tag | Items, plates, and portions can be tagged mine / theirs / ours per household | Sarah's lighter plate; Liam's richer plate |

Rules that follow from this:

- You invite a new household by email or a one-time link. The invitee signs in, lands in an empty household, and gets the starter kit (staples list, recipe bank copy, default locations).
- Recipes are copied into a household, not shared by reference. College Station can edit their copy of your gumbo without touching yours. A later "send recipe to household" action copies again.
- A user switching households sees a hard context switch: different inventory, rules, retailers, budget. The active household is pinned in the header at all times so nobody adds milk to the wrong house.
- Nothing crosses households except an explicit recipe send. No aggregate views across households in v1.

## Household rules engine

Rules live per household as structured data, and every suggestion, plan, and list runs through them before it reaches the screen. Denton's rules are the seed template; College Station starts blank and fills in its own.

| Rule type | Shape | Denton seed | How it is enforced |
| --- | --- | --- | --- |
| Allergy / exclusion | ingredient + who + severity + preferred substitute | coconut and cilantro (Sarah); subs: lime juice, scallion greens | Recipes containing the ingredient are hidden by default, or shown with the substitution applied and a visible badge. Shopping lists never add the excluded item |
| Plating / portion | per person: portion size, richness, volume | Liam: smaller, richer plate. Sarah: lighter, higher-volume plate | Cook sessions print two plating notes; freezer blocks can be tagged per person |
| Prep constraint | max standing minutes, seated-prep preferred, equipment list | seated prep, low standing time; Souper Cubes set, crockpot, Ninja Woodfire Pro XL | Suggestions rank recipes with seated-friendly steps higher; cook mode inserts "sit" breaks |
| Diet / nutrition | optional targets: sodium cap, protein floor, calorie band | none set | Recipe cards show the number; plans warn when a week breaks the cap |
| Cuisine preference | liked / tolerated / avoid | Midwestern comfort, Asian, Mexican, Italian, non-seafood Cajun liked; Mediterranean tolerated | Weighting in the suggestion score, never a hard filter |
| Budget | monthly cap, warning threshold | to be set | List totals show against remaining budget; warn at 80%, block nothing |

Editing rules is plain-language: "Sarah can't have coconut, swap lime juice" creates the allergy row with the substitute. The AI partner proposes the structured rule and shows it for a one-tap confirm.

## Inventory

The inventory is one list of items with a location, a tracking mode, and an optional expiry. Tracking mode is the hybrid you chose: staples run on OK / Low / Out, countable goods run on numbers, and you can flip any item between the two.

### Intake methods

| Method | How it works | Confidence shown to user |
| --- | --- | --- |
| Voice | "Add two cans of black beans and a bottle of Dawn." Speech goes to text on device, text goes to the AI parser, parser returns structured rows | Each parsed row shows item, qty, location guess; one tap confirms all, or tap a row to fix |
| Barcode scan | Camera reads UPC; lookup against Open Food Facts for food and a cached product table for everything else; unknown codes create a draft item you name once and it remembers | Match shown with product image when available; "not sure" state for weak matches |
| Receipt photo | Photo of a Kroger / H-E-B / Walmart receipt; OCR plus AI maps line items to inventory items and quantities; learns store abbreviations per household ("KRO CHKN THGH" = chicken thighs) | Mapped list with unmatched lines flagged for a tap-to-assign |
| Manual tap | Starter staples grid (30 items seeded, editable). Tap to cycle status, long-press for count | Immediate |
| Instacart order import | Paste or forward the order confirmation email, or import from the IDP order record if the API exposes it (see Integrations); items land as "arriving" and flip to stocked on delivery | Order summary with a confirm |

### Quantity and status

- Status mode: OK, Low, Out. Low and Out can auto-add to the shopping list (per-item toggle, on by default).
- Count mode: integer or decimal with a unit (cans, lb, oz, bottles, rolls). Each item has a par level; dropping below par sets Low, hitting zero sets Out.
- Both modes record who changed it and when, so "who used the last of the butter" is answerable.

### Locations

Pantry, fridge, freezer, cleaning closet, garage, bathroom, and custom. The freezer has a sub-location, the freezer shelf, with its own card view: container, portions, recipe, person tag, cook date, quality date, where it sits (door, top drawer, chest, left side), and an Eat 1 button that decrements. Containers are whatever the household owns and names in setup: Souper Cubes trays for Denton, and for anyone else quart and gallon zip bags frozen flat, deli quarts, repurposed yogurt and margarine tubs, foil pans, muffin-tin pucks, mason jars, loaf pans, or any silicone tray. Each container type records its capacity, how many the household has, and whether it goes straight to the oven or microwave.

### Expiry

- Any item can carry a use-by date. Barcode and receipt intake prefill a default shelf life by category (fresh herbs 7 days, dairy 14, canned 2 years) which you can override.
- Three horizons drive alerts: expiring in 2 days, expiring this week, expired. The suggestion engine pulls "use it up" recipes from the first two.
- Freezer blocks carry a quality date (default 90 days) rather than a hard expiry.

### Depletion

- Marking a recipe cooked produces a proposed deduction: each ingredient, the amount the recipe calls for, and the item it maps to. You confirm, edit, or skip per line. Status-mode items get a "still OK?" prompt instead of a number.
- Eat 1 on a freezer block decrements that block count only.
- Manual adjustments stay one tap away on every item card.

## Recipes and the suggestion engine

The recipe bank is per household, searchable, editable, and fed from three sources: the 262-recipe import, AI generation on request, and URL import. Every recipe stores ingredients as structured rows (ingredient, amount, unit, optional substitute), which is what makes matching against inventory possible.

### Sources

| Source | Behavior | Notes |
| --- | --- | --- |
| Imported bank | 262 recipes with quantities, steps, freeze/reheat, two-plate notes, seeded into Denton; College Station gets the same bank minus Denton-specific plating notes | One-time migration; see Migration section |
| AI generated | "Make me a crockpot white chicken chili from what I have." Partner drafts a full recipe in the house format, runs it through rules, and saves it as draft until you cook or approve it | Drafts are badged; they never enter suggestions until approved |
| URL import | Paste a link; the app fetches the page, extracts recipe schema (JSON-LD) when present, falls back to AI extraction, and shows a side-by-side for approval | Sites that block fetching get a paste-the-text fallback |
| Souper Cubes directory | Titles and outbound links only, with coconut titles flagged, kept from Neelix | Not stored as full recipes |

### Suggestion modes (all on by default, each a toggle)

1. Make it now: every structured ingredient maps to an item in stock (status OK or count at or above the recipe amount). Pantry assumptions (salt, oil, water) are a per-household "always have" list.
2. Almost there: one or two ingredients missing. The card shows exactly what is missing and a one-tap "add to list" that respects retailer routing.
3. Use it up: recipes that consume items expiring within 7 days, ranked by how much of the expiring item they use.
4. Freezer first: recipes already sitting as cubes, surfaced as "eat tonight" with zero prep.

### Ranking

Score = match completeness (0 to 1) × rule fit (allergy pass, seated-prep bonus) × preference weight (cuisine) + expiry urgency + freshness penalty (cooked in the last 10 days ranks lower). Scores are explainable: tapping "why this" shows the terms. No hidden weighting.

### Filters

Meal type, cuisine, max active minutes, seated-friendly, equipment (crockpot, grill, oven-from-frozen, microwave only), one-pot, no-chop (pre-cut, canned, or frozen only), sheet-pan, person plate, freezer-safe, "missing 0 / 1 / 2 items," and cheapest per serving. Every recipe also carries an effort score built from active minutes, standing minutes, step count, and dishes used; the score is what the daily energy setting on Home filters against.

### Nutrition on every recipe

Every recipe card shows a per-serving nutrition row, and the two-plate system gets two rows when plates differ. Numbers are computed, not typed: each structured ingredient maps to a USDA FoodData Central entry, amounts are summed, and the total is divided by the recipe's yield. AI-generated and URL-imported recipes get the same treatment the moment they are saved.

| Field | Shown as | Notes |
| --- | --- | --- |
| Calories, protein, carbs, fiber, fat, sodium, added sugar | One compact line per plate, bigger in A++ mode | Labeled "estimate"; tapping it shows the per-ingredient breakdown |
| Cost per serving | Beside the nutrition line, from the household price book | Blank when a price is unknown, never guessed |
| Rule flags | A badge when a serving breaks a household diet rule (sodium cap, protein floor) | Weekly plans sum the flags so a week over cap is visible before you shop |
| Ingredient match confidence | A small mark on any ingredient that mapped weakly | One tap to pick the right USDA entry; the fix is remembered household-wide |

Filters gain nutrition ranges (under 600 kcal, over 25 g protein, under 700 mg sodium) and "cheapest per serving."

### Stretch and substitute

Two buttons on every recipe. "Stretch this" adds servings for the least money using what is in stock (rice, beans, potatoes, pasta, frozen vegetables) and recomputes nutrition and cost per serving. "Swap for cheaper" lists substitutions with the price difference from the household price book and the nutrition change. Both pass through allergy rules before they are offered, and an accepted swap is saved as a variant of the recipe, not written over the original.

## Meal planning

One calendar holds two kinds of entries: dinners (and other meals) on specific days, and cook-week batches that produce freezer blocks. Both pull from the same recipe bank and both feed the same shopping list.

### Weekly dinners

- Week view with a slot per meal. Drag a recipe in, or say "put the brisket chili on Thursday."
- Each slot can hold a cooked recipe, a freezer block ("Sarah: broccoli cheddar, 1-cup"), or a free-text note ("leftovers", "out").
- Different dinners for different people on the same night is a first-class case: a slot can hold two entries tagged by person.
- A plan can be auto-filled: "plan five dinners from what we have, two must be freezer nights." The partner proposes, you accept or swap each slot.

Cheap week: a plan mode that fills the open slots under a dollar target you set, favoring stock on hand, freezer blocks, and the lowest cost per serving, and shows the estimated total before you accept.

Bad day: one button on Home. It moves today's cook forward a day, promotes a freezer block or a no-cook meal into tonight, and shifts the rest of the plan without any re-planning from you. The copy never scolds; a skipped cook is a skipped cook.

### Cook-week batches

- A batch is a recipe plus a target yield in the household's own containers (for Denton, 2-cup × 6 and 1-cup × 4 Souper Cubes; for a zip-bag household, six quart bags frozen flat). The app computes ingredient multiples from the recipe's base yield and the container capacity.
- Container math replaces tray math: the planner knows how many of each container the household owns, warns when a day's batches exceed them, and suggests a freeze-then-refill order for reusable trays or a "buy a box of bags" line for disposables.
- Raw dump-kit batches (uncooked crockpot or skillet bags) are a batch type with no cook step, only an assemble step and a cook-from-frozen note.
- A cook-week plan generates a day-by-day timeline (Wed through Mon or whatever you set), with seated breaks inserted per prep rules, printable labels, and a PDF export that matches what you build by hand today.

### Freezer prep for any household

Souper Cubes are one container type, not the model. A new household picks a freezer kit during setup and gets ideas, labels, and tracking that fit what they own.

| Part | What it does |
| --- | --- |
| Freezer kit setup | Choose container types from a list or add your own; enter how many you have. A "cheapest kit" preset is zip bags, a muffin tin, and saved tubs, under $15 |
| Ideas library | Freezer-ready batch ideas tagged by container and cost: flat-frozen soups and sauces in bags, breakfast burritos and sandwiches, muffin-tin egg bites and oatmeal pucks, cookie dough logs, cooked rice and beans in portions, marinated raw meat dump bags, smoothie bags, seasoned taco meat, broth in jars. Each idea is a recipe in the bank with freeze, thaw, and reheat notes per container type |
| Container-aware notes | Every freezer-safe recipe carries reheat instructions for bag, tub, and oven-safe pan separately; thaw-first versus cook-from-frozen is explicit |
| Labels | The app generates label text (recipe, portions, date, person, reheat line) sized for masking tape, a bag's white panel, or a sheet of address labels; print or copy |
| Freezer map | Optional spots (door, drawer, chest left) so a block can be found without digging; the shelf view can group by spot |
| First in, first out | The shelf sorts oldest first by default; the suggestion engine's freezer-first mode pulls the oldest block that fits tonight |
| Quality dates | Default by food type (soups 3 months, cooked meat 3 months, raw marinated meat 6 months, baked goods 2 months), overridable, never a hard expiry |
| Starter plan | A first cook week sized to the kit: three batches, under a dollar target, chosen from the ideas library and what is already in stock |

### Cook mode

- Guided steps from the recipe's own text, large type, wake lock on, vibration cue at timers, voice next/back.
- At the end: how many portions went in, which container, where they sit, who they're for. That writes the freezer shelf and triggers the depletion confirm.

### From plan to list

The plan's ingredient needs minus current stock equals the shopping list. The subtraction is shown line by line ("need 3 lb thighs, have 1 lb, buy 2 lb") so you can trust it or override it.

## Shopping, retailers and budget

There is one shopping list per household, and every line on it carries a destination. Destinations are set by routing rules you control, so paper towels go to Amazon without you thinking about it and chicken thighs go to Instacart.

### Routing rules

| Rule | Example | Default |
| --- | --- | --- |
| Category to retailer | Cleaning and paper goods to Amazon or Walmart; fresh food to Instacart | Food to the household's primary grocery retailer; everything else to the household's primary non-grocery retailer |
| Item override | "Always buy Dawn from Walmart" | None |
| Retailer per household | Denton: Instacart (Kroger); College Station: H-E-B list (see Integrations for what H-E-B allows) | Set during household setup |
| Plain list fallback | Any line can be moved to "in person" and shows up on a printable / shareable text list grouped by store aisle | Always available |

### List behaviors

- Lines merge: a plan needs 2 lb thighs and the pantry flagged thighs Low; you see one line, 2 lb, with both reasons.
- Each line shows a price chip from the household price book and the estimated line total. Unknown prices show as blank, never as a guess.
- Send actions are per destination: "Send 14 items to Instacart", "Copy 3 items for Amazon", "Share H-E-B list". Nothing is sent without a tap; the partner only drafts.
- After a send, lines move to "ordered" with the retailer and date. Delivery or a receipt scan flips them to stocked.
- Known Instacart auto-match quirks at your Kroger are stored per item ("search this as 'boneless skinless chicken thighs value pack'") so the cart lands right the first time.

### Price book

Per household, per retailer. Prices come from receipt scans (highest trust), manual entry, and an optional weekly web check for the household's ZIP (kept from Neelix, 76207 for Denton; College Station sets its own). Every price carries its source and date. A 7-day stale nudge stays.

### Budget

- Monthly cap per household, set in rules. The home screen shows spent, committed (sent but not received), and remaining.
- Spend is logged from sent lists (estimated) and corrected by receipt scans (actual). Both numbers are visible so you can see how far estimates drift.
- Category breakdown: groceries, cleaning, household, pet, pharmacy. A simple bar per month, 12 months back.
- Warn at 80% of cap, show red at 100%. The app never blocks a send over budget; it just tells you.

## AI partner and voice

You should be able to talk to most of the app. The partner is the front door: a persistent mic button and a chat drawer on every screen, backed by one intent parser that turns speech or text into structured actions, shows you what it understood, and waits for a tap before anything that changes data or money.

### What the partner can do

| Intent | Example utterance | Result shown before confirm |
| --- | --- | --- |
| inventory.add | "We got two bags of rice and a 12-pack of paper towels" | Two rows: rice 2 bags (pantry), paper towels 12 rolls (cleaning closet) |
| inventory.set\_status | "We're out of eggs and low on butter" | Eggs Out, butter Low, both queued for the list |
| inventory.consume | "Used a can of tomatoes" | Tomatoes count minus 1 |
| inventory.query | "Do we have any chicken left?" | Answer with quantity, location, expiry; no confirm needed |
| recipe.suggest | "What can I make tonight that's seated-friendly?" | Ranked cards with the why |
| recipe.generate | "Write me a gumbo I can freeze in 1-cup blocks" | Draft recipe, rules applied, save as draft |
| plan.set | "Thursday is freezer night, Sarah gets the broccoli soup" | Slot filled, person-tagged |
| plan.cookweek | "Plan a cook week with four batches under $90" | Proposed batches, tray math, estimated cost |
| list.add / list.route | "Add Dawn, send it to Walmart" | Line with destination |
| list.send | "Send the grocery stuff to Instacart" | Summary of lines and estimated total; Send button |
| rules.edit | "My son-in-law is allergic to shellfish" | Structured allergy row for confirm |
| cook.navigate | "Next step", "start a 20 minute timer", "read that again" | Immediate, no confirm |

### How parsing works

1. Speech to text on device (Web Speech API in the PWA; native STT in the wrapped build). The transcript is shown live so you can see mishearings.
2. The transcript plus a compact context packet (household rules, item names in stock, recipe titles, active screen) goes to an edge function that calls Claude with a strict JSON schema of intents.
3. The parser returns one or more intents with confidence. High confidence on a read-only intent executes immediately. Anything that writes shows a confirm sheet. Low confidence asks one clarifying question, never two.
4. Corrections teach the household: "no, the small cans" updates the item alias table, so next time it maps right.

### Guardrails

- The partner never sends a list, places an order, or deletes anything on voice alone.
- It never invents stock. If an item is unknown, it says so and offers to add it.
- Allergy rules are applied in the parser's system prompt and re-checked in code after the response. Code wins.
- Every partner action is logged with the utterance, the parsed intent, and what was applied, so a wrong change can be undone from the activity feed.
- Offline: voice capture still works, intents queue, and you see "will apply when back online."

## Accessibility

Accessibility is a release gate, not a settings page. Everything Neelix did carries over, and voice becomes the primary input rather than an add-on.

- Text size: A / A+ / A++ toggle in the header, persisted per user. A++ is 1.6× base and reflows every screen without horizontal scroll.
- Touch targets: minimum 48 × 48 px everywhere; primary actions on cards (Eat 1, Cook 1, Low, Out) are 64 px tall.
- Voice: mic on every screen, hands-free wake in cook mode ("QM, next step"). All voice features have an equivalent tap path.
- Cook mode: screen wake lock, vibration on timer end, high-contrast step view, one step per screen, read-aloud option using the device's speech synthesis.
- Seated prep: recipes carry an estimated standing-minutes figure; cook mode inserts "sit here" breaks based on the household's max-standing rule.
- Screen readers: semantic landmarks, labeled controls, live regions for voice transcript and confirm sheets. Tested with VoiceOver and TalkBack before each release.
- Color is never the only signal: status chips carry text (OK / Low / Out) and an icon.
- Reduced motion respected; no animation is load-bearing.
- Low-energy mode: a "just the essentials" home screen with three big buttons (What can I make, Add to pantry, Shopping list) for bad days.

### Interaction rules

These apply on every screen and are checked in review before a release.

- Undo, not confirm: status taps, Eat 1, Cook 1, and add-to-list happen immediately and show a 5-second undo bar. Confirm sheets are reserved for sending money and deleting data.
- Thumb zone: primary actions sit in the bottom third of the screen; no action is swipe-only; every gesture has a long-press or button equivalent; a left/right-handed toggle mirrors the layout.
- Read-aloud and voice confirm: "read my pantry," "read the list," and "what's expiring" are spoken back through device speech; confirm sheets accept a spoken yes or no.
- Energy first: the daily energy setting filters suggestions, hides heavy recipes, and shortens lists; it is one tap to change and resets each morning.
- Sensory choices: high-contrast theme, a dyslexia-friendly font option, dark mode, no flashing content, reduced motion honored; cook timers flash the screen and vibrate as well as sound.
- Plain language: copy at about a sixth-grade reading level, one idea per sentence, no jargon in labels; errors say what to do next.
- No guilt: expired food reads "compost it," an over-budget week reads "over by $12," a skipped cook is not mentioned again. Nothing in the app keeps score against the person using it.

## Notifications

Push notifications go through Web Push in the PWA and native push once wrapped. Every notification type is a per-user toggle, and a household owner can set quiet hours.

| Trigger | Default timing | Who gets it |
| --- | --- | --- |
| Item hit Low or Out | Batched, once a day at 5 pm | Editors and owner |
| Expiring in 2 days | Morning, 8 am | Editors and owner |
| Expired | Morning, once | Owner |
| Weekly shop reminder | Household-chosen day and time | Editors and owner |
| Cook-week prep day | Evening before each cook day | Whoever is tagged as cook |
| Price book stale (7+ days) | Weekly, with the shop reminder | Owner |
| Budget at 80% / 100% | On the event | Owner |
| List sent by another member | Immediate | Everyone except the sender |

Notifications deep-link to the screen that resolves them. Tapping "3 items expiring" opens the use-it-up suggestions, not a generic inbox.

## Screens and navigation

Five tabs on the bottom bar, a household switcher and text-size toggle in the top bar, and the mic floating above both. Dark opaque header and footer with content scrolling behind them, as you asked for in Neelix.

| Screen | Purpose | Key elements |
| --- | --- | --- |
| Home | Today at a glance | Energy today selector (a little / some / plenty) at the top, Bad day button, tonight's pick with cost per serving, expiring soon, low/out count, budget remaining; "a little" collapses the screen to three big buttons |
| Pantry | Inventory by location | Location chips, search, staples grid (tap-to-cycle), item cards with count stepper, scan and receipt buttons, Souper Cubes shelf as a sub-view |
| Cook | Recipes, suggestions, planning | Suggestion feed with mode toggles, recipe bank search, week calendar, cook-week builder, cook mode (full screen) |
| Shop | The list and the money | List grouped by destination, send buttons, price chips, ordered section, budget bar, price book editor |
| House | Settings for this household | Members and roles, rules editor, retailers and routing, locations, notifications, export |

Secondary screens: item detail (history, aliases, par level, expiry), recipe detail (ingredients mapped to stock, two-plate notes, scale, freeze/reheat), batch detail (tray math, yield), activity feed (every change with undo), partner chat drawer (full history, re-run an intent).

First-run flow for a new household: name it, add members, pick primary grocery and non-grocery retailers, set allergies, choose a starter staples list, optionally import the recipe bank. Five screens, under three minutes, all voice-answerable.

## Data model

Postgres on Supabase. Every tenant table carries `household_id`, and row-level security (RLS) allows a row only when the caller is a member of that household with the right role. That one policy pattern, applied to every table, is the whole multi-household security model.

| Table | Key columns | Notes |
| --- | --- | --- |
| households | id, name, timezone, zip, currency, budget\_monthly\_cents, created\_by | One row per tenant |
| memberships | household\_id, user\_id, role (owner / editor / viewer), person\_label | A user can have many |
| persons | household\_id, name, plate\_profile jsonb | "Liam", "Sarah"; plating and portion rules hang here |
| rules | household\_id, type, payload jsonb, applies\_to\_person\_id | allergy, prep, diet, cuisine, budget |
| locations | household\_id, name, kind (pantry / fridge / freezer / cleaning / garage / custom), parent\_id | Souper Cubes shelf is a child of freezer |
| items | household\_id, name, category, location\_id, track\_mode (status / count), status, qty numeric, unit, par numeric, use\_by date, barcode, image\_url, always\_have bool | The inventory |
| item\_aliases | item\_id, alias, source (voice / receipt / instacart) | What the parser learns |
| item\_events | item\_id, user\_id, delta, before, after, reason, source, recipe\_id, created\_at | Full history; powers undo and "who used it" |
| freezer\_blocks | household\_id, recipe\_id, container\_id, portions, count, person\_id, cooked\_on, quality\_until, freezer\_spot, label\_text; containers table: household\_id, name, kind (tray / bag / tub / pan / jar / muffin-tin), capacity\_ml, count\_owned, disposable bool, oven\_safe bool, microwave\_safe bool | The shelf |
| recipes | household\_id, title, cuisine, meal\_type, base\_yield, yield\_unit, steps jsonb, freeze\_notes, reheat\_notes, plate\_notes jsonb, equipment text\[\], standing\_minutes, nutrition jsonb (per plate, estimated), effort jsonb (active, standing, steps, dishes), cost\_per\_serving\_cents, source (bank / ai / url), source\_url, status (draft / approved) | Per household copy |
| recipe\_ingredients | recipe\_id, ingredient\_name, amount, unit, item\_match\_hint, optional bool | Structured for matching |
| plan\_entries | household\_id, date, slot, kind (dinner / meal / batch / note), recipe\_id, freezer\_block\_id, person\_id, note | The calendar |
| batches | household\_id, plan\_entry\_id, recipe\_id, tray\_plan jsonb, status, cooked\_at | Cook-week yield and tray math |
| retailers | household\_id, name, kind (instacart / heb / walmart / amazon / in\_person), config jsonb, is\_primary\_grocery, is\_primary\_other | Per household |
| routing\_rules | household\_id, match\_kind (category / item), match\_value, retailer\_id |  |
| list\_lines | household\_id, item\_id, qty, unit, reasons jsonb, retailer\_id, status (open / ordered / received), order\_ref, sent\_at | One list |
| prices | household\_id, item\_id, retailer\_id, price\_cents, source (receipt / manual / web), observed\_on | Price book |
| spend | household\_id, retailer\_id, amount\_cents, kind (estimated / actual), category, occurred\_on, list\_send\_id | Budget |
| partner\_turns | household\_id, user\_id, utterance, transcript\_confidence, intents jsonb, applied jsonb, created\_at | Audit and undo |
| notification\_prefs | user\_id, household\_id, type, enabled, quiet\_from, quiet\_to |  |

RLS policy, in plain words: a user can read a row if a membership row joins them to its household; can insert or update if that membership is owner or editor; can delete households or memberships only as owner. Supabase Auth supplies the user id; no application code decides access.

Offline: the PWA keeps a local mirror of the household's tables in IndexedDB and a write queue. Writes apply locally first, sync when online, and conflicts resolve last-write-wins on the row with the event log keeping both sides.

## Architecture and stack decision

Decision: Supabase for data, auth, storage, realtime, and edge functions; a React PWA client with Vite; Capacitor for the later native wrap. Here is why that beats the alternatives for this app.

| Option | Fit for this app | Why not |
| --- | --- | --- |
| Local-only (Neelix today) | Zero cost, fully offline | No sync between your phone and Sarah's, no second household, no push, data lost with the device |
| Firebase (Firestore) | Realtime and auth are good; offline cache is mature | Document model fights the inventory math (joins between recipes, items, plans); security rules are harder to reason about than SQL RLS; you don't have it connected |
| Supabase | Postgres joins for suggestions and list subtraction; RLS gives multi-tenant isolation in one policy; realtime channels for live sync; Storage for receipt photos; Edge Functions for the Claude parser; generous free tier; already connected to your account | Offline needs a client-side mirror (IndexedDB) because Supabase has no built-in offline cache; this is a known, bounded piece of work |
| Custom Node + Postgres | Full control | You would be writing auth, realtime, and storage that Supabase already ships |

PWA now, native later: the PWA covers Android and iOS home-screen installs, camera for barcodes and receipts, Web Speech for voice, Web Push for notifications. The wrap in Capacitor comes when you want reliable background push on iOS, a native barcode scanner, and App Store presence for your daughter's household.

&#91;embedded content: architecture · 2 clients, 4 Supabase services, 4 outside systems\]

Both clients use the same Supabase API; the edge functions are the only thing holding API keys, and every row they touch still passes through row-level security as the signed-in user.

## Hosting cost and exit plan

Decision: the pantry stays on Supabase's free tier, Riker gets its own Hetzner VPS, and the two share nothing. Expected hosting cost is $0; the recurring cost is Claude API usage for parsing and receipts, which follows the app to any host.

| Item | Plan |
| --- | --- |
| Inactivity pause | Free projects pause after 7 idle days. Daily use by either household prevents it; a scheduled ping (GitHub Actions cron now, Riker later) hits a lightweight endpoint once a day as insurance |
| File storage | Downscale receipt photos to about 1 MB before upload and delete them once parsed; keep recipe images small |
| Edge function cap | Confirm the free daily invocation limit before Phase 3; design the parser so one utterance is one call, and batch receipt lines into one call per receipt |
| Trigger to move | A $25 Pro bill, or a hard cap hit that daily use cannot avoid |
| Exit path | PocketBase on the Riker VPS. Schema lives in plain SQL migrations with no Supabase-only features in the tables, so it ports table for table; per-collection rules replace RLS, PocketBase realtime replaces channels, local files replace Storage. Budget one afternoon |
| Build rule | Nothing in the data layer depends on Supabase beyond auth and RLS; retailer and Claude calls sit behind one adapter interface so they run anywhere |

## Riker integration (later)

Decision: the pantry exposes an API that Riker can call as a scoped member; Riker never gets direct database access. The hooks are cheap to leave in place from Phase 1 and cost nothing until Riker exists.

| Hook | How it works | Why this shape |
| --- | --- | --- |
| Riker as a member | Riker gets its own Supabase user, invited to the Denton household as editor | RLS applies to Riker like anyone else; it can never see College Station's data |
| Pantry MCP server | Read and write tools (inventory query and set, list add, plan get, recipe suggest) that wrap the same edge functions the app uses | One parser, one rules engine; Riker calls them as tools instead of re-implementing logic |
| Confirm gates stay | Riker can draft a list, propose a plan, or flag low stock; it cannot send to Instacart or delete anything without your tap in the app | Matches Riker's own approval gates and the pantry's guardrails |
| Events out | A Realtime subscription or webhook for low stock, expiring items, and list sent, so Riker can fold them into a morning briefing | Pantry pushes, Riker listens; no polling |
| Voice routing | When Riker is live, decide whether the app's mic routes through Riker or Riker routes pantry intents to the app's parser; the intent schema is shared either way | Avoids two parsers drifting apart |
| Model routing | Pantry writes always run on Claude; nothing in Riker's cheaper-model lane can change inventory, lists, or rules | Mistakes in the pantry cost money at the store |

Timing: the member and MCP hooks slot in after Phase 2, once College Station is live, and before the Phase 3 voice work so the two voice paths are designed together.

## External integrations and what is uncertain

Cupcake: the rows marked "verify" are from memory and need a check against current docs before the build; retailer programs change their terms often. Rows marked "solid" are stable platform features.

| Integration | Used for | Approach | Confidence |
| --- | --- | --- | --- |
| Claude API (via Supabase Edge Function) | Intent parsing, receipt line mapping, recipe generation, URL recipe extraction fallback | Server-side only; key never ships to the client; strict JSON schema responses | Solid |
| Instacart Developer Platform | Build a shoppable cart link from a list | The products-link endpoint creates a page with the items pre-matched to the household's store; you tap through and check out in Instacart. Keep the per-item search-term overrides you already use at Kroger | Verify: endpoint name and whether it exposes order history for the import feature |
| Instacart MCP connector | Same cart flow inside Claude-driven sessions | Already working in Neelix; keep as an alternate path | Solid for current behavior |
| H-E-B | College Station's grocery | No public ordering API that I can confirm. Plan: a shareable H-E-B-ordered text list, plus a "copy item names" action for pasting into the H-E-B app search | Verify: whether H-E-B offers any partner API today |
| Walmart | Cleaning, paper goods, bulk | Affiliate add-to-cart links can prefill a cart from item IDs; otherwise a copyable list | Verify: current affiliate program terms and whether add-to-cart URLs still work |
| Amazon | Cleaning, household, pet | Add-to-cart URL form with ASIN and quantity; needs an ASIN per item, learned once per household | Verify: URL form still honored; ASIN lookup source |
| Open Food Facts | Barcode to product name, image, category | Free REST lookup; cache results per household | Solid |
| Barcode scanning | Camera intake | BarcodeDetector API where available, ZXing-js fallback | Solid |
| Receipt OCR | Receipt photo intake | Send the image to Claude vision through the edge function; no separate OCR service | Solid |
| Web Speech API | Voice capture in the PWA | Chrome on Android is reliable; iOS Safari support is partial and improves in the native wrap | Verify: current iOS Safari behavior |
| Web Push | Notifications | Standard on Android; iOS requires the PWA to be added to the home screen | Solid |
| schema.org Recipe JSON-LD | URL import | Most recipe sites embed it; fall back to Claude extraction when absent | Solid |
| Souper Cubes site | Directory links | Titles and outbound links only, as in Neelix | Solid |

## Migration from Neelix's Kitchen

Nothing you built is thrown away. Neelix stores everything under the `freezer-partner-state-v1` localStorage key, so migration is an import screen in the new app that reads an exported JSON file from Neelix and maps it table by table.

| Neelix data | Lands in | Transform |
| --- | --- | --- |
| 262 recipes with quantities, steps, freeze/reheat, two-plate notes | recipes + recipe\_ingredients | Ingredient strings parsed to structured rows by Claude in a batch job; anything it cannot parse is flagged for a quick manual fix |
| Pantry tracker (OK / Low / Out, 30 staples) | items in status mode | Direct |
| Souper Cubes freezer inventory | freezer\_blocks | Direct, tray sizes mapped |
| Shopping list | list\_lines | Direct; destination set to Instacart |
| Denton price book (76207) | prices | Source set to "web", dates kept |
| Kroger auto-match quirks | item\_aliases with source "instacart" | Direct |
| Cook-week PDFs | Not imported | Regenerated from the new planner once a plan is rebuilt |

Order of operations: export from Neelix, create the Denton household, run the import, review the flagged ingredient rows (expect a few dozen), and only then retire Neelix. Keep its artifact link for a month in case something was missed.

## Three visual directions

All three keep the dark opaque header and footer with content scrolling behind, 48 px targets, and the A / A+ / A++ scale. They differ in mood and in how they handle the non-food half of the house.

|  | 1. Ship's Stores | 2. Farmhouse Ledger | 3. Clean Slate |
| --- | --- | --- | --- |
| Mood | Quiet starship quartermaster's office: ordered, calm, slightly technical | Hand-kept household ledger: warm, paper, pencil marks | Modern utility: bright, flat, fast, no metaphor |
| Palette | Deep navy bars, slate body, signal amber for Low, coral for Out, cool green for OK | Oatmeal body, forest green bars, rust for attention, moss for OK | White body, charcoal bars, one accent per tab (green pantry, orange cook, blue shop) |
| Type | Display: IBM Plex Sans Condensed. Body: Inter | Display: Fraunces. Body: Source Sans 3 | Display and body: Inter, weight does the work |
| Cards | Rounded rectangles with a thin left status bar; freezer shelf as labeled bins | Index cards with a ruled top line; freezer shelf as masking-tape tray labels (kept from Neelix v2) | Flat tiles, status as a solid chip, freezer shelf as a grid |
| Cleaning and household items | Feel native; the metaphor is "stores", not "kitchen" | Slightly out of place under a kitchen ledger; handled with a separate ledger tab color | Fully neutral |
| Low-energy mode | Three large amber buttons on a dark field | Three large cards on oatmeal | Three full-width tiles |
| Best if | You want it to feel like Riker's sibling and like one app for the whole house | You loved Herbarium and want its warmth with less preciousness | Your daughter's household wants something that looks like any good app and nothing more |

My lean is direction 1 for the multi-household, whole-house scope, with direction 2's tray labels borrowed for the freezer shelf. Pick one, mix, or ask for mockups of any of them.

## Phased roadmap

Four phases, each shippable on its own. Phase 1 replaces Neelix for Denton; Phase 2 brings in College Station; Phase 3 is the full voice and retailer layer; Phase 4 is the native wrap. Dates are placeholders until you confirm how many hours a week this gets.

&#91;embedded content: roadmap · 4 phases, one exit gate each\]

The diamond on each band is its exit gate; a phase does not start until the previous gate is met.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 1. Foundation | Supabase project, schema, RLS, auth, Denton household, Neelix import, pantry (status + count), recipe bank, make-it-now and almost-there suggestions, single shopping list, Instacart send, price book, A / A+ / A++, cook mode | Liam and Sarah run a full cook week in the new app and Neelix is retired |
| 2. Households | Invites and roles, household switcher, College Station setup, rules editor, H-E-B list, Amazon and Walmart routing, budget tracking, expiry alerts, use-it-up and freezer-first modes | Your daughter's household plans and shops a week without help from you |
| 3. Voice and intake | Partner on every screen, intent parser with confirm sheets, barcode scan, receipt photo, Instacart order import, URL recipe import, AI recipe generation, activity feed with undo, push notifications | 80% of your own inventory changes in a week come from voice or scan rather than taps |
| 4. Native and polish | Capacitor wrap, native STT and barcode, background push on iOS, store listings, offline sync hardening, low-energy mode polish, screen-reader audit | App Store and Play listings live; one month with no sync-loss reports |

## Risks, open questions, success criteria

### Risks

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| Retailer cart APIs change or are unavailable (H-E-B, Walmart, Amazon) | High | Shareable per-store text list is always present; retailers are adapters behind one interface, so losing one loses nothing else |
| Voice parsing misreads items with similar names | Medium | Confirm sheet on every write; alias learning; "undo last" from the activity feed |
| Ingredient parsing of the 262 recipes produces messy rows | Medium | Batch job flags low-confidence rows; expect a weekend of cleanup |
| Offline sync conflicts between two phones | Medium | Last-write-wins per row plus a full event log; conflicts surface in the activity feed rather than silently losing data |
| iOS PWA limits on voice and push | Medium | Phase 4 native wrap; until then, iOS users add to home screen and use tap paths |
| Scope creep from two households with different wants | High | Rules are data, not features; new household needs go into the rules engine or wait for a phase review |

### Open questions

- [ ] Which name: Quartermaster, Larder, Stores, or something else?
- [ ] Which visual direction, or which mix?
- [ ] Does College Station want the full recipe bank or a trimmed starter set?
- [ ] Monthly budget figures for each household?
- [ ] Hours per week available to build, so the roadmap gets dates?
- [ ] Should Sarah and your daughter be invited to comment on this spec before the build starts?

### Success criteria (90 days after Phase 2)

- Denton: every weekly shop originates in the app; fewer than 2 forgotten items per week.
- Both households: inventory is trusted enough that "what can I make" is used at least 3 nights a week.
- Food waste: expired-item count per month drops by half against the first month's baseline.
- Budget: actual spend lands within 10% of the app's estimate for three consecutive months.
- Accessibility: Liam can run a full cook week from a chair using voice and cook mode without touching the phone more than 10 times.
