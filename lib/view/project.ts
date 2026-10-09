import type { DataStore } from "@/lib/data/store";
import { EMPTY_FEATURES } from "@/lib/seo/features";
import type { Competitor, Keyword, KeywordMetric, Project, RankCheck, Run, SerpFeatures } from "@/lib/types";
import { pathOf } from "@/lib/utils";
import { buildTimeline, daysBefore, stateAt, type DayState } from "@/lib/view/timeline";

export interface ProjectBundle {
  project: Project;
  keywords: Keyword[];
  metrics: Map<string, KeywordMetric>;
  volumes: Map<string, number | null>;
  checks: RankCheck[];
  competitors: Competitor[];
  timeline: DayState[];
  now: string;
}

/** Loads what most project screens need in one go. Returns null when the project does not exist for this user. */
export async function loadBundle(store: DataStore, projectId: string): Promise<ProjectBundle | null> {
  const project = await store.getProject(projectId);
  if (!project) return null;
  const [keywords, metricRows, checks, competitors] = await Promise.all([store.listKeywords(projectId), store.listMetrics(projectId), store.listRankChecks(projectId), store.listCompetitors(projectId)]);
  const metrics = new Map(metricRows.filter((m) => m.country === project.country && m.language === project.language).map((m) => [m.phrase_norm, m]));
  const volumes = new Map(keywords.map((k) => [k.id, metrics.get(k.phrase_norm)?.volume ?? null]));
  return { project, keywords, metrics, volumes, checks, competitors, timeline: buildTimeline(keywords, checks, volumes), now: store.now() };
}

export type ChangeKind = "up" | "down" | "same" | "new" | "lost" | "none";

export interface KeywordRow {
  id: string;
  phrase: string;
  tags: string[];
  aio: boolean;
  targetUrl: string | null;
  checked: boolean;
  position: number | null;
  depth: number;
  previous: number | null;
  change: number;
  changeKind: ChangeKind;
  best: number | null;
  spark: (number | null)[];
  url: string | null;
  urlPath: string | null;
  cannibalised: boolean;
  otherUrls: string[];
  features: SerpFeatures;
  volume: number | null;
  difficulty: number | null;
  lastChecked: string | null;
  snapshotId: string | null;
  history: { at: string; position: number | null; url: string | null; snapshotId: string | null; depth: number }[];
}

/** How a position moved between two checks. A lower number is better, so 9 to 4 is "up" by 5. */
export function changeOf(previous: number | null | undefined, current: number | null, hadPrevious: boolean): { change: number; kind: ChangeKind } {
  if (!hadPrevious) return { change: 0, kind: "none" };
  if (previous === null || previous === undefined) return current === null ? { change: 0, kind: "same" } : { change: 0, kind: "new" };
  if (current === null) return { change: 0, kind: "lost" };
  if (current === previous) return { change: 0, kind: "same" };
  return current < previous ? { change: previous - current, kind: "up" } : { change: current - previous, kind: "down" };
}

/** One row per tracked keyword with its latest position, movement, history and numbers. */
export function keywordRows(b: ProjectBundle): KeywordRow[] {
  const byKw = new Map<string, RankCheck[]>();
  for (const c of b.checks) byKw.set(c.keyword_id, [...(byKw.get(c.keyword_id) ?? []), c]);
  const sparkFrom = daysBefore(b.now, 30);
  return b.keywords.map((k) => {
    const list = byKw.get(k.id) ?? [];
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    const ch = changeOf(prev?.position, last?.position ?? null, Boolean(prev));
    const ranked = list.map((c) => c.position).filter((p): p is number => p !== null);
    const m = b.metrics.get(k.phrase_norm);
    return {
      id: k.id,
      phrase: k.phrase,
      tags: k.tags,
      aio: k.track_ai_overview,
      targetUrl: k.target_url,
      checked: Boolean(last),
      position: last?.position ?? null,
      depth: last?.depth ?? b.project.depth,
      previous: prev?.position ?? null,
      change: ch.change,
      changeKind: ch.kind,
      best: ranked.length ? Math.min(...ranked) : null,
      spark: list.filter((c) => c.checked_at.slice(0, 10) >= sparkFrom).map((c) => c.position),
      url: last?.url ?? null,
      urlPath: last?.url ? pathOf(last.url) : null,
      cannibalised: Boolean(last?.is_cannibalised),
      otherUrls: last?.other_urls ?? [],
      features: last?.features && "aio" in last.features ? last.features : EMPTY_FEATURES,
      volume: m?.volume ?? null,
      difficulty: m?.difficulty ?? null,
      lastChecked: last?.checked_at ?? null,
      snapshotId: last?.snapshot_id ?? null,
      history: list.map((c) => ({ at: c.checked_at, position: c.position, url: c.url, snapshotId: c.snapshot_id, depth: c.depth })),
    };
  });
}

export interface ProjectStats {
  visibility: number | null;
  visibilityDelta: number | null;
  leftOut: number;
  avgPosition: number | null;
  avgDelta: number | null;
  ranked: number;
  top3: number;
  top3Delta: number | null;
  top10: number;
  top10Delta: number | null;
  tracked: number;
  checked: boolean;
  lastChecked: string | null;
}

/** The stat strip: where the project stands now and how that differs from 30 days ago. */
export function projectStats(b: ProjectBundle): ProjectStats {
  const now = b.timeline[b.timeline.length - 1] ?? null;
  const then = stateAt(b.timeline, daysBefore(b.now, 30));
  const delta = (a: number | null | undefined, c: number | null | undefined) => (a === null || a === undefined || c === null || c === undefined || !then || then === now ? null : a - c);
  const last = b.checks[b.checks.length - 1];
  return {
    visibility: now?.visibility ?? null,
    visibilityDelta: delta(now?.visibility, then?.visibility),
    leftOut: now?.leftOut ?? 0,
    avgPosition: now?.avgPosition ?? null,
    avgDelta: delta(now?.avgPosition, then?.avgPosition),
    ranked: now?.ranked ?? 0,
    top3: now?.top3 ?? 0,
    top3Delta: delta(now?.top3, then?.top3),
    top10: now?.top10 ?? 0,
    top10Delta: delta(now?.top10, then?.top10),
    tracked: b.keywords.length,
    checked: Boolean(now),
    lastChecked: last?.checked_at ?? null,
  };
}

/** Money spent since the first day of the current month. */
export function spentThisMonth(runs: Run[], now: string): number {
  const month = now.slice(0, 7);
  return runs.filter((r) => r.started_at.slice(0, 7) === month).reduce((s, r) => s + r.actual_cost_micros, 0);
}

export const ACTION_LABELS: Record<string, string> = {
  check_rankings: "Rank check",
  fetch_snapshot: "SERP snapshot",
  research: "Keyword research",
  keyword_metrics: "Keyword metrics",
  suggest_competitors: "Competitor discovery",
  competitor_overlap: "Competitor overlap",
  backlinks: "Backlinks",
  domain_overview: "Domain overview",
  retry_failed: "Retry",
};

/** The spend group an action belongs to in the daily spend chart. */
export function featureOf(action: string): "Rank checks" | "Research" | "Competitors" | "Backlinks" {
  if (action === "check_rankings" || action === "fetch_snapshot") return "Rank checks";
  if (action === "research" || action === "keyword_metrics") return "Research";
  if (action === "backlinks") return "Backlinks";
  return "Competitors";
}
