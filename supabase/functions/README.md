# Edge functions

| Function | Principal | Secrets | Status |
| --- | --- | --- | --- |
| `instacart-link` | As the signed-in user (verifies the JWT first) | `INSTACART_API_KEY`, `INSTACART_ENV` (`development` or `production`) | Ready; needs an Instacart Developer Platform key |
| `price-check` | Service role on the weekly schedule (`.github/workflows/price-check.yml`); as a signed-in owner or editor for "Check prices now" | `ANTHROPIC_API_KEY`, optional `PRICE_CHECK_MODEL` (default `claude-opus-5-5`), `PRICE_CHECK_MAX_CALLS_PER_DAY` (default 12) | Ready; needs a Claude key. Writes `prices` rows with source `web` and the page URL in the note, logs every call to `ai_usage`. `quotes.ts` is a copy of `src/integrations/prices/quotes.ts`, which carries the unit tests; keep them identical. |

Deploy with `supabase functions deploy instacart-link price-check` after `supabase link`. The app calls it from the Shop send sheet and falls back to a search link plus a copied list when the function is absent or unconfigured.

Phase 3 functions (parse-intent, receipt-parse, url-import, recipe-generate) are not written yet. Rules for them, from the spec review: run as the user, build the context packet from the database, strict JSON output, per-household daily caps written to `ai_usage`, no tools, and page text treated as data.
