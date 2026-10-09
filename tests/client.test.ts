import { describe, expect, it, vi } from "vitest";
import { LoootClient, LoootError, parseBalance } from "@/lib/looot/client";
import { readInspectPrice } from "@/lib/looot/server";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("LoootClient", () => {
  it("posts a run with the bearer token, the operation id, the input and the idempotency key", async () => {
    const f = fakeFetch(200, { runId: "run_1", status: "completed", result: { organic: [] }, actualCost: 0.001 });
    const client = new LoootClient({ token: "lt_test_token", fetch: f as unknown as typeof fetch });
    const run = await client.run("serper-search", { q: "coffee", gl: "us" }, "r1:kw:1:p1");
    expect(run.status).toBe("completed");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.looot.ai/v1/runs?wait=60");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer lt_test_token");
    expect(JSON.parse(String(init?.body))).toEqual({ endpointId: "serper-search", input: { q: "coffee", gl: "us" }, idempotencyKey: "r1:kw:1:p1" });
  });

  it("reads a run, the balance and an operation from their paths", async () => {
    const f = fakeFetch(200, {});
    const client = new LoootClient({ token: "t", baseUrl: "https://example.test/", fetch: f as unknown as typeof fetch });
    await client.getRun("run 1");
    await client.balance();
    await client.inspect("serper-search");
    expect(f.mock.calls.map((c) => c[0])).toEqual(["https://example.test/v1/runs/run%201", "https://example.test/v1/balance", "https://example.test/v1/operations/serper-search"]);
    expect(f.mock.calls.every((c) => c[1]?.method === "GET" && c[1]?.body === undefined)).toBe(true);
  });

  it("turns an HTTP error into a LoootError with looot's code", async () => {
    const client = new LoootClient({ token: "t", fetch: fakeFetch(402, { error: { code: "insufficient_balance", message: "Top up first." } }) as unknown as typeof fetch });
    await expect(client.run("serper-search", {}, "k")).rejects.toMatchObject({ name: "LoootError", status: 402, code: "insufficient_balance", message: "Top up first." });
    const plain = new LoootClient({ token: "t", fetch: (async () => new Response("bad gateway", { status: 502 })) as unknown as typeof fetch });
    const err = await plain.getRun("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoootError);
    expect((err as LoootError).code).toBe("http_502");
  });
});

describe("parseBalance", () => {
  it("reads dollars, numeric strings, micros and a nested balance", () => {
    expect(parseBalance({ available: 18.42, reserved: 0.5 })).toEqual({ availableUsd: 18.42, reservedUsd: 0.5, topUpUrl: null });
    expect(parseBalance({ available: "18.42" })?.availableUsd).toBe(18.42);
    expect(parseBalance({ availableMicros: 18_420_000 })?.availableUsd).toBe(18.42);
    expect(parseBalance({ balance: { availableUsd: 3 }, topUpLink: { url: "https://looot.ai/billing" } })).toEqual({ availableUsd: 3, reservedUsd: 0, topUpUrl: "https://looot.ai/billing" });
  });
  it("returns null for a body it does not know, and drops a link that is not https", () => {
    expect(parseBalance({ credits: 12 })).toBeNull();
    expect(parseBalance(null)).toBeNull();
    expect(parseBalance("18.42")).toBeNull();
    expect(parseBalance({ available: 1, topUpUrl: "javascript:alert(1)" })?.topUpUrl).toBeNull();
  });
});

describe("readInspectPrice", () => {
  it("reads micros first, then dollar fields, else null", () => {
    expect(readInspectPrice({ amountMicros: 1000 })).toBe(1000);
    expect(readInspectPrice({ amountUsd: 0.0056 })).toBe(5600);
    expect(readInspectPrice({ state: "unknown" })).toBeNull();
    expect(readInspectPrice(undefined)).toBeNull();
  });
});
