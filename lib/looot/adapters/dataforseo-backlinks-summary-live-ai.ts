import { z } from "zod";
import { dfsPayload, fail, num, ok, type Parsed } from "./shared";

const Body = z.looseObject({ backlinks: num, referring_domains: num, rank: num, backlinks_spam_score: num, broken_backlinks: num });

export interface BacklinkSummary {
  backlinks: number | null;
  referring_domains: number | null;
  domain_rank: number | null;
  spam_score: number | null;
  broken_backlinks: number | null;
}

/** DataForSEO backlinks summary: totals for one domain. The rank arrives on a 0 to 1,000 scale and is shown as 0 to 100. */
export function parse(raw: unknown): Parsed<BacklinkSummary> {
  const p = dfsPayload(raw);
  const r = Body.safeParse(p);
  if (!r.success || (r.data.backlinks === undefined && r.data.referring_domains === undefined)) return fail("no backlink totals");
  const rank = r.data.rank;
  return ok({
    backlinks: r.data.backlinks ?? null,
    referring_domains: r.data.referring_domains ?? null,
    domain_rank: typeof rank === "number" ? Math.round(rank > 100 ? rank / 10 : rank) : null,
    spam_score: r.data.backlinks_spam_score ?? null,
    broken_backlinks: r.data.broken_backlinks ?? null,
  });
}
