import { z } from "zod";
import { fail, num, ok, str, toOrganic, type Parsed, type SerpParts } from "./shared";
import { hostOf } from "@/lib/utils";

const Row = z.looseObject({ title: str, link: str, url: str, snippet: str, description: str, position: num });
const Body = z.looseObject({
  organic: z.array(Row).optional().catch(undefined),
  organic_results: z.array(Row).optional().catch(undefined),
  results: z.array(Row).optional().catch(undefined),
  people_also_ask: z.array(z.looseObject({ question: str, snippet: str, link: str })).optional().catch(undefined),
  peopleAlsoAsk: z.array(z.looseObject({ question: str, snippet: str, link: str })).optional().catch(undefined),
  related_searches: z.array(z.looseObject({ query: str })).optional().catch(undefined),
  relatedSearches: z.array(z.looseObject({ query: str })).optional().catch(undefined),
});

/** AnyAPI Google search. The list may arrive as organic, organic_results or results, at the top level or under data. */
export function parse(raw: unknown): Parsed<SerpParts> {
  const inner = raw && typeof raw === "object" && "data" in raw && typeof (raw as { data: unknown }).data === "object" ? (raw as { data: unknown }).data : raw;
  const r = Body.safeParse(inner);
  if (!r.success) return fail("body is not an object");
  const list = r.data.organic ?? r.data.organic_results ?? r.data.results;
  if (!list) return fail("no organic list");
  const paa = r.data.people_also_ask ?? r.data.peopleAlsoAsk ?? [];
  const related = r.data.related_searches ?? r.data.relatedSearches ?? [];
  return ok({
    organic: toOrganic(list),
    ai_overview: null,
    aio_checked: false,
    people_also_ask: paa.filter((q) => q.question).map((q) => ({ question: q.question as string, snippet: q.snippet ?? "", url: q.link ?? "", host: hostOf(q.link ?? "") })),
    related: related.map((s) => s.query).filter((s): s is string => Boolean(s)),
    answer_box: null,
    knowledge: null,
  });
}
