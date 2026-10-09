"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, StickyNote } from "lucide-react";
import { addChartNote } from "@/app/actions";
import { DistributionChart, type DistributionPoint } from "@/components/charts/charts";
import { PaidButton } from "@/components/quote/QuoteProvider";
import { PageHead, Region } from "@/components/shell/PageHead";
import { useToast } from "@/components/shell/toast";
import { Change, Delta, DomainIcon, EmptyState, ErrorPanel, Position, SectionHead } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/overlays";
import { formatMoney } from "@/lib/money";
import { BANDS } from "@/lib/seo/bands";
import { formatPercent } from "@/lib/seo/visibility";
import type { Project } from "@/lib/types";
import { cn, formatDay, formatExact, formatInt, formatRelative } from "@/lib/utils";
import { ACTION_LABELS, type ChangeKind, type ProjectStats } from "@/lib/view/project";
import type { ForcedState } from "@/lib/view/state";
import { daysBefore } from "@/lib/view/timeline";

interface Mover {
  id: string;
  phrase: string;
  from: number | null;
  to: number | null;
  change: number;
  kind: ChangeKind;
  depth: number;
}

export interface OverviewData {
  project: Project;
  now: string;
  stats: ProjectStats;
  distribution: DistributionPoint[];
  notes: { n: number; day: string; body: string }[];
  up: Mover[];
  down: Mover[];
  sov: { domain: string; share: number; slot: number; own: boolean }[] | null;
  features: { label: string; present: number; owned: number | null; ownedLabel: string }[];
  checkedKeywords: number;
  runs: { id: string; action: string; done: number; total: number; cost: number; at: string; status: string; simulated: boolean }[] | null;
  priceCheck: number | null;
  priceDomain: number | null;
  domainOverview: { keywords: number | null; traffic: number | null; at: string } | null;
}

type Range = "7" | "30" | "90" | "all";

export function StatusDot({ status }: { status: string }) {
  const tone = status === "completed" ? "bg-accent" : status === "running" ? "bg-warn" : status === "failed" ? "bg-neg" : status === "cancelled" ? "bg-muted" : "bg-warn";
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", tone)} aria-hidden />;
}

