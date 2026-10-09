"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addCompetitors, addKeywords, removeCompetitor } from "@/app/actions";
import { ShareChart } from "@/components/charts/charts";
import { PaidButton } from "@/components/quote/QuoteProvider";
import { PageHead, Region } from "@/components/shell/PageHead";
import { useToast } from "@/components/shell/toast";
import { BandCell, DomainIcon, EmptyState, ErrorPanel, SectionHead, SortTh, TableSkeleton, useSort } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Checkbox, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Tag } from "@/components/ui/controls";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import type { RunView } from "@/lib/looot/service";
import { isGap } from "@/lib/seo/overlap";
import { formatPercent } from "@/lib/seo/visibility";
import type { CompetitorSuggestion, OverlapRow, Project } from "@/lib/types";
import { cn, formatDay, formatInt, formatRelative } from "@/lib/utils";
import type { ForcedState } from "@/lib/view/state";

interface CompetitorRow {
  id: string;
  domain: string;
  slot: number;
  shared: number;
  avg: number | null;
  share: number;
  overlap: { at: string; rows: OverlapRow[] } | null;
  price: number | null;
}

export interface CompetitorsData {
  project: Project;
  now: string;
  ownShare: number;
  competitors: CompetitorRow[];
  matrix: { id: string; phrase: string; volume: number | null; ours: number | null; theirs: (number | null)[] }[];
  history: Record<string, number | string>[];
  checks: number;
  oldestSnapshot: string | null;
  snapshotsFailed: boolean;
  tracked: string[];
  priceSuggest: number | null;
}

const MAX = 8;

