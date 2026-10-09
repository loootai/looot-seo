"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";
import { BANDS } from "@/lib/seo/bands";
import { cn, formatDay } from "@/lib/utils";

const axis = { fontSize: 11, fill: "var(--muted)" };
const grid = <CartesianGrid stroke="var(--rule)" vertical={false} />;

interface TipRow {
  label: string;
  value: string;
  color?: string;
}

function TipBox({ title, rows, foot }: { title: string; rows: TipRow[]; foot?: string }) {
  return (
    <div className="rounded-overlay border border-rule bg-raised px-2.5 py-2 text-[12px] leading-4 shadow-[var(--shadow)]">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color ? <span className="size-2 rounded-[2px]" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="num">{r.value}</span>
        </p>
      ))}
      {foot ? <p className="caption mt-1 border-t border-rule pt-1">{foot}</p> : null}
    </div>
  );
}

type TipProps = { active?: boolean; payload?: readonly { payload?: unknown }[] };

/** The same data as a chart, as a table for screen readers. */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useMounted() {
  const [m, setM] = React.useState(false);
  React.useEffect(() => setM(true), []);
  return m;
}

/** Fixed-height frame that holds the space before the chart mounts, so nothing jumps. */
function Frame({ height, label, children, className }: { height: number; label: string; children: React.ReactNode; className?: string }) {
  const mounted = useMounted();
  return (
    <div role="img" aria-label={label} className={cn("w-full", className)} style={{ height }}>
      {mounted ? children : <div className="skeleton size-full opacity-40" />}
    </div>
  );
}

export interface DistributionPoint {
  day: string;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b0: number;
}

