import { MemoryStore } from "@/lib/data/memory";
import { DEMO_OWNER_EMAIL, LOOMWORK_RESEARCH, REFERRING_POOL, REFERRING_WORDS, SEED_PROJECTS, type SeedKeyword, type SeedProject } from "@/lib/demo/seed";
import { addDays, checkDays, checkTime, generateSerp, generatedKestrelKeywords, numbersFor, ownPath, positionSeries, rngFor, slug, type GeneratedSerp } from "@/lib/demo/generator";
import { OP, fallbackPrice, pagesForDepth } from "@/lib/looot/catalog";
import { buildQuote } from "@/lib/looot/quote";
import { fallbackPrices } from "@/lib/looot/catalog";
import type { ActionKind, CallItem, Keyword, OverlapRow, Project, ReferringDomain, ResearchResult, Run, RunItem, SerpSnapshot } from "@/lib/types";
import { DEMO_NOW_ISO } from "@/lib/utils";

const LAST_MONTH = "2026-09";

/** Seed keywords of a project, including the generated ones for Kestrel. */
export function seedKeywords(p: SeedProject): SeedKeyword[] {
  return p.id === "kestrel" ? [...p.keywords, ...generatedKestrelKeywords()] : p.keywords;
}

export const kwId = (p: SeedProject, i: number) => `${p.id.slice(0, 3)}-${String(i + 1).padStart(2, "0")}`;

/** Phrases a keyword tool would return for a seed. Used by the seeded research runs and by simulated runs. */
export function ideasFor(seed: string, kind: "ideas" | "related" | "autocomplete"): string[] {
  const pre = ["best", "cheap", "organic", "fresh", "local", "top rated", "small batch", "affordable"];
  const post = ["online", "near me", "delivery", "for beginners", "reviews", "guide", "subscription", "gift set", "brands", "deals", "for home", "wholesale", "sampler", "sale"];
  const questions = [`how to choose ${seed}`, `what is ${seed}`, `is ${seed} worth it`, `${seed} vs supermarket`, `where to buy ${seed}`, `how much is ${seed}`];
  if (kind === "ideas") return [...pre.map((m) => `${m} ${seed}`), ...post.map((m) => `${seed} ${m}`), ...questions];
  if (kind === "related") return [`${seed} comparison`, `${seed} price`, `${seed} for office`, `${seed} monthly box`, `${seed} free shipping`, `${seed} discount code`, `${seed} uk`, `${seed} bulk`, `${seed} sustainable`, `${seed} decaf`];
  return [`${seed} amazon`, `${seed} reddit`, `${seed} 2026`, `${seed} usa`, `${seed} box`, `${seed} cost`, `${seed} options`, `${seed} list`];
}

function loomworkResults(): ResearchResult[] {
  const out: ResearchResult[] = [];
  const seen = new Set<string>();
  const sources: ResearchResult["source"][] = ["ideas", "ideas", "related", "ideas", "autocomplete"];
  for (const m of LOOMWORK_RESEARCH.modifiers) {
    for (const b of LOOMWORK_RESEARCH.bases) {
      const phrase = m.startsWith("#") ? `${b} ${m.slice(1)}` : `${m}${b}`;
      if (seen.has(phrase) || out.length >= 148) continue;
      seen.add(phrase);
      out.push({ phrase, source: sources[out.length % sources.length] as ResearchResult["source"] });
    }
  }
  return out;
}

/** The 100 seeded referring domains of the coffee demo project, highest rank first. */
export function referringDomains(): ReferringDomain[] {
  const r = rngFor("referring");
  const names = [...REFERRING_POOL];
  const w = REFERRING_WORDS;
  while (names.length < 100) {
    const n = `${w.a[Math.floor(r() * w.a.length)]}${w.b[Math.floor(r() * w.b.length)]}${w.tld[Math.floor(r() * w.tld.length)]}`;
    if (!names.includes(n)) names.push(n);
  }
  return names
    .map((domain, i) => ({
      domain,
      rank: Math.max(4, Math.round(74 - i * 0.62 - r() * 6)),
      backlinks: Math.max(1, Math.round((i < 6 ? 180 : 40) * Math.pow(r(), 2.2)) + 1),
      first_seen: addDays("2024-03-01", Math.floor(r() * 900)),
      dofollow_share: Math.round((0.35 + r() * 0.65) * 100) / 100,
    }))
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
}

