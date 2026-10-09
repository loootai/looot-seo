import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompetitorsScreen, type CompetitorsData } from "./CompetitorsScreen";
import { getStore } from "@/lib/data";
import { latestPerKeyword, positionIn, shareOfVoice } from "@/lib/seo/overlap";
import { estimate } from "@/lib/view/estimate";
import { loadBundle } from "@/lib/view/project";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "Competitors" };

export default async function CompetitorsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const state = forcedState(await searchParams);
  const store = await getStore();
  const b = await loadBundle(store, projectId);
  if (!b) notFound();
  const competitors = state === "empty" ? [] : b.competitors;
  const [lite, overlaps] = await Promise.all([store.listSnapshotsLite(projectId).catch(() => null), store.listOverlaps(projectId).catch(() => [])]);
  const ctx = { project: b.project, keywords: b.keywords, competitors: b.competitors, today: b.now.slice(0, 10) };
  const tracked = new Set(b.keywords.map((k) => k.id));
  const snaps = (lite ?? []).filter((s) => tracked.has(s.keyword_id));
  const latest = latestPerKeyword(snaps);
  const domains = [b.project.domain, ...competitors.map((c) => c.domain)];
  const share = shareOfVoice(latest, domains, b.volumes);
  const sub = b.project.include_subdomains;

  const matrix = b.keywords
    .filter((k) => latest.has(k.id))
    .map((k) => {
      const snap = latest.get(k.id);
      return { id: k.id, phrase: k.phrase, volume: b.volumes.get(k.id) ?? null, ours: snap ? positionIn(snap, b.project.domain, sub) : null, theirs: competitors.map((c) => (snap ? positionIn(snap, c.domain, true) : null)) };
    });

  const days = [...new Set(snaps.map((s) => s.fetched_at.slice(0, 10)))].sort();
  const history = days.map((day) => {
    const at = latestPerKeyword(snaps, `${day}T23:59:59.999Z`);
    const s = shareOfVoice(at, domains, b.volumes);
    const row: Record<string, number | string> = { day };
    domains.forEach((d, i) => (row[`d${i}`] = Math.round((s.get(d) ?? 0) * 1000) / 10));
    return row;
  });
  const oldest = [...latest.values()].reduce<string | null>((m, s) => (m === null || s.fetched_at < m ? s.fetched_at : m), null);

  const data: CompetitorsData = {
    project: b.project,
    now: b.now,
    ownShare: share.get(b.project.domain) ?? 0,
    competitors: competitors.map((c, i) => {
      const shared = matrix.map((m) => m.theirs[i]).filter((p): p is number => p !== null && p !== undefined && p <= 10);
      const ov = overlaps.filter((o) => o.competitor_id === c.id).sort((x, y) => y.fetched_at.localeCompare(x.fetched_at))[0] ?? null;
      return { id: c.id, domain: c.domain, slot: c.color_slot, shared: shared.length, avg: shared.length ? shared.reduce((s, p) => s + p, 0) / shared.length : null, share: share.get(c.domain) ?? 0, overlap: ov ? { at: ov.fetched_at, rows: ov.rows } : null, price: estimate("competitor_overlap", { competitorId: c.id }, ctx) };
    }),
    matrix,
    history,
    checks: days.length,
    oldestSnapshot: oldest,
    snapshotsFailed: lite === null,
    tracked: b.keywords.map((k) => k.phrase_norm),
    priceSuggest: estimate("suggest_competitors", {}, ctx),
  };
  return <CompetitorsScreen data={data} state={state} />;
}
