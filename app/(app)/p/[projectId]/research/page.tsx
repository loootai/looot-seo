import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchScreen, type MetricLite } from "./ResearchScreen";
import { getStore } from "@/lib/data";
import { fallbackPrice, OP, pagesForDepth } from "@/lib/looot/catalog";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const state = forcedState(sp);
  const store = await getStore();
  const project = await store.getProject(projectId);
  if (!project) notFound();
  const [keywords, runs, metricRows] = await Promise.all([store.listKeywords(projectId), store.listResearchRuns(projectId), store.listMetrics(projectId)]);
  const active = state === "empty" || sp.run === "none" ? null : (runs.find((r) => r.id === sp.run) ?? runs[0] ?? null);
  const metrics: Record<string, MetricLite> = {};
  for (const m of metricRows) {
    if (m.country !== (active?.country ?? project.country) || m.language !== (active?.language ?? project.language)) continue;
    metrics[m.phrase_norm] = { v: m.volume, d: m.difficulty, c: m.cpc, k: m.competition, i: m.intent, t: m.monthly?.map((x) => x.volume) ?? null };
  }
  return (
    <ResearchScreen
      project={project}
      tracked={keywords.map((k) => k.phrase_norm)}
      runs={runs.map((r) => ({ id: r.id, at: r.created_at, seeds: r.seeds, sources: r.sources, count: r.results.length, cost: r.cost_micros ?? null }))}
      active={active ? { id: active.id, at: active.created_at, seeds: active.seeds, results: active.results } : null}
      metrics={metrics}
      prices={{ ideas: fallbackPrice(OP.ideas), related: fallbackPrice(OP.related), autocomplete: fallbackPrice(OP.autocomplete), overview: fallbackPrice(OP.overview), difficulty: fallbackPrice(OP.difficulty), perKeyword: pagesForDepth(project.depth) * fallbackPrice(project.serp_operation || OP.serper) }}
      state={state}
      now={store.now()}
    />
  );
}
