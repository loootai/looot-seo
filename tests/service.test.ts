import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRunner } from "@/lib/demo/fakeProvider";
import { buildDemoStore } from "@/lib/demo/store";
import { fallbackPrices } from "@/lib/looot/catalog";
import { cancelRun, createQuote, QUOTE_TTL_MS, readRun, startRun, type QuoteResponse } from "@/lib/looot/service";
import { mockRunner, scheduler, seededStore } from "./helpers";

const quoteOf = (r: { body: unknown }) => r.body as QuoteResponse;
const runOf = (r: { body: unknown }) => r.body as { runId: string; replayed: boolean };
const errorOf = (r: { body: unknown }) => (r.body as { error: { code: string } }).error.code;

async function quoted(count = 3, depth: 10 | 30 = 10) {
  const s = await seededStore(count, depth);
  const q = await createQuote(s.store, { projectId: s.project.id, action: "check_rankings" }, { price: fallbackPrices, simulated: false });
  return { ...s, quote: quoteOf(q) };
}

afterEach(() => vi.unstubAllGlobals());

describe("quote, then run", () => {
  it("prices a rank check as keywords x pages x price and stores the quote", async () => {
    const { quote, store } = await quoted(42, 30);
    expect(quote.total).toBe(126_000);
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0]).toMatchObject({ calls: 126, unitPriceMicros: 1000, subtotalMicros: 126_000, operationId: "serper-search" });
    expect((await store.getQuote(quote.quoteId))?.items).toHaveLength(126);
  });

  it("answers 400 without a quoteId: there is no way to run without a quote", async () => {
    const { store } = await seededStore();
    const r = await startRun(store, { maxCostMicros: 1000, idempotencyKey: "abcdefgh" }, { client: mockRunner(), simulated: false, schedule: () => undefined });
    expect(r.status).toBe(400);
    expect(errorOf(r)).toBe("quote_required");
  });

  it("answers 422 when the cap is above the quote total", async () => {
    const { store, quote } = await quoted();
    const client = mockRunner();
    const r = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total + 1, idempotencyKey: "key-above-cap" }, { client, simulated: false, schedule: () => undefined });
    expect(r.status).toBe(422);
    expect(errorOf(r)).toBe("cap_above_quote");
    expect(client.calls).toHaveLength(0);
    expect(await store.listRuns(null)).toHaveLength(0);
  });

  it("answers 409 for a quote older than 10 minutes", async () => {
    const { store, quote } = await quoted();
    const r = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "key-expired" }, { client: mockRunner(), simulated: false, schedule: () => undefined, clock: () => Date.now() + QUOTE_TTL_MS + 1000 });
    expect(r.status).toBe(409);
    expect(errorOf(r)).toBe("quote_expired");
  });

  it("answers 409 when a quote is used a second time", async () => {
    const { store, quote } = await quoted();
    const s = scheduler();
    const deps = { client: mockRunner(), simulated: false, schedule: s.schedule };
    expect((await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "key-first" }, deps)).status).toBe(201);
    const again = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "key-second" }, deps);
    expect(again.status).toBe(409);
    expect(errorOf(again)).toBe("quote_used");
    await s.done();
  });

  it("returns the first run for a repeated idempotency key and creates one row", async () => {
    const { store, quote } = await quoted();
    const s = scheduler();
    const client = mockRunner();
    const body = { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "same-key-1234" };
    const a = await startRun(store, body, { client, simulated: false, schedule: s.schedule });
    const b = await startRun(store, body, { client, simulated: false, schedule: s.schedule });
    await s.done();
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(runOf(b)).toEqual({ runId: runOf(a).runId, replayed: true });
    expect(await store.listRuns(null)).toHaveLength(1);
    expect(client.calls).toHaveLength(3);
  });

  it("answers 503 with no token and never marks the quote used", async () => {
    const { store, quote } = await quoted();
    const r = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "key-no-token" }, { client: null, simulated: false, schedule: () => undefined });
    expect(r.status).toBe(503);
    expect((await store.getQuote(quote.quoteId))?.used_at).toBeNull();
  });

  it("runs under the cap, stores a rank check and a snapshot per keyword, and closes the run", async () => {
    const { store, quote, keywords } = await quoted(3);
    const s = scheduler();
    const client = mockRunner();
    const started = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "full-flow-key" }, { client, simulated: false, schedule: s.schedule });
    await s.done();
    const runId = runOf(started).runId;
    expect(client.calls.map((c) => c.idempotencyKey).sort()).toEqual(keywords.map((k) => `${runId}:kw:${k.id}:p1`).sort());
    const view = await readRun(store, runId);
    expect(view?.run).toMatchObject({ status: "completed", items_done: 3, actual_cost_micros: 3000, max_cost_micros: 3000, simulated: false });
    expect(view?.run.actual_cost_micros).toBeLessThanOrEqual(view!.run.max_cost_micros);
    const checks = await store.listRankChecks(keywords[0]!.project_id);
    expect(checks).toHaveLength(3);
    // The fixture has kestrelcoffee.co at position 2 and a second URL at 4.
    expect(checks[0]).toMatchObject({ position: 2, depth: 10, other_urls: ["https://kestrelcoffee.co/journal/choosing-a-subscription"] });
    expect(checks[0]?.features.answer_box).toEqual({ present: true, owned: true });
    const snap = await store.getSnapshot(checks[0]!.snapshot_id!);
    expect(snap?.parse_ok).toBe(true);
    expect(snap?.people_also_ask).toHaveLength(2);
  });

  it("with a lowered cap makes only the calls that fit and ends partial", async () => {
    const { store, quote } = await quoted(42, 10);
    const s = scheduler();
    const client = mockRunner();
    const started = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: 10_000, idempotencyKey: "lowered-cap-key" }, { client, simulated: false, schedule: s.schedule });
    await s.done();
    const view = await readRun(store, runOf(started).runId);
    expect(client.calls).toHaveLength(10);
    expect(view?.counts).toMatchObject({ completed: 10, skipped: 32, failed: 0 });
    expect(view?.run).toMatchObject({ status: "partial", actual_cost_micros: 10_000 });
  });

  it("records a failed call at $0 with the provider error code, then retries it with the same key", async () => {
    const { store, quote, project } = await quoted(3);
    const s = scheduler();
    const client = mockRunner((_c, n) => (n === 2 ? { status: "failed", error: { code: "provider_timeout", message: "Timed out." } } : {}));
    const started = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "with-a-failure" }, { client, simulated: false, schedule: s.schedule, pollIntervalMs: 1 });
    await s.done();
    const runId = runOf(started).runId;
    const view = await readRun(store, runId);
    expect(view?.run).toMatchObject({ status: "partial", actual_cost_micros: 2000 });
    expect(view?.failures).toHaveLength(1);
    expect(view?.failures[0]?.errorCode).toBe("provider_timeout");
    const failedItem = (await store.listRunItems(runId)).find((i) => i.status === "failed");
    expect(failedItem?.actual_cost_micros).toBe(0);
    const firstKey = client.calls[1]!.idempotencyKey;

    const retryQuote = quoteOf(await createQuote(store, { projectId: project.id, action: "retry_failed", scope: { runId } }, { price: fallbackPrices, simulated: false }));
    expect(retryQuote.total).toBe(1000);
    const retryClient = mockRunner();
    const s2 = scheduler();
    await startRun(store, { quoteId: retryQuote.quoteId, maxCostMicros: retryQuote.total, idempotencyKey: "retry-of-failure" }, { client: retryClient, simulated: false, schedule: s2.schedule });
    await s2.done();
    expect(retryClient.calls.map((c) => c.idempotencyKey)).toEqual([firstKey]);
    expect(await store.listRankChecks(project.id)).toHaveLength(3);
  });

  it("keeps an unreadable body as a charged call with parse_ok false, not a failure", async () => {
    const { store, quote, project } = await quoted(1);
    const s = scheduler();
    const started = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "unreadable-body" }, { client: mockRunner(() => ({ result: { html: "<html>blocked</html>" } })), simulated: false, schedule: s.schedule });
    await s.done();
    const view = await readRun(store, runOf(started).runId);
    expect(view?.counts).toMatchObject({ completed: 1, failed: 0, unreadable: 1 });
    expect(view?.run.actual_cost_micros).toBe(1000);
    const lite = await store.listKeywordSnapshots((await store.listKeywords(project.id))[0]!.id);
    const snap = await store.getSnapshot(lite[0]!.id);
    expect(snap).toMatchObject({ parse_ok: false, organic: [], raw: { html: "<html>blocked</html>" } });
    expect(await store.listRankChecks(project.id)).toHaveLength(0);
  });

  it("lets the user untick an optional line, and the cap follows the smaller total", async () => {
    const { store, project } = await seededStore(2);
    const q = quoteOf(await createQuote(store, { projectId: project.id, action: "backlinks" }, { price: fallbackPrices, simulated: false }));
    expect(q.total).toBe(72_000);
    const s = scheduler();
    const client = mockRunner(() => ({ result: {} }));
    const tooHigh = await startRun(store, { quoteId: q.quoteId, maxCostMicros: 72_000, idempotencyKey: "untick-too-high", disabledLines: ["domains", "newlost"] }, { client, simulated: false, schedule: s.schedule });
    expect(tooHigh.status).toBe(422);
    const ok = await startRun(store, { quoteId: q.quoteId, maxCostMicros: 24_000, idempotencyKey: "untick-fits", disabledLines: ["domains", "newlost"] }, { client, simulated: false, schedule: s.schedule });
    await s.done();
    expect(ok.status).toBe(201);
    expect(client.calls.map((c) => c.endpointId)).toEqual(["dataforseo-backlinks-summary-live-ai"]);
  });

  it("cancels a running run only", async () => {
    const { store, quote } = await quoted(2);
    const s = scheduler();
    const started = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "cancel-me-key" }, { client: mockRunner(), simulated: false, schedule: s.schedule });
    await s.done();
    expect(await cancelRun(store, runOf(started).runId)).toBe(false);
    expect(await cancelRun(store, "missing")).toBe(false);
  });
});

