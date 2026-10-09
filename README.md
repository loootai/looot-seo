# looot-seo

A self-hosted SEO workspace that shows the price of every refresh before it runs: rank tracking, keyword research, SERP snapshots, competitors and backlinks on Next.js, Supabase and one [looot](https://looot.ai) token.

![looot-seo: the project overview and the quote dialog](docs/hero.png)

## What it replaces

The rank tracker, keyword tool and competitor view of a paid SEO suite, for one person or a small agency. You own the database, and you pay per call instead of per seat.

It is close in spirit to [OpenSEO](https://github.com/every-app/open-seo). OpenSEO needs a DataForSEO account. looot-seo needs one looot token, and each feature is pinned to a catalog operation with its price on the button, so a rank check runs on Serper at $0.001 a page.

Want cron and a terminal instead of a web app? Use [looot-seo-monitor](https://github.com/loootai/looot-seo-monitor).

The one rule the app is built around: quote, confirm, run. Every paid button opens a quote with the call count and the unit price. You confirm a cap. The server stops the run when the next call would pass it.

## Run the demo in one command

```bash
git clone https://github.com/loootai/looot-seo && cd looot-seo && npm ci && npm run demo
```

Open http://localhost:3000. Demo mode needs no Supabase project and no token. It runs on seeded data for three made-up businesses, labelled "Demo data" on every screen. "Simulate run" finishes in about 3 seconds, charges nothing and sends no request to looot. Edits live in memory and reset when the server restarts.

Add `?state=empty`, `?state=loading` or `?state=error` to a list screen in demo mode to see that state.

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

## Run it for real

You need a Supabase project and a looot token.

1. Create a Supabase project. In Authentication, keep email enabled. Add your site URL plus `/auth/callback` to the redirect URLs.
2. Apply the schema. With the Supabase CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   Or paste `supabase/migrations/0001_init.sql` into the SQL editor. It creates 14 tables, each with row level security enabled and forced, and policies on `owner_id = auth.uid()`.
3. Get a token at [looot.ai](https://looot.ai) and top up. The minimum is $5.
4. Copy `.env.example` to `.env.local` and fill it in:

   | Variable | Where it comes from | Reaches the browser |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase, Project settings, API | yes |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase, Project settings, API | yes |
   | `LOOOT_TOKEN` | looot.ai | no |
   | `NEXT_PUBLIC_DEMO` | leave empty, or `1` for demo mode | yes |

5. `npm ci && npm run build && npm start`

The app uses no service-role key. Every read and write goes through the signed-in user's session, so row level security is the only gate.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-seo&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,LOOOT_TOKEN&envDescription=Supabase%20URL%20and%20anon%20key%2C%20plus%20a%20looot%20token&envLink=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-seo%23run-it-for-real)

A run sends its calls after the response, inside one request that may last up to 300 seconds (`maxDuration` in `app/api/runs/route.ts`). Check that your Vercel plan allows that, or keep runs small.

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

## What has been tested, and what has not

Tested, with looot mocked:

- `npm test`: 107 unit tests. The client, the cap guard (a $0.010 cap over 42 calls at $0.001 makes exactly 10 calls and skips 32), the quote and run routes, the position rule, visibility, and one adapter per pinned operation.
- `npm run test:rls`: applies the migration to a throwaway local Postgres and checks, with two users, that neither can read, change or attach rows to the other's data, and that `anon` sees nothing. It needs `initdb`, `pg_ctl` and `psql`, and skips with a note when they are missing.
- `tsc --noEmit`, `eslint .`, `next build`, and the bundle grep above.

Not tested:

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
