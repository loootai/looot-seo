import type { SnapshotLite } from "@/lib/types";
import { matchesDomain } from "@/lib/seo/position";
import { ctr } from "@/lib/seo/visibility";

/** Best position of a domain inside one snapshot, or null. */
export function positionIn(snapshot: SnapshotLite, domain: string, includeSubdomains = false): number | null {
  let best: number | null = null;
  for (const r of snapshot.hosts) {
    if (matchesDomain(r.host, domain, includeSubdomains) && (best === null || r.position < best)) best = r.position;
  }
  return best;
}

/** Keeps the newest snapshot per keyword, optionally only those fetched on or before `untilIso`. */
export function latestPerKeyword(snapshots: SnapshotLite[], untilIso?: string): Map<string, SnapshotLite> {
  const out = new Map<string, SnapshotLite>();
  for (const s of snapshots) {
    if (untilIso && s.fetched_at > untilIso) continue;
    const cur = out.get(s.keyword_id);
    if (!cur || s.fetched_at > cur.fetched_at) out.set(s.keyword_id, s);
  }
  return out;
}

/**
 * Share of voice per domain over tracked keywords: the same click-weighted sum as estimated
 * visibility, read from stored snapshots. With no volumes at all every keyword weighs the same.
 */
export function shareOfVoice(latest: Map<string, SnapshotLite>, domains: string[], volumeByKeyword: Map<string, number | null>): Map<string, number> {
  const anyVolume = [...latest.keys()].some((k) => (volumeByKeyword.get(k) ?? 0) > 0);
  const out = new Map<string, number>();
  let den = 0;
  for (const k of latest.keys()) den += ctr(1) * (anyVolume ? volumeByKeyword.get(k) ?? 0 : 1);
  for (const d of domains) {
    let num = 0;
    for (const [k, snap] of latest) num += ctr(positionIn(snap, d, true)) * (anyVolume ? volumeByKeyword.get(k) ?? 0 : 1);
    out.set(d, den > 0 ? num / den : 0);
  }
  return out;
}

/** True when a competitor is in the top 10 and the project is not. */
export function isGap(ours: number | null, theirs: (number | null)[]): boolean {
  const weTop10 = ours !== null && ours <= 10;
  return !weTop10 && theirs.some((p) => p !== null && p <= 10);
}
