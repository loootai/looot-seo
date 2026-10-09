import { parseWith, type KeywordNumbers, type SerpParts } from "@/lib/looot/adapters";
import { OP } from "@/lib/looot/catalog";
import type { ItemOutcome } from "@/lib/looot/run";
import type { DataStore } from "@/lib/data/store";
import { featuresOf } from "@/lib/seo/features";
import { findPosition } from "@/lib/seo/position";
import type { ActionKind, Competitor, Keyword, OrganicRow, Project, ResearchResult } from "@/lib/types";
import { normalisePhrase } from "@/lib/utils";

export interface ApplyContext {
  store: DataStore;
  project: Project;
  keywords: Keyword[];
  competitors: Competitor[];
  runId: string;
  action: ActionKind;
  scope: Record<string, unknown>;
  simulated: boolean;
}

/** What apply learned about one item: whether its body could be read, and a small result to keep on the item. */
export type ItemNote = { parse_ok: boolean; result?: unknown };

const RAW_LIMIT_BYTES = 512 * 1024;
const SERP_OPS = new Set<string>([OP.serper, OP.anyapi, OP.cloro]);

function capRaw(raw: unknown): unknown {
  try {
    return JSON.stringify(raw).length > RAW_LIMIT_BYTES ? null : raw;
  } catch {
    return null;
  }
}

function pageOf(itemKey: string): number {
  const m = /:p(\d+)$/.exec(itemKey);
  return m ? Number(m[1]) : 1;
}

/** Joins result pages into one list. A provider that restarts positions at 1 on each page is offset by the page number. */
export function mergePages(pages: { page: number; organic: OrganicRow[] }[]): OrganicRow[] {
  const out: OrganicRow[] = [];
  for (const p of [...pages].sort((a, b) => a.page - b.page)) {
    const offset = (p.page - 1) * 10;
    for (const r of p.organic) out.push({ ...r, position: p.page > 1 && r.position <= 10 ? offset + r.position : r.position });
  }
  return out.sort((a, b) => a.position - b.position);
}

async function applyKeyword(ctx: ApplyContext, keywordId: string, outcomes: ItemOutcome[], notes: Map<string, ItemNote>): Promise<void> {
  const kw = ctx.keywords.find((k) => k.id === keywordId);
  const done = outcomes.filter((o) => o.status === "completed").sort((a, b) => pageOf(a.item.itemKey) - pageOf(b.item.itemKey));
  const first = done.find((o) => pageOf(o.item.itemKey) === 1);
  if (!kw || !first) return;
  const parsed = done.map((o) => ({ o, page: pageOf(o.item.itemKey), r: SERP_OPS.has(o.item.operationId) ? parseWith(o.item.operationId as typeof OP.serper, o.raw) : ({ ok: false, reason: "not a SERP operation" } as const) }));
  for (const p of parsed) notes.set(p.o.item.itemKey, { parse_ok: p.r.ok });
  const head = parsed.find((p) => p.page === 1);
  const cost = done.reduce((s, o) => s + o.costMicros, 0);
  const now = ctx.store.now();
  const base = { project_id: ctx.project.id, keyword_id: kw.id, run_id: ctx.runId, fetched_at: now, operation_id: first.item.operationId, cost_micros: cost, looot_run_id: first.loootRunId, raw: capRaw(first.raw) };
  if (!head || !head.r.ok) {
    await ctx.store.insertSnapshot({ ...base, organic: [], ai_overview: null, aio_checked: first.item.operationId === OP.cloro, people_also_ask: [], related: [], answer_box: null, knowledge: null, parse_ok: false });
    return;
  }
  const parts: SerpParts = head.r.data;
  // Depth counts only the pages that came back in an unbroken run from page 1.
  const good: { page: number; organic: OrganicRow[] }[] = [];
  for (let page = 1; ; page++) {
    const p = parsed.find((x) => x.page === page);
    if (!p || !p.r.ok) break;
    good.push({ page, organic: p.r.data.organic });
  }
  const organic = mergePages(good);
  const snapshotId = await ctx.store.insertSnapshot({ ...base, organic, ai_overview: parts.ai_overview, aio_checked: parts.aio_checked, people_also_ask: parts.people_also_ask, related: parts.related, answer_box: parts.answer_box, knowledge: parts.knowledge, parse_ok: true });
  if (ctx.action === "fetch_snapshot") return;
  const pos = findPosition(organic, ctx.project.domain, ctx.project.include_subdomains, kw.target_url);
  await ctx.store.insertRankCheck(
    { project_id: ctx.project.id, keyword_id: kw.id, run_id: ctx.runId, checked_at: now, depth: good.length * 10, ...pos, features: featuresOf(parts, ctx.project.domain, ctx.project.include_subdomains), snapshot_id: snapshotId },
    ctx.simulated,
  );
}

