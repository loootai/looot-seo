import { z } from "zod";
import { dfsItems, fail, num, ok, str, type Parsed } from "./shared";

const Item = z.looseObject({ date: str, new_backlinks: num, lost_backlinks: num, new_referring_domains: num, lost_referring_domains: num });

/** DataForSEO new and lost backlinks per month, oldest first, last 12 months. */
export function parse(raw: unknown): Parsed<{ month: string; new: number; lost: number }[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(Item).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(
    r.data
      .filter((i) => i.date)
      .map((i) => ({ month: (i.date as string).slice(0, 7), new: i.new_backlinks ?? 0, lost: i.lost_backlinks ?? 0 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12),
  );
}
