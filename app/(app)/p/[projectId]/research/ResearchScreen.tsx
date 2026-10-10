"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Download, History, SlidersHorizontal, X } from "lucide-react";
import { addKeywords } from "@/app/actions";
import { PaidButton } from "@/components/quote/QuoteProvider";
import { PageHead } from "@/components/shell/PageHead";
import { useToast } from "@/components/shell/toast";
import { Difficulty, EmptyState, ErrorPanel, SortTh, Sparkline, TableSkeleton, useSort } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Tag } from "@/components/ui/controls";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import type { RunView } from "@/lib/looot/service";
import { COUNTRIES, LANGUAGES, locationNameFor } from "@/lib/markets";
import { formatMoney } from "@/lib/money";
import type { Project, ResearchResult } from "@/lib/types";
import { cn, formatDay, formatInt, formatRelative, normalisePhrase, parseKeywordLines, toCsv } from "@/lib/utils";
import type { ForcedState } from "@/lib/view/state";

export interface MetricLite {
  v: number | null;
  d: number | null;
  c: number | null;
  k: number | null;
  i: string | null;
  t: number[] | null;
}

interface Row extends MetricLite {
  phrase: string;
  source: string;
  tracked: boolean;
  has: boolean;
}

type Key = "phrase" | "v" | "d" | "c" | "k";

interface Props {
  project: Project;
  tracked: string[];
  runs: { id: string; at: string; seeds: string[]; sources: string[]; count: number; cost: number | null }[];
  active: { id: string; at: string; seeds: string[]; results: ResearchResult[] } | null;
  metrics: Record<string, MetricLite>;
  prices: { ideas: number; related: number; autocomplete: number; overview: number; difficulty: number; perKeyword: number };
  state: ForcedState;
  now: string;
}

const NO_METRIC: MetricLite = { v: null, d: null, c: null, k: null, i: null, t: null };
const SOURCES = [
  { key: "ideas", label: "Ideas", per: "" },
  { key: "related", label: "Related", per: " per seed" },
  { key: "autocomplete", label: "Autocomplete", per: " per seed" },
] as const;

