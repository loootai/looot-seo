import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BacklinksScreen, type BacklinksData } from "./BacklinksScreen";
import { getStore } from "@/lib/data";
import type { BacklinkSnapshot } from "@/lib/types";
import { estimate } from "@/lib/view/estimate";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "Backlinks" };

export default async function BacklinksPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const state = forcedState(await searchParams);
  const store = await getStore();
  const project = await store.getProject(projectId);
  if (!project) notFound();
  const [keywords, competitors] = await Promise.all([store.listKeywords(projectId), store.listCompetitors(projectId)]);
  let snapshots: BacklinkSnapshot[] | null = null;
  try {
    snapshots = (await store.listBacklinkSnapshots(projectId)).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
  } catch (e) {
    console.error("looot-seo: backlinks failed", e);
  }
  const ctx = { project, keywords, competitors, today: store.now().slice(0, 10) };
  const own = state === "empty" ? [] : (snapshots ?? []).filter((s) => s.domain === project.domain);
  const data: BacklinksData = {
    project,
    now: store.now(),
    failed: snapshots === null,
    latest: own[0] ?? null,
    previous: own[1] ?? null,
    compare: competitors.map((c) => {
      const s = (snapshots ?? []).find((x) => x.domain === c.domain) ?? null;
      return { domain: c.domain, slot: c.color_slot, referring: s?.referring_domains ?? null, rank: s?.domain_rank ?? null, backlinks: s?.backlinks ?? null, at: s?.fetched_at ?? null, price: estimate("backlinks", { domain: c.domain, parts: ["summary"] }, ctx) };
    }),
    priceAll: estimate("backlinks", {}, ctx),
    priceOne: estimate("backlinks", { parts: ["domains"] }, ctx),
  };
  return <BacklinksScreen data={data} state={state} />;
}