export function CompetitorsScreen({ data, state }: { data: CompetitorsData; state: ForcedState }) {
  const router = useRouter();
  const toast = useToast();
  const { project: p, competitors } = data;
  const loading = state === "loading";
  const [suggestions, setSuggestions] = React.useState<CompetitorSuggestion[] | null>(null);
  const [tab, setTab] = React.useState("tracked");
  const full = competitors.length >= MAX;

  const onSuggested = (view: RunView) => {
    const list = view.results.find((r) => Array.isArray(r)) as CompetitorSuggestion[] | undefined;
    if (list && list.length) setSuggestions(list);
    else toast.push(view.counts.unreadable ? "The provider returned a shape this version cannot read. The call was charged; the raw body is on the run in Costs." : "No new competitor domains came back.", "error");
  };
  const add = async (domains: string[]) => {
    const res = await addCompetitors(p.id, domains);
    if (!res.ok) return res.error;
    toast.demoEdit();
    toast.push(`${res.added} ${res.added === 1 ? "competitor" : "competitors"} added. Positions come from stored snapshots, so nothing was charged.`);
    router.refresh();
    return null;
  };

  const actions = (
    <>
      <PaidButton label="Suggest competitors" priceMicros={data.priceSuggest} request={{ projectId: p.id, action: "suggest_competitors", onDone: onSuggested }} variant="secondary" disabled={full} />
      <AddCompetitor onAdd={add} disabled={full} />
    </>
  );

  const series = [{ key: "d0", label: `${p.domain} (you)`, color: "var(--chart-1)" }, ...competitors.map((c, i) => ({ key: `d${i + 1}`, label: c.domain, color: `var(--chart-${c.slot})` }))];

  return (
    <>
      <PageHead title="Competitors" sub={`Up to ${MAX} domains compared with ${p.domain} on the keywords you track.`}>
        {actions}
      </PageHead>

      {loading ? (
        <Region>
          <TableSkeleton rows={5} widths={["2fr", 110, 110, 180, 150, 60]} />
          <div className="border-t border-rule px-4 py-4 md:px-6">
            <Skeleton className="h-[220px] w-full opacity-50" />
          </div>
        </Region>
      ) : state === "error" || data.snapshotsFailed ? (
        <Region>
          <ErrorPanel title="The competitor data could not be loaded" code="snapshots_failed" onRetry={() => router.refresh()} />
        </Region>
      ) : competitors.length === 0 ? (
        <Region>
          <EmptyState title="No competitors yet" actions={actions}>
            <p>Add a domain you already know, or let looot find the domains that rank for the same keywords as {p.domain}.</p>
            <ul className="space-y-1 pt-1 text-ink">
              <li className="flex gap-3">
                <span className="num w-14 text-muted">$0.00</span>
                <span>Add a domain by hand. Its positions are read from the snapshots your rank checks already stored.</span>
              </li>
              <li className="flex gap-3">
                <span className="num w-14 text-muted">$0.012</span>
                <span>Suggest competitors. One call returns up to 20 domains; nothing is added until you tick rows.</span>
              </li>
              <li className="flex gap-3">
                <span className="num w-14 text-muted">$0.012</span>
                <span>Fetch every keyword you share with one competitor, up to 200 rows.</span>
              </li>
            </ul>
          </EmptyState>
        </Region>
      ) : (
        <>
          <Region>
            <div className="overflow-x-auto">
              <table className="tbl max-md:hidden" style={{ minWidth: 760 }}>
                <colgroup>
                  <col />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 52 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Domain</th>
                    <th scope="col" className="r" title="Tracked keywords this domain ranks in the top 10 for">Shared top 10</th>
                    <th scope="col" className="r" title="Average position on those keywords">Avg position</th>
                    <th scope="col">Share of voice</th>
                    <th scope="col" className="r">Last overlap fetch</th>
                    <th scope="col"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="flex items-center gap-2">
                        <DomainIcon domain={p.domain} />
                        <span className="num truncate font-medium">{p.domain}</span>
                        <Tag tone="accent">You</Tag>
                      </span>
                    </td>
                    <td className="num r">{data.matrix.filter((m) => m.ours !== null && m.ours <= 10).length}</td>
                    <td className="num r text-muted">–</td>
                    <td><ShareBar share={data.ownShare} slot={1} /></td>
                    <td className="r text-muted">–</td>
                    <td />
                  </tr>
                  {competitors.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--chart-${c.slot})` }} aria-hidden />
                          <DomainIcon domain={c.domain} />
                          <a href={`https://${c.domain}`} target="_blank" rel="noreferrer noopener" className="num truncate hover:underline">{c.domain}</a>
                        </span>
                      </td>
                      <td className="num r">{c.shared} <span className="text-muted">of {data.matrix.length}</span></td>
                      <td className="num r">{c.avg === null ? <span className="text-muted">–</span> : c.avg.toFixed(1)}</td>
                      <td><ShareBar share={c.share} slot={c.slot} /></td>
                      <td className="r text-muted">{c.overlap ? <span title={c.overlap.at}>{formatRelative(c.overlap.at, data.now)}</span> : "not fetched"}</td>
                      <td className="r">
                        <RemoveButton domain={c.domain} onRemove={async () => { const res = await removeCompetitor(c.id); if (res.ok) (toast.demoEdit(), router.refresh()); else toast.push(res.error, "error"); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-rule md:hidden">
              {[{ id: "own", domain: p.domain, slot: 1, shared: data.matrix.filter((m) => m.ours !== null && m.ours <= 10).length, avg: null as number | null, share: data.ownShare, own: true }, ...competitors.map((c) => ({ ...c, own: false }))].map((c) => (
                <li key={c.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--chart-${c.slot})` }} aria-hidden />
                    <span className={cn("num min-w-0 flex-1 truncate", c.own && "font-medium")}>{c.domain}</span>
                    {c.own ? <Tag tone="accent">You</Tag> : null}
                    <span className="num">{formatPercent(c.share)}</span>
                  </div>
                  <p className="caption mt-0.5 pl-4">{c.shared} tracked keywords in the top 10{c.avg !== null ? ` · average position ${c.avg.toFixed(1)}` : ""}</p>
                </li>
              ))}
            </ul>
          </Region>

          <Region className="px-4 py-4 md:px-6">
            <SectionHead title="Share of voice over time" hint="click a domain to hide its line" />
            <div className="mt-2">
              {data.checks < 2 ? (
                <p className="flex h-[120px] items-center text-muted">{data.checks} {data.checks === 1 ? "check is" : "checks are"} stored. The line needs two.</p>
              ) : (
                <ShareChart data={data.history} series={series} height={200} />
              )}
            </div>
          </Region>

          <Region>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="px-4 md:px-6">
                <TabsTrigger value="tracked">Tracked keywords <span className="caption ml-1 font-normal">free</span></TabsTrigger>
                <TabsTrigger value="shared">All shared keywords <span className="caption ml-1 font-normal">paid</span></TabsTrigger>
              </TabsList>
              <TabsContent value="tracked">
                <Matrix data={data} />
              </TabsContent>
              <TabsContent value="shared">
                <Shared data={data} />
              </TabsContent>
            </Tabs>
          </Region>
        </>
      )}

      <SuggestDialog suggestions={suggestions} room={MAX - competitors.length} onClose={() => setSuggestions(null)} onAdd={add} />
    </>
  );
}

function ShareBar({ share, slot }: { share: number; slot: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-1.5 flex-1 rounded-full bg-rule">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, Math.min(100, share * 250))}%`, background: `var(--chart-${slot})` }} />
      </span>
      <span className="num w-12 text-right">{formatPercent(share)}</span>
    </span>
  );
}

function RemoveButton({ domain, onRemove }: { domain: string; onRemove: () => Promise<void> }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="iconSm" variant="ghost" aria-label={`Remove ${domain}`}>
          <Trash2 strokeWidth={1.5} className="text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="font-medium">Remove {domain}?</p>
        <p className="caption mt-1">Its stored overlap is deleted. Snapshots stay, so adding it back later costs nothing.</p>
        <Button className="mt-3" size="sm" variant="danger" onClick={onRemove}>Remove competitor</Button>
      </PopoverContent>
    </Popover>
  );
}

function AddCompetitor({ onAdd, disabled }: { onAdd: (domains: string[]) => Promise<string | null>; disabled: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [domain, setDomain] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="primary" disabled={disabled} title={disabled ? `A project can have at most ${MAX} competitors` : undefined}>
          <Plus strokeWidth={1.5} /> Add competitor
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const err = await onAdd([domain]);
            setPending(false);
            setError(err);
            if (!err) (setDomain(""), setOpen(false));
          }}
        >
          <Field label="Competitor domain" htmlFor="competitor-domain" error={error} hint="Free. Positions come from stored snapshots.">
            <Input id="competitor-domain" name="domain" inputMode="url" autoComplete="off" spellCheck={false} placeholder="roastwell.com…" value={domain} onChange={(e) => setDomain(e.target.value)} aria-invalid={Boolean(error)} required />
          </Field>
          <Button type="submit" variant="primary" size="sm" disabled={pending || !domain.trim()}>Add competitor</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SuggestDialog({ suggestions, room, onClose, onAdd }: { suggestions: CompetitorSuggestion[] | null; room: number; onClose: () => void; onAdd: (domains: string[]) => Promise<string | null> }) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const toggle = (d: string) => setPicked((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else if (n.size < room) n.add(d); return n; });
  return (
    <Dialog open={suggestions !== null} onOpenChange={(o) => { if (!o) (setPicked(new Set()), setError(null), onClose()); }}>
      <DialogContent title="Suggested competitors" description={`Domains that rank for the same keywords. Tick up to ${room} to add. Adding is free.`}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="tbl">
            <colgroup>
              <col style={{ width: 40 }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Pick</span></th>
                <th scope="col">Domain</th>
                <th scope="col" className="r">Shared keywords</th>
                <th scope="col" className="r">Avg position</th>
              </tr>
            </thead>
            <tbody>
              {(suggestions ?? []).map((s) => (
                <tr key={s.domain} data-selected={picked.has(s.domain)} className="cursor-pointer" onClick={() => toggle(s.domain)}>
                  <td><Checkbox checked={picked.has(s.domain)} onCheckedChange={() => toggle(s.domain)} onClick={(e) => e.stopPropagation()} aria-label={`Add ${s.domain}`} /></td>
                  <td className="num">{s.domain}</td>
                  <td className="num r">{formatInt(s.intersections)}</td>
                  <td className="num r">{s.avg_position === null ? "–" : s.avg_position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3">
          <p className={cn("caption", error && "text-neg")} role={error ? "alert" : undefined}>{error ?? `${picked.size} of ${room} picked`}</p>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={picked.size === 0 || pending}
              onClick={async () => {
                setPending(true);
                const err = await onAdd([...picked]);
                setPending(false);
                setError(err);
                if (!err) (setPicked(new Set()), onClose());
              }}
            >
              Add {picked.size || ""} {picked.size === 1 ? "competitor" : "competitors"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const short = (domain: string) => { const n = domain.split(".")[0] as string; return n.length > 12 ? `${n.slice(0, 11)}…` : n; };

type MKey = "phrase" | "volume" | "ours" | `c${number}`;

function Matrix({ data }: { data: CompetitorsData }) {
  const { competitors: cs, project: p } = data;
  const [gap, setGap] = React.useState(false);
  const [pick, setPick] = React.useState(0);
  const rows = React.useMemo(() => (gap ? data.matrix.filter((m) => isGap(m.ours, m.theirs)) : data.matrix), [gap, data.matrix]);
  const get = { phrase: (r) => r.phrase, volume: (r) => r.volume, ours: (r) => r.ours } as Record<MKey, (r: CompetitorsData["matrix"][number]) => number | string | null>;
  cs.forEach((_, i) => (get[`c${i}`] = (r) => r.theirs[i] ?? null));
  const { sort, sorted, toggle } = useSort<CompetitorsData["matrix"][number], MKey>(rows, { key: "ours", dir: "asc" }, get);
  const gaps = data.matrix.filter((m) => isGap(m.ours, m.theirs)).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5 md:px-6">
        <p className="caption min-w-0 flex-1">
          Read from stored snapshots, so this table is free.{data.oldestSnapshot ? ` Oldest snapshot used: ${formatDay(data.oldestSnapshot, true)}.` : ""}
        </p>
        <label className="flex items-center gap-2 text-[12px]">
          <Checkbox checked={gap} onCheckedChange={(v) => setGap(v === true)} /> Gap only <span className="num text-muted">{gaps}</span>
        </label>
        <Select className="w-auto md:hidden" aria-label="Competitor shown" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
          {cs.map((c, i) => <option key={c.id} value={i}>{c.domain}</option>)}
        </Select>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={gap ? "No gaps" : "No snapshots yet"} actions={gap ? <Button onClick={() => setGap(false)}>Show all keywords</Button> : undefined}>
          <p>{gap ? `No tracked keyword has a competitor in the top 10 while ${p.domain} is outside it.` : "Run a rank check first. Each check stores the full result page, and competitor positions are read from it."}</p>
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto max-md:hidden">
            <table className="tbl" style={{ minWidth: 420 + cs.length * 112 }}>
              <colgroup>
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 104 }} />
                {cs.map((c) => <col key={c.id} style={{ width: 112 }} />)}
              </colgroup>
              <thead>
                <tr>
                  <SortTh label="Keyword" k="phrase" sort={sort} onSort={toggle} />
                  <SortTh label="Volume" k="volume" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                  <SortTh label="You" k="ours" sort={sort} onSort={toggle} className="text-center [&>button]:mx-auto" />
                  {cs.map((c, i) => <SortTh key={c.id} label={short(c.domain)} title={c.domain} k={`c${i}` as MKey} sort={sort} onSort={toggle} className="text-center [&>button]:mx-auto" />)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const all = [r.ours, ...r.theirs].filter((x): x is number => x !== null);
                  const best = all.length ? Math.min(...all) : null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="truncate">{r.phrase}</span>
                          {isGap(r.ours, r.theirs) ? <Tag tone="warn">gap</Tag> : null}
                        </span>
                      </td>
                      <td className="num r">{formatInt(r.volume)}</td>
                      <td><BandCell value={r.ours} strong={r.ours !== null && r.ours === best} /></td>
                      {r.theirs.map((t, i) => <td key={i}><BandCell value={t} strong={t !== null && t === best} /></td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-rule md:hidden">
            {sorted.map((r) => (
              <li key={r.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                <span className="min-w-0 flex-1 truncate">{r.phrase}</span>
                <span className="flex items-center gap-1.5" aria-label={`You ${r.ours ?? "not ranked"}, ${cs[pick]?.domain} ${r.theirs[pick] ?? "not ranked"}`}>
                  <BandCell value={r.ours} className="mx-0" />
                  <span className="caption">vs</span>
                  <BandCell value={r.theirs[pick] ?? null} className="mx-0" />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

type SKey = "phrase" | "volume" | "ours" | "theirs" | "diff";

function Shared({ data }: { data: CompetitorsData }) {
  const router = useRouter();
  const toast = useToast();
  const { competitors: cs, project: p } = data;
  const [id, setId] = React.useState(cs.find((c) => c.overlap)?.id ?? cs[0]?.id ?? "");
  const c = cs.find((x) => x.id === id) ?? cs[0];
  const tracked = React.useMemo(() => new Set(data.tracked), [data.tracked]);
  const [added, setAdded] = React.useState<Set<string>>(new Set());
  const rows = c?.overlap?.rows ?? [];
  const { sort, sorted, toggle } = useSort<OverlapRow, SKey>(rows, { key: "volume", dir: "desc" }, {
    phrase: (r) => r.phrase,
    volume: (r) => r.volume,
    ours: (r) => r.our_position,
    theirs: (r) => r.their_position,
    diff: (r) => (r.our_position === null || r.their_position === null ? null : r.our_position - r.their_position),
  });
  if (!c) return null;
  const top = (n: number | null) => n !== null && n <= 10;
  const counts = { both: rows.filter((r) => r.our_position !== null && r.their_position !== null).length, they: rows.filter((r) => top(r.their_position) && !top(r.our_position)).length, we: rows.filter((r) => top(r.our_position) && !top(r.their_position)).length };
  const track = async (phrase: string) => {
    const res = await addKeywords(p.id, phrase, ["competitor"]);
    if (!res.ok) return toast.push(res.error, "error");
    setAdded((s) => new Set(s).add(phrase));
    toast.demoEdit();
    router.refresh();
  };
  const request = { projectId: p.id, action: "competitor_overlap" as const, scope: { competitorId: c.id }, onDone: () => router.refresh() };
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-2.5 md:px-6">
        <Select className="w-auto min-w-44" aria-label="Competitor" value={c.id} onChange={(e) => setId(e.target.value)}>
          {cs.map((x) => <option key={x.id} value={x.id}>{x.domain}{x.overlap ? "" : " (not fetched)"}</option>)}
        </Select>
        {c.overlap ? <span className="caption">Fetched {formatDay(c.overlap.at, true)}, {formatRelative(c.overlap.at, data.now)}. Up to 200 rows by volume.</span> : null}
        <span className="ml-auto">
          <PaidButton label={c.overlap ? "Refresh" : `Fetch overlap with ${c.domain}`} priceMicros={c.price} request={request} variant={c.overlap ? "secondary" : "primary"} size="sm" />
        </span>
      </div>
      {!c.overlap ? (
        <EmptyState title={`No overlap fetched for ${c.domain}`} actions={<PaidButton label={`Fetch overlap with ${c.domain}`} priceMicros={c.price} request={request} />}>
          <p>One call returns up to 200 keywords both domains rank for, with volume and both positions. The result is stored, so opening it again is free.</p>
        </EmptyState>
      ) : (
        <>
          <dl className="hairline-grid grid grid-cols-3 border-b border-rule">
            {([["Both rank", counts.both], ["Only they are top 10", counts.they], ["Only you are top 10", counts.we]] as const).map(([label, n]) => (
              <div key={label} className="px-4 py-3 md:px-6">
                <dt className="label">{label}</dt>
                <dd className="num mt-1 text-[20px] font-medium leading-6">{n}</dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto">
            <table className="tbl md:min-w-[680px]">
              <colgroup>
                <col />
                <col className="max-md:hidden" style={{ width: 100 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 64 }} />
                <col className="max-md:hidden" style={{ width: 124 }} />
                <col style={{ width: 88 }} />
              </colgroup>
              <thead>
                <tr>
                  <SortTh label="Keyword" k="phrase" sort={sort} onSort={toggle} />
                  <SortTh label="Volume" k="volume" sort={sort} onSort={toggle} align="right" firstDir="desc" className="max-md:hidden" />
                  <SortTh label="You" k="ours" sort={sort} onSort={toggle} className="text-center [&>button]:mx-auto" />
                  <SortTh label="Them" k="theirs" sort={sort} onSort={toggle} className="text-center [&>button]:mx-auto" />
                  <SortTh label="Difference" k="diff" sort={sort} onSort={toggle} align="right" className="max-md:hidden" title="Your position minus theirs. Negative means you are ahead." />
                  <th scope="col"><span className="sr-only">Track</span></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const diff = r.our_position === null || r.their_position === null ? null : r.our_position - r.their_position;
                  const isTracked = tracked.has(r.phrase) || added.has(r.phrase);
                  return (
                    <tr key={r.phrase}>
                      <td>{r.phrase}</td>
                      <td className="num r max-md:hidden">{formatInt(r.volume)}</td>
                      <td><BandCell value={r.our_position} /></td>
                      <td><BandCell value={r.their_position} /></td>
                      <td className={cn("num r max-md:hidden", diff === null ? "text-muted" : diff < 0 ? "text-accent-text" : diff > 0 ? "text-neg" : "text-muted")}>{diff === null ? "–" : diff === 0 ? "level" : diff < 0 ? `${-diff} ahead` : `${diff} behind`}</td>
                      <td className="r">{isTracked ? <span className="caption">tracked</span> : <Button size="sm" variant="ghost" className="h-6" onClick={() => track(r.phrase)}>Track</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
