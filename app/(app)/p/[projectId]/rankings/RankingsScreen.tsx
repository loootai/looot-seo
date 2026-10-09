"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Filter, Loader2, Plus, Search, Sparkles, Tags, TriangleAlert, X } from "lucide-react";
import { addKeywords, removeKeywords, updateKeywords } from "@/app/actions";
import { HistoryChart, type HistoryPoint } from "@/components/charts/charts";
import { PaidButton, useQuote } from "@/components/quote/QuoteProvider";
import { PageHead } from "@/components/shell/PageHead";
import { useToast } from "@/components/shell/toast";
import { BandCell, Change, Difficulty, EmptyState, ErrorPanel, FeatureGlyphs, Position, SortTh, Sparkline, TableSkeleton, useRowKeys, useSort } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Switch, Tag } from "@/components/ui/controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/overlays";
import { formatMoney } from "@/lib/money";
import type { Project } from "@/lib/types";
import { cn, formatDay, formatExact, formatInt, formatRelative, parseKeywordLines } from "@/lib/utils";
import type { KeywordRow } from "@/lib/view/project";
import type { ForcedState } from "@/lib/view/state";

type Key = "phrase" | "position" | "change" | "best" | "volume" | "difficulty" | "lastChecked";
type PosFilter = "all" | "top3" | "top10" | "11-20" | "21-50" | "none" | "moved";

interface Props {
  project: Project;
  rows: KeywordRow[];
  days: string[];
  competitors: { id: string; domain: string; slot: number }[];
  comp: Record<string, (number | null)[]>;
  now: string;
  state: ForcedState;
  priceAll: number | null;
  perKeyword: number;
  aioExtra: number;
  openAdd: boolean;
  openKeyword: string | null;
}

const POS_FILTERS: { value: PosFilter; label: string }[] = [
  { value: "all", label: "All positions" },
  { value: "top3", label: "Top 3" },
  { value: "top10", label: "Top 10" },
  { value: "11-20", label: "11 to 20" },
  { value: "21-50", label: "21 to 50" },
  { value: "none", label: "Not ranked" },
  { value: "moved", label: "Moved" },
];

function matchPos(r: KeywordRow, f: PosFilter): boolean {
  const p = r.position;
  if (f === "all") return true;
  if (f === "moved") return r.changeKind === "up" || r.changeKind === "down" || r.changeKind === "new" || r.changeKind === "lost";
  if (f === "none") return r.checked && p === null;
  if (p === null) return false;
  return f === "top3" ? p <= 3 : f === "top10" ? p <= 10 : f === "11-20" ? p >= 11 && p <= 20 : p >= 21 && p <= 50;
}

