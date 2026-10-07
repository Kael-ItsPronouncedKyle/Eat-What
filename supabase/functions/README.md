# Edge functions

| Function | Principal | Secrets | Status |
| --- | --- | --- | --- |
| `instacart-link` | As the signed-in user (verifies the JWT first) | `INSTACART_API_KEY`, `INSTACART_ENV` (`development` or `production`) | Ready; needs an Instacart Developer Platform key |
| `price-check` | Service role on the weekly schedule (`.github/workflows/price-check.yml`); as a signed-in owner or editor for "Check prices now" | `ANTHROPIC_API_KEY`, optional `PRICE_CHECK_MODEL` (default `claude-opus-5-5`), `PRICE_CHECK_MAX_CALLS_PER_DAY` (default 12) | Ready; needs a Claude key. Writes `prices` rows with source `web` and the page URL in the note, logs every call to `ai_usage`. `quotes.ts` is a copy of `src/integrations/prices/quotes.ts`, which carries the unit tests; keep them identical. |

| `notify` | Service role on the hourly schedule (`.github/workflows/notify.yml`); as a signed-in owner or editor with `{ householdId }` for "send what is due now" | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` address or https URL) | Ready; needs a VAPID pair. Per household it works out the local time, computes what is due with `notifications.ts` (a copy of `src/domain/notifications.ts`, which carries the unit tests; keep them identical), records each dedupe key in `notification_queue`, drains the queue (the `list_sent` rows come from a trigger on `list_sends`, migration `0008_notify_queue.sql`), and sends Web Push with the `web-push` package to every phone in `push_subscriptions` whose owner has that kind on. Quiet hours hold the queue. A phone that answers 404 or 410 is deleted. Idempotent per hour. Not built: `cook_week_prep` (needs the cook-week cook tag). |

Generate the VAPID pair once with `npx web-push generate-vapid-keys`; put the public key in the app's `.env` as `VITE_VAPID_PUBLIC_KEY` and both halves plus `VAPID_SUBJECT` in the function secrets (`supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com`). Changing the pair later invalidates every stored subscription; people flip the phone toggle off and on.

Deploy with `supabase functions deploy instacart-link price-check notify` after `supabase link`. The app calls it from the Shop send sheet and falls back to a search link plus a copied list when the function is absent or unconfigured.

Phase 3 functions (parse-intent, receipt-parse, url-import, recipe-generate) are not written yet. Rules for them, from the spec review: run as the user, build the context packet from the database, strict JSON output, per-household daily caps written to `ai_usage`, no tools, and page text treated as data.
