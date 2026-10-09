import { SEED_PROJECTS, type SeedKeyword, type SeedProject } from "@/lib/demo/seed";
import { generateSerp, numbersFor, rngFor } from "@/lib/demo/generator";
import { demoStore, ideasFor, latestSeededSerp, referringDomains } from "@/lib/demo/store";
import { OP, fallbackPrice } from "@/lib/looot/catalog";
import type { LoootRun, LoootRunner } from "@/lib/looot/client";
import type { Project } from "@/lib/types";

const dfs = (items: unknown[]) => ({ tasks: [{ status_code: 20000, result: [{ items_count: items.length, items }] }] });

function genericSerp(project: Project, phrase: string) {
  const seed = SEED_PROJECTS.find((p) => p.id === project.id);
  const base: SeedProject = seed ?? { id: project.id, name: project.name, domain: project.domain, country: project.country, language: project.language, location_name: project.location_name, depth: project.depth, created_at: project.created_at, competitors: [], firstCheck: null, intervals: [], keywords: [], fillers: SEED_PROJECTS[0]?.fillers ?? [] };
  const p = { ...base, depth: project.depth, fillers: base.fillers.length ? base.fillers : (SEED_PROJECTS[0]?.fillers ?? []) };
  const r = rngFor("new-keyword", project.id, phrase);
  const kw: SeedKeyword = { phrase, volume: 0, difficulty: 0, track: [0, 0, 0] };
  const position = r() < 0.7 ? 3 + Math.floor(r() * (project.depth - 3)) : null;
  return generateSerp(p, kw, 0, "2026-10-08", position);
}

/** The newest stored backlink refresh for a domain in the demo workspace, if there is one. */
function storedBacklinks(project: Project, domain: string) {
  return demoStore()
    .backlinks.filter((b) => b.project_id === project.id && b.domain === domain)
    .sort((a, b) => a.fetched_at.localeCompare(b.fetched_at))
    .at(-1);
}

