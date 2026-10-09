import { OP } from "@/lib/looot/catalog";
import type { Parsed } from "./shared";
import { parse as serper } from "./serper-search";
import { parse as anyapi } from "./anyapi-run-google-search";
import { parse as cloro } from "./cloro-monitor-google-ai-overview";
import { parse as autocomplete } from "./serper-autocomplete";
import { parse as ideas } from "./dataforseo-dataforseo-labs-google-keyword-ideas-live-ai";
import { parse as related } from "./dataforseo-dataforseo-labs-google-related-keywords-live-ai";
import { parse as overview } from "./dataforseo-dataforseo-labs-google-keyword-overview-live-ai";
import { parse as difficulty } from "./dataforseo-dataforseo-labs-bulk-keyword-difficulty-live-ai";
import { parse as competitors } from "./dataforseo-dataforseo-labs-google-competitors-domain-live-ai";
import { parse as intersection } from "./dataforseo-dataforseo-labs-google-domain-intersection-live-ai";
import { parse as domainOverview } from "./dataforseo-dataforseo-labs-google-domain-rank-overview-live-ai";
import { parse as blSummary } from "./dataforseo-backlinks-summary-live-ai";
import { parse as blDomains } from "./dataforseo-backlinks-referring-domains-live-ai";
import { parse as blNewLost } from "./dataforseo-backlinks-timeseries-new-lost-summary-live-ai";

/** One adapter per pinned operation. Each turns the provider's raw body into the shape the tables store. */
export const ADAPTERS = {
  [OP.serper]: serper,
  [OP.anyapi]: anyapi,
  [OP.cloro]: cloro,
  [OP.autocomplete]: autocomplete,
  [OP.ideas]: ideas,
  [OP.related]: related,
  [OP.overview]: overview,
  [OP.difficulty]: difficulty,
  [OP.competitors]: competitors,
  [OP.intersection]: intersection,
  [OP.domainOverview]: domainOverview,
  [OP.blSummary]: blSummary,
  [OP.blDomains]: blDomains,
  [OP.blNewLost]: blNewLost,
} as const;

/** Parses a raw body with the adapter of its operation. An unknown operation or a thrown error reads as not parsed. */
export function parseWith<K extends keyof typeof ADAPTERS>(operationId: K, raw: unknown): ReturnType<(typeof ADAPTERS)[K]> {
  try {
    return ADAPTERS[operationId](raw) as ReturnType<(typeof ADAPTERS)[K]>;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "adapter threw" } as Parsed<never> as ReturnType<(typeof ADAPTERS)[K]>;
  }
}

export type { Parsed, SerpParts } from "./shared";
export type { KeywordNumbers } from "./keywordInfo";
