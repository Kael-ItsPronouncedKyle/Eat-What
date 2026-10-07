# Edge functions

| Function | Principal | Secrets | Status |
| --- | --- | --- | --- |
| `instacart-link` | As the signed-in user (verifies the JWT first) | `INSTACART_API_KEY`, `INSTACART_ENV` (`development` or `production`) | Ready; needs an Instacart Developer Platform key |

Deploy with `supabase functions deploy instacart-link` after `supabase link`. The app calls it from the Shop send sheet and falls back to a search link plus a copied list when the function is absent or unconfigured.

Phase 3 functions (parse-intent, receipt-parse, url-import, recipe-generate) are not written yet. Rules for them, from the spec review: run as the user, build the context packet from the database, strict JSON output, per-household daily caps written to `ai_usage`, no tools, and page text treated as data.
