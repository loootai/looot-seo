import { z } from "zod";
import { num, str } from "./shared";

/** One keyword with the numbers DataForSEO Labs attaches to it. Used by ideas, related and overview. */
export interface KeywordNumbers {
  phrase: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  intent: string | null;
  monthly: { month: string; volume: number }[] | null;
}

export const KeywordItem = z.looseObject({
  keyword: str,
  keyword_info: z
    .looseObject({
      search_volume: num,
      cpc: num,
      competition: num,
      monthly_searches: z.array(z.looseObject({ year: num, month: num, search_volume: num })).nullish().catch(undefined),
    })
    .nullish()
    .catch(undefined),
  keyword_properties: z.looseObject({ keyword_difficulty: num }).nullish().catch(undefined),
  search_intent_info: z.looseObject({ main_intent: str }).nullish().catch(undefined),
});

/** Turns one loose DataForSEO keyword item into KeywordNumbers, or null when it has no keyword. */
export function toNumbers(item: z.infer<typeof KeywordItem>): KeywordNumbers | null {
  if (!item.keyword) return null;
  const info = item.keyword_info;
  const monthly = (info?.monthly_searches ?? [])
    .filter((m) => m.year && m.month && typeof m.search_volume === "number")
    .map((m) => ({ month: `${m.year}-${String(m.month).padStart(2, "0")}`, volume: m.search_volume as number }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
  const kd = item.keyword_properties?.keyword_difficulty;
  return {
    phrase: item.keyword,
    volume: info?.search_volume ?? null,
    cpc: info?.cpc ?? null,
    competition: info?.competition ?? null,
    difficulty: typeof kd === "number" ? Math.max(0, Math.min(100, Math.round(kd))) : null,
    intent: item.search_intent_info?.main_intent ?? null,
    monthly: monthly.length ? monthly : null,
  };
}
