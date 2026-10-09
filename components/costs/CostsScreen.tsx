"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy, Download, ExternalLink, Minus, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { SpendChart } from "@/components/charts/charts";
import { PageHead, Region } from "@/components/shell/PageHead";
import { EmptyState, ErrorPanel, SectionHead, TableSkeleton } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Skeleton, Switch, Tag } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { fallbackPrice } from "@/lib/looot/catalog";
import { formatMoney } from "@/lib/money";
import type { ItemStatus, Run } from "@/lib/types";
import { cn, formatDay, formatExact, formatRelative, toCsv } from "@/lib/utils";
import { calcRefresh, CHECKS_PER_MONTH, monthlyMicros, type CalcInput, type Frequency } from "@/lib/view/costs";
import type { CostsData } from "@/lib/view/costsData";
import { ACTION_LABELS } from "@/lib/view/project";
import type { ForcedState } from "@/lib/view/state";

const SERIES = [
  { key: "Rank checks", label: "Rank checks", color: "var(--chart-1)" },
  { key: "Research", label: "Research", color: "var(--chart-2)" },
  { key: "Competitors", label: "Competitors", color: "var(--chart-3)" },
  { key: "Backlinks", label: "Backlinks", color: "var(--chart-5)" },
];

const STATUS_LABEL: Record<Run["status"], string> = { running: "Running", completed: "Completed", partial: "Partial", failed: "Failed", cancelled: "Cancelled" };

function StatusTag({ status }: { status: Run["status"] }) {
  const tone = status === "completed" ? "accent" : status === "failed" ? "neg" : status === "cancelled" ? "neutral" : "warn";
  return <Tag tone={tone}>{STATUS_LABEL[status]}</Tag>;
}