function overlapRows(p: SeedProject, competitor: string): OverlapRow[] {
  const r = rngFor("overlap", competitor);
  const phrases = new Set<string>();
  for (const k of seedKeywords(p)) if (r() < 0.6) phrases.add(k.phrase);
  for (const seed of ["coffee beans", "espresso beans", "coffee subscription", "pour over coffee", "cold brew"]) for (const idea of [...ideasFor(seed, "ideas"), ...ideasFor(seed, "related")]) if (r() < 0.62) phrases.add(idea);
  return [...phrases].slice(0, 160).map((phrase) => {
    const n = numbersFor(phrase, LAST_MONTH);
    const tracked = seedKeywords(p).find((k) => k.phrase === phrase);
    return { phrase, volume: tracked?.volume ?? n.volume, our_position: tracked && tracked.track[0] > 0 ? tracked.track[0] : 1 + Math.floor(r() * 48), their_position: 1 + Math.floor(Math.pow(r(), 1.4) * 40) };
  }).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
}

interface RunSeed {
  id: string;
  action: ActionKind;
  at: string;
  quoted: number;
  cost: number;
  status: Run["status"];
  total: number;
  done: number;
  seconds: number;
  items: (run: Run) => RunItem[];
}

function seedItems(run: Run, calls: CallItem[], fail: number, doneCount: number, doneIdx?: number[]): RunItem[] {
  return calls.map((c, i) => {
    const failed = i >= calls.length - fail && fail > 0;
    const skipped = doneIdx ? !doneIdx.includes(i) : i >= doneCount;
    const status = skipped ? "pending" : failed ? "failed" : "completed";
    return {
      id: `${run.id}_${i}`,
      run_id: run.id,
      item_key: c.itemKey,
      operation_id: c.operationId,
      input: c.input,
      status: run.status === "cancelled" && skipped ? "skipped_budget" : status,
      looot_run_id: skipped ? null : `run_${(i * 7919 + run.id.length * 104729).toString(36)}${slug(run.id).slice(-4)}`,
      unit_price_micros: c.unitPriceMicros,
      actual_cost_micros: status === "completed" ? c.unitPriceMicros : 0,
      error_code: failed && !skipped ? "provider_timeout" : null,
      error_message: failed && !skipped ? "The provider did not answer in time. Nothing was charged." : null,
      finished_at: skipped ? null : run.finished_at,
      parse_ok: true,
      result: null,
    };
  });
}

