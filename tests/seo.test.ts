import { describe, expect, it } from "vitest";
import { buildQuote, selectLines } from "@/lib/looot/quote";
import { fallbackPrices, pagesForDepth } from "@/lib/looot/catalog";
import { formatMoney, toMicros } from "@/lib/money";
import { bandOf } from "@/lib/seo/bands";
import { isGap, latestPerKeyword, positionIn, shareOfVoice } from "@/lib/seo/overlap";
import { findPosition, matchesDomain, positionText } from "@/lib/seo/position";
import { ctr, estimateVisibility, formatPercent } from "@/lib/seo/visibility";
import type { Keyword, Project } from "@/lib/types";
import { normaliseDomain, parseKeywordLines, toCsv } from "@/lib/utils";
import { calcRefresh, monthlyMicros } from "@/lib/view/costs";
import { changeOf } from "@/lib/view/project";

const row = (position: number, url: string) => ({ position, url, host: new URL(url).hostname.replace(/^www\./, "") });

describe("position rule", () => {
  const serp = [row(1, "https://roastwell.com/a"), row(3, "https://www.kestrelcoffee.co/coffee/espresso"), row(5, "https://shop.kestrelcoffee.co/espresso"), row(8, "https://kestrelcoffee.co/journal/espresso-guide")];

  it("strips www on both sides", () => {
    expect(matchesDomain("www.kestrelcoffee.co", "kestrelcoffee.co", false)).toBe(true);
    expect(matchesDomain("kestrelcoffee.co", "www.kestrelcoffee.co", false)).toBe(true);
    expect(matchesDomain("notkestrelcoffee.co", "kestrelcoffee.co", true)).toBe(false);
  });

  it("counts a subdomain only when the setting is on", () => {
    const only = [row(2, "https://shop.kestrelcoffee.co/espresso")];
    expect(findPosition(only, "kestrelcoffee.co", false).position).toBeNull();
    expect(findPosition(only, "kestrelcoffee.co", true).position).toBe(2);
  });

  it("takes the first result of the site and puts later URLs in other_urls", () => {
    expect(findPosition(serp, "kestrelcoffee.co", false)).toEqual({ position: 3, url: "https://www.kestrelcoffee.co/coffee/espresso", other_urls: ["https://kestrelcoffee.co/journal/espresso-guide"], is_cannibalised: false });
    expect(findPosition(serp, "kestrelcoffee.co", true).other_urls).toHaveLength(2);
  });

  it("flags a ranking URL that is not the target URL", () => {
    expect(findPosition(serp, "kestrelcoffee.co", false, "https://kestrelcoffee.co/coffee/espresso/").is_cannibalised).toBe(false);
    expect(findPosition(serp, "kestrelcoffee.co", false, "https://kestrelcoffee.co/journal/espresso-guide").is_cannibalised).toBe(true);
  });

  it("gives null and the text 'Not in top 30' when the site is not found, never 0 or 101", () => {
    const r = findPosition(serp, "northbeancoffee.com", false);
    expect(r).toEqual({ position: null, url: null, other_urls: [], is_cannibalised: false });
    expect(positionText(r.position, 30)).toBe("Not in top 30");
    expect(positionText(4, 30)).toBe("4");
  });
});

