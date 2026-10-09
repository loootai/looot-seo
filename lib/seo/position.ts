import type { OrganicRow } from "@/lib/types";
import { hostOf, pathOf } from "@/lib/utils";

/** True when `host` is the project domain, or a subdomain of it when subdomains count. `www.` is ignored on both sides. */
export function matchesDomain(host: string, domain: string, includeSubdomains: boolean): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (!h || !d) return false;
  if (h === d) return true;
  return includeSubdomains && h.endsWith(`.${d}`);
}

export interface PositionResult {
  position: number | null;
  url: string | null;
  other_urls: string[];
  is_cannibalised: boolean;
}

/**
 * Finds where a site ranks in a result list: the position of its first organic result.
 * Later results from the same site go to other_urls. When the ranking URL is not the
 * keyword's target URL the result is flagged as cannibalised.
 */
export function findPosition(organic: Pick<OrganicRow, "position" | "url" | "host">[], domain: string, includeSubdomains: boolean, targetUrl?: string | null): PositionResult {
  const mine = [...organic]
    .filter((r) => matchesDomain(r.host || hostOf(r.url), domain, includeSubdomains))
    .sort((a, b) => a.position - b.position);
  const first = mine[0];
  if (!first) return { position: null, url: null, other_urls: [], is_cannibalised: false };
  const samePage = (a: string, b: string) => hostOf(a) === hostOf(b) && pathOf(a).replace(/\/$/, "") === pathOf(b).replace(/\/$/, "");
  return {
    position: first.position,
    url: first.url,
    other_urls: mine.slice(1).map((r) => r.url),
    is_cannibalised: Boolean(targetUrl) && !samePage(first.url, targetUrl as string),
  };
}

/** Text for a position cell. A keyword outside the checked depth reads "Not in top 30", never 0 or 101. */
export function positionText(position: number | null | undefined, depth: number): string {
  return position === null || position === undefined ? `Not in top ${depth}` : String(position);
}