async function applyResearch(ctx: ApplyContext, outcomes: ItemOutcome[], notes: Map<string, ItemNote>): Promise<void> {
  const results: ResearchResult[] = [];
  const seen = new Set<string>();
  const numbers: KeywordNumbers[] = [];
  const add = (phrase: string, source: ResearchResult["source"]) => {
    const n = normalisePhrase(phrase);
    if (!n || seen.has(n) || results.length >= 1000) return;
    seen.add(n);
    results.push({ phrase: n, source });
  };
  for (const o of outcomes) {
    if (o.status !== "completed") continue;
    if (o.item.operationId === OP.autocomplete) {
      const r = parseWith(OP.autocomplete, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) r.data.forEach((s) => add(s, "autocomplete"));
    } else if (o.item.operationId === OP.ideas || o.item.operationId === OP.related) {
      const r = parseWith(o.item.operationId, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) {
        r.data.forEach((k) => add(k.phrase, o.item.operationId === OP.ideas ? "ideas" : "related"));
        numbers.push(...r.data.filter((k) => k.volume !== null));
      }
    }
  }
  const seeds = Array.isArray(ctx.scope.seeds) ? (ctx.scope.seeds as string[]).map(normalisePhrase) : [];
  const sources = Array.isArray(ctx.scope.sources) ? (ctx.scope.sources as string[]) : [];
  const country = typeof ctx.scope.country === "string" ? ctx.scope.country : ctx.project.country;
  const language = typeof ctx.scope.language === "string" ? ctx.scope.language : ctx.project.language;
  if (outcomes.some((o) => o.status === "completed")) {
    await ctx.store.insertResearchRun({ project_id: ctx.project.id, run_id: ctx.runId, seeds, sources, country, language, results });
  }
  if (numbers.length) await ctx.store.upsertMetrics(ctx.project.id, numbers.map((k) => toMetric(k, country, language, ctx.store.now())), ctx.runId);
}

function toMetric(k: Partial<KeywordNumbers> & { phrase: string }, country: string, language: string, now: string) {
  return { phrase_norm: normalisePhrase(k.phrase), country, language, volume: k.volume ?? null, cpc: k.cpc ?? null, competition: k.competition ?? null, difficulty: k.difficulty ?? null, intent: k.intent ?? null, monthly: k.monthly ?? null, fetched_at: now };
}

async function applyMetrics(ctx: ApplyContext, outcomes: ItemOutcome[], notes: Map<string, ItemNote>): Promise<void> {
  const merged = new Map<string, Partial<KeywordNumbers> & { phrase: string }>();
  for (const o of outcomes) {
    if (o.status !== "completed") continue;
    if (o.item.operationId === OP.overview) {
      const r = parseWith(OP.overview, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) for (const k of r.data) merged.set(normalisePhrase(k.phrase), { ...merged.get(normalisePhrase(k.phrase)), ...stripNulls(k), phrase: k.phrase });
    } else if (o.item.operationId === OP.difficulty) {
      const r = parseWith(OP.difficulty, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) for (const k of r.data) if (k.difficulty !== null) merged.set(normalisePhrase(k.phrase), { ...merged.get(normalisePhrase(k.phrase)), phrase: k.phrase, difficulty: k.difficulty });
    }
  }
  if (merged.size) await ctx.store.upsertMetrics(ctx.project.id, [...merged.values()].map((k) => toMetric(k, ctx.project.country, ctx.project.language, ctx.store.now())), ctx.runId);
}

