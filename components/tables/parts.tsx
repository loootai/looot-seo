"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BookOpenText, CircleAlert, ListTree, MessageCircleQuestion, RotateCw, Sparkles, TextQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { Tip } from "@/components/ui/overlays";
import { bandOf } from "@/lib/seo/bands";
import { positionText } from "@/lib/seo/position";
import type { SerpFeatures } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ChangeKind } from "@/lib/view/project";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** Sort state plus a sorted copy of the rows. Nulls always sort last, whichever way the column runs. */
export function useSort<T, K extends string>(rows: T[], initial: SortState<K>, get: Record<K, (row: T) => number | string | null>) {
  const [sort, setSort] = React.useState<SortState<K>>(initial);
  const sorted = React.useMemo(() => {
    const f = get[sort.key];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
    // The accessor map is rebuilt on every render; sorting depends on rows and sort only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: K, firstDir: SortDir = "asc") => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir }));
  return { sort, sorted, toggle };
}

/** Sortable column header with aria-sort. */
export function SortTh<K extends string>({ label, k, sort, onSort, align, className, firstDir, title }: { label: string; k: K; sort: SortState<K>; onSort: (k: K, d?: SortDir) => void; align?: "right"; className?: string; firstDir?: SortDir; title?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn(align === "right" && "r", className)} title={title}>
      <button type="button" onClick={() => onSort(k, firstDir)} className={cn("group -mx-1 inline-flex h-6 items-center gap-1 rounded-[4px] px-1 hover:text-ink", align === "right" && "flex-row-reverse", active && "text-ink")}>
        {label}
        <Icon className={cn("size-3 opacity-0 transition-opacity group-hover:opacity-70", active && "opacity-100")} strokeWidth={1.5} aria-hidden />
      </button>
    </th>
  );
}

/** A position as text. Not ranked prints "Not in top 30" in muted type. */
export function Position({ value, depth, checked = true, className }: { value: number | null; depth: number; checked?: boolean; className?: string }) {
  if (!checked) return <span className={cn("num text-muted", className)}>–</span>;
  if (value === null) return <span className={cn("text-[12px] text-muted", className)}>{positionText(null, depth)}</span>;
  return <span className={cn("num font-medium", className)}>{value}</span>;
}

/** Movement since the previous check: a glyph and a signed number, never colour alone. */
export function Change({ kind, change, className }: { kind: ChangeKind; change: number; className?: string }) {
  if (kind === "none" || kind === "same") return <span className={cn("num text-muted", className)} aria-label={kind === "same" ? "No change" : "No earlier check"}>{kind === "same" ? "=" : "–"}</span>;
  if (kind === "new") return <span className={cn("text-[12px] font-medium text-accent-text", className)}>new</span>;
  if (kind === "lost") return <span className={cn("text-[12px] font-medium text-neg", className)}>lost</span>;
  const up = kind === "up";
  return (
    <span className={cn("num inline-flex items-center gap-0.5 font-medium", up ? "text-accent-text" : "text-neg", className)} aria-label={`${up ? "Up" : "Down"} ${change} ${change === 1 ? "place" : "places"}`}>
      {up ? <ArrowUp className="size-3" strokeWidth={2} aria-hidden /> : <ArrowDown className="size-3" strokeWidth={2} aria-hidden />}
      {up ? "+" : "-"}
      {change}
    </span>
  );
}

/** Signed difference for stat cells. `goodWhenUp` says which direction is the good one. */
export function Delta({ value, goodWhenUp = true, digits = 0, suffix = "", className }: { value: number | null; goodWhenUp?: boolean; digits?: number; suffix?: string; className?: string }) {
  if (value === null) return <span className={cn("caption", className)}>no earlier data</span>;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return <span className={cn("caption num", className)}>= no change</span>;
  const up = rounded > 0;
  const good = up === goodWhenUp;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 text-[12px] font-medium", good ? "text-accent-text" : "text-neg", className)}>
      {up ? <ArrowUp className="size-3" strokeWidth={2} aria-hidden /> : <ArrowDown className="size-3" strokeWidth={2} aria-hidden />}
      {up ? "+" : "-"}
      {Math.abs(rounded).toFixed(digits)}
      {suffix}
    </span>
  );
}

