import { z } from "zod";
import { dfsItems, fail, num, ok, str, type Parsed } from "./shared";
import type { CompetitorSuggestion } from "@/lib/types";

const Item = z.looseObject({ domain: str, avg_position: num, intersections: num });

/** DataForSEO Labs competitors: domains that rank for the same keywords, with the shared count and their average position. */
export function parse(raw: unknown): Parsed<CompetitorSuggestion[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(Item).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(r.data.filter((i) => i.domain).map((i) => ({ domain: (i.domain as string).replace(/^www\./, ""), intersections: i.intersections ?? null, avg_position: i.avg_position ?? null })));
}