export function RankingsScreen({ project, rows, days, competitors, comp, now, state, priceAll, perKeyword, aioExtra, openAdd, openKeyword }: Props) {
  const router = useRouter();
  const toast = useToast();
  const quote = useQuote();
  const base = `/p/${project.id}`;
  const [q, setQ] = React.useState("");
  const [tags, setTags] = React.useState<Set<string>>(new Set());
  const [pos, setPos] = React.useState<PosFilter>("all");
  const [view, setView] = React.useState<"summary" | "dates">("summary");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [openId, setOpenId] = React.useState<string | null>(openKeyword);
  const [adding, setAdding] = React.useState(openAdd);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const allTags = React.useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows]);

  const filtered = React.useMemo(() => rows.filter((r) => (!q || r.phrase.includes(q.toLowerCase().trim())) && (tags.size === 0 || r.tags.some((t) => tags.has(t))) && matchPos(r, pos)), [rows, q, tags, pos]);
  const { sort, sorted, toggle } = useSort<KeywordRow, Key>(
    filtered,
    { key: "position", dir: "asc" },
    { phrase: (r) => r.phrase, position: (r) => r.position, change: (r) => (r.changeKind === "up" ? r.change : r.changeKind === "down" ? -r.change : r.changeKind === "new" ? 100 : r.changeKind === "lost" ? -100 : 0), best: (r) => r.best, volume: (r) => r.volume, difficulty: (r) => r.difficulty, lastChecked: (r) => r.lastChecked },
  );
  const toggleRow = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const keys = useRowKeys({ count: sorted.length, onOpen: (i) => sorted[i] && setOpenId(sorted[i].id), onToggle: (i) => sorted[i] && toggleRow(sorted[i].id) });
  const open = rows.find((r) => r.id === openId) ?? null;
  const filtering = Boolean(q) || tags.size > 0 || pos !== "all";
  const clear = () => (setQ(""), setTags(new Set()), setPos("all"));
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedCost = selectedRows.reduce((s, r) => s + perKeyword + (r.aio ? aioExtra : 0), 0);
  const allShown = sorted.length > 0 && sorted.every((r) => selected.has(r.id));

  // j and k keep moving the selection while the panel is open.
  React.useEffect(() => {
    if (openId && keys.focused >= 0 && sorted[keys.focused] && sorted[keys.focused].id !== openId) setOpenId(sorted[keys.focused].id);
    // Only a focus move should swap the open keyword.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.focused]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" && t.hasAttribute("data-filter-input")) return void (setQ(""), t.blur());
      if (!document.querySelector("[role='dialog'][data-state='open']")) setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const bulk = async (patch: Parameters<typeof updateKeywords>[1], done: string) => {
    const res = await updateKeywords([...selected], patch);
    if (!res.ok) return toast.push(res.error, "error");
    toast.demoEdit();
    toast.push(done);
    router.refresh();
  };

  const checkAll = <PaidButton label="Check rankings" priceMicros={priceAll} request={{ projectId: project.id, action: "check_rankings" }} shortcut disabled={rows.length === 0} />;
  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus strokeWidth={2} /> Add keywords
    </Button>
  );
  const filterControls = (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button className={cn(tags.size > 0 && "border-brand dark:border-accent")} disabled={allTags.length === 0}>
            <Tags strokeWidth={1.5} /> Tags{tags.size ? <span className="num">· {tags.size}</span> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1.5">
          <p className="caption px-1.5 pb-1">Show keywords with any of these tags</p>
          {allTags.map((t) => (
            <label key={t} className="flex h-8 cursor-pointer items-center gap-2 rounded-[4px] px-1.5 hover:bg-hover">
              <Checkbox checked={tags.has(t)} onCheckedChange={(v) => setTags((s) => { const n = new Set(s); if (v) n.add(t); else n.delete(t); return n; })} /> {t}
            </label>
          ))}
        </PopoverContent>
      </Popover>
      <Select aria-label="Position filter" value={pos} onChange={(e) => setPos(e.target.value as PosFilter)} className="w-36">
        {POS_FILTERS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </Select>
    </>
  );

  return (
    <>
      <PageHead title="Rankings" sub={state === "loading" ? "Loading keywords" : `${rows.length} ${rows.length === 1 ? "keyword" : "keywords"} in ${project.country} · ${project.language}, checked to the top ${project.depth}.`}>
        {addButton}
        {checkAll}
      </PageHead>

      <div className="flex items-start border-t border-rule">
        <div className="min-w-0 flex-1 bg-surface">
          {selected.size > 0 ? (
            <div className="sticky top-12 z-20 flex min-h-12 flex-wrap items-center gap-2 border-b border-rule bg-selected px-4 py-2 md:px-6" role="toolbar" aria-label="Actions for selected keywords">
              <span className="num mr-1 font-medium">{selected.size} selected</span>
              <PaidButton size="sm" label={`Check ${selected.size} selected`} priceMicros={selectedCost} request={{ projectId: project.id, action: "check_rankings", scope: { keywordIds: [...selected] } }} />
              <TagPrompt onApply={(t) => void bulk({ tags: [...new Set([...selectedRows.flatMap((r) => r.tags), t])] }, `Tagged ${selected.size} keywords "${t}".`)} />
              <Button size="sm" onClick={() => void bulk({ track_ai_overview: true }, `AI Overview on for ${selected.size} keywords. Adds ${formatMoney(aioExtra)} each per check.`)}>
                <Sparkles strokeWidth={1.5} /> AI Overview on
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const n = selected.size;
                  const res = await removeKeywords([...selected]);
                  if (!res.ok) return toast.push(res.error, "error");
                  setSelected(new Set());
                  toast.demoEdit();
                  toast.push(`Stopped tracking ${n} ${n === 1 ? "keyword" : "keywords"}. History is kept.`);
                  router.refresh();
                }}
              >
                Remove
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          ) : (
            <div className="sticky top-12 z-20 flex min-h-12 flex-wrap items-center gap-2 border-b border-rule bg-surface px-4 py-2 md:px-6">
              <div className="relative min-w-0 flex-1 md:max-w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden />
                <Input data-filter-input type="search" name="filter" autoComplete="off" spellCheck={false} aria-label="Filter keywords" placeholder="Filter keywords…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
              </div>
              <div className="hidden items-center gap-2 md:flex">
                {filterControls}
                <span className="caption rounded-ctl border border-rule px-2 py-1.5" title="Version 1 checks desktop results only">Desktop</span>
              </div>
              <Button className="md:hidden" onClick={() => setFiltersOpen(true)} aria-label="Filters">
                <Filter strokeWidth={1.5} /> {filtering ? "Filters on" : "Filters"}
              </Button>
              <Segmented className="ml-auto hidden md:inline-flex" label="View" value={view} onChange={setView} options={[{ value: "summary", label: "Summary" }, { value: "dates", label: "By date" }]} />
            </div>
          )}

          {state === "loading" ? (
            <TableSkeleton rows={12} widths={[16, "2fr", 60, 70, 50, 64, "1fr", 70, 70, 80, 90]} />
          ) : state === "error" ? (
            <ErrorPanel title="The rankings could not be loaded" code="rank_checks_failed" detail="The database did not answer. Stored checks are unchanged." onRetry={() => router.refresh()} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No keywords tracked"
              actions={
                <>
                  {addButton}
                  <Button asChild>
                    <Link href={`${base}/research`}>Find keywords</Link>
                  </Button>
                </>
              }
            >
              <p>Add the searches you want this site to rank for. Adding is free. A check at top {project.depth} costs <span className="num text-ink">{formatMoney(perKeyword)}</span> per keyword.</p>
            </EmptyState>
          ) : sorted.length === 0 ? (
            <EmptyState title="No keywords match" actions={<Button onClick={clear}>Clear filters</Button>}>
              <p>{rows.length} keywords are tracked, none fit the filter.</p>
            </EmptyState>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                {view === "summary" ? (
                  <table className="tbl" style={{ minWidth: open ? 760 : 1120 }}>
                    <colgroup>
                      <col style={{ width: 40 }} />
                      <col />
                      <col style={{ width: 86 }} />
                      <col style={{ width: 74 }} />
                      {open ? null : <col style={{ width: 56 }} />}
                      <col style={{ width: 84 }} />
                      {open ? null : <col style={{ width: 216 }} />}
                      {open ? null : <col style={{ width: 92 }} />}
                      <col style={{ width: 78 }} />
                      {open ? null : <col style={{ width: 92 }} />}
                      {open ? null : <col style={{ width: 104 }} />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">
                          <Checkbox aria-label="Select all shown keywords" checked={allShown ? true : sorted.some((r) => selected.has(r.id)) ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v ? new Set(sorted.map((r) => r.id)) : new Set())} />
                        </th>
                        <SortTh label="Keyword" k="phrase" sort={sort} onSort={toggle} />
                        <SortTh label="Position" k="position" sort={sort} onSort={toggle} align="right" />
                        <SortTh label="Change" k="change" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                        {open ? null : <SortTh label="Best" k="best" sort={sort} onSort={toggle} align="right" />}
                        <th scope="col">30 days</th>
                        {open ? null : <th scope="col">Ranking URL</th>}
                        {open ? null : <th scope="col">Features</th>}
                        <SortTh label="Volume" k="volume" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                        {open ? null : <SortTh label="Difficulty" k="difficulty" sort={sort} onSort={toggle} align="right" firstDir="desc" />}
                        {open ? null : <SortTh label="Checked" k="lastChecked" sort={sort} onSort={toggle} align="right" firstDir="desc" />}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, i) => (
                        <tr key={`${r.id}:${quote.finishedAt}`} data-row-index={i} data-focused={keys.focused === i || openId === r.id} data-selected={selected.has(r.id)} className={cn("cursor-pointer", quote.finishedAt > 0 && "[&>td]:animate-row-flash")} onClick={() => (keys.setFocused(i), setOpenId(r.id))}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <Checkbox aria-label={`Select ${r.phrase}`} checked={selected.has(r.id)} onCheckedChange={() => toggleRow(r.id)} />
                          </td>
                          <td>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <button type="button" className="max-w-full shrink-0 truncate text-left font-medium hover:underline" onClick={(e) => (e.stopPropagation(), keys.setFocused(i), setOpenId(r.id))} title={r.phrase}>
                                {r.phrase}
                              </button>
                              {r.aio ? <Tag tone="accent" title="AI Overview is checked for this keyword">AIO</Tag> : null}
                              {open ? null : <span className="flex max-h-5 min-w-0 flex-1 flex-wrap gap-x-1.5 gap-y-2 overflow-hidden" title={r.tags.join(", ")}>{r.tags.slice(0, 2).map((t) => <Tag key={t}>{t}</Tag>)}</span>}
                            </span>
                          </td>
                          <td className="r">
                            <Position value={r.position} depth={r.depth} checked={r.checked} />
                          </td>
                          <td className="r">
                            <Change kind={r.changeKind} change={r.change} />
                          </td>
                          {open ? null : <td className="num r text-muted">{r.best ?? "–"}</td>}
                          <td>
                            <Sparkline values={r.spark} invert label={`Position over the last 30 days for ${r.phrase}`} />
                          </td>
                          {open ? null : (
                            <td title={r.url ?? undefined}>
                              <span className="flex min-w-0 items-center gap-1.5">
                                {r.cannibalised ? (
                                  <Tip label={`Not the target URL. ${r.otherUrls.length ? "Another page from this site also ranks. " : ""}Target: ${r.targetUrl ?? "not set"}`}>
                                    <span className="text-warn" role="img" aria-label="Ranking URL is not the target URL">
                                      <TriangleAlert className="size-3.5" strokeWidth={1.75} />
                                    </span>
                                  </Tip>
                                ) : null}
                                <span className="num truncate text-[12px] text-muted">{r.urlPath ?? "–"}</span>
                              </span>
                            </td>
                          )}
                          {open ? null : (
                            <td>
                              <FeatureGlyphs f={r.features} />
                            </td>
                          )}
                          <td className="num r">{formatInt(r.volume)}</td>
                          {open ? null : (
                            <td className="r">
                              <Difficulty value={r.difficulty} />
                            </td>
                          )}
                          {open ? null : (
                            <td className="r text-[12px] text-muted" title={r.lastChecked ? formatExact(r.lastChecked) : undefined}>
                              {r.lastChecked ? formatRelative(r.lastChecked, now) : "not yet"}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="tbl" style={{ minWidth: 300 + days.length * 62, tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: 300 }} />
                      {days.map((d) => (
                        <col key={d} style={{ width: 62 }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <SortTh label="Keyword" k="phrase" sort={sort} onSort={toggle} className="sticky left-0 z-[3] border-r border-rule" />
                        {days.map((d) => (
                          <th key={d} scope="col" className="num text-center" title={d}>
                            {formatDay(d)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, i) => {
                        const byDay = new Map(r.history.map((h) => [h.at.slice(0, 10), h.position]));
                        return (
                          <tr key={r.id} data-row-index={i} data-focused={keys.focused === i} className="cursor-pointer" onClick={() => (keys.setFocused(i), setOpenId(r.id))}>
                            <td className="sticky left-0 z-[1] border-r border-rule bg-surface font-medium" title={r.phrase}>
                              {r.phrase}
                            </td>
                            {days.map((d) => (
                              <td key={d} className="px-1">
                                <BandCell value={byDay.has(d) ? (byDay.get(d) as number | null) : undefined} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <ul className="divide-y divide-rule md:hidden">
                {sorted.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="flex min-h-14 w-full flex-col justify-center gap-0.5 px-4 py-2 text-left active:bg-hover" onClick={() => setOpenId(r.id)}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[14px] font-medium">{r.phrase}</span>
                          {r.aio ? <Tag tone="accent">AIO</Tag> : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Change kind={r.changeKind} change={r.change} />
                          <Position value={r.position} depth={r.depth} checked={r.checked} className="text-[14px]" />
                        </span>
                      </span>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="num truncate text-[12px] text-muted">{r.urlPath ?? (r.checked ? "no page in range" : "not checked yet")}</span>
                        <Sparkline values={r.spark} invert label={`Position over the last 30 days for ${r.phrase}`} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="caption border-t border-rule px-4 py-2 md:border-t-0 md:px-6">
                {sorted.length} of {rows.length} shown. Positions are the first organic result from {project.domain}{project.include_subdomains ? " or its subdomains" : ""}.
              </p>
            </>
          )}
        </div>

        {open ? <DetailPanel key={open.id} row={open} project={project} competitors={competitors} comp={comp} perKeyword={perKeyword} aioExtra={aioExtra} now={now} onClose={() => setOpenId(null)} /> : null}
      </div>

      <AddKeywordsDialog open={adding} onOpenChange={setAdding} projectId={project.id} existing={rows.map((r) => r.phrase)} perKeyword={perKeyword} depth={project.depth} />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent title="Filters" description={`${sorted.length} of ${rows.length} keywords shown`}>
          <div className="flex flex-col gap-3 px-5 py-4 [&_button]:justify-start [&_select]:w-full">
            {filterControls}
            <Segmented label="View" value={view} onChange={setView} options={[{ value: "summary", label: "Summary" }, { value: "dates", label: "By date" }]} className="hidden" />
          </div>
          <div className="flex justify-between border-t border-rule px-5 py-3">
            <Button variant="ghost" onClick={clear}>Clear filters</Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>Show {sorted.length}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TagPrompt({ onApply }: { onApply: (tag: string) => void }) {
  const [v, setV] = React.useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Tags strokeWidth={1.5} /> Tag
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (v.trim()) (onApply(v.trim().toLowerCase()), setV(""));
          }}
        >
          <Input aria-label="Tag to add" autoComplete="off" placeholder="brand, journal…" value={v} onChange={(e) => setV(e.target.value)} />
          <Button type="submit" variant="primary">Add</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function DetailPanel({ row, project, competitors, comp, perKeyword, aioExtra, now, onClose }: { row: KeywordRow; project: Project; competitors: Props["competitors"]; comp: Props["comp"]; perKeyword: number; aioExtra: number; now: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [shown, setShown] = React.useState<Set<string>>(new Set(competitors.slice(0, 1).map((c) => c.id)));
  const [target, setTarget] = React.useState(row.targetUrl ?? "");
  const [tag, setTag] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const save = async (patch: Parameters<typeof updateKeywords>[1], done?: string) => {
    setPending(true);
    const res = await updateKeywords([row.id], patch);
    setPending(false);
    if (!res.ok) return toast.push(res.error, "error");
    toast.demoEdit();
    if (done) toast.push(done);
    router.refresh();
  };
  const data: HistoryPoint[] = row.history.map((h) => {
    const point: HistoryPoint = { at: h.at, position: h.position };
    competitors.forEach((c, i) => (point[c.id] = h.snapshotId ? (comp[h.snapshotId]?.[i] ?? null) : null));
    return point;
  });
  const cost = perKeyword + (row.aio ? aioExtra : 0);

  return (
    <aside className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface md:sticky md:top-12 md:z-10 md:h-[calc(100dvh-48px)] md:w-[520px] md:shrink-0 md:border-l md:border-rule" aria-label={`Details for ${row.phrase}`}>
      <div className="flex items-start justify-between gap-3 border-b border-rule px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-5">{row.phrase}</h2>
          <p className="caption num mt-0.5">
            {project.country} · {project.language} · Google · desktop · {formatMoney(cost)} per check
          </p>
        </div>
        <Button size="iconSm" variant="ghost" aria-label="Close details" onClick={onClose}>
          <X strokeWidth={1.5} />
        </Button>
      </div>

      <dl className="hairline-grid grid grid-cols-3 border-b border-rule">
        <div className="px-5 py-3">
          <dt className="label">Position</dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="stat text-[22px] leading-7">{row.checked ? (row.position ?? "–") : "–"}</span>
            <Change kind={row.changeKind} change={row.change} />
          </dd>
          {row.checked && row.position === null ? <dd className="caption">Not in top {row.depth}</dd> : null}
        </div>
        <div className="px-5 py-3">
          <dt className="label">Best ever</dt>
          <dd className="stat mt-1 text-[22px] leading-7">{row.best ?? "–"}</dd>
        </div>
        <div className="px-5 py-3">
          <dt className="label">Volume</dt>
          <dd className="stat mt-1 text-[22px] leading-7">{formatInt(row.volume)}</dd>
        </div>
      </dl>

      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold">Position history</h3>
          <div className="flex flex-wrap gap-1.5">
            {competitors.map((c) => (
              <button key={c.id} type="button" aria-pressed={shown.has(c.id)} onClick={() => setShown((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className={cn("num inline-flex h-6 items-center gap-1.5 rounded-[4px] border px-1.5 text-[11px]", shown.has(c.id) ? "border-rule-strong text-ink" : "border-rule text-muted")}>
                <span className="h-0.5 w-2.5" style={{ background: shown.has(c.id) ? `var(--chart-${c.slot})` : "var(--rule-strong)" }} />
                {c.domain}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {data.length === 0 ? <p className="py-8 text-muted">This keyword has not been checked yet.</p> : data.length === 1 ? <p className="py-8 text-muted">1 check stored. The line needs two.</p> : <HistoryChart data={data} depth={project.depth} lines={competitors.filter((c) => shown.has(c.id)).map((c) => ({ key: c.id, label: c.domain, color: `var(--chart-${c.slot})` }))} />}
        </div>
      </div>

      <div className="space-y-4 border-b border-rule px-5 py-4">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="label block text-ink">Check the AI Overview</span>
            <span className="caption block">Uses the Cloro call for page 1. <span className="num">+{formatMoney(aioExtra)}</span> per check.</span>
          </span>
          <Switch checked={row.aio} disabled={pending} onCheckedChange={(v) => void save({ track_ai_overview: v }, v ? `AI Overview on. This keyword now costs ${formatMoney(perKeyword + aioExtra)} per check.` : "AI Overview off.")} aria-label="Check the AI Overview for this keyword" />
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({ target_url: target }, "Target URL saved.");
          }}
        >
          <Field label="Target URL" htmlFor="kw-target" hint={row.cannibalised ? <span className="text-warn">The page that ranks is not this one: {row.urlPath}</span> : "The page you want to rank. A different ranking page gets a warning."}>
            <div className="flex gap-2">
              <Input id="kw-target" name="target" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder={`https://${project.domain}/…`} value={target} onChange={(e) => setTarget(e.target.value)} className="num text-[12px]" />
              <Button type="submit" disabled={pending || target === (row.targetUrl ?? "")}>Save</Button>
            </div>
          </Field>
        </form>
        <div>
          <p className="label text-ink">Tags</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.tags.map((t) => (
              <Tag key={t} className="h-6 gap-1 pr-1">
                {t}
                <button type="button" aria-label={`Remove tag ${t}`} className="rounded-[2px] hover:text-ink" onClick={() => void save({ tags: row.tags.filter((x) => x !== t) })}>
                  <X className="size-3" strokeWidth={1.5} />
                </button>
              </Tag>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tag.trim()) (void save({ tags: [...row.tags, tag] }), setTag(""));
              }}
            >
              <Input aria-label="Add a tag" autoComplete="off" placeholder="Add tag…" value={tag} onChange={(e) => setTag(e.target.value)} className="h-6 w-28 text-[12px]" />
            </form>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Check log</h3>
          <Button asChild size="sm">
            <Link href={`/p/${project.id}/serp/${row.id}`}>
              Open SERP <ExternalLink strokeWidth={1.5} />
            </Link>
          </Button>
        </div>
        {row.history.length === 0 ? (
          <p className="mt-2 text-muted">No checks yet.</p>
        ) : (
          <table className="mt-2 w-full text-[12px]">
            <thead>
              <tr className="label text-left">
                <th scope="col" className="h-7 font-medium">Date</th>
                <th scope="col" className="h-7 text-right font-medium">Pos.</th>
                <th scope="col" className="h-7 pl-4 font-medium">URL</th>
                <th scope="col" className="h-7 text-right font-medium">Cost</th>
                <th scope="col" className="h-7 text-right font-medium">SERP</th>
              </tr>
            </thead>
            <tbody>
              {[...row.history].reverse().slice(0, 30).map((h) => (
                <tr key={h.at} className="border-t border-rule">
                  <td className="h-7 whitespace-nowrap text-muted" title={formatExact(h.at)}>{formatDay(h.at, true)}</td>
                  <td className="num h-7 text-right">{h.position ?? <span className="text-muted">–</span>}</td>
                  <td className="num h-7 max-w-0 truncate pl-4 text-muted" style={{ width: "50%" }} title={h.url ?? undefined}>{h.url ? h.url.replace(/^https?:\/\/[^/]+/, "") : `not in top ${h.depth}`}</td>
                  <td className="num h-7 text-right text-muted">{formatMoney(cost)}</td>
                  <td className="h-7 text-right">
                    {h.snapshotId ? (
                      <Link href={`/p/${project.id}/serp/${row.id}?s=${h.snapshotId}`} className="text-accent-text hover:underline">
                        Open
                      </Link>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="caption mt-2">Checked {row.lastChecked ? formatRelative(row.lastChecked, now) : "never"}. Cost shown is the price of this keyword at today&apos;s settings.</p>
      </div>
    </aside>
  );
}

function AddKeywordsDialog({ open, onOpenChange, projectId, existing, perKeyword, depth }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string; existing: string[]; perKeyword: number; depth: number }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const have = React.useMemo(() => new Set(existing), [existing]);
  const parsed = parseKeywordLines(text);
  const fresh = parsed.filter((p) => !have.has(p));
  const dupes = parsed.length - fresh.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add keywords" description="Adding is free. Checks are priced when you run them.">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const res = await addKeywords(projectId, text, tags.split(","));
            setPending(false);
            if (!res.ok) return setError(res.error);
            toast.demoEdit();
            toast.push(`${res.added} ${res.added === 1 ? "keyword" : "keywords"} added${res.skipped ? `, ${res.skipped} already tracked` : ""}.`);
            setText("");
            setError(null);
            onOpenChange(false);
            router.refresh();
          }}
        >
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <Field label="Keywords, one per line" htmlFor="add-kw" error={error} hint={parsed.length === 0 ? "Paste from a spreadsheet or type them in." : <span className="num">{fresh.length} new, {dupes} already tracked</span>}>
              <Textarea id="add-kw" name="keywords" rows={8} spellCheck={false} autoFocus placeholder={"cold brew concentrate\nbest decaf coffee beans…"} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field label="Tags" htmlFor="add-tags" hint="Optional. Separate with commas.">
              <Input id="add-tags" name="tags" autoComplete="off" placeholder="beans, journal…" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <p className="num rounded-ctl border border-rule px-2.5 py-2 text-[12px]">
              Adds {fresh.length} x {depth / 10} {depth === 10 ? "page" : "pages"} x {formatMoney(perKeyword / (depth / 10))} = <span className="font-medium">{formatMoney(fresh.length * perKeyword)}</span> to each check at top {depth}
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || fresh.length === 0} className="min-w-32">
              {pending ? <Loader2 className="animate-spin" aria-label="Adding" /> : `Add ${fresh.length} ${fresh.length === 1 ? "keyword" : "keywords"}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