/** Keyword difficulty as a number and a five-step bar. */
export function Difficulty({ value }: { value: number | null }) {
  if (value === null) return <span className="num text-muted">–</span>;
  const steps = Math.min(5, Math.max(1, Math.ceil(value / 20)));
  return (
    <span className="inline-flex items-center justify-end gap-2" title={`Difficulty ${value} of 100`}>
      <span className="num">{value}</span>
      <span className="flex gap-px" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("h-2.5 w-[3px] rounded-[1px]", i <= steps ? (steps >= 4 ? "bg-neg" : steps === 3 ? "bg-warn" : "bg-accent") : "bg-rule-strong")} />
        ))}
      </span>
    </span>
  );
}

/** Up to four SERP feature marks. Emerald when the project is in the feature, grey when it is only present. */
export function FeatureGlyphs({ f }: { f: SerpFeatures }) {
  const items = [
    { on: f.aio.present, own: f.aio.cited, Icon: Sparkles, label: "AI Overview", ownLabel: "cites you" },
    { on: f.paa.present, own: f.paa.owned, Icon: MessageCircleQuestion, label: "People also ask", ownLabel: "includes your page" },
    { on: f.answer_box.present, own: f.answer_box.owned, Icon: TextQuote, label: "Answer box", ownLabel: "yours" },
    { on: f.knowledge.present, own: false, Icon: BookOpenText, label: "Knowledge panel", ownLabel: "" },
  ].filter((i) => i.on);
  if (items.length === 0) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {items.map(({ Icon, label, own, ownLabel }) => (
        <Tip key={label} label={own ? `${label}, ${ownLabel}` : `${label}, present`}>
          <span className={cn("inline-flex", own ? "text-accent-text" : "text-muted/70")} role="img" aria-label={own ? `${label}, ${ownLabel}` : `${label}, present`}>
            <Icon className="size-3.5" strokeWidth={own ? 2 : 1.5} />
          </span>
        </Tip>
      ))}
    </span>
  );
}

/** A position inside a cell tinted by its band, for the by-date table and the competitor matrix. */
export function BandCell({ value, strong, className }: { value: number | null | undefined; strong?: boolean; className?: string }) {
  if (value === undefined) return <span className={cn("num block text-center text-muted/60", className)}>·</span>;
  const band = bandOf(value);
  return (
    <span className={cn("num mx-auto flex h-6 w-9 items-center justify-center rounded-[3px] text-[12px]", strong && "font-semibold", value === null && "text-muted", className)} style={{ background: `var(--band-${band})` }}>
      {value ?? "–"}
    </span>
  );
}

