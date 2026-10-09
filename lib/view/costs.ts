import { CATALOG, OP, pagesForDepth, type PriceSource } from "@/lib/looot/catalog";
import type { Micros } from "@/lib/money";

export interface CalcInput {
  keywords: number;
  depth: number;
  aioKeywords: number;
  metrics: boolean;
  overlaps: number;
  backlinks: boolean;
  domainOverview: boolean;
  serpOperation: string;
}

export interface CalcLine {
  key: "rank" | "aio" | "metrics" | "overlap" | "backlinks" | "domain";
  label: string;
  /** The multiplication as text, such as "42 keywords x 3 pages x $0.001". */
  calls: number;
  unitMicros: Micros;
  subtotalMicros: Micros;
  note?: string;
}

export type Frequency = "once" | "weekly" | "daily";
export const CHECKS_PER_MONTH: Record<Frequency, number> = { once: 1, weekly: 4.33, daily: 30.4 };

/**
 * What one full refresh costs, line by line. An AI Overview keyword uses the Cloro call in place of
 * its first Serper page, so those pages are taken off the rank check line.
 */
export function calcRefresh(input: CalcInput, price: PriceSource): { lines: CalcLine[]; totalMicros: Micros; perCheckMicros: Micros } {
  const kw = Math.max(0, Math.floor(input.keywords));
  const aio = Math.min(kw, Math.max(0, Math.floor(input.aioKeywords)));
  const pages = pagesForDepth(input.depth);
  const serp = price(input.serpOperation || OP.serper);
  const rankCalls = kw * pages - aio;
  const lines: CalcLine[] = [
    { key: "rank", label: "Rank check", calls: rankCalls, unitMicros: serp, subtotalMicros: rankCalls * serp, note: aio ? `${kw} x ${pages} pages, minus ${aio} first pages served by the AI Overview call` : `${kw} keywords x ${pages} ${pages === 1 ? "page" : "pages"}` },
    { key: "aio", label: "AI Overview keywords", calls: aio, unitMicros: price(OP.cloro), subtotalMicros: aio * price(OP.cloro), note: "replaces page 1 for these keywords" },
    { key: "metrics", label: "Keyword metrics", calls: input.metrics ? 2 : 0, unitMicros: price(OP.overview), subtotalMicros: input.metrics ? price(OP.overview) + price(OP.difficulty) : 0, note: "volume call plus difficulty call" },
    { key: "overlap", label: "Competitor overlap", calls: Math.max(0, input.overlaps), unitMicros: price(OP.intersection), subtotalMicros: Math.max(0, input.overlaps) * price(OP.intersection), note: "one call per competitor" },
    { key: "backlinks", label: "Backlinks", calls: input.backlinks ? 3 : 0, unitMicros: price(OP.blSummary), subtotalMicros: input.backlinks ? price(OP.blSummary) + price(OP.blDomains) + price(OP.blNewLost) : 0, note: "totals, referring domains, new and lost" },
    { key: "domain", label: "Domain overview", calls: input.domainOverview ? 1 : 0, unitMicros: price(OP.domainOverview), subtotalMicros: input.domainOverview ? price(OP.domainOverview) : 0 },
  ];
  const perCheckMicros = (lines[0]?.subtotalMicros ?? 0) + (lines[1]?.subtotalMicros ?? 0);
  return { lines, totalMicros: lines.reduce((s, l) => s + l.subtotalMicros, 0), perCheckMicros };
}

/** Rank check spend per month at a frequency. */
export function monthlyMicros(perCheckMicros: Micros, frequency: Frequency): Micros {
  return Math.round(perCheckMicros * CHECKS_PER_MONTH[frequency]);
}

/** Every pinned operation with the price to show, keyed for the client. */
export function priceRows(price: PriceSource): { operationId: string; jobId: string; feature: string; note: string | null; micros: Micros; tableMicros: Micros; priceDate: string }[] {
  return CATALOG.map((c) => ({ operationId: c.operationId, jobId: c.jobId, feature: c.feature, note: c.note ?? null, micros: price(c.operationId), tableMicros: c.priceMicros, priceDate: c.priceDate }));
}
