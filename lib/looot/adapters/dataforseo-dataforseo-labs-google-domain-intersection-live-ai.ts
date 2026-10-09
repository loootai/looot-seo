import { z } from "zod";
import { dfsItems, fail, num, ok, str, type Parsed } from "./shared";
import type { OverlapRow } from "@/lib/types";

const Serp = z.looseObject({ rank_absolute: num, rank_group: num }).nullish().catch(undefined);
const Item = z.looseObject({
  keyword_data: z.looseObject({ keyword: str, keyword_info: z.looseObject({ search_volume: num }).nullish().catch(undefined) }).nullish().catch(undefined),
  first_domain_serp_element: Serp,
  second_domain_serp_element: Serp,
});

/** DataForSEO Labs domain intersection: keywords both domains rank for. target1 is the project, target2 the competitor. */
export function parse(raw: unknown): Parsed<OverlapRow[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(Item).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(
    r.data
      .filter((i) => i.keyword_data?.keyword)
      .slice(0, 200)
      .map((i) => ({
        phrase: i.keyword_data?.keyword as string,
        volume: i.keyword_data?.keyword_info?.search_volume ?? null,
        our_position: i.first_domain_serp_element?.rank_group ?? i.first_domain_serp_element?.rank_absolute ?? null,
        their_position: i.second_domain_serp_element?.rank_group ?? i.second_domain_serp_element?.rank_absolute ?? null,
      })),
  );
}