describe("demo mode", () => {
  it("quotes the Kestrel check from the fallback table and simulates it without any network request", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("demo mode must not use the network");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const store = buildDemoStore();
    const project = (await store.getProject("kestrel"))!;
    const q = quoteOf(await createQuote(store, { projectId: "kestrel", action: "check_rankings" }, { price: fallbackPrices, simulated: true }));
    expect(q.simulated).toBe(true);
    expect(q.lines[0]).toMatchObject({ key: "rank", calls: 126, unitPriceMicros: 1000, subtotalMicros: 126_000 });
    expect(q.lines[1]).toMatchObject({ key: "aio", calls: 10, unitPriceMicros: 4600, optional: true });
    expect(q.total).toBe(172_000);
    const s = scheduler();
    const started = await startRun(store, { quoteId: q.quoteId, maxCostMicros: q.total, idempotencyKey: "demo-simulated-run" }, { client: fakeRunner(project, 126), simulated: true, schedule: s.schedule });
    await s.done();
    const view = await readRun(store, runOf(started).runId);
    expect(view?.run).toMatchObject({ status: "completed", simulated: true, items_done: 126, actual_cost_micros: 172_000 });
    expect(view?.counts.unreadable).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 20_000);
  it("counts only the calls that were sent when the cap holds the rest back", async () => {
    const { store, quote } = await quoted(42, 10);
    const s = scheduler();
    const started = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: 10_000, idempotencyKey: "capped-run-count" }, { client: mockRunner(), simulated: false, schedule: s.schedule });
    await s.done();
    const view = await readRun(store, runOf(started).runId);
    expect(view?.run).toMatchObject({ status: "partial", items_total: 42, items_done: 10, actual_cost_micros: 10_000 });
    expect(view?.counts).toMatchObject({ completed: 10, skipped: 32 });
  });

  it("a simulated backlink refresh keeps the project's own referring domains", async () => {
    const store = buildDemoStore();
    const project = (await store.getProject("kestrel"))!;
    const before = (await store.listBacklinkSnapshots("kestrel")).find((b) => b.domain === project.domain)!;
    const q = quoteOf(await createQuote(store, { projectId: "kestrel", action: "backlinks" }, { price: fallbackPrices, simulated: true }));
    expect(q.total).toBe(72_000);
    const s = scheduler();
    await startRun(store, { quoteId: q.quoteId, maxCostMicros: q.total, idempotencyKey: "demo-backlinks-run" }, { client: fakeRunner(project, 3), simulated: true, schedule: s.schedule });
    await s.done();
    const after = (await store.listBacklinkSnapshots("kestrel")).find((b) => b.domain === project.domain)!;
    expect(after.id).not.toBe(before.id);
    expect(after.top_domains?.length).toBe(100);
    expect(after.top_domains?.map((d) => d.domain).slice(0, 5)).toEqual(before.top_domains?.map((d) => d.domain).slice(0, 5));
    expect(after.top_domains?.some((d) => d.domain.endsWith(".uk"))).toBe(false);
    expect(after.referring_domains).toBe(418);
    expect(after.domain_rank).toBe(before.domain_rank);
    expect(after.top_domains?.[0]).toMatchObject({ domain: before.top_domains?.[0]?.domain, rank: before.top_domains?.[0]?.rank, backlinks: before.top_domains?.[0]?.backlinks });
    expect(after.new_lost).toHaveLength(12);
  });
});
