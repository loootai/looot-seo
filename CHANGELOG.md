# Changelog

Built from the GitHub release notes. Each version links to its release page.

## 0.1.4 (2026-10-11)

Spend limit across runs. Each run was capped, but nothing in the database limited what one user spent over a day or a month; only an in-memory rate limit and the token balance did.

Each user now has a daily and a monthly budget (default $5 and $50). Before a run starts, its cap is reserved against both in one atomic database step, so two simultaneous runs cannot both pass. A run over budget is refused with `budget_reached` and makes no call. Reservations settle to the real cost, are released when a run fails, and stay held while a call is open. Stale holds are checked against looot and released after 24 hours. The sidebar, the Costs screen and Settings show used, held and left, and Settings edits the budgets.

Migration: run `supabase/migrations/0002_period_budget.sql` (additive: `spend_budgets`, `budget_reservations`, six functions).

[Release page](https://github.com/loootai/looot-seo/releases/tag/v0.1.4)

## 0.1.3 (2026-10-11)

Security release. Earlier versions (up to v0.1.2) let any signed-in Supabase user use the workspace: read projects, change settings and start paid runs on your LOOOT_TOKEN. If your Supabase project allows public sign-ups (the default), a stranger could create an account and do this.

If you run looot-seo on a reachable host, upgrade and set LOOOT_SEO_ALLOWED_EMAILS and/or LOOOT_SEO_ALLOWED_DOMAINS. With neither set the app shows a setup page and refuses data, settings and spending. A signed-in user who is not on the list gets a not-authorised page, and the APIs answer 403.

Also new: a per-user rate limit on quotes and runs, an optional LOOOT_SEO_MAX_RUN_USD ceiling per run, a same-origin check on the sign-in `next` parameter, and tests generated from the route map. Turn off public sign-ups in Supabase as well. See "Securing a deployment" in the README.

[Release page](https://github.com/loootai/looot-seo/releases/tag/v0.1.3)

## 0.1.2 (2026-10-10)

Sidebar layout: left sidebar that collapses to an icon rail, drawer on phones, spend panel, docs and GitHub links.

[Release page](https://github.com/loootai/looot-seo/releases/tag/v0.1.2)

## 0.1.1 (2026-10-10)

Dependency security bump. next and eslint-config-next 16.3.7 to 16.3.8, which fixes six Next.js advisories (GHSA-3w37-wq28-93x7, GHSA-4jqv-mc3x-m676, GHSA-39w2-rjm5-chcv, GHSA-f87g-xv8r-7p7x, GHSA-mcj8-r9mp-w47p, GHSA-cjq9-62q9-8jv4). No code changes. v0.1.0 is unchanged.

[Release page](https://github.com/loootai/looot-seo/releases/tag/v0.1.1)

## 0.1.0 (2026-10-09)

First release.

A self-hosted SEO workspace on Next.js, Supabase and one looot token. Every paid refresh shows a quote first and stops at the cap you confirm.

- Projects per domain and market, rank tracking with history, a by-date table and a keyword detail panel
- SERP viewer: organic results, AI Overview with sources, People also ask, related searches, compare two snapshots
- Keyword research from seeds, with metrics as a separate paid step
- Competitors: share of voice from stored snapshots, paid overlap per competitor
- Backlinks overview and a costs screen with every run and every call
- Demo mode: `npm ci && npm run demo`, no Supabase project and no token

Tested with looot mocked: 105 unit tests, a row level security test on a throwaway Postgres, typecheck, lint and build. No paid looot run was made. The 14 pinned operations show as unverified in the public catalog, and the adapter fixtures come from provider documentation. See the README for the full list of what is not tested and not built yet.

[Release page](https://github.com/loootai/looot-seo/releases/tag/v0.1.0)
