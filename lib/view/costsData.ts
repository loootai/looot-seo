import "server-only";
import type { DataStore } from "@/lib/data/store";
import type { BudgetStatus } from "@/lib/looot/budget";
import { IS_DEMO } from "@/lib/env";
import { CATALOG, fallbackPrice } from "@/lib/looot/catalog";
import { TOKEN_ENV, hasLoootToken, livePrices, readBalance } from "@/lib/looot/server";
import type { Micros } from "@/lib/money";
import type { Run } from "@/lib/types";
import { priceRows } from "@/lib/view/costs";
import { featureOf, spentThisMonth } from "@/lib/view/project";
import { daysBefore } from "@/lib/view/timeline";

/** The balance the demo shows. Nothing reads it from looot. */
export const DEMO_BALANCE_MICROS: Micros = 18_420_000;

export interface CalcBase {
  projectId: string;
  name: string;
  domain: string;
  keywords: number;
  aioKeywords: number;
  depth: number;
  competitors: number;
  serpOperation: string;
}

export interface CostsData {
  scope: { projectId: string; name: string } | null;
  now: string;
  demo: boolean;
  hasToken: boolean;
  tokenEnv: string;
  balanceMicros: Micros | null;
  balanceReachable: boolean;
  topUpUrl: string;
  spentMonth: Micros;
  spentAll: Micros;
  bases: CalcBase[];
  prices: ReturnType<typeof priceRows>;
  spend: Record<string, number | string>[];
  runs: (Run & { projectName: string })[] | null;
  /** Used, held and left against the daily and monthly budget. null when it could not be read. */
  budget: BudgetStatus | null;
}

/** Everything the Costs screen shows, for one project or for all of them. */
export async function loadCosts(store: DataStore, projectId: string | null): Promise<CostsData | null> {
  const projects = await store.listProjects();
  const scoped = projectId ? projects.find((p) => p.id === projectId) : null;
  if (projectId && !scoped) return null;
  const now = store.now();
  const names = new Map(projects.map((p) => [p.id, p.name]));

  const bases = await Promise.all(
    (scoped ? [scoped] : projects).map(async (p): Promise<CalcBase> => {
      const [kws, comps] = await Promise.all([store.listKeywords(p.id), store.listCompetitors(p.id)]);
      return { projectId: p.id, name: p.name, domain: p.domain, keywords: kws.length, aioKeywords: kws.filter((k) => k.track_ai_overview).length, depth: p.depth, competitors: comps.length, serpOperation: p.serp_operation };
    }),
  );

  let runs: Run[] | null = null;
  try {
    runs = await store.listRuns(projectId);
  } catch (e) {
    console.error("looot-seo: runs failed", e);
  }

  let price = fallbackPrice;
  let balanceMicros: Micros | null = IS_DEMO ? DEMO_BALANCE_MICROS : null;
  let reachable = true;
  let topUpUrl = "https://looot.ai";
  const hasToken = !IS_DEMO && hasLoootToken();
  if (hasToken) {
    const [live, balance] = await Promise.all([livePrices(CATALOG.map((c) => c.operationId)), readBalance()]);
    price = (op) => live.get(op) ?? fallbackPrice(op);
    balanceMicros = balance?.availableMicros ?? null;
    reachable = balance !== null;
    if (balance?.topUpUrl) topUpUrl = balance.topUpUrl;
  }

  const from = daysBefore(now, 29);
  const days: Record<string, number | string>[] = [];
  for (let i = 29; i >= 0; i--) days.push({ day: daysBefore(now, i), "Rank checks": 0, Research: 0, Competitors: 0, Backlinks: 0 });
  for (const r of runs ?? []) {
    const day = r.started_at.slice(0, 10);
    if (day < from || r.simulated) continue;
    const row = days.find((d) => d.day === day);
    const f = featureOf(r.action);
    if (row) row[f] = Number(row[f]) + r.actual_cost_micros;
  }
  const real = (runs ?? []).filter((r) => !r.simulated);
  const budget = await store.budgetStatus(new Date()).catch((e) => (console.error("looot-seo: budget failed", e), null));
  return {
    scope: scoped ? { projectId: scoped.id, name: scoped.name } : null,
    now,
    demo: IS_DEMO,
    hasToken,
    tokenEnv: TOKEN_ENV,
    balanceMicros,
    balanceReachable: reachable,
    topUpUrl,
    spentMonth: spentThisMonth(real, now),
    spentAll: real.reduce((s, r) => s + r.actual_cost_micros, 0),
    bases,
    prices: priceRows(price),
    spend: days,
    runs: runs ? runs.map((r) => ({ ...r, projectName: names.get(r.project_id) ?? "" })) : null,
    budget,
  };
}
