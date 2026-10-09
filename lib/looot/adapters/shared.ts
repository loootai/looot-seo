import { z } from "zod";
import type { AiOverview, FeatureBox, OrganicRow, PaaRow } from "@/lib/types";
import { hostOf } from "@/lib/utils";

/** Result of an adapter: the normalised data, or a note that the body could not be read. */
export type Parsed<T> = { ok: true; data: T } | { ok: false; reason: string };

export const fail = (reason: string): Parsed<never> => ({ ok: false, reason });
export const ok = <T>(data: T): Parsed<T> => ({ ok: true, data });

/** Optional string that turns a wrong type into undefined instead of failing the whole body. */
export const str = z.string().optional().catch(undefined);
/** Optional number that also accepts numeric strings. */
export const num = z
  .union([z.number(), z.string().transform((s) => Number(s))])
  .optional()
  .catch(undefined)
  .transform((n) => (typeof n === "number" && Number.isFinite(n) ? n : undefined));

/** The parts of a search result page every SERP adapter returns. */
export interface SerpParts {
  organic: OrganicRow[];
  ai_overview: AiOverview | null;
  aio_checked: boolean;
  people_also_ask: PaaRow[];
  related: string[];
  answer_box: FeatureBox | null;
  knowledge: FeatureBox | null;
}

/** Builds organic rows from loose items, numbering by order when the provider sends no position. */
export function toOrganic(items: { title?: string; link?: string; url?: string; snippet?: string; description?: string; position?: number }[]): OrganicRow[] {
  const rows: OrganicRow[] = [];
  items.forEach((it, i) => {
    const url = it.link ?? it.url;
    if (!url) return;
    rows.push({ position: it.position ?? i + 1, title: it.title ?? url, url, host: hostOf(url), snippet: it.snippet ?? it.description ?? "" });
  });
  return rows;
}

/**
 * DataForSEO bodies carry the payload at tasks[0].result[0]. The "-live-ai" operations may
 * return a reduced body with the payload at the top level or under result. This returns
 * the first object that looks like the payload.
 */
export function dfsPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const tasks = body.tasks;
  if (Array.isArray(tasks) && tasks[0] && typeof tasks[0] === "object") {
    const result = (tasks[0] as Record<string, unknown>).result;
    if (Array.isArray(result) && result[0] && typeof result[0] === "object") return result[0] as Record<string, unknown>;
    return null;
  }
  const result = body.result;
  if (Array.isArray(result) && result[0] && typeof result[0] === "object") return result[0] as Record<string, unknown>;
  if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
  return body;
}

/** The items list of a DataForSEO payload, or null when there is none. */
export function dfsItems(raw: unknown): unknown[] | null {
  const p = dfsPayload(raw);
  if (!p) return null;
  if (Array.isArray(p.items)) return p.items;
  if (p.items === null && typeof p.items_count === "number") return [];
  return null;
}