describe("visibility and bands", () => {
  it("uses the one CTR curve", () => {
    expect([1, 2, 3, 4, 5, 6, 10, 11, 20, 21, 50].map(ctr)).toEqual([0.28, 0.15, 0.1, 0.07, 0.05, 0.03, 0.03, 0.01, 0.01, 0, 0]);
    expect(ctr(null)).toBe(0);
  });
  it("leaves keywords with no volume out of both sums and counts them", () => {
    const v = estimateVisibility([{ position: 1, volume: 1000 }, { position: null, volume: 1000 }, { position: 2, volume: null }, { position: 3, volume: 0 }]);
    expect(v).toEqual({ value: 0.5, counted: 2, leftOut: 2 });
    expect(estimateVisibility([{ position: 1, volume: null }]).value).toBeNull();
    expect(formatPercent(0.1864)).toBe("18.6%");
    expect(formatPercent(null)).toBe("–");
  });
  it("bands positions as 1 to 3, 4 to 10, 11 to 20, 21 and beyond, not ranked", () => {
    expect([1, 3, 4, 10, 11, 20, 21, 50, null].map(bandOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 0]);
  });
  it("describes movement: lower is better", () => {
    expect(changeOf(9, 4, true)).toEqual({ change: 5, kind: "up" });
    expect(changeOf(6, 9, true)).toEqual({ change: 3, kind: "down" });
    expect(changeOf(28, null, true).kind).toBe("lost");
    expect(changeOf(null, 12, true).kind).toBe("new");
    expect(changeOf(undefined, 12, false).kind).toBe("none");
  });
});

describe("share of voice from stored snapshots", () => {
  const snaps = [
    { id: "s1", keyword_id: "k1", fetched_at: "2026-10-01T09:00:00Z", hosts: [{ position: 1, host: "roastwell.com" }, { position: 4, host: "kestrelcoffee.co" }] },
    { id: "s2", keyword_id: "k1", fetched_at: "2026-10-08T09:00:00Z", hosts: [{ position: 1, host: "kestrelcoffee.co" }, { position: 2, host: "roastwell.com" }] },
    { id: "s3", keyword_id: "k2", fetched_at: "2026-10-08T09:00:00Z", hosts: [{ position: 3, host: "blog.roastwell.com" }] },
  ];
  it("keeps the newest snapshot per keyword, or the newest before a date", () => {
    expect(latestPerKeyword(snaps).get("k1")?.id).toBe("s2");
    expect(latestPerKeyword(snaps, "2026-10-02T00:00:00Z").get("k1")?.id).toBe("s1");
    expect(positionIn(snaps[2]!, "roastwell.com", true)).toBe(3);
    expect(positionIn(snaps[2]!, "roastwell.com")).toBeNull();
  });
  it("weights by volume and sums to at most 1", () => {
    const share = shareOfVoice(latestPerKeyword(snaps), ["kestrelcoffee.co", "roastwell.com"], new Map([["k1", 1000], ["k2", 1000]]));
    expect(share.get("kestrelcoffee.co")).toBeCloseTo(0.5);
    expect(share.get("roastwell.com")).toBeCloseTo((0.15 + 0.1) / 0.56);
  });
  it("marks a gap when a competitor is top 10 and the project is not", () => {
    expect(isGap(14, [7, null])).toBe(true);
    expect(isGap(9, [1])).toBe(false);
    expect(isGap(null, [12])).toBe(false);
  });
});

describe("money", () => {
  it("formats 4 decimals under a cent, 3 under a dollar, 2 above", () => {
    expect(formatMoney(1000)).toBe("$0.001");
    expect(formatMoney(900)).toBe("$0.0009");
    expect(formatMoney(5600)).toBe("$0.0056");
    expect(formatMoney(126_000)).toBe("$0.126");
    expect(formatMoney(18_420_000)).toBe("$18.42");
    expect(formatMoney(4_830_000)).toBe("$4.83");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(null)).toBe("–");
  });
  it("converts dollars to whole micros", () => {
    expect(toMicros(0.0056)).toBe(5600);
    expect(toMicros("0.012")).toBe(12_000);
    expect(toMicros(undefined)).toBe(0);
  });
});

