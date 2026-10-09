/** Money is stored as integer micros: millionths of a US dollar, the unit the looot catalog uses. */
export type Micros = number;

/** Converts dollars (number or numeric string) to micros, rounding to the nearest micro. */
export function toMicros(usd: number | string | null | undefined): Micros {
  if (usd === null || usd === undefined || usd === "") return 0;
  const n = typeof usd === "number" ? usd : Number(usd);
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}

/** Converts micros to dollars. */
export function toUsd(micros: Micros): number {
  return micros / 1_000_000;
}

/**
 * The one place money is formatted. Under $0.01: up to 4 decimals ($0.001, $0.0056).
 * Under $1: 3 decimals ($0.126). From $1: 2 decimals ($18.42).
 */
export function formatMoney(micros: Micros | null | undefined): string {
  if (micros === null || micros === undefined || Number.isNaN(micros)) return "–";
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(micros);
  const usd = abs / 1_000_000;
  if (abs === 0) return "$0.00";
  if (abs < 10_000) {
    let s = usd.toFixed(4);
    if (s.endsWith("0")) s = s.slice(0, -1);
    return `${sign}$${s}`;
  }
  if (abs < 1_000_000) return `${sign}$${usd.toFixed(3)}`;
  return `${sign}$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usd)}`;
}
