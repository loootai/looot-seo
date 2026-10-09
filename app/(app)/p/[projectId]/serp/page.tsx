import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead, Region } from "@/components/shell/PageHead";
import { EmptyState, ErrorPanel, FeatureGlyphs, Position, TableSkeleton } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/controls";
import { getStore } from "@/lib/data";
import { formatDay, formatRelative } from "@/lib/utils";
import { keywordRows, loadBundle } from "@/lib/view/project";
import { forcedState } from "@/lib/view/state";

export const metadata: Metadata = { title: "SERP" };

export default async function SerpIndexPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const state = forcedState(await searchParams);
  const store = await getStore();
  const b = await loadBundle(store, projectId);
  if (!b) notFound();
  const rows = state === "empty" ? [] : keywordRows(b).sort((x, y) => (x.position ?? 999) - (y.position ?? 999));
  const base = `/p/${projectId}`;
  return (
    <>
      <PageHead title="SERP snapshots" sub="What Google returned for each keyword on each check. Opening a stored snapshot is free." />
      <Region>
        {state === "loading" ? (
          <TableSkeleton rows={12} widths={["2fr", 90, 120, 120, 110]} />
        ) : state === "error" ? (
          <ErrorPanel title="The snapshots could not be loaded" code="snapshots_failed" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No keywords to show"
            actions={
              <Button asChild variant="primary">
                <Link href={`${base}/rankings?add=1`}>Add keywords</Link>
              </Button>
            }
          >
            <p>A snapshot is stored for every keyword on every rank check. Add keywords and run a check to see the first ones.</p>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl sm:min-w-[560px]">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col className="max-sm:hidden" style={{ width: 130 }} />
                <col className="max-sm:hidden" style={{ width: 150 }} />
                <col className="max-sm:hidden" style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Keyword</th>
                  <th scope="col" className="r">Position</th>
                  <th scope="col" className="max-sm:hidden">Features</th>
                  <th scope="col" className="r max-sm:hidden">Latest snapshot</th>
                  <th scope="col" className="r max-sm:hidden">Snapshots</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`${base}/serp/${r.id}`} className="flex min-w-0 items-center gap-1.5 font-medium hover:underline">
                        <span className="truncate">{r.phrase}</span>
                        {r.aio ? <Tag tone="accent">AIO</Tag> : null}
                      </Link>
                    </td>
                    <td className="r">
                      <Position value={r.position} depth={r.depth} checked={r.checked} />
                    </td>
                    <td className="max-sm:hidden">{r.checked ? <FeatureGlyphs f={r.features} /> : <span className="text-muted">–</span>}</td>
                    <td className="r text-muted max-sm:hidden" title={r.lastChecked ?? undefined}>
                      {r.lastChecked ? `${formatDay(r.lastChecked)} · ${formatRelative(r.lastChecked, b.now)}` : "never checked"}
                    </td>
                    <td className="num r text-muted max-sm:hidden">{r.history.filter((h) => h.snapshotId).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Region>
    </>
  );
}
