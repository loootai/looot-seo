const hits = new Map<string, number[]>();

/** Counts one hit for `key`. Returns the seconds to wait when more than `limit` hits fell in the last `windowMs`, else 0. Memory is per server instance. */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): number {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return 0;
}

/** Clears all counters. Tests only. */
export function resetRateLimits(): void {
  hits.clear();
}
