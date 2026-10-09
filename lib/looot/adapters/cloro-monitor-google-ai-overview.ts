import { z } from "zod";
import { fail, num, ok, str, toOrganic, type Parsed, type SerpParts } from "./shared";
import { hostOf } from "@/lib/utils";

const Row = z.looseObject({ title: str, link: str, url: str, snippet: str, description: str, position: num });
const Source = z.looseObject({ label: str, title: str, url: str, link: str });
const Result = z.looseObject({
  organicResults: z.array(Row).optional().catch(undefined),
  organic: z.array(Row).optional().catch(undefined),
  aioverview: z.looseObject({ text: str, markdown: str, sources: z.array(Source).optional().catch(undefined) }).nullish().catch(undefined),
  peopleAlsoAsk: z.array(z.looseObject({ question: str, snippet: str, answer: str, link: str, url: str })).optional().catch(undefined),
  relatedSearches: z.array(z.union([z.string(), z.looseObject({ query: str })])).optional().catch(undefined),
});

/** Cloro Google monitor with the AI Overview add-on: overview text, its sources, organic results, People also ask. */
export function parse(raw: unknown): Parsed<SerpParts> {
  const inner = raw && typeof raw === "object" && "result" in raw ? (raw as { result: unknown }).result : raw;
  const r = Result.safeParse(inner);
  if (!r.success) return fail("body is not an object");
  const list = r.data.organicResults ?? r.data.organic;
  if (!list) return fail("no organic list");
  const aio = r.data.aioverview;
  const text = aio?.text ?? aio?.markdown ?? "";
  return ok({
    organic: toOrganic(list),
    ai_overview: text
      ? {
          text,
          sources: (aio?.sources ?? [])
            .map((s) => ({ title: s.label ?? s.title ?? "", url: s.url ?? s.link ?? "" }))
            .filter((s) => s.url)
            .map((s) => ({ ...s, host: hostOf(s.url) })),
        }
      : null,
    aio_checked: true,
    people_also_ask: (r.data.peopleAlsoAsk ?? []).filter((q) => q.question).map((q) => ({ question: q.question as string, snippet: q.snippet ?? q.answer ?? "", url: q.link ?? q.url ?? "", host: hostOf(q.link ?? q.url ?? "") })),
    related: (r.data.relatedSearches ?? []).map((s) => (typeof s === "string" ? s : s.query)).filter((s): s is string => Boolean(s)),
    answer_box: null,
    knowledge: null,
  });
}
