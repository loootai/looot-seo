import "server-only";
import { LoootClient, parseBalance } from "@/lib/looot/client";
import { fallbackPrice } from "@/lib/looot/catalog";
import { toMicros, type Micros } from "@/lib/money";
import type { Balance } from "@/lib/types";

/** Name of the env var that holds the token. Screens get it as a prop, so the client bundle never spells it. */
export const TOKEN_ENV = "LOOOT_TOKEN";

/** True when a looot token is set on the server. The token itself is never returned to a caller. */
export function hasLoootToken(): boolean {
  return Boolean(process.env.LOOOT_TOKEN);
}

/** Server ceiling for one run in micros, from LOOOT_SEO_MAX_RUN_USD. Undefined when unset or not a positive number. */
export function maxRunMicros(): number | undefined {
  const usd = Number(process.env.LOOOT_SEO_MAX_RUN_USD);
  return Number.isFinite(usd) && usd > 0 ? toMicros(usd) : undefined;
}

/** Builds the looot client from LOOOT_TOKEN. Returns null when the token is missing. */
export function loootFromEnv(): LoootClient | null {
  const token = process.env.LOOOT_TOKEN;
  if (!token) return null;
  return new LoootClient({ token, baseUrl: process.env.LOOOT_API_URL });
}

/** Reads the looot balance. Returns null with no token or when the call fails. */
export async function readBalance(): Promise<Balance | null> {
  const client = loootFromEnv();
  if (!client) return null;
  try {
    const b = parseBalance(await client.balance());
    if (!b) return null;
    return { availableMicros: toMicros(b.availableUsd), reservedMicros: toMicros(b.reservedUsd), topUpUrl: b.topUpUrl };
  } catch {
    return null;
  }
}

const PRICE_TTL_MS = 10 * 60 * 1000;
const priceCache = new Map<string, { micros: Micros; at: number }>();

/** Pulls a per-call price in micros out of an inspect response, or null when no known field is there. */
export function readInspectPrice(price: Record<string, unknown> | undefined | null): Micros | null {
  if (!price) return null;
  if (typeof price.amountMicros === "number") return Math.round(price.amountMicros);
  for (const key of ["amountUsd", "usd", "perCallUsd", "amount"]) {
    const v = price[key];
    if (typeof v === "number" && Number.isFinite(v)) return toMicros(v);
  }
  return null;
}

/**
 * Live price of an operation, cached for 10 minutes. The result is never lower than the
 * fallback table, so a quote can only err on the expensive side.
 */
export async function livePrice(operationId: string): Promise<Micros> {
  const floor = fallbackPrice(operationId);
  const hit = priceCache.get(operationId);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.micros;
  const client = loootFromEnv();
  if (!client) return floor;
  let micros = floor;
  try {
    const live = readInspectPrice((await client.inspect(operationId)).endpoint?.price);
    if (live !== null) micros = Math.max(floor, live);
  } catch {
    micros = floor;
  }
  priceCache.set(operationId, { micros, at: Date.now() });
  return micros;
}

/** Live prices for several operations at once, as a lookup. */
export async function livePrices(operationIds: string[]): Promise<Map<string, Micros>> {
  const unique = [...new Set(operationIds)];
  const values = await Promise.all(unique.map((id) => livePrice(id)));
  return new Map(unique.map((id, i) => [id, values[i] as Micros]));
}
