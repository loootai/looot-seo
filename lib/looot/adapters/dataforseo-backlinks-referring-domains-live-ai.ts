import { z } from "zod";
import { dfsItems, fail, num, ok, str, type Parsed } from "./shared";
import type { ReferringDomain } from "@/lib/types";

const Item = z.looseObject({
  domain: str,
  rank: num,
  backlinks: num,
  first_seen: str,
  referring_links_attributes: z.looseObject({ nofollow: num }).nullish().catch(undefined),
});

/** DataForSEO referring domains: the top linking domains by rank, at most 100. */
export function parse(raw: unknown): Parsed<ReferringDomain[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(Item).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(
    r.data
      .filter((i) => i.domain)
      .slice(0, 100)
      .map((i) => {
        const nofollow = i.referring_links_attributes?.nofollow;
        const share = i.backlinks && i.backlinks > 0 ? Math.round(Math.max(0, Math.min(1, 1 - (nofollow ?? 0) / i.backlinks)) * 1000) / 1000 : null;
        return {
          domain: i.domain as string,
          rank: typeof i.rank === "number" ? Math.round(i.rank > 100 ? i.rank / 10 : i.rank) : null,
          backlinks: i.backlinks ?? null,
          first_seen: i.first_seen ? i.first_seen.slice(0, 10) : null,
          dofollow_share: share,
        };
      }),
  );
}