function duration(run: Run): string {
  if (!run.finished_at) return "–";
  const s = Math.max(0, Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function CostsScreen({ data, state }: { data: CostsData; state: ForcedState }) {
  const router = useRouter();
  const loading = state === "loading";
  const runs = data.runs ?? [];
  const over = runs.filter((r) => r.actual_cost_micros > r.max_cost_micros || r.over_cap_micros > 0).length;

  return (
    <>
      <PageHead title="Costs and runs" sub={data.scope ? `What a refresh of ${data.scope.name} costs before it runs, and what every run cost after.` : "What a refresh costs before it runs, and what every run cost after, across all projects."} />

      {!data.demo && !data.hasToken ? (
        <Region className="px-4 py-4 md:px-6">
          <div className="flex max-w-3xl items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="font-medium">No looot token is set on the server</p>
              <p className="mt-0.5 text-muted">
                Set the environment variable <code className="num text-ink">{data.tokenEnv}</code> and restart. Get a token at{" "}
                <a className="text-accent-text hover:underline" href="https://looot.ai" target="_blank" rel="noreferrer noopener">looot.ai</a>. Until then every screen that reads stored data still works, and no paid button can run.
              </p>
            </div>
          </div>
        </Region>
      ) : null}

      <div className="grid border-t border-rule bg-surface lg:grid-cols-12">
        <section className="min-w-0 px-4 py-4 md:px-6 lg:col-span-7 lg:border-r lg:border-rule" aria-label="What a refresh costs">
          {loading ? <div className="space-y-4"><Skeleton className="w-40" />{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-5" style={{ width: `${92 - i * 6}%` }} />)}</div> : data.bases.length ? <Calculator data={data} /> : <EmptyState className="px-0 py-4" title="No project to price"><p>Create a project and the calculator fills in its keywords, depth and competitors.</p></EmptyState>}
        </section>

        <section className="min-w-0 border-t border-rule lg:col-span-5 lg:border-t-0" aria-label="Balance and spend">
          <dl className="hairline-grid grid grid-cols-2 border-b border-rule">
            <div className="px-4 py-3.5 md:px-6">
              <dt className="label flex items-center gap-2">looot balance {data.demo ? <Tag tone="warn">Demo data</Tag> : null}</dt>
              <dd className="stat mt-1.5">{loading ? <Skeleton className="my-1 h-6 w-24" /> : data.balanceMicros === null ? "–" : formatMoney(data.balanceMicros)}</dd>
              <dd className="mt-1 h-4">
                {data.balanceMicros === null && !loading ? (
                  <span className="caption">{data.hasToken && !data.balanceReachable ? "looot did not answer the balance call" : `needs ${data.tokenEnv}`}</span>
                ) : (
                  <a href={data.topUpUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[12px] text-accent-text hover:underline">
                    Top up at looot.ai <ExternalLink className="size-3" strokeWidth={1.5} aria-hidden />
                  </a>
                )}
              </dd>
            </div>
            <div className="px-4 py-3.5 md:px-6">
              <dt className="label">Spent this month</dt>
              <dd className="stat mt-1.5">{loading ? <Skeleton className="my-1 h-6 w-20" /> : formatMoney(data.spentMonth)}</dd>
              <dd className="caption mt-1 h-4">{formatMoney(data.spentAll)} over {runs.filter((r) => !r.simulated).length} runs in total</dd>
            </div>
          </dl>
          <div className="px-4 py-4 md:px-6">
            <SectionHead title="Daily spend" hint="last 30 days">
              <span className="caption hidden flex-wrap items-center gap-x-3 sm:flex">
                {SERIES.map((s) => (
                  <span key={s.key} className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: s.color }} /> {s.label}</span>
                ))}
              </span>
            </SectionHead>
            <div className="mt-2">{loading ? <Skeleton className="h-[230px] w-full opacity-50" /> : <SpendChart data={data.spend} series={SERIES} height={230} />}</div>
          </div>
        </section>
      </div>

      <Region>
        <PriceTable data={data} />
      </Region>

      <Region>
        {loading ? (
          <TableSkeleton rows={8} widths={[28, 130, "2fr", 90, 80, 80, 80, 100, 80]} />
        ) : state === "error" || data.runs === null ? (
          <ErrorPanel title="The runs could not be loaded" code="runs_failed" onRetry={() => router.refresh()} />
        ) : (
          <RunsTable runs={runs} over={over} now={data.now} showProject={!data.scope} />
        )}
      </Region>
    </>
  );
}

function Stepper({ value, onChange, min = 0, max = 5000, label, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; step?: number }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min)));
  return (
    <span className="inline-flex h-7 items-center rounded-ctl border border-rule-strong bg-surface">
      <button type="button" className="inline-flex h-full w-6 items-center justify-center text-muted hover:text-ink disabled:opacity-40" onClick={() => set(value - step)} disabled={value <= min} aria-label={`Fewer ${label}`}>
        <Minus className="size-3" strokeWidth={2} />
      </button>
      <input type="number" inputMode="numeric" name={label} aria-label={label} className="num h-full w-11 border-x border-rule bg-transparent text-center text-[12px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" value={value} min={min} max={max} onChange={(e) => set(Number(e.target.value))} />
      <button type="button" className="inline-flex h-full w-6 items-center justify-center text-muted hover:text-ink disabled:opacity-40" onClick={() => set(value + step)} disabled={value >= max} aria-label={`More ${label}`}>
        <Plus className="size-3" strokeWidth={2} />
      </button>
    </span>
  );
}

