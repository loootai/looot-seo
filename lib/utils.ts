import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names and resolves Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Lowercases, trims and collapses spaces, the form keywords are compared in. */
export function normalisePhrase(phrase: string): string {
  return phrase.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Turns anything a person types for a site (URL, www host, path) into a bare host. */
export function normaliseDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return s;
}

/** True when the string looks like a host with at least one dot. */
export function isValidDomain(host: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host);
}

/** Host of a URL without www, or an empty string when the URL cannot be read. */
export function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Path and query of a URL, "/" when there is none. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return (u.pathname || "/") + u.search;
  } catch {
    return url;
  }
}

/** The fixed "now" of demo mode, so every screenshot shows the same numbers. */
export const DEMO_NOW_ISO = "2026-10-08T14:02:00.000Z";

/** Formats a count with thousands separators, or a dash for null. */
export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

/** Formats a date as "8 Oct" or "8 Oct 2026". */
export function formatDay(iso: string, withYear = false): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(d);
}

/** Formats an exact UTC date and time for title attributes. */
export function formatExact(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
}

/** Relative time such as "3 days ago", measured from `nowIso`. */
export function formatRelative(iso: string | null | undefined, nowIso: string): string {
  if (!iso) return "never";
  const diff = new Date(nowIso).getTime() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 31) return `${d} days ago`;
  const mo = Math.round(d / 30);
  return mo === 1 ? "1 month ago" : `${mo} months ago`;
}

/** Splits a textarea into unique, normalised keyword phrases, keeping first-seen order. */
export function parseKeywordLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n|,/)) {
    const n = normalisePhrase(line);
    if (!n || n.length > 80 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Builds a CSV string from rows, quoting every cell. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
