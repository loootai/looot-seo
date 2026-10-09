"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { NewLostChart } from "@/components/charts/charts";
import { PaidButton } from "@/components/quote/QuoteProvider";
import { PageHead, Region } from "@/components/shell/PageHead";
import { Delta, DomainIcon, EmptyState, ErrorPanel, SectionHead, SortTh, TableSkeleton, useRowKeys, useSort } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Skeleton, Tag } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import type { BacklinkSnapshot, Project, ReferringDomain } from "@/lib/types";
import { cn, formatDay, formatExact, formatInt, formatRelative } from "@/lib/utils";
import type { ForcedState } from "@/lib/view/state";

export interface BacklinksData {
  project: Project;
  now: string;
  failed: boolean;
  latest: BacklinkSnapshot | null;
  previous: BacklinkSnapshot | null;
  compare: { domain: string; slot: number; referring: number | null; rank: number | null; backlinks: number | null; at: string | null; price: number | null }[];
  priceAll: number | null;
  priceOne: number | null;
}

type Key = "domain" | "rank" | "backlinks" | "first_seen" | "dofollow_share";

export function BacklinksScreen({ data, state }: { data: BacklinksData; state: ForcedState }) {
  const router = useRouter();
  const { project: p, latest: s, previous: prev } = data;
  const loading = state === "loading";
  const refresh = { projectId: p.id, action: "backlinks" as const, onDone: () => router.refresh() };
  const main = <PaidButton label="Refresh backlink data" priceMicros={data.priceAll} request={refresh} shortcut />;

  const cells: { label: string; value: number | null; before: number | null; goodWhenUp: boolean; hint?: string }[] = s
    ? [
        { label: "Backlinks", value: s.backlinks, before: prev?.backlinks ?? null, goodWhenUp: true },
        { label: "Referring domains", value: s.referring_domains, before: prev?.referring_domains ?? null, goodWhenUp: true },
        { label: "Domain rank", value: s.domain_rank, before: prev?.domain_rank ?? null, goodWhenUp: true, hint: "0 to 100" },
        { label: "Spam score", value: s.spam_score, before: prev?.spam_score ?? null, goodWhenUp: false, hint: "0 to 100" },
        { label: "Broken backlinks", value: s.broken_backlinks, before: prev?.broken_backlinks ?? null, goodWhenUp: false },
      ]
    : [];

  return (
    <>
      <PageHead
        title="Backlinks"
        sub={
          s ? (
            <>
              <span title={formatExact(s.fetched_at)}>Fetched {formatRelative(s.fetched_at, data.now)}.</span> A rank check does not refresh backlink data. It changes slowly, so once a month is enough.
            </>
          ) : (
            `Who links to ${p.domain}. An overview, not a link explorer.`
          )
        }
      >
        {main}
      </PageHead>

      {loading ? (
        <>
          <Region>
            <div className="hairline-grid grid grid-cols-2 md:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="px-4 py-3.5 md:px-6">
                  <Skeleton className="w-24" />
                  <Skeleton className="mt-3 h-6 w-16" />
                  <Skeleton className="mt-2.5 w-20" />
                </div>
              ))}
            </div>
          </Region>
          <Region className="px-4 py-4 md:px-6">
            <Skeleton className="h-[220px] w-full opacity-50" />
          </Region>
          <Region>
            <TableSkeleton rows={8} widths={["2fr", 80, 100, 110, 110]} />
          </Region>
        </>
      ) : state === "error" || data.failed ? (
        <Region>
          <ErrorPanel title="The backlink data could not be loaded" code="backlinks_failed" onRetry={() => router.refresh()} />
        </Region>
      ) : !s ? (
        <Region>
          <EmptyState title="No backlink data yet" actions={main}>
            <p>A refresh makes three calls for {p.domain}. You can untick any of them in the quote.</p>
            <ul className="space-y-1 pt-1 text-ink">
              {[
                ["Backlink totals", "backlinks, referring domains, domain rank, spam score, broken links"],
                ["Referring domains", "the top 100 linking domains by rank, with first seen and dofollow share"],
                ["New and lost links", "one row per month for the last 12 months"],
              ].map(([name, what]) => (
                <li key={name} className="flex gap-3">
                  <span className="num w-14 shrink-0 text-muted">{formatMoney(data.priceOne)}</span>
                  <span>
                    <span className="font-medium">{name}.</span> <span className="text-muted">{what}</span>
                  </span>
                </li>
              ))}
            </ul>
          </EmptyState>
        </Region>
      ) : (
        <>
          <Region>
            <dl className="hairline-grid grid grid-cols-2 md:grid-cols-5 [&>*:nth-child(odd)]:max-md:border-l-0 [&>*]:max-md:border-b [&>*]:max-md:border-rule">
              {cells.map((c, i) => (
                <div key={c.label} className={cn("min-w-0 px-4 py-3.5 md:px-6", i === 4 && "max-md:col-span-2")}>
                  <dt className="label">
                    {c.label} {c.hint ? <span className="caption font-normal">{c.hint}</span> : null}
                  </dt>
                  <dd className="stat mt-1.5">{formatInt(c.value)}</dd>
                  <dd className="mt-1 flex h-4 items-center gap-1.5 whitespace-nowrap">
                    {prev ? (
                      <>
                        <Delta value={c.value === null || c.before === null ? null : c.value - c.before} goodWhenUp={c.goodWhenUp} />
                        <span className="caption">since {formatDay(prev.fetched_at)}</span>
                      </>
                    ) : (
                      <span className="caption">first refresh</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Region>

          <div className="grid border-t border-rule bg-surface lg:grid-cols-12">
            <section className="min-w-0 px-4 py-4 md:px-6 lg:col-span-8 lg:border-r lg:border-rule" aria-label="New and lost links">
              <SectionHead title="New and lost links" hint="per month, new above the line and lost below">
                <span className="caption flex items-center gap-3">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-accent" /> New</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-neg/75" /> Lost</span>
                </span>
              </SectionHead>
              <div className="mt-2">
                {s.new_lost && s.new_lost.length ? (
                  <NewLostChart data={s.new_lost} height={210} />
                ) : (
                  <PartMissing what="The monthly history" request={{ ...refresh, scope: { parts: ["newlost"] } }} price={data.priceOne} />
                )}
              </div>
            </section>
            <section className="min-w-0 border-t border-rule px-4 py-4 md:px-6 lg:col-span-4 lg:border-t-0" aria-label="Competitor comparison">
              <SectionHead title="Against competitors" hint="stored refreshes only" />
              <table className="mt-1.5 w-full">
                <thead>
                  <tr className="label text-left">
                    <th scope="col" className="h-6 font-medium">Domain</th>
                    <th scope="col" className="h-6 text-right font-medium">Ref. domains</th>
                    <th scope="col" className="h-6 w-14 text-right font-medium">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-rule">
                    <th scope="row" className="h-9 text-left font-normal">
                      <span className="flex items-center gap-2">
                        <span className="num truncate font-medium">{p.domain}</span>
                        <Tag tone="accent">You</Tag>
                      </span>
                    </th>
                    <td className="num text-right">{formatInt(s.referring_domains)}</td>
                    <td className="num text-right">{formatInt(s.domain_rank)}</td>
                  </tr>
                  {data.compare.map((c) => (
                    <tr key={c.domain} className="border-t border-rule">
                      <th scope="row" className="h-9 max-w-0 text-left font-normal">
                        <span className="num block truncate" title={c.at ? `Fetched ${formatExact(c.at)}` : undefined}>{c.domain}</span>
                      </th>
                      {c.at ? (
                        <>
                          <td className="num text-right">{formatInt(c.referring)}</td>
                          <td className="num text-right">{formatInt(c.rank)}</td>
                        </>
                      ) : (
                        <td colSpan={2} className="text-right">
                          <PaidButton label="Fetch summary" priceMicros={c.price} request={{ projectId: p.id, action: "backlinks", scope: { domain: c.domain, parts: ["summary"] }, onDone: () => router.refresh() }} variant="ghost" size="sm" className="-mr-2 h-6" />
                        </td>
                      )}
                    </tr>
                  ))}
                  {data.compare.length === 0 ? (
                    <tr className="border-t border-rule">
                      <td colSpan={3} className="caption h-9">Add competitors to compare their link profile with yours.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          </div>

          <Region>
            {s.top_domains && s.top_domains.length ? <DomainsTable rows={s.top_domains} /> : <div className="px-4 py-4 md:px-6"><PartMissing what="The referring domains list" request={{ ...refresh, scope: { parts: ["domains"] } }} price={data.priceOne} /></div>}
          </Region>
        </>
      )}
    </>
  );
}

function PartMissing({ what, request, price }: { what: string; request: React.ComponentProps<typeof PaidButton>["request"]; price: number | null }) {
  return (
    <div className="flex min-h-24 flex-col items-start justify-center gap-2.5">
      <p className="text-muted">{what} was not part of the last refresh, or the call failed. A failed call costs nothing.</p>
      <PaidButton label="Retry" priceMicros={price} request={request} variant="secondary" size="sm" />
    </div>
  );
}

function DomainsTable({ rows }: { rows: ReferringDomain[] }) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => (q.trim() ? rows.filter((r) => r.domain.includes(q.trim().toLowerCase())) : rows), [rows, q]);
  const { sort, sorted, toggle } = useSort<ReferringDomain, Key>(filtered, { key: "rank", dir: "desc" }, { domain: (r) => r.domain, rank: (r) => r.rank, backlinks: (r) => r.backlinks, first_seen: (r) => r.first_seen, dofollow_share: (r) => r.dofollow_share });
  const keys = useRowKeys({ count: sorted.length, onOpen: (i) => { const d = sorted[i]?.domain; if (d) window.open(`https://${d}`, "_blank", "noopener,noreferrer"); } });
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5 md:px-6">
        <h2 className="text-[13px] font-semibold">Referring domains</h2>
        <span className="caption">top {rows.length} by rank</span>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden />
          <Input data-filter-input type="search" name="filter" autoComplete="off" spellCheck={false} aria-label="Filter referring domains" placeholder="Filter domains…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
      </div>
      {sorted.length === 0 ? (
        <EmptyState title="No domains match" actions={<Button onClick={() => setQ("")}>Clear filter</Button>} />
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="tbl">
            <colgroup>
              <col />
              <col style={{ width: 84 }} />
              <col style={{ width: 104 }} />
              <col className="max-md:hidden" style={{ width: 120 }} />
              <col className="max-md:hidden" style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh label="Domain" k="domain" sort={sort} onSort={toggle} />
                <SortTh label="Rank" k="rank" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                <SortTh label="Backlinks" k="backlinks" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                <SortTh label="First seen" k="first_seen" sort={sort} onSort={toggle} align="right" firstDir="desc" className="max-md:hidden" />
                <SortTh label="Dofollow share" k="dofollow_share" sort={sort} onSort={toggle} align="right" firstDir="desc" className="max-md:hidden" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.domain} data-row-index={i} data-focused={keys.focused === i}>
                  <td>
                    <a href={`https://${r.domain}`} target="_blank" rel="noreferrer noopener" className="group flex items-center gap-2">
                      <DomainIcon domain={r.domain} />
                      <span className="num truncate group-hover:underline">{r.domain}</span>
                      <ExternalLink className="size-3 shrink-0 text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth={1.5} aria-hidden />
                    </a>
                  </td>
                  <td className="num r">{formatInt(r.rank)}</td>
                  <td className="num r">{formatInt(r.backlinks)}</td>
                  <td className="num r text-muted max-md:hidden">{r.first_seen ? formatDay(r.first_seen, true) : "–"}</td>
                  <td className="max-md:hidden">
                    {r.dofollow_share === null ? (
                      <span className="num block text-right text-muted">–</span>
                    ) : (
                      <span className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-14 rounded-full bg-rule" aria-hidden>
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(r.dofollow_share * 100)}%` }} />
                        </span>
                        <span className="num w-9 text-right">{Math.round(r.dofollow_share * 100)}%</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
