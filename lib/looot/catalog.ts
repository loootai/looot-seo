import type { Micros } from "@/lib/money";

export interface CatalogEntry {
  operationId: string;
  jobId: string;
  feature: string;
  priceMicros: Micros;
  /** Date the catalog reported for this price. */
  priceDate: string;
  note?: string;
}

/** The day the table below was read from the free public catalog. */
export const CATALOG_READ_ON = "2026-10-08";

/**
 * Every looot operation this app can call, with the price the public catalog showed on
 * CATALOG_READ_ON. It is the demo price source and the fallback when a live price cannot be read.
 * With a token, quotes read the live price and use the higher of the two.
 */
export const CATALOG: CatalogEntry[] = [
  { operationId: "serper-search", jobId: "google.serp.organic", feature: "Rank check and SERP snapshot", priceMicros: 1000, priceDate: "2026-10-05", note: "per page of 10 results" },
  { operationId: "anyapi-run-google-search", jobId: "google.serp.organic", feature: "Rank check, second provider", priceMicros: 900, priceDate: "2026-09-30", note: "per page of 10 results" },
  { operationId: "cloro-monitor-google-ai-overview", jobId: "google.serp.ai-overview", feature: "SERP snapshot with AI Overview", priceMicros: 5600, priceDate: "2026-09-30", note: "1 page" },
  { operationId: "dataforseo-dataforseo-labs-google-keyword-ideas-live-ai", jobId: "dataforseolabs.google.keyword-ideas.live-ai", feature: "Keyword ideas from seeds", priceMicros: 12000, priceDate: "2026-09-16" },
  { operationId: "dataforseo-dataforseo-labs-google-related-keywords-live-ai", jobId: "dataforseolabs.google.related-keywords.live-ai", feature: "Related keywords", priceMicros: 12000, priceDate: "2026-09-21", note: "per seed" },
  { operationId: "serper-autocomplete", jobId: "search.google-autocomplete", feature: "Autocomplete suggestions", priceMicros: 1000, priceDate: "2026-10-05", note: "per seed" },
  { operationId: "dataforseo-dataforseo-labs-google-keyword-overview-live-ai", jobId: "dataforseolabs.google.keyword-overview.live-ai", feature: "Volume, CPC, competition, intent, trend", priceMicros: 12000, priceDate: "2026-09-16", note: "up to 700 keywords" },
  { operationId: "dataforseo-dataforseo-labs-bulk-keyword-difficulty-live-ai", jobId: "dataforseolabs.bulk-keyword-difficulty.live-ai", feature: "Keyword difficulty", priceMicros: 12000, priceDate: "2026-09-16", note: "up to 1,000 keywords" },
  { operationId: "dataforseo-dataforseo-labs-google-competitors-domain-live-ai", jobId: "dataforseolabs.google.competitors-domain.live-ai", feature: "Competitor discovery", priceMicros: 12000, priceDate: "2026-09-16" },
  { operationId: "dataforseo-dataforseo-labs-google-domain-intersection-live-ai", jobId: "dataforseolabs.google.domain-intersection.live-ai", feature: "Competitor keyword overlap", priceMicros: 12000, priceDate: "2026-09-16", note: "one competitor per call" },
  { operationId: "dataforseo-dataforseo-labs-google-domain-rank-overview-live-ai", jobId: "keywords.domain.overview", feature: "Domain search overview", priceMicros: 12000, priceDate: "2026-09-16" },
  { operationId: "dataforseo-backlinks-summary-live-ai", jobId: "backlinks.domain.summary", feature: "Backlink totals", priceMicros: 24000, priceDate: "2026-09-16" },
  { operationId: "dataforseo-backlinks-referring-domains-live-ai", jobId: "backlinks.referring.domains", feature: "Referring domains list", priceMicros: 24000, priceDate: "2026-09-15" },
  { operationId: "dataforseo-backlinks-timeseries-new-lost-summary-live-ai", jobId: "backlinks.timeseries-new-lost-summary.live-ai", feature: "New and lost links over time", priceMicros: 24000, priceDate: "2026-09-16" },
];

export const OP = {
  serper: "serper-search",
  anyapi: "anyapi-run-google-search",
  cloro: "cloro-monitor-google-ai-overview",
  ideas: "dataforseo-dataforseo-labs-google-keyword-ideas-live-ai",
  related: "dataforseo-dataforseo-labs-google-related-keywords-live-ai",
  autocomplete: "serper-autocomplete",
  overview: "dataforseo-dataforseo-labs-google-keyword-overview-live-ai",
  difficulty: "dataforseo-dataforseo-labs-bulk-keyword-difficulty-live-ai",
  competitors: "dataforseo-dataforseo-labs-google-competitors-domain-live-ai",
  intersection: "dataforseo-dataforseo-labs-google-domain-intersection-live-ai",
  domainOverview: "dataforseo-dataforseo-labs-google-domain-rank-overview-live-ai",
  blSummary: "dataforseo-backlinks-summary-live-ai",
  blDomains: "dataforseo-backlinks-referring-domains-live-ai",
  blNewLost: "dataforseo-backlinks-timeseries-new-lost-summary-live-ai",
} as const;

/** The SERP operations a project may pin for rank checks. */
export const SERP_OPERATIONS = [OP.serper, OP.anyapi] as const;

/** Catalog row for an operation id. Throws for an id this app does not pin. */
export function catalogEntry(operationId: string): CatalogEntry {
  const e = CATALOG.find((c) => c.operationId === operationId);
  if (!e) throw new Error(`Operation ${operationId} is not in the pinned catalog`);
  return e;
}

/** Fallback price for an operation, in micros. */
export function fallbackPrice(operationId: string): Micros {
  return catalogEntry(operationId).priceMicros;
}

export type PriceSource = (operationId: string) => Micros;

/** A price source that reads the fallback table only. Used in demo mode and in tests. */
export const fallbackPrices: PriceSource = fallbackPrice;

/** Calls needed to see `depth` results at 10 results per call. */
export function pagesForDepth(depth: number): number {
  return Math.max(1, Math.ceil(depth / 10));
}