function stripNulls<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

async function applyBacklinks(ctx: ApplyContext, domain: string, outcomes: ItemOutcome[], notes: Map<string, ItemNote>): Promise<void> {
  const prev = (await ctx.store.listBacklinkSnapshots(ctx.project.id)).find((s) => s.domain === domain);
  const row = {
    project_id: ctx.project.id,
    domain,
    run_id: ctx.runId,
    fetched_at: ctx.store.now(),
    backlinks: prev?.backlinks ?? null,
    referring_domains: prev?.referring_domains ?? null,
    domain_rank: prev?.domain_rank ?? null,
    spam_score: prev?.spam_score ?? null,
    broken_backlinks: prev?.broken_backlinks ?? null,
    new_lost: prev?.new_lost ?? null,
    top_domains: prev?.top_domains ?? null,
  };
  let any = false;
  for (const o of outcomes) {
    if (o.status !== "completed") continue;
    if (o.item.operationId === OP.blSummary) {
      const r = parseWith(OP.blSummary, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) Object.assign(row, r.data), (any = true);
    } else if (o.item.operationId === OP.blDomains) {
      const r = parseWith(OP.blDomains, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) (row.top_domains = r.data), (any = true);
    } else if (o.item.operationId === OP.blNewLost) {
      const r = parseWith(OP.blNewLost, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) (row.new_lost = r.data), (any = true);
    }
  }
  if (any) await ctx.store.insertBacklinkSnapshot(row);
}

/**
 * Stores the results of one group of finished calls (the pages of one keyword, the calls of one
 * research run, the three backlink calls). A body the adapter cannot read is kept as raw JSON with
 * parse_ok = false; it is not a failed call, because looot charged for it.
 */
export async function applyGroup(ctx: ApplyContext, group: string, outcomes: ItemOutcome[]): Promise<Map<string, ItemNote>> {
  const notes = new Map<string, ItemNote>();
  if (group.startsWith("kw:")) await applyKeyword(ctx, group.slice(3), outcomes, notes);
  else if (group === "research") await applyResearch(ctx, outcomes, notes);
  else if (group === "metrics") await applyMetrics(ctx, outcomes, notes);
  else if (group.startsWith("bl:")) await applyBacklinks(ctx, group.slice(3), outcomes, notes);
  else {
    const o = outcomes.find((x) => x.status === "completed");
    if (!o) return notes;
    if (group === "suggest") {
      const r = parseWith(OP.competitors, o.raw);
      const taken = new Set([ctx.project.domain, ...ctx.competitors.map((c) => c.domain)]);
      notes.set(o.item.itemKey, { parse_ok: r.ok, result: r.ok ? r.data.filter((s) => !taken.has(s.domain)).slice(0, 20) : capRaw(o.raw) });
    } else if (group.startsWith("overlap:")) {
      const r = parseWith(OP.intersection, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) await ctx.store.insertOverlap({ project_id: ctx.project.id, competitor_id: group.slice(8), run_id: ctx.runId, fetched_at: ctx.store.now(), both_count: r.data.length, rows: r.data });
    } else if (group.startsWith("do:")) {
      const r = parseWith(OP.domainOverview, o.raw);
      notes.set(o.item.itemKey, { parse_ok: r.ok });
      if (r.ok) await ctx.store.insertDomainOverview({ project_id: ctx.project.id, domain: group.slice(3), fetched_at: ctx.store.now(), ...r.data }, ctx.runId);
    }
  }
  return notes;
}
