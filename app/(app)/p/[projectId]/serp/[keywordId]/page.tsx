import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SerpViewer } from "./SerpViewer";
import { getStore } from "@/lib/data";
import { estimate } from "@/lib/view/estimate";
import { fallbackPrice, OP } from "@/lib/looot/catalog";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "SERP viewer" };

export default async function SerpViewerPage({ params, searchParams }: { params: Promise<{ projectId: string; keywordId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId, keywordId } = await params;
  const sp = await searchParams;
  const state = forcedState(sp);
  const store = await getStore();
  const [project, keywords, competitors] = await Promise.all([store.getProject(projectId), store.listKeywords(projectId), store.listCompetitors(projectId)]);
  const keyword = keywords.find((k) => k.id === keywordId);
  if (!project || !keyword) notFound();
  const refs = state === "empty" ? [] : await store.listKeywordSnapshots(keywordId);
  const pickId = typeof sp.s === "string" && refs.some((r) => r.id === sp.s) ? sp.s : refs[0]?.id;
  const compareId = typeof sp.c === "string" && refs.some((r) => r.id === sp.c) && sp.c !== pickId ? sp.c : null;
  const [snapshot, compare] = await Promise.all([pickId ? store.getSnapshot(pickId) : null, compareId ? store.getSnapshot(compareId) : null]);
  const serp = fallbackPrice(project.serp_operation || OP.serper);
  return (
    <SerpViewer
      project={project}
      keyword={keyword}
      competitors={competitors.map((c) => ({ domain: c.domain, slot: c.color_slot }))}
      refs={refs}
      snapshot={state === "error" && snapshot ? { ...snapshot, parse_ok: false, organic: [], ai_overview: null, people_also_ask: [], related: [], answer_box: null, knowledge: null } : snapshot}
      compare={compare ? { id: compare.id, fetched_at: compare.fetched_at, organic: compare.organic, questions: compare.people_also_ask.map((q) => q.question) } : null}
      state={state}
      now={store.now()}
      priceFetch={estimate("fetch_snapshot", { keywordId }, { project, keywords, competitors, today: store.now().slice(0, 10) })}
      aioExtra={Math.max(0, fallbackPrice(OP.cloro) - serp)}
    />
  );
}