export function ResearchScreen({ project, tracked, runs, active, metrics, prices, state, now }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = React.useState<"seeds" | "paste">("seeds");
  const [seeds, setSeeds] = React.useState<string[]>(active?.seeds.slice(0, 5) ?? []);
  const [draft, setDraft] = React.useState("");
  const [pasted, setPasted] = React.useState("");
  const [sources, setSources] = React.useState<Set<string>>(new Set(["ideas", "related", "autocomplete"]));
  const [market, setMarket] = React.useState({ country: project.country, language: project.language });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [f, setF] = React.useState({ minV: "", maxV: "", maxD: "", intent: "", has: "", not: "", hideTracked: false });
  const [limit, setLimit] = React.useState(150);
  const [staged, setStaged] = React.useState<string[]>([]);
  const [failures, setFailures] = React.useState<RunView["failures"]>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const trackedSet = React.useMemo(() => new Set(tracked), [tracked]);

  React.useEffect(() => {
    try {
      setStaged(JSON.parse(localStorage.getItem(`seo-staged:${project.id}`) ?? "[]") as string[]);
    } catch {}
  }, [project.id]);

  const addSeed = (raw: string) => {
    const s = normalisePhrase(raw);
    if (!s) return;
    setSeeds((p) => (p.includes(s) || p.length >= 5 ? p : [...p, s]));
    setDraft("");
  };

  const pastedList = React.useMemo(() => parseKeywordLines(pasted), [pasted]);
  const base: { phrase: string; source: string }[] = mode === "paste" ? pastedList.map((phrase) => ({ phrase, source: "pasted" })) : (active?.results ?? []);
  const rows: Row[] = React.useMemo(
    () => base.map((r) => {
      const m = metrics[r.phrase] ?? NO_METRIC;
      return { ...m, phrase: r.phrase, source: r.source, tracked: trackedSet.has(r.phrase), has: m.v !== null || m.d !== null };
    }),
    // base is rebuilt from these inputs on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, pastedList, mode, metrics, trackedSet],
  );
  const filtered = rows.filter((r) => {
    const has = f.has.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const not = f.not.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (f.hideTracked && r.tracked) return false;
    if (f.minV && (r.v ?? -1) < Number(f.minV)) return false;
    if (f.maxV && (r.v ?? Infinity) > Number(f.maxV)) return false;
    if (f.maxD && (r.d ?? Infinity) > Number(f.maxD)) return false;
    if (f.intent && r.i !== f.intent) return false;
    if (has.length && !has.every((w) => r.phrase.includes(w))) return false;
    if (not.some((w) => r.phrase.includes(w))) return false;
    return true;
  });
  const { sort, sorted, toggle } = useSort<Row, Key>(filtered, { key: "v", dir: "desc" }, { phrase: (r) => r.phrase, v: (r) => r.v, d: (r) => r.d, c: (r) => r.c, k: (r) => r.k });
  const missing = rows.filter((r) => !r.has).map((r) => r.phrase);
  const findPrice = (sources.has("ideas") ? prices.ideas : 0) + (sources.has("related") ? prices.related * seeds.length : 0) + (sources.has("autocomplete") ? prices.autocomplete * seeds.length : 0);
  const metricsPrice = Math.ceil(missing.length / 700) * prices.overview + Math.ceil(missing.length / 1000) * prices.difficulty;
  const picked = rows.filter((r) => selected.has(r.phrase));
  const toTrack = picked.filter((r) => !r.tracked);
  const pickedVolume = picked.reduce((s, r) => s + (r.v ?? 0), 0);
  const withD = picked.filter((r) => r.d !== null);
  const filtering = Boolean(f.minV || f.maxV || f.maxD || f.intent || f.has || f.not || f.hideTracked);
  const onRunDone = (view: RunView) => {
    setFailures(view.failures);
    setSelected(new Set());
    router.replace(`/p/${project.id}/research`, { scroll: false });
  };
  const scopeMarket = market.country === project.country && market.language === project.language ? {} : { country: market.country, language: market.language, location_name: locationNameFor(market.country) };

  const track = async () => {
    const res = await addKeywords(project.id, toTrack.map((r) => r.phrase).join("\n"), ["research"]);
    if (!res.ok) return toast.push(res.error, "error");
    toast.demoEdit();
    toast.push(`Tracking ${res.added} more ${res.added === 1 ? "keyword" : "keywords"}. They are priced into the next check.`);
    setSelected(new Set());
    router.refresh();
  };
  const exportCsv = () => {
    const list = picked.length ? picked : sorted;
    const csv = toCsv(["keyword", "source", "volume", "difficulty", "cpc", "competition", "intent", "tracked"], list.map((r) => [r.phrase, r.source, r.v, r.d, r.c, r.k, r.i, r.tracked ? "yes" : "no"]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${project.domain}-keywords.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filterFields = (
    <>
      <div>
        <Label htmlFor="rf-minv">Volume</Label>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Input id="rf-minv" name="minVolume" inputMode="numeric" autoComplete="off" placeholder="min" className="num" value={f.minV} onChange={(e) => setF({ ...f, minV: e.target.value.replace(/\D/g, "") })} />
          <span className="text-muted">to</span>
          <Input aria-label="Maximum volume" name="maxVolume" inputMode="numeric" autoComplete="off" placeholder="max" className="num" value={f.maxV} onChange={(e) => setF({ ...f, maxV: e.target.value.replace(/\D/g, "") })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="rf-maxd">Difficulty up to</Label>
          <Input id="rf-maxd" name="maxDifficulty" inputMode="numeric" autoComplete="off" placeholder="100" className="num mt-1.5" value={f.maxD} onChange={(e) => setF({ ...f, maxD: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div>
          <Label htmlFor="rf-intent">Intent</Label>
          <Select id="rf-intent" name="intent" className="mt-1.5" value={f.intent} onChange={(e) => setF({ ...f, intent: e.target.value })}>
            <option value="">Any</option>
            {["informational", "commercial", "transactional", "navigational"].map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="rf-has">Contains</Label>
          <Input id="rf-has" name="contains" data-filter-input autoComplete="off" spellCheck={false} placeholder="words…" className="mt-1.5" value={f.has} onChange={(e) => setF({ ...f, has: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="rf-not">Excludes</Label>
          <Input id="rf-not" name="excludes" autoComplete="off" spellCheck={false} placeholder="words…" className="mt-1.5" value={f.not} onChange={(e) => setF({ ...f, not: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center gap-2">
        <Checkbox checked={f.hideTracked} onCheckedChange={(v) => setF({ ...f, hideTracked: Boolean(v) })} /> Hide tracked
      </label>
      {filtering ? (
        <Button size="sm" variant="ghost" className="-ml-2" onClick={() => setF({ minV: "", maxV: "", maxD: "", intent: "", has: "", not: "", hideTracked: false })}>
          Clear filters
        </Button>
      ) : null}
    </>
  );

  const examples = [...new Set([...staged, ...tracked.filter((t) => t.split(" ").length <= 4).slice(0, 3)])].filter((s) => !seeds.includes(s)).slice(0, 6);

  return (
    <>
      <PageHead title="Keyword research" sub="Find keywords, get their numbers, track the good ones. Finding and pricing are separate steps, so you never pay for numbers on keywords you discard.">
        <Popover>
          <PopoverTrigger asChild>
            <Button disabled={runs.length === 0}>
              <History strokeWidth={1.5} /> Past searches{runs.length ? <span className="num">· {runs.length}</span> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-1.5">
            <p className="caption px-2 pb-1 pt-0.5">Opening a stored search is free.</p>
            {runs.map((r) => (
              <button key={r.id} type="button" onClick={() => (setMode("seeds"), setSeeds(r.seeds.slice(0, 5)), setSelected(new Set()), router.push(`/p/${project.id}/research?run=${r.id}`, { scroll: false }))} className={cn("flex w-full flex-col rounded-[4px] px-2 py-1.5 text-left hover:bg-hover", active?.id === r.id && "bg-selected")}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{r.seeds.join(", ")}</span>
                  <span className="num shrink-0 text-[12px] text-muted">{r.cost === null ? "" : formatMoney(r.cost)}</span>
                </span>
                <span className="caption">
                  {formatDay(r.at, true)} · {r.count} results · {r.sources.join(", ")}
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </PageHead>

      <section className="border-t border-rule bg-surface px-4 py-4 md:px-6" aria-label="New search">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented label="Input" value={mode} onChange={setMode} options={[{ value: "seeds", label: "From seeds" }, { value: "paste", label: "Paste a list" }]} />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="num inline-flex h-8 items-center gap-1.5 rounded-ctl px-2 text-[12px] text-muted hover:bg-hover hover:text-ink">
                Market: {market.country} · {market.language} <span className="font-sans text-accent-text">change</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3">
              <p className="caption">For this search only. The project stays on {project.country} · {project.language}.</p>
              <Select aria-label="Country" value={market.country} onChange={(e) => setMarket({ ...market, country: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
              <Select aria-label="Language" value={market.language} onChange={(e) => setMarket({ ...market, language: e.target.value })}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </Select>
            </PopoverContent>
          </Popover>
        </div>

        {mode === "seeds" ? (
          <div className="mt-3 grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <Label htmlFor="seed-input">Seed keywords <span className="font-normal text-muted">· {seeds.length} of 5</span></Label>
              <div className="mt-1.5 flex min-h-9 flex-wrap items-center gap-1.5 rounded-ctl border border-rule-strong bg-surface px-1.5 py-1 focus-within:border-accent">
                {seeds.map((s) => (
                  <Tag key={s} tone="ink" className="h-6 gap-1 pr-1 text-[12px] font-normal">
                    {s}
                    <button type="button" aria-label={`Remove seed ${s}`} onClick={() => setSeeds((p) => p.filter((x) => x !== s))}>
                      <X className="size-3" strokeWidth={1.5} />
                    </button>
                  </Tag>
                ))}
                <input id="seed-input" name="seed" autoComplete="off" spellCheck={false} disabled={seeds.length >= 5} placeholder={seeds.length >= 5 ? "5 seeds is the limit" : seeds.length ? "Add another seed…" : "Type a seed and press Enter…"} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") (e.preventDefault(), addSeed(draft)); else if (e.key === "Backspace" && !draft) setSeeds((p) => p.slice(0, -1)); }} onBlur={() => addSeed(draft)} className="h-6 min-w-40 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted/80" />
              </div>
              {examples.length ? (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                  Try
                  {examples.map((s) => (
                    <button key={s} type="button" disabled={seeds.length >= 5} onClick={() => addSeed(s)} className="rounded-[4px] border border-dashed border-rule-strong px-1.5 py-0.5 text-ink hover:bg-hover disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <legend className="sr-only">Sources</legend>
                {SOURCES.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-[12px]">
                    <Checkbox checked={sources.has(s.key)} onCheckedChange={(v) => setSources((p) => { const n = new Set(p); if (v) n.add(s.key); else n.delete(s.key); return n; })} />
                    <span>
                      {s.label} <span className="num text-muted">· {formatMoney(prices[s.key])}{s.per}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <PaidButton label="Find keywords" priceMicros={seeds.length && sources.size ? findPrice : null} disabled={seeds.length === 0 || sources.size === 0} shortcut request={{ projectId: project.id, action: "research", scope: { seeds, sources: [...sources], ...scopeMarket }, onDone: onRunDone }} />
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <Label htmlFor="paste-list">Keywords you already have <span className="font-normal text-muted">· {pastedList.length} unique</span></Label>
              <Textarea id="paste-list" name="keywords" rows={4} spellCheck={false} placeholder={"one keyword per line…"} className="mt-1.5" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            </div>
            <p className="caption max-w-xs">Pasting costs nothing. Use the button above the table to get numbers for the ones that have none yet.</p>
          </div>
        )}
      </section>

      {failures.length ? (
        <div role="alert" className="border-t border-rule bg-surface px-4 py-2.5 text-[12px] md:px-6">
          <span className="font-medium text-neg">{failures.length} {failures.length === 1 ? "source call" : "source calls"} failed and cost $0.</span>{" "}
          <span className="num text-muted">{failures.map((x) => `${x.itemKey.split(":")[0]} (${x.errorCode ?? "error"})`).join(", ")}.</span> The sources that answered are shown below. Use Retry in the bar at the top.
        </div>
      ) : null}

      <div className="flex items-start border-t border-rule">
        <div className="min-w-0 flex-1 bg-surface">
          {state === "loading" ? (
            <>
              <p className="border-b border-rule px-4 py-2.5 text-[12px] text-muted md:px-6" role="status">Ideas done, Related 2 of 3, Autocomplete waiting.</p>
              <TableSkeleton rows={12} widths={[16, "2fr", 80, 70, 70, 90, 60, 80, 100]} />
            </>
          ) : state === "error" ? (
            <ErrorPanel title="Stored research could not be loaded" code="research_runs_failed" detail="The database did not answer. No new call was made, so nothing was charged." onRetry={() => router.refresh()} />
          ) : rows.length === 0 ? (
            mode === "paste" ? (
              <EmptyState title="Paste a list to see it here"><p>Each line becomes a row. Numbers already stored for this project show at once and cost nothing.</p></EmptyState>
            ) : active ? (
              <EmptyState title={`No keywords came back for these seeds in ${project.country} · ${project.language}`}><p>Try a broader seed, such as one or two words. The calls that answered were charged; see Costs for the exact amount.</p></EmptyState>
            ) : (
              <EmptyState title="No search yet">
                <p>Add up to 5 seeds above. What each source costs:</p>
                <ul className="num space-y-0.5 text-[12px] text-ink">
                  <li>Ideas · {formatMoney(prices.ideas)} for all seeds in one call</li>
                  <li>Related · {formatMoney(prices.related)} per seed</li>
                  <li>Autocomplete · {formatMoney(prices.autocomplete)} per seed</li>
                  <li>Volume and difficulty · {formatMoney(prices.overview + prices.difficulty)} for up to 700 keywords, only when you ask</li>
                </ul>
              </EmptyState>
            )
          ) : (
            <>
              <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-2 md:px-6">
                <p className="text-[12px] text-muted">
                  <span className="num text-ink">{sorted.length}</span> of {rows.length} keywords
                  {mode === "seeds" && active ? <> · search from {formatDay(active.at, true)}, {formatRelative(active.at, now)}</> : null}
                </p>
                <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
                  <Button size="sm" className="xl:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
                    <SlidersHorizontal strokeWidth={1.5} /> {filtering ? "Filters on" : "Filters"}
                  </Button>
                  {missing.length > 0 ? <PaidButton size="sm" className="max-sm:h-auto max-sm:min-h-8 max-sm:max-w-full max-sm:shrink max-sm:whitespace-normal max-sm:py-1 max-sm:text-left" label={`Get volume and difficulty for ${missing.length} ${missing.length === 1 ? "keyword" : "keywords"}`} priceMicros={metricsPrice} request={{ projectId: project.id, action: "keyword_metrics", scope: { phrases: missing }, onDone: () => router.refresh() }} /> : <span className="caption flex items-center gap-1"><Check className="size-3 text-accent-text" strokeWidth={2} aria-hidden /> Every keyword has numbers</span>}
                </div>
              </div>
              {filtersOpen ? <div className="grid gap-3 border-b border-rule px-4 py-3 sm:grid-cols-2 md:px-6 xl:hidden">{filterFields}</div> : null}
              {sorted.length === 0 ? (
                <EmptyState title="No keywords match" actions={<Button onClick={() => setF({ minV: "", maxV: "", maxD: "", intent: "", has: "", not: "", hideTracked: false })}>Clear filters</Button>} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="tbl min-w-0 md:min-w-[860px]">
                    <colgroup>
                      <col style={{ width: 40 }} />
                      <col />
                      <col className="max-md:hidden" style={{ width: 104 }} />
                      <col style={{ width: 84 }} />
                      <col className="max-md:hidden" style={{ width: 84 }} />
                      <col style={{ width: 96 }} />
                      <col className="max-md:hidden" style={{ width: 70 }} />
                      <col className="max-md:hidden" style={{ width: 70 }} />
                      <col className="max-md:hidden" style={{ width: 112 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">
                          <Checkbox aria-label="Select all shown keywords" checked={sorted.every((r) => selected.has(r.phrase)) ? true : sorted.some((r) => selected.has(r.phrase)) ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v ? new Set(sorted.map((r) => r.phrase)) : new Set())} />
                        </th>
                        <SortTh label="Keyword" k="phrase" sort={sort} onSort={toggle} />
                        <th scope="col" className="max-md:hidden">Source</th>
                        <SortTh label="Volume" k="v" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                        <th scope="col" className="max-md:hidden">12 months</th>
                        <SortTh label="Difficulty" k="d" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                        <SortTh label="CPC" k="c" sort={sort} onSort={toggle} align="right" firstDir="desc" className="max-md:hidden" />
                        <SortTh label="Comp." k="k" sort={sort} onSort={toggle} align="right" firstDir="desc" className="max-md:hidden" title="Paid search competition, 0 to 1" />
                        <th scope="col" className="max-md:hidden">Intent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.slice(0, limit).map((r) => (
                        <tr key={r.phrase} data-selected={selected.has(r.phrase)}>
                          <td>
                            <Checkbox aria-label={`Select ${r.phrase}`} checked={selected.has(r.phrase)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(r.phrase); else n.delete(r.phrase); return n; })} />
                          </td>
                          <td title={r.phrase}>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{r.phrase}</span>
                              {r.tracked ? <Tag tone="accent">tracked</Tag> : null}
                            </span>
                          </td>
                          <td className="text-[12px] text-muted max-md:hidden">{r.source}</td>
                          <td className="num r">{r.v === null ? <span className="text-muted">–</span> : formatInt(r.v)}</td>
                          <td className="max-md:hidden">{r.t ? <Sparkline values={r.t} label={`Search volume over 12 months for ${r.phrase}`} /> : <span className="text-muted">–</span>}</td>
                          <td className="r"><Difficulty value={r.d} /></td>
                          <td className="num r max-md:hidden">{r.c === null ? <span className="text-muted">–</span> : `$${r.c.toFixed(2)}`}</td>
                          <td className="num r max-md:hidden">{r.k === null ? <span className="text-muted">–</span> : r.k.toFixed(2)}</td>
                          <td className="max-md:hidden">{r.i ? <Tag>{r.i}</Tag> : <span className="text-muted">–</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {sorted.length > limit ? (
                <div className="border-b border-rule px-4 py-2 md:px-6">
                  <Button size="sm" onClick={() => setLimit((l) => l + 300)}>Show {Math.min(300, sorted.length - limit)} more</Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {rows.length > 0 && state !== "loading" && state !== "error" ? (
          <aside className="sticky top-12 hidden h-[calc(100dvh-48px)] w-[280px] shrink-0 flex-col overflow-y-auto border-l border-rule bg-surface xl:flex" aria-label="Filters and selection">
            <div className="space-y-3 border-b border-rule px-4 py-4">
              <h2 className="text-[13px] font-semibold">Filters</h2>
              {filterFields}
            </div>
            <SelectedBlock picked={picked} toTrack={toTrack.length} volume={pickedVolume} avgD={withD.length ? withD.reduce((s, r) => s + (r.d ?? 0), 0) / withD.length : null} perKeyword={prices.perKeyword} depth={project.depth} onTrack={track} onExport={exportCsv} onRemove={(p) => setSelected((s) => { const n = new Set(s); n.delete(p); return n; })} total={sorted.length} />
          </aside>
        ) : null}
      </div>

      {picked.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-rule bg-raised px-4 py-2.5 shadow-[var(--shadow)] lg:left-60 xl:hidden">
          <p className="min-w-0 flex-1 text-[12px]">
            <span className="num font-medium">{picked.length}</span> selected · <span className="num">{formatInt(pickedVolume)}</span> volume
            <span className="block text-muted">Adds <span className="num">{formatMoney(toTrack.length * prices.perKeyword)}</span> to each check</span>
          </p>
          <Button size="icon" aria-label="Export CSV" onClick={exportCsv}><Download strokeWidth={1.5} /></Button>
          <Button variant="primary" disabled={toTrack.length === 0} onClick={track}>Track {toTrack.length}</Button>
        </div>
      ) : null}
    </>
  );
}

function SelectedBlock({ picked, toTrack, volume, avgD, perKeyword, depth, onTrack, onExport, onRemove, total }: { picked: Row[]; toTrack: number; volume: number; avgD: number | null; perKeyword: number; depth: number; onTrack: () => void; onExport: () => void; onRemove: (p: string) => void; total: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
      <h2 className="text-[13px] font-semibold">Selected <span className="num font-normal text-muted">· {picked.length}</span></h2>
      {picked.length === 0 ? (
        <p className="mt-2 text-muted">Tick keywords in the table to collect them here.</p>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div><dt className="caption">Total volume</dt><dd className="num text-[15px] font-medium">{formatInt(volume)}</dd></div>
            <div><dt className="caption">Avg. difficulty</dt><dd className="num text-[15px] font-medium">{avgD === null ? "–" : avgD.toFixed(0)}</dd></div>
          </dl>
          <ul className="mt-3 max-h-48 space-y-px overflow-y-auto border-y border-rule py-1">
            {picked.map((r) => (
              <li key={r.phrase} className="flex h-6 items-center justify-between gap-2 text-[12px]">
                <span className={cn("truncate", r.tracked && "text-muted")}>{r.phrase}</span>
                <button type="button" aria-label={`Unselect ${r.phrase}`} className="text-muted hover:text-ink" onClick={() => onRemove(r.phrase)}><X className="size-3" strokeWidth={1.5} /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 space-y-2">
        <Button variant="primary" className="w-full" disabled={toTrack === 0} onClick={onTrack}>Track {toTrack} {toTrack === 1 ? "keyword" : "keywords"}</Button>
        <p className="caption">{toTrack === 0 ? "Tracking is free. It only adds rows." : <>Free to add. Adds <span className="num text-ink">{formatMoney(toTrack * perKeyword)}</span> to each check at depth {depth}.</>}</p>
        <Button className="w-full" onClick={onExport}><Download strokeWidth={1.5} /> Export CSV{picked.length ? ` · ${picked.length} selected` : ` · ${total} shown`}</Button>
      </div>
    </div>
  );
}
