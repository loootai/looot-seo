import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RankingsScreen } from "./RankingsScreen";
import { getStore } from "@/lib/data";
import { fallbackPrice, OP, pagesForDepth } from "@/lib/looot/catalog";
import { positionIn } from "@/lib/seo/overlap";
import { estimate } from "@/lib/view/estimate";
import { keywordRows, loadBundle } from "@/lib/view/project";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const state = forcedState(sp);
  const store = await getStore();
  const b = await loadBundle(store, projectId);
  if (!b) notFound();
  const rows = state === "empty" ? [] : keywordRows(b);
  const lite = await store.listSnapshotsLite(projectId).catch(() => []);
  // Competitor positions per snapshot, so the history chart can draw their lines without another request.
  const comp: Record<string, (number | null)[]> = {};
  if (b.competitors.length) for (const s of lite) comp[s.id] = b.competitors.map((c) => positionIn(s, c.domain, true));
  const days = [...new Set(b.checks.map((c) => c.checked_at.slice(0, 10)))].sort().slice(-14);
  const serp = fallbackPrice(b.project.serp_operation || OP.serper);
  return (
    <RankingsScreen
      project={b.project}
      rows={rows}
      days={days}
      competitors={b.competitors.map((c) => ({ id: c.id, domain: c.domain, slot: c.color_slot }))}
      comp={comp}
      now={b.now}
      state={state}
      priceAll={estimate("check_rankings", {}, { project: b.project, keywords: b.keywords, competitors: b.competitors, today: b.now.slice(0, 10) })}
      perKeyword={pagesForDepth(b.project.depth) * serp}
      aioExtra={Math.max(0, fallbackPrice(OP.cloro) - serp)}
      openAdd={sp.add === "1"}
      openKeyword={typeof sp.kw === "string" ? sp.kw : null}
    />
  );
}
