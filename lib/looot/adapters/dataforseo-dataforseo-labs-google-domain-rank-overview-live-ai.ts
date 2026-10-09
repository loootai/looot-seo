import { z } from "zod";
import { dfsItems, fail, num, ok, type Parsed } from "./shared";

const Organic = z.looseObject({ count: num, etv: num, pos_1: num, pos_2_3: num, pos_4_10: num, pos_11_20: num, pos_21_30: num, pos_31_40: num, pos_41_50: num });
const Item = z.looseObject({ metrics: z.looseObject({ organic: Organic.nullish().catch(undefined) }).nullish().catch(undefined) });

export interface DomainOverviewData {
  organic_keywords: number | null;
  est_traffic: number | null;
  distribution: Record<string, number>;
}

/** DataForSEO Labs domain rank overview: how many keywords a domain ranks for, by position range, and estimated traffic. */
export function parse(raw: unknown): Parsed<DomainOverviewData> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(Item).safeParse(items);
  if (!r.success) return fail("items are not objects");
  const o = r.data[0]?.metrics?.organic;
  if (!o) return fail("no organic metrics");
  const distribution: Record<string, number> = {};
  for (const k of ["pos_1", "pos_2_3", "pos_4_10", "pos_11_20", "pos_21_30", "pos_31_40", "pos_41_50"] as const) {
    if (typeof o[k] === "number") distribution[k] = o[k] as number;
  }
  return ok({ organic_keywords: o.count ?? null, est_traffic: o.etv ?? null, distribution });
}