/** The raw body a provider would send for one call, built from seeded data. Shapes follow the fixtures in tests/fixtures. */
export function fakeResult(operationId: string, input: Record<string, unknown>, project: Project): unknown {
  const last = "2026-09";
  switch (operationId) {
    case OP.serper:
    case OP.anyapi:
    case OP.cloro: {
      const phrase = String(input.q ?? input.query ?? "");
      const page = Number(input.page ?? 1);
      const g = latestSeededSerp(project.id, phrase) ?? genericSerp(project, phrase);
      const slice = g.organic.slice((page - 1) * 10, page * 10).map((o, i) => ({ title: o.title, link: o.url, snippet: o.snippet, position: i + 1 }));
      const paa = g.people_also_ask.map((q) => ({ question: q.question, snippet: q.snippet, link: q.url }));
      if (operationId === OP.cloro) return { success: true, result: { organicResults: slice, aioverview: g.ai_overview ? { text: g.ai_overview.text, sources: g.ai_overview.sources.map((s) => ({ label: s.title, url: s.url })) } : null, peopleAlsoAsk: paa, relatedSearches: g.related.map((query) => ({ query })) } };
      return {
        searchParameters: { q: phrase, page },
        organic: slice,
        ...(page === 1 ? { peopleAlsoAsk: paa, relatedSearches: g.related.map((query) => ({ query })), ...(g.answer_box ? { answerBox: { title: g.answer_box.title, snippet: g.answer_box.snippet, link: g.answer_box.url } } : {}), ...(g.knowledge ? { knowledgeGraph: { title: g.knowledge.title, description: g.knowledge.snippet, website: g.knowledge.url } } : {}) } : {}),
      };
    }
    case OP.autocomplete:
      return { suggestions: ideasFor(String(input.q ?? ""), "autocomplete").map((value) => ({ value })) };
    case OP.ideas:
      return dfs((input.keywords as string[]).flatMap((s) => ideasFor(s, "ideas")).map((keyword) => ({ keyword })));
    case OP.related:
      return dfs(ideasFor(String(input.keyword ?? ""), "related").map((keyword) => ({ keyword_data: { keyword } })));
    case OP.overview:
      return dfs(
        (input.keywords as string[]).map((keyword) => {
          const n = numbersFor(keyword, last);
          return { keyword, keyword_info: { search_volume: n.volume, cpc: n.cpc, competition: n.competition, monthly_searches: n.monthly.map((m) => ({ year: Number(m.month.slice(0, 4)), month: Number(m.month.slice(5)), search_volume: m.volume })) }, search_intent_info: { main_intent: n.intent } };
        }),
      );
    case OP.difficulty:
      return { items: (input.keywords as string[]).map((keyword) => ({ keyword, keyword_difficulty: numbersFor(keyword, last).difficulty })) };
    case OP.competitors: {
      const pool = ["harborlightcoffee.com", "firstcrackroasters.com", "wakefieldroasters.com", "altitudebeans.com", "copperpotcoffee.com", "latitudecoffee.co", "hillsideroasting.co", "morningritualcoffee.com", "greenbeandepot.com", "blackapronsupply.com"];
      const r = rngFor("suggest", project.domain);
      return dfs(pool.map((domain) => ({ domain, avg_position: Math.round((8 + r() * 30) * 10) / 10, intersections: 40 + Math.floor(r() * 520) })).sort((a, b) => b.intersections - a.intersections));
    }
    case OP.intersection: {
      const r = rngFor("intersection", String(input.target2));
      const phrases = ["coffee beans", "espresso beans", "coffee subscription", "cold brew", "pour over coffee"].flatMap((s) => ideasFor(s, "ideas")).filter(() => r() < 0.7);
      return dfs(phrases.map((keyword) => ({ keyword_data: { keyword, keyword_info: { search_volume: numbersFor(keyword, last).volume } }, first_domain_serp_element: { rank_group: 1 + Math.floor(r() * 45) }, second_domain_serp_element: { rank_group: 1 + Math.floor(r() * 38) } })));
    }
    case OP.domainOverview: {
      const r = rngFor("domain-overview", String(input.target));
      const count = 300 + Math.floor(r() * 2400);
      return dfs([{ metrics: { organic: { count, etv: Math.round(count * (4 + r() * 6)), pos_1: Math.round(count * 0.02), pos_2_3: Math.round(count * 0.05), pos_4_10: Math.round(count * 0.18), pos_11_20: Math.round(count * 0.25), pos_21_30: Math.round(count * 0.22), pos_31_40: Math.round(count * 0.16), pos_41_50: Math.round(count * 0.12) } } }]);
    }
    case OP.blSummary: {
      const prev = storedBacklinks(project, String(input.target));
      if (prev) return { tasks: [{ result: [{ target: input.target, rank: prev.domain_rank ?? 0, backlinks: (prev.backlinks ?? 0) + 41, referring_domains: (prev.referring_domains ?? 0) + 6, backlinks_spam_score: prev.spam_score ?? 0, broken_backlinks: Math.max(0, (prev.broken_backlinks ?? 0) - 2) }] }] };
      const r = rngFor("bl-summary", String(input.target));
      const rd = 120 + Math.floor(r() * 900);
      return { tasks: [{ result: [{ target: input.target, rank: 180 + Math.floor(r() * 380), backlinks: rd * (5 + Math.floor(r() * 6)), referring_domains: rd, backlinks_spam_score: Math.floor(r() * 9), broken_backlinks: Math.floor(r() * 60) }] }] };
    }
    case OP.blDomains: {
      const target = String(input.target);
      const r = rngFor("bl-domains", target);
      const row = (d: { domain: string; rank: number | null; backlinks: number | null; first_seen: string | null; dofollow_share: number | null }) => ({ domain: d.domain, rank: d.rank ?? 0, backlinks: d.backlinks ?? 1, first_seen: `${d.first_seen ?? "2025-01-14"} 00:00:00 +00:00`, referring_links_attributes: { nofollow: Math.round((d.backlinks ?? 1) * (1 - (d.dofollow_share ?? 1))) } });
      // A refresh of a domain that already has a stored list returns the same sites, so the demo keeps its story.
      const prev = storedBacklinks(project, target)?.top_domains;
      if (prev?.length) return dfs(prev.map(row));
      if (!target.endsWith(".uk")) return dfs(referringDomains().slice(0, 60).map(row));
      const names = ["nhs.uk", "leedsphysiocollective.co.uk", "yorkshiresportsclinic.co.uk", "runnersrepair.co.uk", "physiofinder.org.uk", "jointcarejournal.com", "rehabnotes.co.uk", "movewellnorth.co.uk", "headingleylife.co.uk", "leedsrunningclub.org.uk", "yorkshirebusinessdirectory.co.uk", "otleyroadclinic.co.uk", "northernhealthnotes.com", "parkrunstories.co.uk", "localclinicguide.co.uk", "westyorkshirewellbeing.org"];
      return dfs(names.map((domain, i) => row({ domain, rank: Math.round((720 - i * 34 - Math.floor(r() * 20)) / 10), backlinks: 1 + Math.floor(Math.pow(r(), 2) * 40), first_seen: `2025-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-14`, dofollow_share: Math.round((0.4 + r() * 0.6) * 100) / 100 })));
    }
    case OP.blNewLost: {
      const prev = storedBacklinks(project, String(input.target))?.new_lost;
      if (prev?.length) return dfs(prev.map((m) => ({ date: `${m.month}-01 00:00:00 +00:00`, new_backlinks: m.new, lost_backlinks: m.lost })));
      const r = rngFor("bl-newlost", String(input.target));
      return dfs(Array.from({ length: 12 }, (_, i) => ({ date: `${new Date(Date.UTC(2025, 9 + i, 1)).toISOString().slice(0, 10)} 00:00:00 +00:00`, new_backlinks: 4 + Math.floor(r() * 22), lost_backlinks: 2 + Math.floor(r() * 12) })));
    }
    default:
      return {};
  }
}

/** A looot runner that never leaves the process. Every call "costs" its catalog price and returns seeded data. */
export function fakeRunner(project: Project, totalItems: number): LoootRunner {
  // A simulated run takes about 3 seconds whatever its size.
  const delay = Math.max(15, Math.min(700, Math.round((3000 * 4) / Math.max(1, totalItems))));
  let n = 0;
  return {
    async run(endpointId, input, idempotencyKey): Promise<LoootRun> {
      await new Promise((r) => setTimeout(r, delay));
      n += 1;
      return { runId: `sim_${n}_${idempotencyKey.slice(-6)}`, status: "completed", result: fakeResult(endpointId, input, project), actualCost: fallbackPrice(endpointId) / 1_000_000 };
    },
    async getRun(runId): Promise<LoootRun> {
      return { runId, status: "completed" };
    },
  };
}
