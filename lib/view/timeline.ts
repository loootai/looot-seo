import { bandOf } from "@/lib/seo/bands";
import { estimateVisibility } from "@/lib/seo/visibility";
import type { Keyword, RankCheck } from "@/lib/types";

export interface DayState {
  day: string;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b0: number;
  top3: number;
  top10: number;
  ranked: number;
  checked: number;
  avgPosition: number | null;
  visibility: number | null;
  leftOut: number;
  positions: Map<string, number | null>;
}

/**
 * The state of a project on every day it was checked. A keyword keeps its last known position on
 * days it was not part of the check. Keywords never checked are not counted in any band.
 */
export function buildTimeline(keywords: Keyword[], checks: RankCheck[], volumes: Map<string, number | null>): DayState[] {
  const live = new Set(keywords.map((k) => k.id));
  const byDay = new Map<string, RankCheck[]>();
  for (const c of checks) {
    if (!live.has(c.keyword_id)) continue;
    const day = c.checked_at.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), c]);
  }
  const state = new Map<string, number | null>();
  const out: DayState[] = [];
  for (const day of [...byDay.keys()].sort()) {
    for (const c of (byDay.get(day) ?? []).sort((a, b) => a.checked_at.localeCompare(b.checked_at))) state.set(c.keyword_id, c.position);
    const s: DayState = { day, b1: 0, b2: 0, b3: 0, b4: 0, b0: 0, top3: 0, top10: 0, ranked: 0, checked: state.size, avgPosition: null, visibility: null, leftOut: 0, positions: new Map(state) };
    let sum = 0;
    for (const pos of state.values()) {
      const b = bandOf(pos);
      if (b === 1) s.b1 += 1;
      else if (b === 2) s.b2 += 1;
      else if (b === 3) s.b3 += 1;
      else if (b === 4) s.b4 += 1;
      else s.b0 += 1;
      if (pos !== null) {
        s.ranked += 1;
        sum += pos;
        if (pos <= 3) s.top3 += 1;
        if (pos <= 10) s.top10 += 1;
      }
    }
    s.avgPosition = s.ranked ? sum / s.ranked : null;
    const vis = estimateVisibility([...state.entries()].map(([id, position]) => ({ position, volume: volumes.get(id) })));
    s.visibility = vis.value;
    s.leftOut = vis.leftOut;
    out.push(s);
  }
  return out;
}

/** The last state on or before a day, or null when the project had no check by then. */
export function stateAt(timeline: DayState[], day: string): DayState | null {
  let found: DayState | null = null;
  for (const s of timeline) if (s.day <= day) found = s;
  return found;
}

/** YYYY-MM-DD `days` before an ISO time. */
export function daysBefore(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
