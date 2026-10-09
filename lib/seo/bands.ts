/** Position bands used by the distribution chart and the tinted table cells. 0 means not ranked. */
export type Band = 0 | 1 | 2 | 3 | 4;

export const BANDS: { band: Band; label: string; key: string }[] = [
  { band: 1, label: "1 to 3", key: "b1" },
  { band: 2, label: "4 to 10", key: "b2" },
  { band: 3, label: "11 to 20", key: "b3" },
  { band: 4, label: "21 to 50", key: "b4" },
  { band: 0, label: "Not ranked", key: "b0" },
];

/** Band for a position. */
export function bandOf(position: number | null | undefined): Band {
  if (!position) return 0;
  if (position <= 3) return 1;
  if (position <= 10) return 2;
  if (position <= 20) return 3;
  return 4;
}
