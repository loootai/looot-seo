import { fallbackPrices, type PriceSource } from "@/lib/looot/catalog";
import { buildQuote, QuoteError } from "@/lib/looot/quote";
import type { ActionKind, Competitor, Keyword, Project } from "@/lib/types";

/** Price shown on a paid button before the quote dialog opens. Built by the same code as the quote, on catalog prices. */
export function estimate(action: ActionKind, scope: Record<string, unknown>, ctx: { project: Project; keywords: Keyword[]; competitors: Competitor[]; today: string; price?: PriceSource }): number | null {
  try {
    return buildQuote(action, scope, { project: ctx.project, keywords: ctx.keywords, competitors: ctx.competitors, price: ctx.price ?? fallbackPrices, today: ctx.today }).totalMicros;
  } catch (e) {
    if (e instanceof QuoteError) return null;
    throw e;
  }
}
