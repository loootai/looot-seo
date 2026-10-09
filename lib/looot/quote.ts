import { OP, catalogEntry, pagesForDepth, type PriceSource } from "@/lib/looot/catalog";
import type { ActionKind, CallItem, Competitor, Keyword, Project, QuoteLine, Run, RunItem } from "@/lib/types";
import type { Micros } from "@/lib/money";
import { normalisePhrase } from "@/lib/utils";

export interface QuoteContext {
  project: Project;
  keywords: Keyword[];
  competitors: Competitor[];
  price: PriceSource;
  /** Set for retry_failed: the run being retried and all of its items. */
  retry?: { run: Run; items: RunItem[] };
  /** Today as YYYY-MM-DD, used for date ranges sent to providers. */
  today: string;
}

export interface BuiltQuote {
  action: ActionKind;
  title: string;
  lines: QuoteLine[];
  items: CallItem[];
  totalMicros: Micros;
}

/** Thrown when a quote request cannot be turned into calls. The route answers 400 with the message. */
export class QuoteError extends Error {}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Input for one page of Google results, in the field names each SERP operation expects. */
export function serpInput(operationId: string, phrase: string, project: Project, page: number): Record<string, unknown> {
  if (operationId === OP.cloro) return { query: phrase, gl: project.country.toUpperCase(), hl: project.language, include: ["aioverview"], pages: 1 };
  if (operationId === OP.anyapi) return { query: phrase, gl: project.country.toLowerCase(), hl: project.language, page };
  return { q: phrase, gl: project.country.toLowerCase(), hl: project.language, page };
}

