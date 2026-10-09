import { describe, expect, it } from "vitest";
import { buildDemoStore } from "@/lib/demo/store";
import { CATALOG } from "@/lib/looot/catalog";
import { formatMoney } from "@/lib/money";
import { formatPercent } from "@/lib/seo/visibility";
import { loadCosts } from "@/lib/view/costsData";
import { keywordRows, loadBundle, projectStats } from "@/lib/view/project";
import { fixture } from "./helpers";

describe("demo dataset", () => {
  it("shows the same Kestrel numbers on every machine and every day", async () => {
    const a = projectStats((await loadBundle(buildDemoStore(), "kestrel"))!);
    const b = projectStats((await loadBundle(buildDemoStore(), "kestrel"))!);
    expect(a).toEqual(b);
    expect(formatPercent(a.visibility)).toBe("18.6%");
    expect(a.avgPosition?.toFixed(1)).toBe("11.4");
    expect(a).toMatchObject({ top3: 8, top10: 23, ranked: 37, tracked: 42 });
  });

  it("has the spec rows: a cited AI Overview, a lost keyword, a cannibalised one", async () => {
    const rows = keywordRows((await loadBundle(buildDemoStore(), "kestrel"))!);
    const by = (p: string) => rows.find((r) => r.phrase === p)!;
    expect(by("single origin coffee subscription")).toMatchObject({ position: 4, volume: 2900, difficulty: 41, aio: true });
    expect(by("single origin coffee subscription").features.aio).toEqual({ present: true, cited: true });
    expect(by("cold brew coffee ratio")).toMatchObject({ position: null, depth: 30 });
    expect(by("best coffee for french press").cannibalised).toBe(true);
    expect(by("decaf swiss water process beans").position).toBe(1);
  });

  it("has three projects: one mature, one young, one empty", async () => {
    const store = buildDemoStore();
    const ps = await store.listProjects();
    expect(ps.map((p) => p.domain).sort()).toEqual(["fernhillphysio.co.uk", "kestrelcoffee.co", "loomwork.app"]);
    expect(await store.listKeywords("fernhill")).toHaveLength(18);
    expect(await store.listKeywords("loomwork")).toHaveLength(0);
    expect(await store.listBacklinkSnapshots("fernhill")).toHaveLength(0);
    expect((await store.listResearchRuns("loomwork"))[0]?.results).toHaveLength(148);
  });

  it("has 37 Kestrel runs worth $4.83, 2 partial, 1 cancelled, none over its cap", async () => {
    const runs = await buildDemoStore().listRuns("kestrel");
    expect(runs).toHaveLength(37);
    expect(formatMoney(runs.reduce((s, r) => s + r.actual_cost_micros, 0))).toBe("$4.83");
    expect(runs.filter((r) => r.status === "partial")).toHaveLength(2);
    expect(runs.filter((r) => r.status === "cancelled")).toHaveLength(1);
    expect(runs.filter((r) => r.actual_cost_micros > r.max_cost_micros || r.max_cost_micros > r.quoted_micros)).toHaveLength(0);
    const costs = (await loadCosts(buildDemoStore(), "kestrel"))!;
    expect(costs.spentAll).toBe(4_830_000);
    expect(costs.bases[0]).toMatchObject({ keywords: 42, aioKeywords: 10, depth: 30, competitors: 4 });
  });

  it("has backlink totals from the spec", async () => {
    const latest = (await buildDemoStore().listBacklinkSnapshots("kestrel")).filter((s) => s.domain === "kestrelcoffee.co").sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0];
    expect(latest).toMatchObject({ backlinks: 3184, referring_domains: 412, domain_rank: 38, spam_score: 3, broken_backlinks: 27 });
    expect(latest?.new_lost).toHaveLength(12);
  });
});

describe("price table", () => {
  it("matches the public catalog rows stored on the build date", () => {
    const stored = fixture("public-catalog-2026-10-08") as { items: { operationId: string; price: { amountMicros: number; effectiveAt: string } }[] };
    expect(stored.items).toHaveLength(CATALOG.length);
    for (const c of CATALOG) {
      const row = stored.items.find((i) => i.operationId === c.operationId);
      expect(row, c.operationId).toBeDefined();
      expect(c.priceMicros, c.operationId).toBe(row!.price.amountMicros);
      expect(c.priceDate, c.operationId).toBe(row!.price.effectiveAt.slice(0, 10));
    }
  });
});
