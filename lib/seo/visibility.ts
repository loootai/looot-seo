/**
 * Click-through rate by organic position. One curve for the whole app; visibility is an
 * estimate built on it and is labelled "Estimated visibility" wherever it is shown.
 */
export const CTR_CURVE: { from: number; to: number; ctr: number }[] = [
  { from: 1, to: 1, ctr: 0.28 },
  { from: 2, to: 2, ctr: 0.15 },
  { from: 3, to: 3, ctr: 0.1 },
  { from: 4, to: 4, ctr: 0.07 },
  { from: 5, to: 5, ctr: 0.05 },
  { from: 6, to: 10, ctr: 0.03 },
  { from: 11, to: 20, ctr: 0.01 },
];

/** Expected click-through rate for a position, 0 beyond 20 or when not ranked. */
export function ctr(position: number | null | undefined): number {
  if (!position || position < 1) return 0;
  return CTR_CURVE.find((b) => position >= b.from && position <= b.to)?.ctr ?? 0;
}

export interface VisibilityResult {
  /** 0 to 1, or null when no keyword has a volume. */
  value: number | null;
  counted: number;
  leftOut: number;
}

/** Sum of ctr(position) x volume over sum of ctr(1) x volume. Keywords with no volume are left out of both sums. */
export function estimateVisibility(items: { position: number | null; volume: number | null | undefined }[]): VisibilityResult {
  let num = 0;
  let den = 0;
  let counted = 0;
  let leftOut = 0;
  for (const it of items) {
    if (!it.volume || it.volume <= 0) {
      leftOut += 1;
      continue;
    }
    counted += 1;
    num += ctr(it.position) * it.volume;
    den += ctr(1) * it.volume;
  }
  return { value: den > 0 ? num / den : null, counted, leftOut };
}

/** Formats a 0 to 1 share as a percent with one decimal. */
export function formatPercent(v: number | null | undefined): string {
  return v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`;
}