function line(key: string, label: string, operationId: string, calls: number, unit: Micros, optional: boolean, detail?: string): QuoteLine {
  return { key, label, detail, operationId, calls, unitPriceMicros: unit, subtotalMicros: calls * unit, optional, priceDate: catalogEntry(operationId).priceDate };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function rankItems(keywords: Keyword[], pages: number, ctx: QuoteContext): { lines: QuoteLine[]; items: CallItem[] } {
  const serpOp = ctx.project.serp_operation || OP.serper;
  const serpPrice = ctx.price(serpOp);
  const cloroPrice = ctx.price(OP.cloro);
  const extra = Math.max(0, cloroPrice - serpPrice);
  const items: CallItem[] = [];
  let aio = 0;
  for (const kw of keywords) {
    for (let p = 1; p <= pages; p++) {
      const base = { itemKey: `kw:${kw.id}:p${p}`, lineKey: "rank", group: `kw:${kw.id}` };
      if (kw.track_ai_overview && p === 1) {
        aio += 1;
        items.push({ ...base, operationId: OP.cloro, input: serpInput(OP.cloro, kw.phrase, ctx.project, 1), unitPriceMicros: serpPrice + extra, addOn: { lineKey: "aio", micros: extra } });
      } else {
        items.push({ ...base, operationId: serpOp, input: serpInput(serpOp, kw.phrase, ctx.project, p), unitPriceMicros: serpPrice });
      }
    }
  }
  const lines = [line("rank", "Rank check", serpOp, keywords.length * pages, serpPrice, false, `${plural(keywords.length, "keyword")} x ${plural(pages, "page")}`)];
  if (aio > 0) lines.push(line("aio", "AI Overview add-on", OP.cloro, aio, extra, true, `${plural(aio, "keyword")}, replaces page 1`));
  return { lines, items };
}

/**
 * Turns an action and its scope into the exact list of looot calls and the quote lines shown
 * to the user. Pure: prices come from ctx.price, nothing is fetched and nothing is stored.
 */
export function buildQuote(action: ActionKind, scope: Record<string, unknown>, ctx: QuoteContext): BuiltQuote {
  const { project } = ctx;
  const market = { location_name: project.location_name, language_code: project.language };
  let title = "";
  let lines: QuoteLine[] = [];
  let items: CallItem[] = [];
  const one = (key: string, label: string, operationId: string, input: Record<string, unknown>, group: string, optional = false, detail?: string) => {
    const unit = ctx.price(operationId);
    lines.push(line(key, label, operationId, 1, unit, optional, detail));
    items.push({ itemKey: key, lineKey: key, group, operationId, input, unitPriceMicros: unit });
  };

  switch (action) {
    case "check_rankings": {
      const ids = Array.isArray(scope.keywordIds) ? new Set(scope.keywordIds as string[]) : null;
      const kws = ctx.keywords.filter((k) => !ids || ids.has(k.id));
      if (kws.length === 0) throw new QuoteError("There are no keywords to check.");
      ({ lines, items } = rankItems(kws, pagesForDepth(project.depth), ctx));
      title = `Check rankings for ${plural(kws.length, "keyword")}`;
      break;
    }
    case "fetch_snapshot": {
      const kw = ctx.keywords.find((k) => k.id === scope.keywordId);
      if (!kw) throw new QuoteError("That keyword is not in this project.");
      ({ lines, items } = rankItems([kw], 1, ctx));
      lines[0] = { ...(lines[0] as QuoteLine), label: "SERP snapshot", detail: "1 keyword x 1 page" };
      title = `Fetch a fresh snapshot for "${kw.phrase}"`;
      break;
    }
    case "research": {
      const seeds = (Array.isArray(scope.seeds) ? (scope.seeds as string[]) : []).map(normalisePhrase).filter(Boolean).slice(0, 5);
      const sources = Array.isArray(scope.sources) ? (scope.sources as string[]) : [];
      if (seeds.length === 0) throw new QuoteError("Add at least one seed keyword.");
      if (sources.length === 0) throw new QuoteError("Pick at least one source.");
      const m = { location_name: typeof scope.location_name === "string" ? scope.location_name : market.location_name, language_code: typeof scope.language === "string" ? scope.language : market.language_code };
      const gl = (typeof scope.country === "string" ? scope.country : project.country).toLowerCase();
      if (sources.includes("ideas")) one("ideas", "Keyword ideas", OP.ideas, { keywords: seeds, ...m, limit: 100 }, "research", false, `${plural(seeds.length, "seed")}, 1 call`);
      if (sources.includes("related")) {
        const unit = ctx.price(OP.related);
        lines.push(line("related", "Related keywords", OP.related, seeds.length, unit, false, "1 call per seed"));
        seeds.forEach((s, i) => items.push({ itemKey: `related:${i}`, lineKey: "related", group: "research", operationId: OP.related, input: { keyword: s, ...m, depth: 1, limit: 50 }, unitPriceMicros: unit }));
      }
      if (sources.includes("autocomplete")) {
        const unit = ctx.price(OP.autocomplete);
        lines.push(line("autocomplete", "Autocomplete suggestions", OP.autocomplete, seeds.length, unit, false, "1 call per seed"));
        seeds.forEach((s, i) => items.push({ itemKey: `autocomplete:${i}`, lineKey: "autocomplete", group: "research", operationId: OP.autocomplete, input: { q: s, gl, hl: m.language_code }, unitPriceMicros: unit }));
      }
      title = `Find keywords from ${plural(seeds.length, "seed")}`;
      break;
    }
    case "keyword_metrics": {
      const phrases = [...new Set((Array.isArray(scope.phrases) ? (scope.phrases as string[]) : []).map(normalisePhrase).filter(Boolean))];
      if (phrases.length === 0) throw new QuoteError("There are no keywords to get numbers for.");
      const ov = chunk(phrases, 700);
      const kd = chunk(phrases, 1000);
      const ovUnit = ctx.price(OP.overview);
      const kdUnit = ctx.price(OP.difficulty);
      lines.push(line("overview", "Volume, CPC, competition, intent", OP.overview, ov.length, ovUnit, false, "up to 700 keywords per call"));
      lines.push(line("difficulty", "Keyword difficulty", OP.difficulty, kd.length, kdUnit, true, "up to 1,000 keywords per call"));
      ov.forEach((c, i) => items.push({ itemKey: `overview:${i}`, lineKey: "overview", group: "metrics", operationId: OP.overview, input: { keywords: c, ...market }, unitPriceMicros: ovUnit }));
      kd.forEach((c, i) => items.push({ itemKey: `difficulty:${i}`, lineKey: "difficulty", group: "metrics", operationId: OP.difficulty, input: { keywords: c, ...market }, unitPriceMicros: kdUnit }));
      title = `Get volume and difficulty for ${plural(phrases.length, "keyword")}`;
      break;
    }
    case "suggest_competitors": {
      one("suggest", "Competitor discovery", OP.competitors, { target: project.domain, ...market, exclude_top_domains: true, limit: 20 }, "suggest");
      title = `Suggest competitors for ${project.domain}`;
      break;
    }
    case "competitor_overlap": {
      const c = ctx.competitors.find((x) => x.id === scope.competitorId);
      if (!c) throw new QuoteError("That competitor is not in this project.");
      one("overlap", `Keyword overlap with ${c.domain}`, OP.intersection, { target1: project.domain, target2: c.domain, ...market, limit: 200, order_by: ["keyword_data.keyword_info.search_volume,desc"] }, `overlap:${c.id}`);
      title = `Fetch overlap with ${c.domain}`;
      break;
    }
    case "backlinks": {
      const domain = typeof scope.domain === "string" && scope.domain ? scope.domain : project.domain;
      const parts = Array.isArray(scope.parts) ? (scope.parts as string[]) : ["summary", "domains", "newlost"];
      const own = domain === project.domain;
      const from = new Date(`${ctx.today}T00:00:00Z`);
      from.setUTCMonth(from.getUTCMonth() - 12);
      if (parts.includes("summary")) one("summary", "Backlink totals", OP.blSummary, { target: domain, include_subdomains: true, exclude_internal_backlinks: true }, `bl:${domain}`, own);
      if (parts.includes("domains")) one("domains", "Referring domains, top 100", OP.blDomains, { target: domain, limit: 100, order_by: ["rank,desc"] }, `bl:${domain}`, own);
      if (parts.includes("newlost")) one("newlost", "New and lost links, 12 months", OP.blNewLost, { target: domain, date_from: from.toISOString().slice(0, 10), group_range: "month" }, `bl:${domain}`, own);
      if (items.length === 0) throw new QuoteError("Pick at least one backlink call.");
      title = `Refresh backlink data for ${domain}`;
      break;
    }
    case "domain_overview": {
      const domain = typeof scope.domain === "string" && scope.domain ? scope.domain : project.domain;
      one("domain_overview", "Domain search overview", OP.domainOverview, { target: domain, ...market }, `do:${domain}`);
      title = `Refresh domain overview for ${domain}`;
      break;
    }
    case "retry_failed": {
      const retry = ctx.retry;
      if (!retry) throw new QuoteError("That run was not found.");
      const failedGroups = new Set<string>();
      const groupOf = (key: string) => (key.startsWith("kw:") ? key.split(":").slice(0, 2).join(":") : null);
      const failed = retry.items.filter((i) => i.status === "failed" || i.status === "timed_out");
      if (failed.length === 0) throw new QuoteError("That run has no failed calls to retry.");
      for (const f of failed) failedGroups.add(groupOf(f.item_key) ?? f.item_key);
      // A keyword is stored from all of its pages, so every page of a failed keyword is sent again.
      // Pages that already succeeded carry their first idempotency key and looot replays them at no charge.
      const again = retry.items.filter((i) => failedGroups.has(groupOf(i.item_key) ?? i.item_key));
      const byOp = new Map<string, RunItem[]>();
      for (const it of again) byOp.set(it.operation_id, [...(byOp.get(it.operation_id) ?? []), it]);
      for (const [op, list] of byOp) {
        const unit = Math.max(ctx.price(op), ...list.map((l) => l.unit_price_micros));
        lines.push(line(`retry:${op}`, catalogEntry(op).feature, op, list.length, unit, false, "same idempotency keys as the first attempt"));
        for (const it of list) {
          items.push({ itemKey: it.item_key, lineKey: `retry:${op}`, group: groupOf(it.item_key) ?? retryGroup(retry.run.action, it.item_key), operationId: op, input: it.input, unitPriceMicros: unit, idempotencyKey: `${retry.run.id}:${it.item_key}` });
        }
      }
      title = `Retry ${plural(failed.length, "failed call")}`;
      action = retry.run.action;
      break;
    }
    default:
      throw new QuoteError(`Unknown action ${String(action)}`);
  }
  return { action, title, lines, items, totalMicros: lines.reduce((s, l) => s + l.subtotalMicros, 0) };
}

function retryGroup(action: ActionKind, itemKey: string): string {
  if (action === "research") return "research";
  if (action === "keyword_metrics") return "metrics";
  return itemKey;
}

/**
 * Applies the lines a user unticked in the quote dialog. Items of a dropped line are removed.
 * An item that carried a dropped add-on falls back to the plain SERP call for the same keyword.
 */
export function selectLines(quote: { lines: QuoteLine[]; items: CallItem[] }, disabled: string[], project: Project): { lines: QuoteLine[]; items: CallItem[]; totalMicros: Micros } {
  const off = new Set(disabled.filter((k) => quote.lines.find((l) => l.key === k)?.optional));
  const lines = quote.lines.filter((l) => !off.has(l.key));
  const items: CallItem[] = [];
  for (const it of quote.items) {
    if (off.has(it.lineKey)) continue;
    if (it.addOn && off.has(it.addOn.lineKey)) {
      const op = project.serp_operation || OP.serper;
      const phrase = String(it.input.query ?? it.input.q ?? "");
      items.push({ itemKey: it.itemKey, lineKey: it.lineKey, group: it.group, operationId: op, input: serpInput(op, phrase, project, 1), unitPriceMicros: it.unitPriceMicros - it.addOn.micros });
    } else items.push(it);
  }
  return { lines, items, totalMicros: lines.reduce((s, l) => s + l.subtotalMicros, 0) };
}
