import { describe, expect, it } from "vitest";
import { ADAPTERS, parseWith } from "@/lib/looot/adapters";
import { dfsPayload } from "@/lib/looot/adapters/shared";
import { mergePages } from "@/lib/looot/apply";
import { CATALOG, OP } from "@/lib/looot/catalog";
import { fixture } from "./helpers";

const data = <K extends keyof typeof ADAPTERS>(op: K) => {
  const r = parseWith(op, fixture(op));
  if (!r.ok) throw new Error(`${op}: ${r.reason}`);
  return r.data as Extract<ReturnType<(typeof ADAPTERS)[K]>, { ok: true }>["data"];
};

describe("adapters, one per pinned operation", () => {
  it("covers all 14 operations of the catalog", () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual(CATALOG.map((c) => c.operationId).sort());
    expect(CATALOG).toHaveLength(14);
  });

  it.each(CATALOG.map((c) => c.operationId))("%s reads its fixture, which is marked as written from docs", (op) => {
    const body = fixture(op) as { _note?: string };
    expect(body._note).toBe("Shape from provider docs, not from a live run");
    expect(parseWith(op as keyof typeof ADAPTERS, body).ok).toBe(true);
  });

  it.each(CATALOG.map((c) => c.operationId))("%s turns an unknown shape into ok false, never an exception", (op) => {
    for (const bad of [null, "text", 42, [], { unexpected: true }, { tasks: [{ status_code: 40501, result: null }] }, { organic: "nope" }]) {
      expect(() => parseWith(op as keyof typeof ADAPTERS, bad)).not.toThrow();
    }
    expect(parseWith(op as keyof typeof ADAPTERS, null).ok).toBe(false);
    expect(parseWith(op as keyof typeof ADAPTERS, { tasks: [{ status_code: 40501, result: null }] }).ok).toBe(false);
  });

  it("serper-search: organic, questions, related, answer box, knowledge panel", () => {
    const d = data(OP.serper);
    expect(d.organic).toHaveLength(4);
    expect(d.organic[1]).toMatchObject({ position: 2, host: "kestrelcoffee.co", url: "https://www.kestrelcoffee.co/subscriptions/single-origin" });
    expect(d.people_also_ask[0]).toMatchObject({ question: "Is single origin coffee better?", host: "kestrelcoffee.co" });
    expect(d.related).toEqual(["single origin coffee subscription gift", "best coffee subscription"]);
    expect(d.answer_box?.host).toBe("kestrelcoffee.co");
    expect(d.knowledge).toMatchObject({ title: "Single-origin coffee", host: "en.wikipedia.org" });
    expect(d.ai_overview).toBeNull();
    expect(d.aio_checked).toBe(false);
  });

  it("anyapi-run-google-search: reads the list under data with url and description fields", () => {
    const d = data(OP.anyapi);
    expect(d.organic.map((o) => o.host)).toEqual(["rivergatephysio.co.uk", "fernhillphysio.co.uk"]);
    expect(d.organic[1]?.snippet).toBe("Sports injury and back pain clinic.");
    expect(d.people_also_ask).toHaveLength(1);
  });

  it("cloro-monitor-google-ai-overview: overview text and sources, flagged as checked", () => {
    const d = data(OP.cloro);
    expect(d.aio_checked).toBe(true);
    expect(d.ai_overview?.text).toContain("medium-dark roast");
    expect(d.ai_overview?.sources.map((s) => s.host)).toEqual(["kestrelcoffee.co", "en.wikipedia.org"]);
    expect(d.related).toEqual(["best espresso beans for beginners", "espresso beans vs coffee beans"]);
    const none = parseWith(OP.cloro, { result: { organicResults: [], aioverview: null } });
    expect(none.ok && none.data.ai_overview).toBeNull();
    expect(none.ok && none.data.aio_checked).toBe(true);
  });

  it("serper-autocomplete: suggestion strings", () => {
    expect(data(OP.autocomplete)).toEqual(["coffee subscription gift", "coffee subscription box", "coffee subscription reddit"]);
  });

  it("keyword ideas, related and overview: numbers, 12 months oldest first, nulls kept as null", () => {
    const ideas = data(OP.ideas);
    expect(ideas).toHaveLength(3);
    expect(ideas[0]).toMatchObject({ phrase: "coffee subscription box", volume: 5400, cpc: 3.12, competition: 0.81, difficulty: 44, intent: "commercial" });
    expect(ideas[0]?.monthly).toHaveLength(12);
    expect(ideas[0]?.monthly?.[0]?.month).toBe("2025-10");
    expect(ideas[0]?.monthly?.[11]?.month).toBe("2026-09");
    expect(ideas[2]).toMatchObject({ phrase: "coffee of the month", volume: null, difficulty: null, monthly: null });
    expect(data(OP.related).map((k) => k.phrase)).toEqual(["espresso beans online", "best espresso beans"]);
    expect(data(OP.overview)[1]).toMatchObject({ phrase: "cold brew coffee ratio", volume: 22200, intent: "informational" });
  });

  it("bulk keyword difficulty: a score per keyword, null when missing", () => {
    expect(data(OP.difficulty)).toEqual([
      { phrase: "single origin coffee subscription", difficulty: 41 },
      { phrase: "cold brew coffee ratio", difficulty: 34 },
      { phrase: "kestrel coffee", difficulty: null },
    ]);
  });

  it("competitors domain: strips www and keeps the shared count", () => {
    expect(data(OP.competitors)).toEqual([
      { domain: "roastwell.com", intersections: 510, avg_position: 14.6 },
      { domain: "northbeancoffee.com", intersections: 388, avg_position: 18.2 },
    ]);
  });

  it("domain intersection: first domain is ours, second is theirs", () => {
    expect(data(OP.intersection)).toEqual([
      { phrase: "decaf swiss water process beans", volume: 1300, our_position: 1, their_position: 7 },
      { phrase: "whole bean coffee delivery", volume: 4400, our_position: 21, their_position: 4 },
    ]);
  });

  it("domain rank overview: keyword count, traffic and the distribution", () => {
    const d = data(OP.domainOverview);
    expect(d).toMatchObject({ organic_keywords: 1284, est_traffic: 9460.4 });
    expect(d.distribution.pos_4_10).toBe(233);
  });

  it("backlinks summary: totals, with the 0 to 1,000 rank shown as 0 to 100", () => {
    expect(data(OP.blSummary)).toEqual({ backlinks: 3184, referring_domains: 412, domain_rank: 38, spam_score: 3, broken_backlinks: 27 });
  });

  it("referring domains: rank scaled, first seen as a day, dofollow share from the nofollow count", () => {
    const d = data(OP.blDomains);
    expect(d[0]).toEqual({ domain: "homebaristaforum.net", rank: 69, backlinks: 40, first_seen: "2025-08-21", dofollow_share: 0.45 });
    expect(d[1]).toMatchObject({ rank: 71, dofollow_share: 1 });
  });

  it("new and lost: one row per month, oldest first", () => {
    expect(data(OP.blNewLost)).toEqual([
      { month: "2026-07", new: 31, lost: 12 },
      { month: "2026-08", new: 44, lost: 19 },
    ]);
  });

  it("DataForSEO bodies are read under tasks[0].result[0] and also at the top level", () => {
    const full = fixture(OP.blSummary) as { tasks: { result: unknown[] }[] };
    const reduced = full.tasks[0]!.result[0];
    expect(parseWith(OP.blSummary, reduced)).toEqual(parseWith(OP.blSummary, full));
    expect(parseWith(OP.blSummary, { result: [reduced] })).toEqual(parseWith(OP.blSummary, full));
    expect(dfsPayload({ tasks: [{ result: null }] })).toBeNull();
    const items = (fixture(OP.difficulty) as { tasks: { result: { items: unknown[] }[] }[] }).tasks[0]!.result[0]!.items;
    expect(parseWith(OP.difficulty, { items }).ok).toBe(true);
  });

  it("joins result pages into one list and offsets a provider that restarts at 1", () => {
    const row = (position: number) => ({ position, title: "t", url: `https://example.com/${position}`, host: "example.com", snippet: "" });
    const merged = mergePages([
      { page: 2, organic: [row(1), row(2)] },
      { page: 1, organic: [row(1), row(2)] },
      { page: 3, organic: [row(21)] },
    ]);
    expect(merged.map((r) => r.position)).toEqual([1, 2, 11, 12, 21]);
  });
});
