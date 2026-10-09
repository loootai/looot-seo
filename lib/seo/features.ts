import type { SerpFeatures, SerpSnapshot } from "@/lib/types";
import { matchesDomain } from "@/lib/seo/position";

type Parts = Pick<SerpSnapshot, "ai_overview" | "people_also_ask" | "answer_box" | "knowledge">;

/** Which SERP features a snapshot shows, and which of them cite or belong to the project domain. */
export function featuresOf(parts: Parts, domain: string, includeSubdomains: boolean): SerpFeatures {
  const owns = (host: string | undefined | null) => Boolean(host) && matchesDomain(host as string, domain, includeSubdomains);
  return {
    aio: { present: Boolean(parts.ai_overview?.text), cited: Boolean(parts.ai_overview?.sources.some((s) => owns(s.host))) },
    paa: { present: parts.people_also_ask.length > 0, owned: parts.people_also_ask.some((q) => owns(q.host)) },
    answer_box: { present: Boolean(parts.answer_box), owned: owns(parts.answer_box?.host) },
    knowledge: { present: Boolean(parts.knowledge) },
  };
}

export const EMPTY_FEATURES: SerpFeatures = {
  aio: { present: false, cited: false },
  paa: { present: false, owned: false },
  answer_box: { present: false, owned: false },
  knowledge: { present: false },
};