/** Stacked area of how many keywords sit in each position band over time, with numbered note markers. */
export function DistributionChart({ data, notes, height = 260 }: { data: DistributionPoint[]; notes: { n: number; day: string; body: string }[]; height?: number }) {
  const last = data[data.length - 1];
  const first = data[0];
  const days = new Set(data.map((d) => d.day));
  // A note is drawn on its own day when there was a check, otherwise on the next check after it.
  const marks = notes.map((n) => ({ ...n, x: days.has(n.day) ? n.day : data.find((d) => d.day >= n.day)?.day })).filter((n): n is typeof n & { x: string } => Boolean(n.x));
  return (
    <>
      <Frame height={height} label={last && first ? `Position distribution from ${formatDay(first.day)} to ${formatDay(last.day)}. On the last day ${last.b1} keywords were in positions 1 to 3 and ${last.b2} in 4 to 10.` : "Position distribution"}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -18 }}>
            {grid}
            <XAxis dataKey="day" tickFormatter={(d: string) => formatDay(d)} tick={axis} tickLine={false} axisLine={{ stroke: "var(--rule)" }} minTickGap={36} />
            <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={44} domain={[0, "dataMax"]} tickCount={5} />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={(p: TipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const row = p.payload[0]?.payload as unknown as DistributionPoint;
                const note = marks.find((m) => m.x === row.day);
                return <TipBox title={formatDay(row.day, true)} rows={BANDS.map((b) => ({ label: b.label, value: String(row[b.key as keyof DistributionPoint]), color: `var(--band-${b.band})` }))} foot={note ? `Note ${note.n}: ${note.body}` : undefined} />;
              }}
            />
            {[...BANDS].map((b) => (
              <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke="var(--surface)" strokeWidth={1} fill={`var(--band-${b.band})`} fillOpacity={1} isAnimationActive={false} name={b.label} />
            ))}
            {marks.map((m) => (
              <ReferenceLine key={m.n} x={m.x} stroke="var(--text)" strokeDasharray="2 3" strokeWidth={1} label={{ value: String(m.n), position: "top", fontSize: 10, fill: "var(--text)", fontWeight: 600 }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Frame>
      <DataTable caption="Keywords per position band on each check day" head={["Day", ...BANDS.map((b) => b.label)]} rows={data.map((d) => [d.day, d.b1, d.b2, d.b3, d.b4, d.b0])} />
    </>
  );
}

export interface HistoryPoint {
  at: string;
  position: number | null;
  [competitor: string]: number | string | null;
}

/** Position of one keyword over time. The y axis is inverted so position 1 is at the top. */
export function HistoryChart({ data, depth, lines, height = 200 }: { data: HistoryPoint[]; depth: number; lines: { key: string; label: string; color: string }[]; height?: number }) {
  const ticks = [1, 3, 10, 20, 30, 50].filter((t) => t <= depth);
  return (
    <>
      <Frame height={height} label={`Position history over ${data.length} checks. Latest position ${data[data.length - 1]?.position ?? "not ranked"}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis dataKey="at" tickFormatter={(d: string) => formatDay(d)} tick={axis} tickLine={false} axisLine={{ stroke: "var(--rule)" }} minTickGap={32} />
            <YAxis reversed domain={[1, depth]} ticks={ticks} tick={axis} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={(p: TipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const row = p.payload[0]?.payload as unknown as HistoryPoint;
                return <TipBox title={formatDay(row.at, true)} rows={[{ label: "You", value: row.position === null ? `Not in top ${depth}` : String(row.position), color: "var(--chart-1)" }, ...lines.map((l) => ({ label: l.label, value: row[l.key] === null || row[l.key] === undefined ? "–" : String(row[l.key]), color: l.color }))]} />;
              }}
            />
            {lines.map((l) => (
              <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={1.25} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
            ))}
            <Line type="monotone" dataKey="position" stroke="var(--chart-1)" strokeWidth={1.5} dot={{ r: 2, fill: "var(--chart-1)", strokeWidth: 0 }} activeDot={{ r: 3.5 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Frame>
      <DataTable caption="Position on each check" head={["Check", "Position"]} rows={data.map((d) => [d.at.slice(0, 10), d.position ?? "not ranked"])} />
    </>
  );
}

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/** Share of voice over time, one line per domain, with a legend that toggles lines. */
export function ShareChart({ data, series, height = 220 }: { data: Record<string, number | string>[]; series: SeriesDef[]; height?: number }) {
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const shown = series.filter((s) => !hidden.has(s.key));
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <button key={s.key} type="button" aria-pressed={!hidden.has(s.key)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })} className={cn("inline-flex h-6 items-center gap-1.5 text-[12px]", hidden.has(s.key) && "text-muted line-through opacity-60")}>
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            <span className="num">{s.label}</span>
          </button>
        ))}
      </div>
      <Frame height={height} label={`Share of voice over ${data.length} checks for ${series.length} domains.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -14 }}>
            {grid}
            <XAxis dataKey="day" tickFormatter={(d: string) => formatDay(d)} tick={axis} tickLine={false} axisLine={{ stroke: "var(--rule)" }} minTickGap={36} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={(p: TipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const row = p.payload[0]?.payload as Record<string, number | string>;
                return <TipBox title={formatDay(String(row.day), true)} rows={shown.map((s) => ({ label: s.label, value: `${Number(row[s.key] ?? 0).toFixed(1)}%`, color: s.color }))} />;
              }}
            />
            {shown.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={i === 0 && s.key === series[0]?.key ? 2 : 1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Frame>
      <DataTable caption="Share of voice in percent per check day" head={["Day", ...series.map((s) => s.label)]} rows={data.map((d) => [String(d.day), ...series.map((s) => Number(d[s.key] ?? 0).toFixed(1))])} />
    </>
  );
}

/** New links above the axis and lost links below it, per month. */
export function NewLostChart({ data, height = 220 }: { data: { month: string; new: number; lost: number }[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, lostNeg: -d.lost }));
  const fmt = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  return (
    <>
      <Frame height={height} label={`New and lost backlinks for ${data.length} months.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} stackOffset="sign" margin={{ top: 6, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
            {grid}
            <XAxis dataKey="month" tickFormatter={fmt} tick={axis} tickLine={false} axisLine={false} minTickGap={12} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => String(Math.abs(v))} />
            <ReferenceLine y={0} stroke="var(--rule-strong)" />
            <Tooltip
              cursor={{ fill: "var(--hover)" }}
              content={(p: TipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const row = p.payload[0]?.payload as unknown as { month: string; new: number; lost: number };
                const net = row.new - row.lost;
                return <TipBox title={fmt(row.month)} rows={[{ label: "New", value: `+${row.new}`, color: "var(--accent)" }, { label: "Lost", value: `-${row.lost}`, color: "var(--neg)" }, { label: "Net", value: `${net >= 0 ? "+" : ""}${net}` }]} />;
              }}
            />
            <Bar dataKey="new" stackId="a" fill="var(--accent)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="lostNeg" stackId="a" fill="var(--neg)" fillOpacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Frame>
      <DataTable caption="New and lost backlinks per month" head={["Month", "New", "Lost", "Net"]} rows={data.map((d) => [d.month, d.new, d.lost, d.new - d.lost])} />
    </>
  );
}

/** Daily spend for the last 30 days, stacked by feature. Values are micros. */
export function SpendChart({ data, series, height = 150 }: { data: Record<string, number | string>[]; series: SeriesDef[]; height?: number }) {
  const total = data.reduce((s, d) => s + series.reduce((a, k) => a + Number(d[k.key] ?? 0), 0), 0);
  return (
    <>
      <Frame height={height} label={`Daily spend over ${data.length} days, ${formatMoney(total)} in total.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -6 }} barCategoryGap="20%">
            {grid}
            <XAxis dataKey="day" tickFormatter={(d: string) => formatDay(d)} tick={axis} tickLine={false} axisLine={{ stroke: "var(--rule)" }} minTickGap={40} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={50} tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(2)}`} />
            <Tooltip
              cursor={{ fill: "var(--hover)" }}
              content={(p: TipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const row = p.payload[0]?.payload as Record<string, number | string>;
                const rows = series.filter((s) => Number(row[s.key] ?? 0) > 0).map((s) => ({ label: s.label, value: formatMoney(Number(row[s.key])), color: s.color }));
                return <TipBox title={formatDay(String(row.day), true)} rows={rows.length ? rows : [{ label: "Nothing spent", value: "$0.00" }]} />;
              }}
            />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Frame>
      <DataTable caption="Spend per day in US dollars" head={["Day", ...series.map((s) => s.label)]} rows={data.map((d) => [String(d.day), ...series.map((s) => (Number(d[s.key] ?? 0) / 1_000_000).toFixed(4))])} />
    </>
  );
}
