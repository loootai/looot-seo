import type { Metadata } from "next";
import { ProjectsScreen, type ProjectRow } from "./ProjectsScreen";
import { getStore } from "@/lib/data";
import { loadBundle, projectStats, spentThisMonth } from "@/lib/view/project";
import { forcedState } from "@/lib/view/state";
import { daysBefore } from "@/lib/view/timeline";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const state = forcedState(sp);
  let rows: ProjectRow[] = [];
  let error: string | null = null;
  let now = new Date().toISOString();
  const store = await getStore();
  const defaults = await store.getDefaults().catch(() => ({ depth: 30 as const, country: "US", language: "en", serp_operation: "serper-search" }));
  try {
    now = store.now();
    const projects = await store.listProjects();
    rows = await Promise.all(
      projects.map(async (p): Promise<ProjectRow> => {
        const [b, runs] = await Promise.all([loadBundle(store, p.id), store.listRuns(p.id)]);
        if (!b) throw new Error("project disappeared");
        const s = projectStats(b);
        const from = daysBefore(now, 30);
        return { id: p.id, name: p.name, domain: p.domain, market: `${p.country} · ${p.language}`, keywords: b.keywords.length, visibility: s.visibility, spark: b.timeline.filter((d) => d.day >= from).map((d) => (d.visibility === null ? null : d.visibility * 100)), top10: s.checked ? s.top10 : null, top10Delta: s.top10Delta, lastChecked: s.lastChecked, spent: spentThisMonth(runs, now) };
      }),
    );
  } catch (e) {
    console.error("looot-seo: projects failed", e);
    error = "projects_load_failed";
  }
  return <ProjectsScreen rows={state === "empty" ? [] : rows} state={state ?? (error ? "error" : null)} errorCode={error ?? "projects_load_failed"} now={now} defaults={defaults} openNew={sp.new === "1"} />;
}
