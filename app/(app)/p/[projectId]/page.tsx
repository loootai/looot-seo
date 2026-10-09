import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OverviewScreen, type OverviewData } from "./OverviewScreen";
import { getStore } from "@/lib/data";
import { latestPerKeyword, shareOfVoice } from "@/lib/seo/overlap";
import { estimate } from "@/lib/view/estimate";
import { keywordRows, loadBundle, projectStats } from "@/lib/view/project";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const state = forcedState(await searchParams);
  const store = await getStore();
  const b = await loadBundle(store, projectId);
  if (!b) notFound();
  const today = b.now.slice(0, 10);
  const ctx = { project: b.project, keywords: b.keywords, competitors: b.competitors, today };
  const rows = keywordRows(b);

  // Each region loads on its own, so one failed query does not blank the page.
  const [lite, runs, notes, overviews] = await Promise.all([
    store.listSnapshotsLite(projectId).catch(() => null),
    store.listRuns(projectId).catch(() => null),
    store.listChartNotes(projectId).catch(() => []),
    store.listDomainOverviews(projectId).catch(() => []),
  ]);

  let sov: OverviewData["sov"] = null;
  if (lite) {
    const latest = latestPerKeyword(lite.filter((s) => b.volumes.has(s.keyword_id)));
    const domains = [b.project.domain, ...b.competitors.map((c) => c.domain)];
    const share = shareOfVoice(latest, domains, b.volumes);
    sov = domains.map((d, i) => ({ domain: d, share: share.get(d) ?? 0, slot: i === 0 ? 1 : (b.competitors[i - 1]?.color_slot ?? i + 1), own: i === 0 }));
  }
  const f = { aio: [0, 0], paa: [0, 0], answer: [0, 0], knowledge: [0, 0] } as Record<string, [number, number]>;
  for (const r of rows.filter((x) => x.checked)) {
    if (r.features.aio.present) (f.aio as [number, number])[0] += 1;
    if (r.features.aio.cited) (f.aio as [number, number])[1] += 1;
    if (r.features.paa.present) (f.paa as [number, number])[0] += 1;
    if (r.features.paa.owned) (f.paa as [number, number])[1] += 1;
    if (r.features.answer_box.present) (f.answer as [number, number])[0] += 1;
    if (r.features.answer_box.owned) (f.answer as [number, number])[1] += 1;
    if (r.features.knowledge.present) (f.knowledge as [number, number])[0] += 1;
  }
  const moved = rows.filter((r) => r.changeKind === "up" || r.changeKind === "down" || r.changeKind === "new" || r.changeKind === "lost");
  const mover = (r: (typeof rows)[number]) => ({ id: r.id, phrase: r.phrase, from: r.previous, to: r.position, change: r.change, kind: r.changeKind, depth: r.depth });
  const own = overviews.find((o) => o.domain === b.project.domain) ?? null;

  const data: OverviewData = {
    project: b.project,
    now: b.now,
    stats: projectStats(b),
    distribution: b.timeline.map((d) => ({ day: d.day, b1: d.b1, b2: d.b2, b3: d.b3, b4: d.b4, b0: d.b0 })),
    notes: notes.map((n, i) => ({ n: i + 1, day: n.noted_on, body: n.body })),
    up: moved.filter((r) => r.changeKind === "up" || r.changeKind === "new").sort((x, y) => y.change - x.change || (x.position ?? 99) - (y.position ?? 99)).slice(0, 5).map(mover),
    down: moved.filter((r) => r.changeKind === "down" || r.changeKind === "lost").sort((x, y) => (y.changeKind === "lost" ? 99 : y.change) - (x.changeKind === "lost" ? 99 : x.change)).slice(0, 5).map(mover),
    sov,
    features: [
      { label: "AI Overview", present: f.aio?.[0] ?? 0, owned: f.aio?.[1] ?? 0, ownedLabel: "cite you" },
      { label: "People also ask", present: f.paa?.[0] ?? 0, owned: f.paa?.[1] ?? 0, ownedLabel: "include your page" },
      { label: "Answer box", present: f.answer?.[0] ?? 0, owned: f.answer?.[1] ?? 0, ownedLabel: "are yours" },
      { label: "Knowledge panel", present: f.knowledge?.[0] ?? 0, owned: null, ownedLabel: "" },
    ],
    checkedKeywords: rows.filter((x) => x.checked).length,
    runs: runs ? runs.slice(0, 5).map((r) => ({ id: r.id, action: r.action, done: r.items_done, total: r.items_total, cost: r.actual_cost_micros, at: r.started_at, status: r.status, simulated: r.simulated })) : null,
    priceCheck: estimate("check_rankings", {}, ctx),
    priceDomain: estimate("domain_overview", {}, ctx),
    domainOverview: own ? { keywords: own.organic_keywords, traffic: own.est_traffic, at: own.fetched_at } : null,
  };
  return <OverviewScreen data={data} state={state} />;
}
