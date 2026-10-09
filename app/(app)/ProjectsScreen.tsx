"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHead, Region } from "@/components/shell/PageHead";
import { ProjectForm } from "@/components/shell/ProjectSettings";
import { Delta, DomainIcon, EmptyState, ErrorPanel, SortTh, Sparkline, TableSkeleton, useRowKeys, useSort } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/overlays";
import { formatMoney } from "@/lib/money";
import { formatPercent } from "@/lib/seo/visibility";
import type { UserDefaults } from "@/lib/types";
import { formatExact, formatInt, formatRelative } from "@/lib/utils";
import type { ForcedState } from "@/lib/view/state";

export interface ProjectRow {
  id: string;
  name: string;
  domain: string;
  market: string;
  keywords: number;
  visibility: number | null;
  spark: (number | null)[];
  top10: number | null;
  top10Delta: number | null;
  lastChecked: string | null;
  spent: number;
}

type Key = "name" | "keywords" | "visibility" | "top10" | "lastChecked" | "spent";

export function ProjectsScreen({ rows, state, errorCode, now, defaults, openNew }: { rows: ProjectRow[]; state: ForcedState; errorCode: string; now: string; defaults: UserDefaults; openNew: boolean }) {
  const router = useRouter();
  const [sheet, setSheet] = React.useState(openNew);
  const { sort, sorted, toggle } = useSort<ProjectRow, Key>(rows, { key: "name", dir: "asc" }, { name: (r) => r.name.toLowerCase(), keywords: (r) => r.keywords, visibility: (r) => r.visibility, top10: (r) => r.top10, lastChecked: (r) => r.lastChecked, spent: (r) => r.spent });
  const keys = useRowKeys({ count: sorted.length, onOpen: (i) => sorted[i] && router.push(`/p/${sorted[i].id}`) });
  const newButton = (
    <Button variant="primary" onClick={() => setSheet(true)}>
      <Plus strokeWidth={2} /> New project
    </Button>
  );

  return (
    <>
      <PageHead title="Projects" sub={state === "loading" || state === "error" ? "One project per site and market." : `${rows.length} ${rows.length === 1 ? "project" : "projects"}. One project per site and market.`}>
        {newButton}
      </PageHead>
      <Region>
        {state === "loading" ? (
          <TableSkeleton rows={4} widths={["2fr", 150, 70, 80, 150, 90, 110, 100]} />
        ) : state === "error" ? (
          <ErrorPanel title="The projects could not be loaded" code={errorCode} detail="The database did not answer. Your data is unchanged." onRetry={() => router.refresh()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No projects yet" actions={newButton}>
            <p>A project is one website in one country and language, with the keywords you want to rank for.</p>
            <div className="num pt-1 text-[12px] leading-5">
              <p>First check of 20 keywords at top 10: 20 x 1 page x $0.001 = $0.020</p>
              <p>First check of 20 keywords at top 30: 20 x 3 pages x $0.001 = $0.060</p>
              <p>First check of 20 keywords at top 50: 20 x 5 pages x $0.001 = $0.100</p>
            </div>
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="tbl" style={{ minWidth: 900 }}>
                <colgroup>
                  <col />
                  <col style={{ width: 196 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 176 }} />
                  <col style={{ width: 116 }} />
                  <col style={{ width: 124 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <SortTh label="Project" k="name" sort={sort} onSort={toggle} />
                    <th scope="col">Domain</th>
                    <th scope="col">Market</th>
                    <SortTh label="Keywords" k="keywords" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                    <SortTh label="Est. visibility" k="visibility" sort={sort} onSort={toggle} align="right" firstDir="desc" title="Estimated visibility: click-weighted share of search volume, from a fixed click-through curve" />
                    <SortTh label="Top 10" k="top10" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                    <SortTh label="Last checked" k="lastChecked" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                    <SortTh label="Spent this month" k="spent" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.id} data-row-index={i} data-focused={keys.focused === i} className="cursor-pointer" onClick={() => router.push(`/p/${r.id}`)}>
                      <td>
                        <Link href={`/p/${r.id}`} className="flex items-center gap-2.5 font-medium" onClick={(e) => e.stopPropagation()}>
                          <DomainIcon domain={r.domain} size={18} />
                          <span className="truncate">{r.name}</span>
                        </Link>
                      </td>
                      <td className="num text-muted">{r.domain}</td>
                      <td className="num text-muted">{r.market}</td>
                      <td className="num r">{formatInt(r.keywords)}</td>
                      <td className="r">
                        <span className="inline-flex items-center justify-end gap-3">
                          <Sparkline values={r.spark} width={64} label={`Estimated visibility over the last 30 days for ${r.name}`} />
                          <span className="num w-12 text-right">{formatPercent(r.visibility)}</span>
                        </span>
                      </td>
                      <td className="r">
                        <span className="inline-flex items-center justify-end gap-2">
                          {r.top10Delta ? <Delta value={r.top10Delta} /> : null}
                          <span className="num w-6 text-right">{r.top10 ?? "–"}</span>
                        </span>
                      </td>
                      <td className="r text-muted" title={r.lastChecked ? formatExact(r.lastChecked) : "No check yet"}>
                        {r.lastChecked ? formatRelative(r.lastChecked, now) : "not checked yet"}
                      </td>
                      <td className="num r">{formatMoney(r.spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-rule md:hidden">
              {sorted.map((r) => (
                <li key={r.id}>
                  <Link href={`/p/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-hover">
                    <DomainIcon domain={r.domain} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[14px] font-medium">{r.name}</span>
                        <span className="num shrink-0">{formatPercent(r.visibility)}</span>
                      </span>
                      <span className="flex items-baseline justify-between gap-3 text-[12px] text-muted">
                        <span className="num truncate">{r.domain}</span>
                        <span className="shrink-0">
                          {r.keywords} kw · {r.lastChecked ? formatRelative(r.lastChecked, now) : "not checked"}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Region>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent title="New project" description="A site, a market and the first keywords.">
          <ProjectForm defaults={defaults} onDone={(id) => (setSheet(false), id && router.push(`/p/${id}`))} />
        </SheetContent>
      </Sheet>
    </>
  );
}