describe("quotes", () => {
  const project: Project = { id: "p1", name: "Kestrel", domain: "kestrelcoffee.co", country: "US", language: "en", location_name: "United States", depth: 30, include_subdomains: false, serp_operation: "serper-search", created_at: "2026-07-01T00:00:00Z" };
  const kw = (i: number, aio = false): Keyword => ({ id: `k${i}`, project_id: "p1", phrase: `keyword ${i}`, phrase_norm: `keyword ${i}`, target_url: null, tags: [], track_ai_overview: aio, engine: "google", archived_at: null, created_at: project.created_at });
  const ctx = { project, keywords: [kw(1, true), kw(2), kw(3)], competitors: [{ id: "c1", project_id: "p1", domain: "roastwell.com", label: null, color_slot: 2, created_at: project.created_at }], price: fallbackPrices, today: "2026-10-08" };

  it("a check costs depth / 10 calls per keyword", () => {
    expect([10, 20, 30, 50].map(pagesForDepth)).toEqual([1, 2, 3, 5]);
    const q = buildQuote("check_rankings", {}, ctx);
    expect(q.items).toHaveLength(9);
    expect(q.totalMicros).toBe(9 * 1000 + 4600);
    expect(q.items[0]).toMatchObject({ operationId: "cloro-monitor-google-ai-overview", unitPriceMicros: 5600, input: { query: "keyword 1", gl: "US", include: ["aioverview"], pages: 1 } });
    expect(q.items[1]).toMatchObject({ operationId: "serper-search", input: { q: "keyword 1", gl: "us", hl: "en", page: 2 } });
  });

  it("dropping the AI Overview line falls back to the plain SERP call for page 1", () => {
    const q = buildQuote("check_rankings", { keywordIds: ["k1"] }, ctx);
    const s = selectLines(q, ["aio", "rank"], project);
    expect(s.lines.map((l) => l.key)).toEqual(["rank"]);
    expect(s.totalMicros).toBe(3000);
    expect(s.items[0]).toMatchObject({ operationId: "serper-search", unitPriceMicros: 1000, input: { q: "keyword 1", page: 1 } });
  });

  it("prices research per source and per seed, and metrics as two calls", () => {
    expect(buildQuote("research", { seeds: ["a", "b", "c"], sources: ["ideas", "related", "autocomplete"] }, ctx).totalMicros).toBe(12_000 + 36_000 + 3000);
    const m = buildQuote("keyword_metrics", { phrases: Array.from({ length: 148 }, (_, i) => `kw ${i}`) }, ctx);
    expect(m.totalMicros).toBe(24_000);
    expect(m.lines.map((l) => l.calls)).toEqual([1, 1]);
    expect(buildQuote("backlinks", {}, ctx).totalMicros).toBe(72_000);
    expect(buildQuote("competitor_overlap", { competitorId: "c1" }, ctx).items[0]?.input).toMatchObject({ target1: "kestrelcoffee.co", target2: "roastwell.com", limit: 200 });
    expect(() => buildQuote("check_rankings", { keywordIds: [] }, ctx)).toThrow("no keywords");
  });

  it("the cost calculator matches the quote for the same project", () => {
    const calc = calcRefresh({ keywords: 42, depth: 30, aioKeywords: 10, metrics: true, overlaps: 3, backlinks: true, domainOverview: true, serpOperation: "serper-search" }, fallbackPrices);
    expect(calc.lines.map((l) => l.subtotalMicros)).toEqual([116_000, 56_000, 24_000, 36_000, 72_000, 12_000]);
    expect(calc.perCheckMicros).toBe(172_000);
    expect(calc.totalMicros).toBe(316_000);
    expect(monthlyMicros(calc.perCheckMicros, "weekly")).toBe(744_760);
    const plain = calcRefresh({ keywords: 42, depth: 30, aioKeywords: 0, metrics: false, overlaps: 0, backlinks: false, domainOverview: false, serpOperation: "serper-search" }, fallbackPrices);
    expect(plain.totalMicros).toBe(126_000);
  });
});

describe("small helpers", () => {
  it("cleans a typed domain and a pasted keyword list", () => {
    expect(normaliseDomain(" https://WWW.Kestrelcoffee.co/shop?x=1 ")).toBe("kestrelcoffee.co");
    expect(parseKeywordLines("Cold Brew  Ratio\ncold brew ratio\n\n decaf beans ,v60")).toEqual(["cold brew ratio", "decaf beans", "v60"]);
    expect(toCsv(["a", "b"], [["x", 'say "hi"']])).toBe('"a","b"\n"x","say ""hi"""');
  });
});
