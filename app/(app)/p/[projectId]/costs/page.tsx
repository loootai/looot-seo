import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CostsScreen } from "@/components/costs/CostsScreen";
import { getStore } from "@/lib/data";
import { loadCosts } from "@/lib/view/costsData";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "Costs and runs" };

export default async function CostsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const state = forcedState(await searchParams);
  const data = await loadCosts(await getStore(), projectId);
  if (!data) notFound();
  return <CostsScreen data={state === "empty" ? { ...data, runs: [], spentMonth: 0, spentAll: 0, spend: data.spend.map((d) => ({ day: d.day as string, "Rank checks": 0, Research: 0, Competitors: 0, Backlinks: 0 })) } : data} state={state} />;
}