/** Builds the whole demo workspace: three projects with history, runs and stored results. */
export function buildDemoStore(): MemoryStore {
  const store = new MemoryStore(DEMO_NOW_ISO);
  store.email = DEMO_OWNER_EMAIL;
  const serpCache = new Map<string, GeneratedSerp>();
  const index = new Map<string, { p: SeedProject; kw: SeedKeyword; days: string[]; series: (number | null)[] }>();

  for (const p of SEED_PROJECTS) {
    const project: Project = { id: p.id, name: p.name, domain: p.domain, country: p.country, language: p.language, location_name: p.location_name, depth: p.depth, include_subdomains: false, serp_operation: OP.serper, created_at: p.created_at };
    store.projects.push(project);
    p.competitors.forEach((domain, i) => store.competitors.push({ id: `${p.id}-c${i + 1}`, project_id: p.id, domain, label: null, color_slot: i + 2, created_at: p.created_at }));
    const days = checkDays(p);
    const kws = seedKeywords(p);
    const keywordRows: Keyword[] = [];
    kws.forEach((kw, i) => {
      const id = kwId(p, i);
      const series = positionSeries(p, kw, days);
      index.set(id, { p, kw, days, series });
      const row: Keyword = { id, project_id: p.id, phrase: kw.phrase, phrase_norm: kw.phrase, target_url: kw.cannibalised ? `https://www.${p.domain}/coffee/${slug(kw.phrase.replace(/^best /, ""))}` : null, tags: kw.tags ?? [], track_ai_overview: Boolean(kw.aio), engine: "google", archived_at: null, created_at: p.created_at };
      keywordRows.push(row);
      store.keywords.push(row);
      const n = numbersFor(kw.phrase, LAST_MONTH);
      store.metrics.push({ project_id: p.id, phrase_norm: kw.phrase, country: p.country, language: p.language, volume: kw.volume, cpc: n.cpc, competition: n.competition, difficulty: kw.difficulty, intent: kw.knowledge ? "navigational" : n.intent, monthly: n.monthly.map((m) => ({ month: m.month, volume: Math.round((m.volume / n.volume) * kw.volume / 10) * 10 })), fetched_at: `${days[0] ?? p.created_at.slice(0, 10)}T09:30:00.000Z` });
      days.forEach((day, ci) => {
        const position = series[ci] as number | null;
        const own = `https://www.${p.domain}${ownPath(p, kw, day)}`;
        const second = kw.cannibalised && position !== null && position + 6 <= p.depth;
        store.rankChecks.push({
          id: `rc_${id}_${ci}`,
          project_id: p.id,
          keyword_id: id,
          run_id: `run_${p.id}_rank_${ci}`,
          checked_at: checkTime(day, ci),
          depth: p.depth,
          position,
          url: position === null ? null : own,
          other_urls: second ? [row.target_url as string] : [],
          is_cannibalised: Boolean(kw.cannibalised) && position !== null,
          features: {
            aio: { present: Boolean(kw.aio), cited: kw.aio === "cited" && position !== null },
            paa: { present: true, owned: Boolean(kw.paaOwned) && position !== null },
            answer_box: { present: Boolean(kw.answerBox), owned: kw.answerBox === "owned" && position !== null },
            knowledge: { present: Boolean(kw.knowledge) },
          },
          snapshot_id: `snap_${id}_${ci}`,
        });
      });
    });

    // Runs: one rank check per check day.
    const rankCalls = keywordRows.length ? buildQuote("check_rankings", {}, { project, keywords: keywordRows, competitors: [], price: fallbackPrices, today: "2026-10-08" }) : null;
    const seeds: RunSeed[] = [];
    days.forEach((day, ci) => {
      if (!rankCalls) return;
      const fail = p.id === "kestrel" ? (ci === 7 ? 3 : ci === 19 ? 1 : 0) : 0;
      const at = checkTime(day, ci);
      seeds.push({ id: `run_${p.id}_rank_${ci}`, action: "check_rankings", at, quoted: rankCalls.totalMicros, cost: rankCalls.totalMicros - fail * fallbackPrice(OP.serper), status: fail ? "partial" : "completed", total: rankCalls.items.length, done: rankCalls.items.length, seconds: 38 + ((ci * 13) % 31), items: (run) => seedItems(run, rankCalls.items, fail, rankCalls.items.length) });
    });
    const other = (id: string, action: ActionKind, at: string, scope: Record<string, unknown>, opts: { done?: number; doneIdx?: number[]; status?: Run["status"]; seconds?: number } = {}) => {
      const q = buildQuote(action, scope, { project, keywords: keywordRows, competitors: store.competitors.filter((c) => c.project_id === p.id), price: fallbackPrices, today: at.slice(0, 10) });
      const done = opts.doneIdx?.length ?? opts.done ?? q.items.length;
      const cost = q.items.filter((_, i) => (opts.doneIdx ? opts.doneIdx.includes(i) : i < done)).reduce((s, i) => s + i.unitPriceMicros, 0);
      seeds.push({ id: `run_${p.id}_${id}`, action, at, quoted: q.totalMicros, cost, status: opts.status ?? "completed", total: q.items.length, done, seconds: opts.seconds ?? 6 + q.items.length * 2, items: (run) => seedItems(run, q.items, 0, done, opts.doneIdx) });
      return q;
    };

    if (p.id === "kestrel") {
      const phrases = kws.map((k) => k.phrase);
      other("suggest", "suggest_competitors", "2026-07-09T09:20:00.000Z", {});
      other("metrics1", "keyword_metrics", "2026-07-10T08:05:00.000Z", { phrases });
      other("backlinks1", "backlinks", "2026-07-12T10:14:00.000Z", {});
      other("overlap1", "competitor_overlap", "2026-07-21T13:02:00.000Z", { competitorId: "kestrel-c1" });
      other("overlap2", "competitor_overlap", "2026-07-21T13:04:00.000Z", { competitorId: "kestrel-c2" });
      other("domain", "domain_overview", "2026-08-02T09:41:00.000Z", {});
      other("research1", "research", "2026-08-19T14:22:00.000Z", { seeds: ["coffee subscription", "espresso beans", "pour over coffee"], sources: ["ideas", "related", "autocomplete"] }, { doneIdx: [0, 1, 2, 4, 5], status: "cancelled", seconds: 9 });
      other("overlap3", "competitor_overlap", "2026-09-03T11:30:00.000Z", { competitorId: "kestrel-c3" });
      const seedsA = ["single origin coffee", "coffee subscription", "espresso beans", "decaf coffee beans", "pour over coffee"];
      other("research2", "research", "2026-09-18T15:10:00.000Z", { seeds: seedsA, sources: ["ideas", "related"] });
      const resA: ResearchResult[] = [];
      const seenA = new Set<string>();
      for (const s of seedsA) for (const [kind, list] of [["ideas", ideasFor(s, "ideas")], ["related", ideasFor(s, "related")]] as const) for (const phrase of list) if (!seenA.has(phrase)) (seenA.add(phrase), resA.push({ phrase, source: kind }));
      other("metrics2", "keyword_metrics", "2026-09-18T15:13:00.000Z", { phrases: resA.map((x) => x.phrase) });
      other("backlinks2", "backlinks", "2026-09-26T09:05:00.000Z", {});
      const resB: ResearchResult[] = [];
      for (const phrase of [...ideasFor("coffee subscription", "ideas"), ...ideasFor("coffee subscription", "related"), ...ideasFor("espresso beans", "related"), ...ideasFor("coffee subscription", "autocomplete"), ...ideasFor("espresso beans", "autocomplete")]) resB.push({ phrase, source: phrase.match(/amazon|reddit|2026|usa|box|cost|options|list/) ? "autocomplete" : "ideas" });
      store.research.push({ id: "rs_kestrel_1", project_id: p.id, run_id: "run_kestrel_research1", seeds: ["coffee subscription", "espresso beans", "pour over coffee"], sources: ["ideas", "related", "autocomplete"], country: "US", language: "en", results: resB, created_at: "2026-08-19T14:22:09.000Z", cost_micros: 38000 });
      store.research.push({ id: "rs_kestrel_2", project_id: p.id, run_id: "run_kestrel_research2", seeds: seedsA, sources: ["ideas", "related"], country: "US", language: "en", results: resA, created_at: "2026-09-18T15:10:20.000Z", cost_micros: 72000 });
      for (const r of resA) {
        if (store.metrics.some((m) => m.project_id === p.id && m.phrase_norm === r.phrase)) continue;
        const n = numbersFor(r.phrase, LAST_MONTH);
        store.metrics.push({ project_id: p.id, phrase_norm: r.phrase, country: "US", language: "en", ...n, fetched_at: "2026-09-18T15:13:30.000Z" });
      }
      const top = referringDomains();
      const nl = rngFor("newlost");
      const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2025, 9 + i, 1)).toISOString().slice(0, 7));
      const new_lost = months.map((month) => ({ month, new: 18 + Math.floor(nl() * 44), lost: 9 + Math.floor(nl() * 26) }));
      store.backlinks.push({ id: "bl_kestrel_1", project_id: p.id, domain: p.domain, run_id: "run_kestrel_backlinks1", fetched_at: "2026-07-12T10:14:20.000Z", backlinks: 2871, referring_domains: 384, domain_rank: 36, spam_score: 3, broken_backlinks: 31, new_lost: new_lost.slice(0, 9), top_domains: top.slice(0, 92) });
      store.backlinks.push({ id: "bl_kestrel_2", project_id: p.id, domain: p.domain, run_id: "run_kestrel_backlinks2", fetched_at: "2026-09-26T09:05:25.000Z", backlinks: 3184, referring_domains: 412, domain_rank: 38, spam_score: 3, broken_backlinks: 27, new_lost, top_domains: top });
      store.backlinks.push({ id: "bl_kestrel_c1", project_id: p.id, domain: "roastwell.com", run_id: null, fetched_at: "2026-09-26T09:07:00.000Z", backlinks: 9412, referring_domains: 1038, domain_rank: 52, spam_score: 2, broken_backlinks: 64, new_lost: null, top_domains: null });
      store.competitors.filter((c) => c.project_id === p.id).slice(0, 3).forEach((c, i) => {
        const rows = overlapRows(p, c.domain);
        store.overlaps.push({ id: `ov_${c.id}`, project_id: p.id, competitor_id: c.id, run_id: `run_kestrel_overlap${i + 1}`, fetched_at: ["2026-07-21T13:02:10.000Z", "2026-07-21T13:04:08.000Z", "2026-09-03T11:30:12.000Z"][i] as string, both_count: rows.length, rows });
      });
      store.domainOverviews.push({ id: "do_kestrel", project_id: p.id, domain: p.domain, fetched_at: "2026-08-02T09:41:10.000Z", organic_keywords: 1284, est_traffic: 9460, distribution: { pos_1: 21, pos_2_3: 64, pos_4_10: 233, pos_11_20: 318, pos_21_30: 290, pos_31_40: 201, pos_41_50: 157 } });
      store.notes.push({ id: "note_1", project_id: p.id, noted_on: "2026-08-04", body: "Launched the subscription landing page" });
      store.notes.push({ id: "note_2", project_id: p.id, noted_on: "2026-09-11", body: "Moved blog to /journal, redirects fixed 09-14" });
    }
    if (p.id === "fernhill") other("metrics", "keyword_metrics", "2026-09-03T08:50:00.000Z", { phrases: kws.map((k) => k.phrase) });
    if (p.id === "loomwork") {
      const results = loomworkResults();
      other("research", "research", "2026-10-07T15:52:00.000Z", { seeds: LOOMWORK_RESEARCH.seeds, sources: ["ideas", "related", "autocomplete"] });
      other("metrics", "keyword_metrics", "2026-10-07T15:55:00.000Z", { phrases: results.map((r) => r.phrase) });
      store.research.push({ id: "rs_loomwork_1", project_id: p.id, run_id: "run_loomwork_research", seeds: LOOMWORK_RESEARCH.seeds, sources: ["ideas", "related", "autocomplete"], country: "US", language: "en", results, created_at: "2026-10-07T15:52:14.000Z", cost_micros: 38000 });
      for (const r of results) store.metrics.push({ project_id: p.id, phrase_norm: r.phrase, country: "US", language: "en", ...numbersFor(r.phrase, LAST_MONTH), fetched_at: "2026-10-07T15:55:20.000Z" });
    }
    for (const s of seeds) {
      const run: Run = { id: s.id, project_id: p.id, quote_id: null, action: s.action, idempotency_key: `seed:${s.id}`, status: s.status, items_total: s.total, items_done: s.done, quoted_micros: s.quoted, max_cost_micros: s.quoted, actual_cost_micros: s.cost, started_at: s.at, finished_at: new Date(new Date(s.at).getTime() + s.seconds * 1000).toISOString(), simulated: false, over_cap_micros: 0 };
      store.runs.push(run);
      store.itemFactories.set(run.id, s.items);
    }
  }

  const serp = (id: string, ci: number): GeneratedSerp | null => {
    const e = index.get(id);
    if (!e || ci < 0 || ci >= e.days.length) return null;
    const key = `${id}:${ci}`;
    let g = serpCache.get(key);
    if (!g) {
      g = generateSerp(e.p, e.kw, ci, e.days[ci] as string, e.series[ci] as number | null);
      serpCache.set(key, g);
    }
    return g;
  };
  const liteCache = new Map<string, ReturnType<NonNullable<MemoryStore["virtual"]>["lite"]>>();
  store.virtual = {
    lite(projectId) {
      let list = liteCache.get(projectId);
      if (!list) {
        list = [];
        for (const [id, e] of index) {
          if (e.p.id !== projectId) continue;
          e.days.forEach((day, ci) => list?.push({ id: `snap_${id}_${ci}`, keyword_id: id, fetched_at: checkTime(day, ci), hosts: (serp(id, ci) as GeneratedSerp).organic.map((o) => ({ position: o.position, host: o.host })) }));
        }
        liteCache.set(projectId, list);
      }
      return list;
    },
    refs(keywordId) {
      const e = index.get(keywordId);
      return e ? e.days.map((day, ci) => ({ id: `snap_${keywordId}_${ci}`, fetched_at: checkTime(day, ci), position: e.series[ci] as number | null })) : [];
    },
    get(id) {
      const m = /^snap_(.+)_(\d+)$/.exec(id);
      if (!m) return null;
      const kid = m[1] as string;
      const ci = Number(m[2]);
      const e = index.get(kid);
      const g = serp(kid, ci);
      if (!e || !g) return null;
      const aio = Boolean(e.kw.aio);
      const pages = pagesForDepth(e.p.depth);
      const snap: SerpSnapshot = {
        id,
        project_id: e.p.id,
        keyword_id: kid,
        run_id: `run_${e.p.id}_rank_${ci}`,
        fetched_at: checkTime(e.days[ci] as string, ci),
        operation_id: aio ? OP.cloro : OP.serper,
        ...g,
        aio_checked: aio,
        raw: { searchParameters: { q: e.kw.phrase, gl: e.p.country.toLowerCase(), hl: e.p.language, page: 1 }, organic: g.organic.slice(0, 10).map((o) => ({ title: o.title, link: o.url, snippet: o.snippet, position: o.position })), note: "Demo data. This body was generated, not fetched." },
        parse_ok: true,
        cost_micros: (aio ? fallbackPrice(OP.cloro) : fallbackPrice(OP.serper)) + (pages - 1) * fallbackPrice(OP.serper),
        looot_run_id: `run_demo_${slug(kid)}_${ci}`,
      };
      return snap;
    },
  };
  return store;
}

const g = globalThis as unknown as { __loootSeoDemo?: MemoryStore };

/** The one demo store of this server process. Edits live in memory until the server restarts. */
export function demoStore(): MemoryStore {
  if (!g.__loootSeoDemo) g.__loootSeoDemo = buildDemoStore();
  return g.__loootSeoDemo;
}

/** Latest generated result page for a seeded keyword phrase, used by simulated runs. */
export function latestSeededSerp(projectId: string, phrase: string): GeneratedSerp | null {
  const p = SEED_PROJECTS.find((x) => x.id === projectId);
  if (!p) return null;
  const kws = seedKeywords(p);
  const i = kws.findIndex((k) => k.phrase === phrase);
  const days = checkDays(p);
  if (i < 0 || days.length === 0) return null;
  const kw = kws[i] as SeedKeyword;
  const series = positionSeries(p, kw, days);
  return generateSerp(p, kw, days.length - 1, days[days.length - 1] as string, series[days.length - 1] as number | null);
}
