# Setup guide

Everything the owner does, in order, to take Quartermaster from "runs on my laptop" to "both households use it on their phones". Each step says what it unlocks, so you can stop at any line and still have a working app.

The app runs three ways:

| Mode | Needs | Who can use it |
| --- | --- | --- |
| Local, on a computer | `npm run dev` | Phones on the same Wi-Fi, no account, demo data |
| Hosted, local mode | GitHub Pages (step 1) | Anyone with the link, no account, data stays on each phone |
| Hosted, synced | GitHub Pages + Supabase (steps 2 to 5) | Both households, sign in by email, phones stay in sync |

## 1. GitHub Pages (hosting, free)

The `pages` workflow builds the app and publishes it at `https://kael-itspronouncedkyle.github.io/Eat-What/` on every push to `main`.

1. On GitHub open the repository, then Settings, Pages.
2. Under "Build and deployment", set Source to **GitHub Actions**.
3. Open the Actions tab, pick the `pages` workflow, and press "Run workflow" once (later pushes to `main` run it on their own).
4. Open the address above on your phone. Add it to the home screen (iPhone: Share, Add to Home Screen; Android: browser menu, Install app).

Until Supabase is connected the hosted app runs in local mode: each phone has its own copy of the demo data and nothing syncs. That is enough to test every screen.

## 2. Supabase project (accounts and sync)

Decision first: a new project in the existing Pro org (no idle pause, about $10 a month), or a free org under Liam's own account ($0, pauses after 7 idle days; the `keepalive` workflow in this repo pings it daily so it does not). The build assumes the free org; nothing changes for Pro except skipping the keep-alive secrets.

1. At supabase.com create the project. Region: us-east-1 or us-east-2. Save the database password.
2. Apply the migrations in order. Either paste each file into the SQL editor and run it, or install the CLI and run:

   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref <your project ref>
   supabase db push
   ```

   The files, in order: `supabase/migrations/0001_init.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_realtime.sql`, `0005_allergy_aliases.sql`, `0006_container_cavities.sql`, `0007_apply_ops.sql`, `0008_notify_queue.sql`.
3. Authentication, Providers, Email: turn **Enable email OTP** on and **Allow new users to sign up** off. Under Authentication, URL configuration, set Site URL to `https://kael-itspronouncedkyle.github.io/Eat-What/` and add it to Redirect URLs.
4. Authentication, Users: "Invite user" with your own email. Then do the same for Sarah and for the College Station owner (the app's invite links need them to have signed in once, or you can invite everyone here).
5. Storage: create a **private** bucket named `receipts`. Then in the SQL editor run:

   ```sql
   create policy "members upload receipts" on storage.objects
     for insert to authenticated
     with check (bucket_id = 'receipts' and app.has_role((storage.foldername(name))[1]::uuid, array['owner','editor','agent']));
   create policy "members read receipts" on storage.objects
     for select to authenticated
     using (bucket_id = 'receipts' and app.has_role((storage.foldername(name))[1]::uuid, array['owner','editor','viewer','agent']));
   ```

6. Project Settings, API: copy the **Project URL**, the **publishable (anon) key**, and the **service role key**. The service role key is a secret; it never goes in the app.

## 3. Connect the hosted app to Supabase

On GitHub: Settings, Secrets and variables, Actions.

Variables tab (these are public, they ship in the app):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key |
| `VITE_VAPID_PUBLIC_KEY` | from step 5, leave empty until then |

Secrets tab (used only by the scheduled workflows):

| Secret | Value | Used by |
| --- | --- | --- |
| `SUPABASE_URL` | the Project URL | keepalive, price-check, notify |
| `SUPABASE_ANON_KEY` | the publishable key | keepalive |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role key | price-check, notify |

Re-run the `pages` workflow. The app now shows a sign-in screen. Sign in with the code it emails you; the first-run screen creates the Denton household. In House, Members, "Invite" makes a link for Sarah; she opens it on her phone and signs in with her own email.

For College Station: Sarah or you tap House, "Start another household", name it College Station, ZIP 77840, then invite its owner. Or let the College Station owner sign in first and create it from their own first-run screen.

To run against Supabase on a computer instead, copy `.env.example` to `.env` and fill the same three `VITE_` values.

## 4. Edge functions (links, prices, intake)

Each needs the CLI from step 2. Deploy all of them once:

```bash
supabase functions deploy instacart-link price-check notify parse-intent url-import recipe-generate receipt-parse
```

Then set secrets for the ones you want on. Everything degrades cleanly without its secret: the Instacart send copies a list and opens a search, the price check says it is not configured, the partner uses its on-phone rules, and the scan screen takes typed receipt lines.

| Secret | Gets you | Where to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | weekly price check, partner parsing on the server, recipe import from a link, recipe generation, receipt photos | console.anthropic.com, API keys |
| `INSTACART_API_KEY` and `INSTACART_ENV=development` | real Instacart shopping-list links instead of a search link | Instacart Developer Platform, apply for a development key; set `INSTACART_ENV=production` once approved |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push notifications | step 5 |

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set INSTACART_API_KEY=... INSTACART_ENV=development
```

Optional caps and model choice are listed in `supabase/functions/README.md`. Expected AI cost at two households: $10 to $20 a month.

Turn the weekly price check on per household under House, Price check (owner only). It runs Mondays from the `price-check` workflow and on demand from "Check prices now".

## 5. Push notifications

1. On any computer: `npx web-push generate-vapid-keys`. It prints a public and a private key.
2. `supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:you@example.com`
3. On GitHub set the `VITE_VAPID_PUBLIC_KEY` variable to the public key and re-run the `pages` workflow.
4. On each phone: House, Notifications, turn on "Notifications on this phone". iPhone needs the app added to the home screen first (iOS only allows push for installed web apps).

The hourly `notify` workflow sends what is due: low/out at 5 pm, expiring at 8 am, the weekly shop and stale-price reminders, budget lines, and "list sent" to everyone but the sender. Quiet hours are set under House, Notifications.

## 6. Bring over Neelix

In Neelix's Kitchen open the browser console and run `localStorage.getItem('freezer-partner-state-v1')`. Save the output as a `.json` file, then in Quartermaster open House, Import from Neelix, and pick the file. Rows the importer could not match are flagged for a quick fix. Keep Neelix until a full cook week has gone through the new app.

## 7. Facts to confirm

The seed invented these; correct them in the app under House:

- College Station members "Em" (owner) and "Partner" (editor), a severe shellfish allergy for Partner, a $600 monthly budget, H-E-B as the food default, Amazon for everything else.
- Denton's Souper Cubes count: 2 trays of 2-cup, 2 of 1-cup, 1 of 1/2-cup.
- Monthly budgets for both households (House, Edit).
- Starter prices are estimates. A receipt scan, a typed price, or the weekly check replaces them.

## Checks that everything works

- Sign in on two phones in the same household; change an item's status on one and watch it change on the other within a few seconds.
- Turn Wi-Fi off on one phone, tap Low on three items, turn it back on; the header chip counts down to zero and the other phone catches up.
- Send a list to Instacart and mark it arrived; the budget bar moves.
- House, Price check, "Check prices now" (needs `ANTHROPIC_API_KEY`); the price book shows rows marked "web check" with a source link.
- Pantry, Scan a barcode and a receipt photo.
- Trigger a notification: set a staple to Out before 5 pm and wait for the hourly run, or press "Run workflow" on `notify`.