/** Line of positions with no axis, ending in a dot. With `invert`, a better position draws higher. */
export function Sparkline({ values, width = 60, height = 20, invert = false, max, label }: { values: (number | null)[]; width?: number; height?: number; invert?: boolean; max?: number; label: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <span className="caption" style={{ width, display: "inline-block" }}>{pts.length === 0 ? "" : "1 check"}</span>;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(max ?? 0, ...pts.map((p) => p.v), lo + 2);
  const x = (i: number) => 2 + (i / Math.max(1, values.length - 1)) * (width - 5);
  const y = (v: number) => {
    const t = (Math.min(v, hi) - lo) / Math.max(1e-9, hi - lo);
    return 2 + (invert ? t : 1 - t) * (height - 4);
  };
  const d = pts.map((p, n) => `${n === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1] as { v: number; i: number };
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="inline-block overflow-visible align-middle">
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
      <circle cx={x(last.i)} cy={y(last.v)} r={2} fill="var(--accent)" />
    </svg>
  );
}

const ICON_TONES = ["#0b4a35", "#2f6fde", "#b4472f", "#3b8c8c", "#7a8b2e", "#8a5a44", "#5f6b7a", "#d98a1f"];
/** Letter tile for a domain. No request leaves the browser for it. */
export function DomainIcon({ domain, size = 16, className }: { domain: string; size?: number; className?: string }) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-[4px] font-semibold uppercase leading-none text-white", className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.58), background: ICON_TONES[h % ICON_TONES.length] }}>
      {domain.replace(/^www\./, "").charAt(0)}
    </span>
  );
}

/** Left-aligned empty block: what is missing, one sentence, and the next action. */
export function EmptyState({ title, children, actions, className }: { title: string; children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-xl px-5 py-10", className)}>
      <h2 className="text-[15px] font-semibold leading-6">{title}</h2>
      {children ? <div className="mt-1.5 space-y-2 text-muted">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Inline error for one region. Says what failed, shows the code, offers a retry. */
export function ErrorPanel({ title = "This part could not be loaded", code = "load_failed", detail, onRetry, className }: { title?: string; code?: string; detail?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex max-w-xl items-start gap-3 px-5 py-8", className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-neg" strokeWidth={1.5} aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-muted">
          {detail ?? "The request did not finish. Nothing was charged for it."} Error code <code className="num text-ink">{code}</code>.
        </p>
        <Button className="mt-3" size="sm" onClick={onRetry ?? (() => window.location.reload())}>
          <RotateCw strokeWidth={1.5} /> Try again
        </Button>
      </div>
    </div>
  );
}

/** Skeleton rows with the real column widths, so the table does not shift when data arrives. */
export function TableSkeleton({ rows = 12, widths }: { rows?: number; widths: (number | string)[] }) {
  return (
    <div role="status" aria-label="Loading" className="overflow-hidden">
      <div className="flex h-8 items-center gap-3 border-b border-rule px-3">
        {widths.map((w, i) => (
          <div key={i} style={{ width: w, flex: typeof w === "string" ? "1 1 0" : "none" }}>
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-9 items-center gap-3 border-b border-rule px-3">
          {widths.map((w, i) => (
            <div key={i} style={{ width: w, flex: typeof w === "string" ? "1 1 0" : "none" }}>
              <Skeleton style={{ width: `${45 + ((r * 7 + i * 13) % 45)}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** j and k move the focused row, Enter opens it, x selects it. Does nothing while a field has focus. */
export function useRowKeys({ count, onOpen, onToggle, enabled = true }: { count: number; onOpen?: (index: number) => void; onToggle?: (index: number) => void; enabled?: boolean }) {
  const [focused, setFocused] = React.useState(-1);
  const ref = React.useRef({ count, onOpen, onToggle, focused });
  React.useEffect(() => {
    ref.current = { count, onOpen, onToggle, focused };
  });
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role='dialog'][data-state='open'][aria-modal='true']")) return;
      const c = ref.current;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.max(0, Math.min(c.count - 1, c.focused + (e.key === "j" ? 1 : -1)));
        setFocused(next);
        document.querySelector(`[data-row-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && c.focused >= 0 && t?.tagName !== "BUTTON" && t?.tagName !== "A") {
        e.preventDefault();
        c.onOpen?.(c.focused);
      } else if (e.key === "x" && c.focused >= 0) {
        e.preventDefault();
        c.onToggle?.(c.focused);
      } else if (e.key === "Escape") setFocused(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
  return { focused, setFocused };
}

/** Section heading inside a screen: a small label with optional controls on the right. */
export function SectionHead({ title, hint, children, className }: { title: string; hint?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1", className)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[13px] font-semibold leading-5">{title}</h2>
        {hint ? <span className="caption truncate">{hint}</span> : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

export { ListTree };