export function OverviewScreen({ data, state }: { data: OverviewData; state: ForcedState }) {
  const router = useRouter();
  const { project: p, stats: s } = data;
  const [range, setRange] = React.useState<Range>("90");
  const base = `/p/${p.id}`;
  const empty = state === "empty";
  const loading = state === "loading";
  const noKeywords = !loading && (empty ? false : s.tracked === 0);
  const unchecked = empty || (!s.checked && s.tracked > 0);
  const from = range === "all" ? "" : daysBefore(data.now, Number(range));
  const dist = data.distribution.filter((d) => d.day >= from);
  const check = <PaidButton label="Check rankings" priceMicros={data.priceCheck} request={{ projectId: p.id, action: "check_rankings" }} shortcut disabled={s.tracked === 0} />;

  const cells: { label: string; hint?: string; value: React.ReactNode; sub: React.ReactNode }[] = [
    { label: "Estimated visibility", hint: `Sum of click-through rate x volume over tracked keywords, divided by the same sum at position 1. ${s.leftOut ? `${s.leftOut} ${s.leftOut === 1 ? "keyword has" : "keywords have"} no volume and ${s.leftOut === 1 ? "is" : "are"} left out.` : "Every tracked keyword has a volume."}`, value: unchecked ? "–" : formatPercent(s.visibility), sub: unchecked ? "no check yet" : <><Delta value={s.visibilityDelta === null ? null : s.visibilityDelta * 100} digits={1} suffix=" pts" /> <span className="caption">vs 30 days ago</span></> },
    { label: "Average position", value: unchecked || s.avgPosition === null ? "–" : s.avgPosition.toFixed(1), sub: unchecked ? "no check yet" : <><Delta value={s.avgDelta} goodWhenUp={false} digits={1} /> <span className="caption">{s.ranked} of {s.tracked} ranked</span></> },
    { label: "Top 3", value: unchecked ? "–" : s.top3, sub: unchecked ? "no check yet" : <><Delta value={s.top3Delta} /> <span className="caption">vs 30 days ago</span></> },
    { label: "Top 10", value: unchecked ? "–" : s.top10, sub: unchecked ? "no check yet" : <><Delta value={s.top10Delta} /> <span className="caption">vs 30 days ago</span></> },
    { label: "Keywords tracked", value: s.tracked, sub: <span className="caption">{s.lastChecked && !unchecked ? <span title={formatExact(s.lastChecked)}>checked {formatRelative(s.lastChecked, data.now)}</span> : "not checked yet"}</span> },
  ];

  return (
    <>
      <PageHead
        title={
          <span className="flex items-center gap-2.5">
            <DomainIcon domain={p.domain} size={22} />
            {p.name}
          </span>
        }
        sub={
          <span className="num text-[12px]">
            {p.domain} · {p.country} · {p.language} · top {p.depth}
            {data.domainOverview && data.domainOverview.keywords !== null ? <span className="font-sans"> · ranks for {formatInt(data.domainOverview.keywords)} keywords, about {formatInt(data.domainOverview.traffic)} visits a month (fetched {formatDay(data.domainOverview.at)})</span> : null}
          </span>
        }
      >
        <PaidButton label="Refresh domain overview" priceMicros={data.priceDomain} request={{ projectId: p.id, action: "domain_overview" }} variant="secondary" />
        {check}
      </PageHead>

      {noKeywords ? (
        <Region>
          <EmptyState title="This project has no keywords yet">
            <p>Two steps to the first numbers. Neither costs anything until you confirm a quote.</p>
            <ol className="space-y-2 pt-2 text-ink">
              <li className="flex gap-3">
                <span className="num text-muted">1.</span>
                <span>
                  Add keywords. <Link className="text-accent-text underline-offset-2 hover:underline" href={`${base}/research`}>Find them in Research</Link> or <Link className="text-accent-text underline-offset-2 hover:underline" href={`${base}/rankings?add=1`}>paste a list</Link>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="num text-muted">2.</span>
                <span>Run the first check. At top {p.depth} it costs <span className="num">{formatMoney((p.depth / 10) * 1000)}</span> per keyword.</span>
              </li>
            </ol>
          </EmptyState>
        </Region>
      ) : (
        <>
          <Region>
            <dl className="hairline-grid grid grid-cols-2 md:grid-cols-5 [&>*:nth-child(odd)]:max-md:border-l-0 [&>*]:max-md:border-b [&>*]:max-md:border-rule">
              {cells.map((c, i) => (
                <div key={c.label} className={cn("min-w-0 px-4 py-3.5 md:px-6", i === 4 && "max-md:col-span-2")}>
                  <dt className="label flex items-center gap-1">
                    {c.label}
                    {c.hint ? (
                      <Tip label={c.hint}>
                        <button type="button" className="text-muted/70 hover:text-ink" aria-label={`About ${c.label}`}>
                          <Info className="size-3" strokeWidth={1.5} />
                        </button>
                      </Tip>
                    ) : null}
                  </dt>
                  <dd className="stat mt-1.5">{loading ? <Skeleton className="my-1 h-6 w-20" /> : c.value}</dd>
                  <dd className="mt-1 flex h-4 items-center gap-1.5 whitespace-nowrap">{loading ? <Skeleton className="w-24" /> : c.sub}</dd>
                </div>
              ))}
            </dl>
          </Region>

          <div className="grid border-t border-rule bg-surface lg:grid-cols-12">
            <section className="min-w-0 px-4 py-4 md:px-6 lg:col-span-8 lg:border-r lg:border-rule" aria-label="Position distribution">
              <SectionHead title="Position distribution" hint="keywords per band on each check">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={unchecked || loading}>
                      <StickyNote strokeWidth={1.5} /> Add note
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end">
                    <NoteForm projectId={p.id} today={data.now.slice(0, 10)} />
                  </PopoverContent>
                </Popover>
                <Segmented label="Range" value={range} onChange={setRange} options={[{ value: "7", label: "7 d" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }, { value: "all", label: "All" }]} />
              </SectionHead>
              <div className="mt-3 h-[220px] md:h-[262px]">
                {loading ? (
                  <Skeleton className="size-full opacity-50" />
                ) : state === "error" ? (
                  <ErrorPanel className="px-0 py-6" title="The history could not be loaded" code="rank_checks_failed" onRetry={() => router.refresh()} />
                ) : unchecked ? (
                  <div className="flex h-full flex-col items-start justify-center gap-3">
                    <p className="max-w-md text-muted">No check has run yet, so there is no history to draw. The first check reads the top {p.depth} results for each of the {s.tracked} keywords.</p>
                    {check}
                  </div>
                ) : dist.length < 2 ? (
                  <div className="flex h-full items-center text-muted">{dist.length} check in this range. The chart needs two. Try a longer range.</div>
                ) : (
                  <DistributionChart data={dist} notes={data.notes.filter((n) => n.day >= from)} height={258} />
                )}
              </div>
              {!unchecked && !loading ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {BANDS.map((b) => (
                    <span key={b.key} className="caption flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[2px] border border-rule" style={{ background: `var(--band-${b.band})` }} /> {b.label}
                    </span>
                  ))}
                  {data.notes.filter((n) => n.day >= from).map((n) => (
                    <Tip key={n.n} label={`${formatDay(n.day, true)}: ${n.body}`}>
                      <button type="button" className="caption inline-flex items-center gap-1 hover:text-ink">
                        <span className="num inline-flex size-3.5 items-center justify-center rounded-full border border-ink/50 text-[9px] font-semibold text-ink">{n.n}</span>
                        <span className="max-w-44 truncate">{n.body}</span>
                      </button>
                    </Tip>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="min-w-0 border-t border-rule px-4 py-4 md:px-6 lg:col-span-4 lg:border-t-0" aria-label="Movers">
              <SectionHead title="Movers" hint="since the previous check" />
              {loading ? (
                <div className="mt-3 space-y-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} style={{ width: `${60 + ((i * 17) % 35)}%` }} />)}</div>
              ) : unchecked || (data.up.length === 0 && data.down.length === 0) ? (
                <p className="mt-3 text-muted">{unchecked ? "Movement shows after the second check." : "Nothing moved between the last two checks."}</p>
              ) : (
                <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-1">
                  {([["Up", data.up], ["Down", data.down]] as const).map(([label, list]) => (
                    <div key={label}>
                      <h3 className="label">{label}</h3>
                      <ul className="mt-0.5">
                        {list.length === 0 ? <li className="caption py-1.5">None</li> : null}
                        {list.map((m) => (
                          <li key={m.id}>
                            <Link href={`${base}/rankings?kw=${m.id}`} className="-mx-2 flex h-7 items-center gap-2 rounded-[4px] px-2 hover:bg-hover">
                              <span className="min-w-0 flex-1 truncate">{m.phrase}</span>
                              <span className="num w-5 text-right text-muted">{m.from ?? "–"}</span>
                              <ArrowRight className="size-3 text-muted/70" strokeWidth={1.5} aria-hidden />
                              <span className="w-6 text-right">{m.to === null ? <span className="num text-muted">–</span> : <Position value={m.to} depth={m.depth} />}</span>
                              <span className="w-10 text-right">
                                <Change kind={m.kind} change={m.change} />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid border-y border-rule bg-surface md:grid-cols-3 md:[&>*+*]:border-l md:[&>*+*]:border-rule max-md:[&>*+*]:border-t max-md:[&>*+*]:border-rule">
            <section className="min-w-0 px-4 py-4 md:px-6" aria-label="Share of voice">
              <SectionHead title="Share of voice" hint="tracked keywords, stored snapshots" />
              {loading ? (
                <div className="mt-3 space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 18}%` }} />)}</div>
              ) : data.sov === null ? (
                <ErrorPanel className="px-0 py-4" title="Share of voice could not be loaded" code="snapshots_failed" onRetry={() => router.refresh()} />
              ) : unchecked ? (
                <p className="mt-3 text-muted">Needs one check. It is read from stored snapshots and costs nothing.</p>
              ) : (
                <ul className="mt-2.5 space-y-2">
                  {[...data.sov].sort((a, b) => b.share - a.share).map((d) => (
                    <li key={d.domain} className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3">
                      <span className="min-w-0">
                        <span className={cn("num block truncate text-[12px] leading-4", d.own ? "font-medium" : "text-muted")}>{d.domain}{d.own ? " (you)" : ""}</span>
                        <span className="mt-1 block h-1.5 rounded-full bg-rule">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, Math.min(100, d.share * 100 * 2.5))}%`, background: `var(--chart-${d.slot})` }} />
                        </span>
                      </span>
                      <span className="num text-right">{formatPercent(d.share)}</span>
                    </li>
                  ))}
                  {data.sov.length === 1 ? (
                    <li className="caption pt-1">
                      <Link href={`${base}/competitors`} className="text-accent-text hover:underline">Add competitors</Link> to compare.
                    </li>
                  ) : null}
                </ul>
              )}
            </section>

            <section className="min-w-0 px-4 py-4 md:px-6" aria-label="SERP features">
              <SectionHead title="SERP features on your keywords" />
              {loading ? (
                <div className="mt-3 space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} style={{ width: `${80 - i * 10}%` }} />)}</div>
              ) : unchecked ? (
                <p className="mt-3 text-muted">Counted from the first check onwards.</p>
              ) : (
                <table className="mt-1.5 w-full">
                  <thead>
                    <tr className="label text-left">
                      <th scope="col" className="h-6 font-medium">Feature</th>
                      <th scope="col" className="h-6 text-right font-medium">Keywords</th>
                      <th scope="col" className="h-6 text-right font-medium">With you in it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.features.map((f) => (
                      <tr key={f.label} className="border-t border-rule">
                        <th scope="row" className="h-8 text-left font-normal">{f.label}</th>
                        <td className="num h-8 text-right">{f.present} <span className="text-muted">of {data.checkedKeywords}</span></td>
                        <td className={cn("num h-8 text-right", f.owned ? "font-medium text-accent-text" : "text-muted")} title={f.owned === null ? "Not tracked for this feature" : `${f.owned} ${f.ownedLabel}`}>{f.owned ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="min-w-0 px-4 py-4 md:px-6" aria-label="Last runs">
              <SectionHead title="Last runs">
                <Link href={`${base}/costs`} className="text-[12px] text-accent-text hover:underline">All runs and costs</Link>
              </SectionHead>
              {loading ? (
                <div className="mt-3 space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} style={{ width: `${95 - ((i * 13) % 30)}%` }} />)}</div>
              ) : data.runs === null ? (
                <ErrorPanel className="px-0 py-4" title="Runs could not be loaded" code="runs_failed" onRetry={() => router.refresh()} />
              ) : empty || data.runs.length === 0 ? (
                <p className="mt-3 text-muted">No runs yet. Every paid action shows up here with what it cost.</p>
              ) : (
                <ul className="mt-1.5">
                  {data.runs.map((r) => (
                    <li key={r.id} className="flex h-8 items-center gap-2 border-t border-rule first:border-t-0">
                      <StatusDot status={r.status} />
                      <span className="min-w-0 flex-1 truncate">{ACTION_LABELS[r.action] ?? r.action}</span>
                      <span className="num hidden text-muted xl:inline">{r.done}/{r.total}</span>
                      <span className="num w-14 text-right">{formatMoney(r.cost)}</span>
                      <span className="w-20 text-right text-[12px] text-muted" title={formatExact(r.at)}>{formatRelative(r.at, data.now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function NoteForm({ projectId, today }: { projectId: string; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [day, setDay] = React.useState(today);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const res = await addChartNote(projectId, day, body);
        setPending(false);
        if (!res.ok) return setError(res.error);
        setBody("");
        setError(null);
        toast.demoEdit();
        toast.push("Note added to the chart.");
        router.refresh();
      }}
    >
      <Field label="Date" htmlFor="note-day">
        <Input id="note-day" name="day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
      </Field>
      <Field label="What changed" htmlFor="note-body" hint={`${body.length} of 140`} error={error}>
        <Input id="note-body" name="body" autoComplete="off" maxLength={140} placeholder="Moved the blog to /journal…" value={body} onChange={(e) => setBody(e.target.value)} required />
      </Field>
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        Add note
      </Button>
    </form>
  );
}
