# looot-seo

A self-hosted SEO workspace that shows the price of every refresh before it runs: rank tracking, keyword research, SERP snapshots, competitors and backlinks on Next.js, Supabase and one [looot](https://looot.ai) token.

![looot-seo: the project overview and the quote dialog](docs/hero.png)

## What it replaces

The rank tracker, keyword tool and competitor view of a paid SEO suite, for one person or a small agency. You own the database, and you pay per call instead of per seat.

It is close in spirit to [OpenSEO](https://github.com/every-app/open-seo). OpenSEO needs a DataForSEO account. looot-seo needs one looot token, and each feature is pinned to a catalog operation with its price on the button, so a rank check runs on Serper at $0.001 a page.

Want cron and a terminal instead of a web app? Use [looot-seo-monitor](https://github.com/loootai/looot-seo-monitor).

The one rule the app is built around: quote, confirm, run. Every paid button opens a quote with the call count and the unit price. You confirm a cap. The server stops the run when the next call would pass it.

## What you need

- Node 20.9 or newer (Next.js 16 requires it; `package.json` has no `engines` field and there is no `.nvmrc`). The tests, lint, typecheck, build and demo were run on Node 24.
- For the demo, nothing else. No account, no token.
- For the real app, a [looot](https://looot.ai) account and an agent token, plus a free Supabase project for sign-in and the database.

Create the looot account at https://looot.ai/auth/sign-up. Then get a token one of two ways.

- Run `npm i -g looot`, then `looot login`. It opens a browser to approve.
- Or in the looot web app go to Settings, "Agent tokens", and create one. See https://docs.looot.ai/get-started/sign-in.

With no browser (CI, a server), create the token in Settings > Agent tokens and run `export LOOOT_TOKEN=...`. The token needs the scopes `runs.execute`, `catalog.read`, `runs.read` and `usage.read`. A paid run needs a funded balance. The minimum top-up is $5, and signing up adds no credit. See https://docs.looot.ai/money.

## Try it in one minute

```bash
git clone https://github.com/loootai/looot-seo && cd looot-seo && npm install --ignore-scripts && npm run demo
```

Open http://localhost:3000. Demo mode needs no Supabase project and no token. It runs on seeded data for three made-up businesses, labelled "Demo data" on every screen. "Simulate run" finishes in about 3 seconds, charges nothing and sends no request to looot. Edits live in memory and reset when the server restarts.

Add `?state=empty`, `?state=loading` or `?state=error` to a list screen in demo mode to see that state.

If port 3000 is busy, run `NEXT_PUBLIC_DEMO=1 node_modules/.bin/next dev -p 4101` instead. Next.js may write an `AGENTS.md` and a `CLAUDE.md` into the folder on first start. They are not part of this repo.

## Run it with your own data

This repo is a web app. It has no command-line interface and no `--dry-run` flag. The quote dialog is the dry run. Every paid button opens a quote with the call count and the unit price, and nothing is sent to looot until you confirm a cap.

You need the steps in [Run the web app with sign-in](#run-the-web-app-with-sign-in) first, because the real app keeps projects in Supabase. Then:

```bash
cp .env.example .env.local
npm run dev
```

`npm run dev` serves http://localhost:3000. The code reads these variables.

| Variable | Needed | What it does | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL for sign-in and every query. Reaches the browser | Supabase, Project Settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key. The app uses no service-role key. Reaches the browser | Supabase, Project Settings, API |
| `LOOOT_TOKEN` | for paid runs | looot agent token. Server only (`lib/looot/server.ts` imports `server-only`). Without it, a run answers `missing_token` | Settings > Agent tokens in looot |
| `LOOOT_API_URL` | no | Base URL of the looot API. Defaults to `https://api.looot.ai` | Leave unset |
| `LOOOT_SEO_ALLOWED_EMAILS` | yes, one of the two | Comma separated emails that may use the workspace. Exact match, ignoring case. Server only | Your own address |
| `LOOOT_SEO_ALLOWED_DOMAINS` | yes, one of the two | Comma separated domains. Matches the part after the `@` exactly, so `corp.io` does not match `sub.corp.io` | Your company domain |
| `LOOOT_SEO_MAX_RUN_USD` | no | Ceiling for one run in dollars. A run whose cap is higher is refused with 422 `cap_above_limit`. Unset means the quote total is the only limit | Your budget |
| `NEXT_PUBLIC_DEMO` | no | `1` runs on seeded data with no Supabase and no token | Set by `npm run demo` |

Then, in the app:

1. Press New project. Fill in the domain, name, country, language and first keywords. The repo ships `examples/keywords.example.txt` with four keywords to paste. Adding keywords is free.
2. Open Rankings and press the check button. The quote dialog lists the lines, the call count, the unit price and the total. Lower the cap if you want, then confirm.
3. Results are stored in your Supabase project. Every run, with each call's operation id, status, cost and looot run id, is under Costs.

In Settings, the looot connection card has a test button. It calls Balance only, which is free.

## Spending

- Quote, confirm, run. Every paid button opens a quote first. The cap can be lowered and never raised above the quote total. The server answers 422 `cap_above_quote` if it is.
- The server stops a run when the next call would pass the cap. A $0.010 cap over 42 calls at $0.001 makes exactly 10 calls and skips 32.
- A quote older than 10 minutes, or one that already started a run, is refused with 409. Two requests with the same idempotency key create one run.
- Typical list prices. A rank check of 42 keywords to the top 30 is 42 x 3 pages x $0.001 = $0.126, or $0.172 with AI Overview on for 10 of them. Keyword ideas are $0.012 a call, backlink totals $0.024. The full table is in [What each feature costs](#what-each-feature-costs).
- A failed call costs $0, and a failed item retried sends the same idempotency key, so it is not charged twice.

## Run the web app with sign-in

The app uses Supabase Auth (email and password, or a magic link) and a Postgres database. These steps use a hosted Supabase project, not a local Docker stack.

1. Create a project in the Supabase dashboard. Copy the project URL and the anon key from Project Settings, API into `.env.local`. Under Authentication, keep the email provider on.
2. Apply the schema. There is one migration, `supabase/migrations/0001_init.sql`. It creates 14 tables, each with row level security enabled and forced, and policies on `owner_id = auth.uid()`. Either link and push from a clone of this repo:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   Or open the SQL editor in the Supabase dashboard, paste the whole file and run it.
3. Under Authentication, URL Configuration, add the redirect URLs. The app sends the confirmation and magic links to `<origin>/auth/callback` (`app/auth/callback/route.ts`).
   - `http://localhost:3000/auth/callback` for `npm run dev`
   - `https://<your-app-domain>/auth/callback` for the deployed app
   Set the Site URL to your deployed app URL.
4. Put `LOOOT_TOKEN` and `LOOOT_SEO_ALLOWED_EMAILS=you@example.com` in `.env.local`. Without an allow-list the app shows a setup page and refuses everything. Then `npm run dev` and open http://localhost:3000. Create an account on the sign-in page with email and password (at least 8 characters), or request a magic link. Depending on your Supabase email settings you may have to confirm the address first.

For a production build on your own machine, use `npm run build && npm start`.

## Deploy

1. Push the repo to your own GitHub account, or use the Deploy with Vercel button below.
2. In Vercel, Add New, Project, import the repo. The framework preset is Next.js and the defaults work. The repo has no `vercel.json`.
3. Add these environment variables before the first deploy.

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
   | `LOOOT_TOKEN` | your looot agent token |
   | `LOOOT_SEO_ALLOWED_EMAILS` and/or `LOOOT_SEO_ALLOWED_DOMAINS` | who may use the workspace. Required |

4. Deploy, then add `https://<your-vercel-domain>/auth/callback` to the Supabase redirect URLs and set the Site URL to the same domain.
5. In Supabase, Authentication, Providers, Email, turn off "Allow new users to sign up" once your own account exists. If you leave sign-ups open, the allow-list is what keeps strangers out: a stranger can create a Supabase account, but every page, API route and server action answers 403 for an address that is not on the list. Turn sign-ups off as well, because it also stops strangers from using your project's email quota.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-seo&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,LOOOT_TOKEN&envDescription=Supabase%20URL%20and%20anon%20key%2C%20plus%20a%20looot%20token&envLink=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-seo%23run-the-web-app-with-sign-in)

A run sends its calls after the response, inside one request that may last up to 300 seconds (`maxDuration` in `app/api/runs/route.ts`). Check that your Vercel plan allows that, or keep runs small. The repo has no scheduled workflow. Refresh is manual.

## Securing a deployment

Every page, route handler and server action that reads data, changes settings or spends checks the caller on the server. Three things must be true: the caller has a Supabase session, the address is confirmed, and it is on your allow-list.

| Caller | Result |
|---|---|
| Not signed in | Pages redirect to `/login`. API routes answer 401 |
| Signed in, not on the list | Pages redirect to `/not-authorised`. API routes and server actions answer 403 |
| Signed in, no allow-list set on the server | Pages redirect to `/setup`. API routes answer 503. Nobody becomes admin by signing in first |
| On the list | Open |
| Demo mode (`NEXT_PUBLIC_DEMO=1`) | Open, seeded data, no token |

Public: `/login`, `/setup`, `/not-authorised`, `/auth/callback` and static files. Everything else is admin: all pages, `/api/balance`, `/api/quotes`, `/api/runs` and `/api/runs/<id>`, and every server action. An unlisted path is admin.

Environment variables: `LOOOT_SEO_ALLOWED_EMAILS`, `LOOOT_SEO_ALLOWED_DOMAINS` (at least one), and optionally `LOOOT_SEO_MAX_RUN_USD`.

Spending rules. `LOOOT_TOKEN` is one token for the whole deployment, so every allowed user spends from the same balance. A run needs a stored quote. The caller can lower the cap and never raise it above the quote total or `LOOOT_SEO_MAX_RUN_USD`. Each user is limited to 10 runs and 30 quotes a minute (per server instance). The idempotency key is made once per quote, so a double click starts one run. The row level security in `supabase/migrations/0001_init.sql` keeps one allowed user's projects and runs from another's. `npm run test:rls` checks that on a throwaway local Postgres.

The rate limits live in memory, so each server instance counts for itself. On a host that runs several instances (several Vercel function instances, several containers) a user gets the full 10 runs and 30 quotes a minute from each one. Treat them as a per-instance brake. The cap on one run is not in memory: it comes from the stored quote row and `LOOOT_SEO_MAX_RUN_USD`, and a quote can start only one run (the database marks it used). While a run executes, its running total is held in that one process, which is enough because one run is one process. What the app does not have is a total across runs. Nothing in the database limits what one user spends in a day or a month, so the only limits across runs are the per-instance rate limit and the balance on your looot token. Set `LOOOT_SEO_MAX_RUN_USD`, keep a small balance on the token, and rate limit at your proxy or CDN if the deployment runs several instances.

The sign-in link handler follows a `next` parameter only when it is a same-origin relative path. This repo has no cron or webhook route.

For a stronger setup, put the app behind a VPN or an identity-aware proxy (Cloudflare Access, Tailscale, Google IAP) so strangers cannot reach it at all, and keep the allow-list as the second lock.

## Screens

| | |
|---|---|
| **Projects.** One row per site and market, with visibility, top 10 and spend. ![Projects](docs/screenshots/projects.png) | **Overview.** Position bands over time, movers, share of voice, last runs. ![Overview](docs/screenshots/overview.png) |
| **Rankings.** 36 px rows, sort on every column, `j`/`k` to move, `Enter` to open. ![Rankings](docs/screenshots/rankings.png) | **Rankings by date.** One column per check for the last 14 checks. ![Rankings by date](docs/screenshots/rankings-by-date.png) |
| **Keyword detail.** History against competitors, target URL, tags, check log. ![Keyword detail](docs/screenshots/keyword-detail.png) | **Quote dialog.** Lines, total, a cap you can lower and never raise. ![Quote](docs/screenshots/quote.png) |
| **SERP viewer.** Organic results, AI Overview with sources, People also ask, related searches, compare two snapshots. ![SERP viewer](docs/screenshots/serp.png) | **Keyword research.** Seeds to ideas, then metrics as a separate paid step. ![Research](docs/screenshots/research.png) |
| **Competitors.** Share of voice from stored snapshots (free), full overlap per competitor (paid). ![Competitors](docs/screenshots/competitors.png) | **Backlinks.** Totals, new and lost by month, top 100 referring domains. ![Backlinks](docs/screenshots/backlinks.png) |
| **Costs and runs.** A calculator bound to the project, every pinned price, every run with its calls. ![Costs](docs/screenshots/costs.png) | **Run detail.** Each call with its operation id, status, cost and looot run id. ![Run detail](docs/screenshots/costs-run.png) |
| **Settings.** Account, looot connection, defaults. ![Settings](docs/screenshots/settings.png) | **Sign in.** Email and password, or a magic link. ![Sign in](docs/screenshots/login.png) |
| **Dark theme.** ![Rankings, dark](docs/screenshots/rankings-dark.png) | **Command palette** on `Cmd+K`, shortcut sheet on `?`. ![Command palette](docs/screenshots/palette.png) |

Phone width:

<p>
<img src="docs/screenshots/m-overview.png" width="24%" alt="Overview on a phone">
<img src="docs/screenshots/m-rankings.png" width="24%" alt="Rankings on a phone">
<img src="docs/screenshots/m-serp.png" width="24%" alt="SERP viewer on a phone">
<img src="docs/screenshots/m-quote.png" width="24%" alt="Quote sheet on a phone">
</p>

More in [docs/screenshots](docs/screenshots): empty, loading and error states, and every screen in dark.

## Where the token lives

`LOOOT_TOKEN` is read in one file, `lib/looot/server.ts`, which starts with `import "server-only"`. To check that it stays out of the browser bundle:

```bash
LOOOT_TOKEN=lt_fake_CANARY_7f3a9 NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon node_modules/.bin/next build
grep -r "CANARY_7f3a9" .next/static    # prints nothing
grep -rl "LOOOT_TOKEN" .next/static    # prints nothing
```

## What each feature costs

Prices read from the free looot public catalog on 2026-10-08. The date column is the catalog's own date for that price. With a token, a quote reads the live price and uses the higher of the live price and this table.

| Feature | Operation id | Price per call | Price date |
|---|---|---|---|
| Rank check and SERP snapshot, per page of 10 results | `serper-search` | $0.001 | 2026-10-05 |
| Rank check, second provider (a setting) | `anyapi-run-google-search` | $0.0009 | 2026-09-30 |
| SERP snapshot with AI Overview, 1 page | `cloro-monitor-google-ai-overview` | $0.0056 | 2026-09-30 |
| Keyword ideas from seeds | `dataforseo-dataforseo-labs-google-keyword-ideas-live-ai` | $0.012 | 2026-09-16 |
| Related keywords, per seed | `dataforseo-dataforseo-labs-google-related-keywords-live-ai` | $0.012 | 2026-09-21 |
| Autocomplete suggestions, per seed | `serper-autocomplete` | $0.001 | 2026-10-05 |
| Volume, CPC, competition, intent, trend (up to 700 keywords) | `dataforseo-dataforseo-labs-google-keyword-overview-live-ai` | $0.012 | 2026-09-16 |
| Keyword difficulty (up to 1,000 keywords) | `dataforseo-dataforseo-labs-bulk-keyword-difficulty-live-ai` | $0.012 | 2026-09-16 |
| Competitor discovery | `dataforseo-dataforseo-labs-google-competitors-domain-live-ai` | $0.012 | 2026-09-16 |
| Competitor keyword overlap, one competitor per call | `dataforseo-dataforseo-labs-google-domain-intersection-live-ai` | $0.012 | 2026-09-16 |
| Domain search overview | `dataforseo-dataforseo-labs-google-domain-rank-overview-live-ai` | $0.012 | 2026-09-16 |
| Backlink totals | `dataforseo-backlinks-summary-live-ai` | $0.024 | 2026-09-16 |
| Referring domains list | `dataforseo-backlinks-referring-domains-live-ai` | $0.024 | 2026-09-15 |
| New and lost links over time | `dataforseo-backlinks-timeseries-new-lost-summary-live-ai` | $0.024 | 2026-09-16 |

Worked example: 42 keywords checked to the top 30 is 42 x 3 pages x $0.001 = $0.126. Turning AI Overview on for 10 of them swaps their first page for the $0.0056 call, which adds 10 x $0.0046 = $0.046, so the check is $0.172. A failed call costs $0.

Depth costs pages. The app assumes Google returns 10 organic results per call, so a top 30 check is 3 calls per keyword.

## Money rules

- The cap can never be above the quote total. The server answers 422.
- A quote older than 10 minutes, or one that already started a run, is refused with 409.
- Two requests with the same idempotency key create one run.
- Every call to looot carries the key `<runId>:<itemKey>`. A retry of a failed item sends the same key, so it cannot be charged twice.
- The database refuses a run row whose actual cost is above its cap, or whose cap is above its quote.

## Troubleshooting

These are the exact messages in the code.

| Message | What it means and what to do |
|---|---|
| `Supabase is not set up yet` (sign-in page), or `Supabase is not set up on this server.` (HTTP 503 from the API) | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is empty. Set both in `.env.local` and restart, or run the demo. |
| `Supabase did not answer` | The sign-in service could not be reached. Check your connection and that the Supabase project is not paused. |
| `That link did not work` | The link was used or expired. Request a new one. Check that `<origin>/auth/callback` is in the Supabase redirect URLs. |
| `That email and password do not match.` | Wrong password for that account. |
| `Sign in first.` (HTTP 401, code `signed_out`) | Your session is gone. Sign in again. |
| `LOOOT_TOKEN is not set on the server, so nothing can run.` (HTTP 503, code `missing_token`) | Create a token (see [What you need](#what-you-need)), set it in `.env.local` or the Vercel environment variables and restart. Settings shows the token as Missing. |
| `looot did not accept the token or did not answer. Check the token and try again.` (Settings test) | The token is wrong, revoked or missing a scope, or looot was unreachable. Create a new one with `runs.execute`, `catalog.read`, `runs.read` and `usage.read`. |
| `looot returned HTTP 401` or `HTTP 402`, or the message looot sends back | 401 is a bad token. 402 or a blocked call means the balance is too low. Top up at https://looot.ai (minimum $5). |
| `The call ended as blocked.` (or `stopped`, `failed`) | The call finished without a result and cost $0. The run detail in Costs shows the looot run id. |
| `The provider returned a shape this version cannot read. The call was charged; the raw body is on the run in Costs.` | The call succeeded but the parser does not know the shape. The raw body is stored on the run. File an issue with it. |
| `The run could not be started. Nothing was charged.` / `The quote could not be built. Nothing was charged.` | A server error before any call. Retry, and check the server log for `looot-seo:`. |

How to file an issue. Open one at https://github.com/loootai/looot-seo/issues with the run id (Costs, then the run), the action you took, and the raw response body with secrets removed.

## Status

Tested, with looot mocked:

- `npm test`: 107 unit tests. The client, the cap guard (a $0.010 cap over 42 calls at $0.001 makes exactly 10 calls and skips 32), the quote and run routes, the position rule, visibility, and one adapter per pinned operation.
- `npm run test:rls`: applies the migration to a throwaway local Postgres and checks, with two users, that neither can read, change or attach rows to the other's data, and that `anon` sees nothing. It needs `initdb`, `pg_ctl` and `psql`, and skips with a note when they are missing.
- `tsc --noEmit`, `eslint .`, `next build`, and the bundle grep above.

Not tested. If a parser fails on a real response, open an issue with the raw response body (secrets removed).

- No paid looot run was made during the build. All 14 operations show `unverified` in the public catalog. The adapter fixtures in `tests/fixtures/` are written from each provider's public documentation, not from a live run. If a provider returns a shape an adapter cannot read, the app stores the raw body, shows "The provider returned a shape this version cannot read" and still records the cost.
- The Supabase data layer is type checked and its schema is covered by the RLS test, but the app has not been run end to end against a hosted Supabase project.
- The balance call uses `GET /v1/balance`, the path the public looot n8n node uses. The body's field names are read defensively. If they do not match, the balance chip stays hidden and nothing else changes.
- Whether `serper-search` returns more than 10 organic results for a larger `num`. The maths stays at 10 per call until a real run shows otherwise.
- Whether the keyword overview body already carries difficulty. If it does, the separate difficulty call can go and the metrics step drops from $0.024 to $0.012.

## Not yet

- Scheduled refresh. A schedule spends money with nobody watching, so it needs a monthly cap first. Version 1 is manual refresh only.
- Site audit. The catalog has a single-URL Lighthouse job, which is not a crawl.
- Anchor text breakdown for backlinks.
- AI Mode, ChatGPT and Perplexity answers.
- Bing and Yahoo ranks. The schema has an `engine` column, so adding them needs no migration.
- Google Search Console clicks. That needs OAuth on your Google account.
- Historical rank back-fill. History starts at the first check.
- Mobile rankings. Checks are desktop only.
- Teams. One user owns each row. There is no sharing.

## Development

```bash
npm ci
npm run demo          # seeded data on http://localhost:3000
npm test              # unit tests
npm run test:rls      # row level security on a throwaway Postgres
npm run typecheck && npm run lint
git config core.hooksPath .githooks   # run the leak scan before each commit
```

Dependencies are pinned to exact versions. `scripts/screenshots.mjs` retakes every image in `docs/screenshots` from a running demo with headless Chrome, and `docs/hero.html` is the source of the image at the top.

Layout: `app/` routes, `components/` UI, `lib/looot/` the client, quote and run path with one adapter per operation, `lib/seo/` position and visibility rules, `lib/data/` the store interface with a Supabase and an in-memory version, `lib/demo/` the seeded data, `supabase/migrations/` the schema.

## Licence

MIT. See [LICENSE](LICENSE).
