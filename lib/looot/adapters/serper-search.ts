import { z } from "zod";
import { fail, num, ok, str, toOrganic, type Parsed, type SerpParts } from "./shared";
import { hostOf } from "@/lib/utils";

const Body = z.looseObject({
  organic: z.array(z.looseObject({ title: str, link: str, snippet: str, position: num })),
  peopleAlsoAsk: z.array(z.looseObject({ question: str, snippet: str, link: str, title: str })).optional().catch(undefined),
  relatedSearches: z.array(z.looseObject({ query: str })).optional().catch(undefined),
  answerBox: z.looseObject({ title: str, snippet: str, answer: str, link: str }).optional().catch(undefined),
  knowledgeGraph: z.looseObject({ title: str, description: str, descriptionLink: str, website: str }).optional().catch(undefined),
});

/** Serper Google search: organic results, People also ask, related searches, answer box, knowledge panel. */
export function parse(raw: unknown): Parsed<SerpParts> {
  const r = Body.safeParse(raw);
  if (!r.success) return fail("no organic list");
  const b = r.data;
  const ab = b.answerBox;
  const kg = b.knowledgeGraph;
  const kgUrl = kg?.website ?? kg?.descriptionLink ?? "";
  return ok({
    organic: toOrganic(b.organic),
    ai_overview: null,
    aio_checked: false,
    people_also_ask: (b.peopleAlsoAsk ?? []).filter((q) => q.question).map((q) => ({ question: q.question as string, snippet: q.snippet ?? "", url: q.link ?? "", host: hostOf(q.link ?? "") })),
    related: (b.relatedSearches ?? []).map((s) => s.query).filter((s): s is string => Boolean(s)),
    answer_box: ab && (ab.snippet || ab.answer) ? { title: ab.title ?? "", snippet: ab.snippet ?? ab.answer ?? "", url: ab.link ?? "", host: hostOf(ab.link ?? "") } : null,
    knowledge: kg?.title ? { title: kg.title, snippet: kg.description ?? "", url: kgUrl, host: hostOf(kgUrl) } : null,
  });
}
