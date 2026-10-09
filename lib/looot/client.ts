/** Error from the looot API, with the HTTP status and looot's error code when there is one. */
export class LoootError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = "http_error",
  ) {
    super(message);
    this.name = "LoootError";
  }
}

export interface LoootRun {
  runId: string;
  status: string;
  result?: unknown;
  actualCost?: number | string | null;
  error?: { code?: string; message?: string } | null;
}

export const TERMINAL_STATUSES = new Set(["completed", "failed", "blocked", "stopped"]);

export interface LoootClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** The three calls the run path needs. Tests pass their own implementation. */
export interface LoootRunner {
  run(endpointId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<LoootRun>;
  getRun(runId: string): Promise<LoootRun>;
}

/** Client for the looot REST API. It never reads the environment; lib/looot/server.ts builds it from LOOOT_TOKEN. */
export class LoootClient implements LoootRunner {
  readonly #token: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(opts: LoootClientOptions) {
    this.#token = opts.token;
    this.#baseUrl = (opts.baseUrl ?? "https://api.looot.ai").replace(/\/+$/, "");
    this.#fetch = opts.fetch ?? fetch;
  }

  async #request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.#token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string; code?: string } } | null)?.error;
      throw new LoootError(err?.message ?? `looot returned HTTP ${res.status}`, res.status, err?.code ?? `http_${res.status}`);
    }
    return json as T;
  }

  /** Paid. Runs one pinned operation and waits up to 60 seconds. The same idempotency key never charges twice. */
  run(endpointId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<LoootRun> {
    return this.#request("POST", "/v1/runs?wait=60", { endpointId, input, idempotencyKey });
  }

  /** Free. Reads a run again. */
  getRun(runId: string): Promise<LoootRun> {
    return this.#request("GET", `/v1/runs/${encodeURIComponent(runId)}`);
  }

  /** Free. The workspace balance, as looot sends it. Read it with parseBalance. */
  balance(): Promise<unknown> {
    return this.#request("GET", "/v1/balance");
  }

  /** Free. Inputs and price of one operation. */
  inspect(endpointId: string): Promise<{ endpoint?: { price?: Record<string, unknown> } }> {
    return this.#request("GET", `/v1/operations/${encodeURIComponent(endpointId)}`);
  }
}

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Reads a balance body into dollars. The path comes from the public looot n8n node; the public API
 * description does not give the body's fields, so this accepts the names looot is known to use
 * and returns null for anything else. A null balance hides the balance chip; it never blocks a run.
 */
export function parseBalance(body: unknown): { availableUsd: number; reservedUsd: number; topUpUrl: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const src = (b.balance && typeof b.balance === "object" ? b.balance : b) as Record<string, unknown>;
  const micros = asNumber(src.availableMicros) ?? asNumber(src.balanceMicros);
  const usd = asNumber(src.available) ?? asNumber(src.availableUsd) ?? asNumber(src.balanceUsd) ?? asNumber(b.balance);
  const available = usd ?? (micros === null ? null : micros / 1_000_000);
  if (available === null) return null;
  const reserved = asNumber(src.reserved) ?? asNumber(src.reservedUsd) ?? (asNumber(src.reservedMicros) ?? 0) / 1_000_000;
  const link = b.topUpUrl ?? b.topUpLink;
  const linkUrl = typeof link === "string" ? link : link && typeof link === "object" ? ((link as Record<string, unknown>).url ?? (link as Record<string, unknown>).dashboard ?? (link as Record<string, unknown>).dashboardUrl) : null;
  return { availableUsd: available, reservedUsd: reserved, topUpUrl: typeof linkUrl === "string" && /^https:\/\//.test(linkUrl) ? linkUrl : null };
}