function Calculator({ data }: { data: CostsData }) {
  const [pid, setPid] = React.useState(data.bases[0]?.projectId ?? "");
  const base = data.bases.find((b) => b.projectId === pid) ?? data.bases[0];
  const initial = React.useCallback((b: NonNullable<typeof base>): CalcInput => ({ keywords: b.keywords, depth: b.depth, aioKeywords: b.aioKeywords, metrics: true, overlaps: Math.min(3, b.competitors), backlinks: true, domainOverview: true, serpOperation: b.serpOperation }), []);
  const [input, setInput] = React.useState<CalcInput>(() => initial(base as NonNullable<typeof base>));
  const [freq, setFreq] = React.useState<Frequency>("weekly");
  const prices = React.useMemo(() => new Map(data.prices.map((p) => [p.operationId, p.micros])), [data.prices]);
  const price = React.useCallback((op: string) => prices.get(op) ?? fallbackPrice(op), [prices]);
  if (!base) return null;
  const calc = calcRefresh(input, price);
  const patch = (p: Partial<CalcInput>) => setInput((i) => ({ ...i, ...p }));
  const changed = JSON.stringify(input) !== JSON.stringify(initial(base));
  const monthly = monthlyMicros(calc.perCheckMicros, freq);
  const control: Record<string, React.ReactNode> = {
    rank: (
      <span className="flex items-center gap-1.5">
        <Stepper label="keywords" value={input.keywords} onChange={(v) => patch({ keywords: v, aioKeywords: Math.min(v, input.aioKeywords) })} />
        <Select aria-label="Depth" className="h-7 w-[84px] text-[12px]" value={input.depth} onChange={(e) => patch({ depth: Number(e.target.value) })}>
          {[10, 20, 30, 50].map((d) => <option key={d} value={d}>top {d}</option>)}
        </Select>
      </span>
    ),
    aio: <Stepper label="AI Overview keywords" value={input.aioKeywords} max={input.keywords} onChange={(v) => patch({ aioKeywords: v })} />,
    metrics: <Switch aria-label="Keyword metrics" checked={input.metrics} onCheckedChange={(v) => patch({ metrics: v })} />,
    overlap: <Stepper label="competitors" value={input.overlaps} max={8} onChange={(v) => patch({ overlaps: v })} />,
    backlinks: <Switch aria-label="Backlinks" checked={input.backlinks} onCheckedChange={(v) => patch({ backlinks: v })} />,
    domain: <Switch aria-label="Domain overview" checked={input.domainOverview} onCheckedChange={(v) => patch({ domainOverview: v })} />,
  };
  return (
    <>
      <SectionHead title="What a refresh costs" hint={<span className="max-sm:hidden">{`filled from ${base.name}, change any number to try another`}</span>}>
        {data.bases.length > 1 ? (
          <Select aria-label="Project" className="h-7 w-auto text-[12px]" value={base.projectId} onChange={(e) => { const b = data.bases.find((x) => x.projectId === e.target.value); if (b) (setPid(b.projectId), setInput(initial(b))); }}>
            {data.bases.map((b) => <option key={b.projectId} value={b.projectId}>{b.name}</option>)}
          </Select>
        ) : null}
        {changed ? <Button size="sm" variant="ghost" onClick={() => setInput(initial(base))}>Reset</Button> : null}
      </SectionHead>
      <table className="mt-2 w-full">
        <thead className="sr-only">
          <tr><th scope="col">Line</th><th scope="col">Setting</th><th scope="col">Maths</th><th scope="col">Subtotal</th></tr>
        </thead>
        <tbody>
          {calc.lines.map((l) => (
            <tr key={l.key} className="border-t border-rule align-middle">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="block font-medium">{l.label}</span>
                {l.note ? <span className="caption block">{l.note}</span> : null}
                <span className="mt-1.5 block sm:hidden">{control[l.key]}</span>
              </th>
              <td className="py-2 pr-3 text-right max-sm:hidden">{control[l.key]}</td>
              <td className={cn("num whitespace-nowrap py-2 pr-3 text-right text-[12px] text-muted max-md:hidden", l.calls === 0 && "opacity-50")}>
                {l.key === "metrics" || l.key === "backlinks" ? `${l.calls} calls` : `${l.calls} x ${formatMoney(l.unitMicros)}`}
              </td>
              <td className={cn("num w-20 py-2 text-right", l.calls === 0 && "text-muted")}>{formatMoney(l.subtotalMicros)}</td>
            </tr>
          ))}
          <tr className="border-t border-rule-strong">
            <th scope="row" className="py-2.5 text-left font-semibold">One full refresh</th>
            <td className="max-sm:hidden" />
            <td className="max-md:hidden" />
            <td className="num py-2.5 text-right text-[15px] font-semibold">{formatMoney(calc.totalMicros)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ctl bg-hover px-3 py-2.5">
        <label htmlFor="calc-frequency" className="label text-ink">Rank checks run</label>
        <Select id="calc-frequency" className="h-7 w-auto text-[12px]" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
          <option value="once">once</option>
          <option value="weekly">weekly</option>
          <option value="daily">daily</option>
        </Select>
        <p className="min-w-0 flex-1 basis-64">
          {freq === "once" ? (
            <>One rank check costs <span className="num font-medium">{formatMoney(calc.perCheckMicros)}</span>.</>
          ) : (
            <>
              About <span className="num font-medium">{formatMoney(monthly)}</span> a month for {freq} rank checks <span className="num text-muted">({formatMoney(calc.perCheckMicros)} x {CHECKS_PER_MONTH[freq]})</span>.
            </>
          )}{" "}
          <span className="text-muted">Version 1 has no schedule: every check starts with a click and a quote.</span>
        </p>
      </div>
    </>
  );
}

function PriceTable({ data }: { data: CostsData }) {
  const [open, setOpen] = React.useState(false);
  const [changedSince, setChangedSince] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    try {
      const seen = JSON.parse(localStorage.getItem("seo-prices") ?? "{}") as Record<string, number>;
      setChangedSince(new Set(data.prices.filter((p) => seen[p.operationId] !== undefined && seen[p.operationId] !== p.micros).map((p) => p.operationId)));
      localStorage.setItem("seo-prices", JSON.stringify(Object.fromEntries(data.prices.map((p) => [p.operationId, p.micros]))));
    } catch {}
  }, [data.prices]);
  const shown = open ? data.prices : data.prices.slice(0, 4);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5 md:px-6">
        <h2 className="text-[13px] font-semibold">Price of every operation this app calls</h2>
        <span className="caption">{data.hasToken ? "live from looot, never below the catalog table" : "from the looot public catalog"}, dates are the catalog&apos;s own</span>
        <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Show fewer" : `Show all ${data.prices.length}`}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl md:min-w-[720px]">
          <colgroup>
            <col style={{ width: "30%" }} />
            <col className="max-md:hidden" />
            <col style={{ width: 96 }} />
            <col className="max-sm:hidden" style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Used for</th>
              <th scope="col" className="max-md:hidden">Operation id</th>
              <th scope="col" className="r">Per call</th>
              <th scope="col" className="r max-sm:hidden">Price date</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.operationId}>
                <td title={p.note ?? undefined}>
                  {p.feature}
                  {p.note ? <span className="text-muted"> · {p.note}</span> : null}
                </td>
                <td className="num text-[12px] text-muted max-md:hidden" title={p.jobId}>{p.operationId}</td>
                <td className="num r">
                  {changedSince.has(p.operationId) || p.micros !== p.tableMicros ? <Tag tone="warn" className="mr-2" title={`The catalog table says ${formatMoney(p.tableMicros)}`}>changed</Tag> : null}
                  {formatMoney(p.micros)}
                </td>
                <td className="num r text-muted max-sm:hidden">{p.priceDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface ItemRow {
  item_key: string;
  operation_id: string;
  input: Record<string, unknown>;
  status: ItemStatus;
  looot_run_id: string | null;
  unit_price_micros: number;
  actual_cost_micros: number;
  error_code: string | null;
  parse_ok: boolean;
}

function inputSummary(input: Record<string, unknown>): string {
  const main = input.q ?? input.query ?? input.keyword ?? input.target ?? input.target1 ?? (Array.isArray(input.keywords) ? `${input.keywords.length} keywords` : null);
  const extra = input.target2 ? ` vs ${String(input.target2)}` : input.page && Number(input.page) > 1 ? ` · page ${String(input.page)}` : "";
  return main === null || main === undefined ? JSON.stringify(input).slice(0, 80) : `${String(main)}${extra}`;
}

function RunItems({ runId }: { runId: string }) {
  const [items, setItems] = React.useState<ItemRow[] | null>(null);
  const [error, setError] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [all, setAll] = React.useState(false);
  const load = React.useCallback(() => {
    setError(false);
    fetch(`/api/runs/${encodeURIComponent(runId)}?items=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: ItemRow[] }) => setItems(d.items))
      .catch(() => setError(true));
  }, [runId]);
  React.useEffect(load, [load]);
  if (error) return <ErrorPanel className="py-4" title="The calls of this run could not be loaded" code="run_items_failed" onRetry={load} />;
  if (!items) return <div className="space-y-2.5 px-12 py-3" role="status" aria-label="Loading calls">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} style={{ width: `${70 - i * 12}%` }} />)}</div>;
  // Failed and unreadable calls first, so the reason a run was partial is on top.
  const order = (i: ItemRow) => (i.status === "failed" || i.status === "timed_out" ? 0 : !i.parse_ok && i.status === "completed" ? 1 : i.status === "skipped_budget" ? 2 : 3);
  const sorted = [...items].sort((a, b) => order(a) - order(b));
  const shown = all ? sorted : sorted.slice(0, 8);
  const tone = (s: ItemStatus) => (s === "completed" ? "accent" : s === "failed" || s === "timed_out" ? "neg" : s === "skipped_budget" ? "warn" : "neutral");
  return (
    <div className="border-l-2 border-accent/50 bg-bg/60 pl-3 md:ml-6">
      <table className="w-full table-fixed text-[12px]">
        <colgroup>
          <col className="max-md:hidden" style={{ width: "30%" }} />
          <col />
          <col style={{ width: 110 }} />
          <col style={{ width: 70 }} />
          <col className="max-md:hidden" style={{ width: 210 }} />
        </colgroup>
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="h-7 px-2 font-medium max-md:hidden">Operation</th>
            <th scope="col" className="h-7 px-2 font-medium">Input</th>
            <th scope="col" className="h-7 px-2 font-medium">Status</th>
            <th scope="col" className="h-7 px-2 text-right font-medium">Cost</th>
            <th scope="col" className="h-7 px-2 font-medium max-md:hidden">looot run id</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((i) => (
            <tr key={i.item_key} className="border-t border-rule">
              <td className="num h-7 truncate px-2 text-muted max-md:hidden" title={i.operation_id}>{i.operation_id}</td>
              <td className="h-7 truncate px-2" title={JSON.stringify(i.input)}>{inputSummary(i.input)}</td>
              <td className="h-7 px-2">
                <Tag tone={tone(i.status)}>{i.status === "skipped_budget" ? "not sent" : i.status === "timed_out" ? "timed out" : i.status}</Tag>
                {i.error_code ? <span className="num ml-1.5 text-neg">{i.error_code}</span> : !i.parse_ok && i.status === "completed" ? <span className="ml-1.5 text-warn">unreadable</span> : null}
              </td>
              <td className="num h-7 px-2 text-right" title={i.status === "failed" ? "A failed call costs nothing" : undefined}>{formatMoney(i.actual_cost_micros)}</td>
              <td className="h-7 px-2 max-md:hidden">
                {i.looot_run_id ? (
                  <button type="button" className="num group inline-flex max-w-full items-center gap-1.5 text-muted hover:text-ink" onClick={() => { void navigator.clipboard?.writeText(i.looot_run_id as string); setCopied(i.item_key); window.setTimeout(() => setCopied(null), 1500); }} aria-label={`Copy run id ${i.looot_run_id}`}>
                    <span className="truncate">{i.looot_run_id}</span>
                    {copied === i.item_key ? <Check className="size-3 shrink-0 text-accent-text" strokeWidth={2} /> : <Copy className="size-3 shrink-0 opacity-60 group-hover:opacity-100" strokeWidth={1.5} />}
                  </button>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 8 ? (
        <Button size="sm" variant="ghost" className="my-1 ml-0.5" onClick={() => setAll((a) => !a)}>
          {all ? "Show the first 8" : `Show all ${sorted.length} calls`}
        </Button>
      ) : null}
    </div>
  );
}

function RunsTable({ runs, over, now, showProject }: { runs: CostsData["runs"] & object; over: number; now: string; showProject: boolean }) {
  const [action, setAction] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(25);
  const actions = [...new Set(runs.map((r) => r.action))];
  const filtered = runs.filter((r) => (action === "all" || r.action === action) && (status === "all" || r.status === status));
  const shown = filtered.slice(0, limit);
  const exportCsv = () => {
    const csv = toCsv(["started_at", "project", "action", "items_done", "items_total", "quoted_usd", "cap_usd", "actual_usd", "status", "simulated", "run_id"], filtered.map((r) => [r.started_at, r.projectName, r.action, r.items_done, r.items_total, r.quoted_micros / 1e6, r.max_cost_micros / 1e6, r.actual_cost_micros / 1e6, r.status, r.simulated ? "yes" : "no", r.id]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "looot-seo-runs.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const cols = showProject ? 10 : 9;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-2.5 md:px-6">
        <h2 className="text-[13px] font-semibold">Runs</h2>
        {runs.length ? (
          <p className={cn("flex items-center gap-1.5 text-[12px]", over ? "text-neg" : "text-accent-text")} role="status">
            {over ? <TriangleAlert className="size-3.5" strokeWidth={1.5} aria-hidden /> : <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden />}
            {over ? "A run went over its cap." : "Every run stayed at or under its cap."} <span className="num">{over} of {runs.length}</span> runs exceeded.
          </p>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Select aria-label="Filter by action" className="h-7 w-auto text-[12px]" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </Select>
          <Select aria-label="Filter by status" className="h-7 w-auto text-[12px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as Run["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
          <Button size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download strokeWidth={1.5} /> <span className="max-sm:sr-only">Export CSV</span>
          </Button>
        </div>
      </div>
      {runs.length === 0 ? (
        <EmptyState title="No runs yet">
          <p>Every paid action lands here with its quote, the cap you confirmed and what looot charged. The calculator above works without any runs.</p>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No runs match" actions={<Button onClick={() => (setAction("all"), setStatus("all"))}>Clear filters</Button>} />
      ) : (
        <>
          <div className="overflow-x-auto max-md:hidden">
            <table className="tbl" style={{ minWidth: 860 }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: 150 }} />
                {showProject ? <col style={{ width: 170 }} /> : null}
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Calls</span></th>
                  <th scope="col">Started</th>
                  {showProject ? <th scope="col">Project</th> : null}
                  <th scope="col">Action</th>
                  <th scope="col" className="r">Items</th>
                  <th scope="col" className="r">Quoted</th>
                  <th scope="col" className="r">Cap</th>
                  <th scope="col" className="r">Actual</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="r">Duration</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="cursor-pointer" data-selected={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td>
                        <button type="button" aria-expanded={open === r.id} aria-label={`Calls of the ${ACTION_LABELS[r.action] ?? r.action} run started ${formatExact(r.started_at)}`} className="inline-flex size-6 items-center justify-center rounded-[4px] text-muted hover:text-ink" onClick={(e) => (e.stopPropagation(), setOpen(open === r.id ? null : r.id))}>
                          <ChevronRight className={cn("size-3.5 transition-transform duration-100", open === r.id && "rotate-90")} strokeWidth={1.5} />
                        </button>
                      </td>
                      <td title={formatExact(r.started_at)}>
                        <span className="num">{formatDay(r.started_at)}</span> <span className="caption">{formatRelative(r.started_at, now)}</span>
                      </td>
                      {showProject ? <td>{r.projectName}</td> : null}
                      <td>
                        {ACTION_LABELS[r.action] ?? r.action}
                        {r.simulated ? <Tag tone="warn" className="ml-2">simulated</Tag> : null}
                      </td>
                      <td className="num r">{r.items_done}<span className="text-muted">/{r.items_total}</span></td>
                      <td className="num r text-muted">{formatMoney(r.quoted_micros)}</td>
                      <td className="num r text-muted">{formatMoney(r.max_cost_micros)}</td>
                      <td className="num r font-medium">{formatMoney(r.actual_cost_micros)}</td>
                      <td><StatusTag status={r.status} /></td>
                      <td className="num r text-muted">{duration(r)}</td>
                    </tr>
                    {open === r.id ? (
                      <tr>
                        <td colSpan={cols} className="!h-auto !overflow-visible !whitespace-normal !p-0 hover:!bg-transparent">
                          <RunItems runId={r.id} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-rule md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" aria-expanded={open === r.id} className="flex w-full items-center gap-3 px-4 py-2.5 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{ACTION_LABELS[r.action] ?? r.action}</span>
                      <StatusTag status={r.status} />
                    </span>
                    <span className="caption block truncate">
                      {formatDay(r.started_at)} · {r.items_done}/{r.items_total} calls · cap {formatMoney(r.max_cost_micros)}{showProject ? ` · ${r.projectName}` : ""}
                    </span>
                  </span>
                  <span className="num font-medium">{formatMoney(r.actual_cost_micros)}</span>
                  <ChevronRight className={cn("size-4 text-muted transition-transform duration-100", open === r.id && "rotate-90")} strokeWidth={1.5} aria-hidden />
                </button>
                {open === r.id ? <RunItems runId={r.id} /> : null}
              </li>
            ))}
          </ul>
          {filtered.length > limit ? (
            <div className="flex items-center gap-3 px-4 py-2.5 md:px-6">
              <Button size="sm" onClick={() => setLimit((l) => l + 25)}>Show 25 more</Button>
              <span className="caption">{shown.length} of {filtered.length} runs</span>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
