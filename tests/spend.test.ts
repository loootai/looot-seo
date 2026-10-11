import { describe, expect, it } from "vitest";
import { budgetRefusal, overBudget, windowOf } from "@/lib/looot/budget";
import { fallbackPrices } from "@/lib/looot/catalog";
import type { LoootRun, LoootRunner } from "@/lib/looot/client";
import { reconcileReservations } from "@/lib/looot/reservations";
import { createQuote, readRun, startRun, type QuoteResponse } from "@/lib/looot/service";
import type { MemoryStore } from "@/lib/data/memory";
import { mockRunner, scheduler, seededStore } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const quoteOf = (r: { body: unknown }) => r.body as QuoteResponse;
const runOf = (r: { body: unknown }) => r.body as { runId: string; replayed: boolean };
const errorOf = (r: { body: unknown }) => (r.body as { error: { code: string; message: string } }).error;
const stuck = () => {
  const c = mockRunner(() => ({ status: "running", actualCost: null, result: undefined }));
  c.getRun = async (runId) => ({ runId, status: "running" });
  return c;
};
const deps = (client: LoootRunner | null, schedule: (w: () => Promise<void>) => void) => ({ client, simulated: false, schedule, sleep: async () => undefined, pollIntervalMs: 1, pollTimeoutMs: 5 });

/** A store with `keywords` keywords and the given budgets. One quote per call costs keywords x $0.001. */
async function setup(budgets: { daily: number; monthly?: number }, keywords = 1) {
  const s = await seededStore(keywords, 10);
  await s.store.setBudgets(budgets.daily, budgets.monthly ?? 50_000_000);
  const quote = async () => quoteOf(await createQuote(s.store, { projectId: s.project.id, action: "check_rankings" }, { price: fallbackPrices, simulated: false }));
  return { ...s, quote };
}
const go = async (store: MemoryStore, q: QuoteResponse, key: string, client: LoootRunner, extra: Record<string, unknown> = {}) => {
  const sch = scheduler();
  const r = await startRun(store, { quoteId: q.quoteId, maxCostMicros: q.total, idempotencyKey: key, ...extra }, deps(client, sch.schedule));
  await sch.done();
  return r;
};
const daily = async (store: MemoryStore) => (await store.budgetStatus(new Date())).daily;

describe("period budget", () => {
  it("two simultaneous runs that together pass the daily budget: exactly one calls looot", async () => {
    const { store, quote } = await setup({ daily: 4_000 }, 3);
    const [q1, q2] = [await quote(), await quote()];
    const client = mockRunner();
    const sch = scheduler();
    const [a, b] = await Promise.all([
      startRun(store, { quoteId: q1.quoteId, maxCostMicros: q1.total, idempotencyKey: "race-key-one" }, deps(client, sch.schedule)),
      startRun(store, { quoteId: q2.quoteId, maxCostMicros: q2.total, idempotencyKey: "race-key-two" }, deps(client, sch.schedule)),
    ]);
    await sch.done();
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    expect(client.calls).toHaveLength(3);
    expect((await daily(store)).spentMicros).toBe(3_000);
  });

  it("many small runs stop at the budget", async () => {
    const { store, quote } = await setup({ daily: 5_000 });
    const client = mockRunner();
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await go(store, await quote(), `small-run-${i}`, client));
    expect(client.calls).toHaveLength(5);
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 422)).toHaveLength(3);
    const d = await daily(store);
    expect(d.spentMicros).toBe(5_000);
    expect(d.spentMicros + d.reservedMicros).toBeLessThanOrEqual(5_000);
  });

  it("refuses at the monthly budget and names it, with used, held and left", async () => {
    const { store, quote } = await setup({ daily: 50_000_000, monthly: 1_500 });
    const client = mockRunner();
    expect((await go(store, await quote(), "month-run-1", client)).status).toBe(201);
    const refused = await go(store, await quote(), "month-run-2", client);
    expect(refused.status).toBe(422);
    expect(errorOf(refused).code).toBe("budget_reached");
    expect(errorOf(refused).message).toBe("The monthly budget of $0.0015 cannot cover this run ($0.001): $0.001 spent, $0.00 held for runs in progress, $0.0005 left. No call was made. Change the budget in Settings.");
    expect(client.calls).toHaveLength(1);
  });

  it("holds the run's cap while it runs and settles to the real cost", async () => {
    const { store, quote } = await setup({ daily: 10_000 }, 3);
    const q = await quote();
    const client = mockRunner(() => ({ actualCost: 0.0004 }));
    const sch = scheduler();
    await startRun(store, { quoteId: q.quoteId, maxCostMicros: q.total, idempotencyKey: "settle-key-1" }, deps(client, sch.schedule));
    expect((await daily(store)).reservedMicros).toBe(3_000);
    await sch.done();
    const d = await daily(store);
    expect(d).toMatchObject({ spentMicros: 1_200, reservedMicros: 0 });
  });

  it("a pending run keeps its reservation and is not written as failed", async () => {
    const { store, quote } = await setup({ daily: 1_500 });
    const client = stuck();
    const first = await go(store, await quote(), "pending-run-1", client);
    const view = await readRun(store, runOf(first).runId);
    expect(view?.run.status).not.toBe("failed");
    expect(view?.counts.failed).toBe(0);
    expect(await daily(store)).toMatchObject({ reservedMicros: 1_000, spentMicros: 0, remainingMicros: 500 });
    const second = await go(store, await quote(), "pending-run-2", client);
    expect(second.status).toBe(422);
    expect(client.calls).toHaveLength(1);
  });

  it("a failed run releases its reservation", async () => {
    const { store, quote } = await setup({ daily: 5_000 }, 2);
    const client = mockRunner(() => ({ status: "failed", actualCost: 0, error: { code: "provider_error", message: "no" } }));
    await go(store, await quote(), "failed-run-1", client);
    expect(await daily(store)).toMatchObject({ reservedMicros: 0, spentMicros: 0, remainingMicros: 5_000 });
  });

  it("a refused quote does not leave a reservation behind", async () => {
    const { store, quote } = await setup({ daily: 5_000 });
    const q = await quote();
    const client = mockRunner();
    await store.markQuoteUsed(q.quoteId);
    const r = await go(store, q, "used-quote-1", client);
    expect(r.status).toBe(409);
    expect(await daily(store)).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
  });

  it("a late completion settles to the real cost when the reservation is reconciled", async () => {
    const { store, quote } = await setup({ daily: 5_000 }, 2);
    const q = await quote();
    const first = await go(store, q, "late-run-1", stuck());
    const runId = runOf(first).runId;
    expect((await daily(store)).reservedMicros).toBe(2_000);
    const late: LoootRunner = { run: async () => Promise.reject(new Error("no new calls")), getRun: async (id): Promise<LoootRun> => ({ runId: id, status: "completed", actualCost: 0.0007, result: {} }) };
    // Before the soft expiry nothing is touched.
    expect(await reconcileReservations({ store, client: late, now: new Date() })).toMatchObject({ settled: 0, kept: 0 });
    const out = await reconcileReservations({ store, client: late, now: new Date(Date.now() + 20 * 60_000) });
    expect(out.settled).toBe(1);
    expect(await daily(store)).toMatchObject({ reservedMicros: 0, spentMicros: 1_400 });
    const view = await readRun(store, runId);
    expect(view?.run).toMatchObject({ status: "completed", actual_cost_micros: 1_400 });
  });

  it("an expired reservation whose run is still pending stays held until the hard expiry, then is released", async () => {
    const { store, quote } = await setup({ daily: 5_000 });
    await go(store, await quote(), "expire-run-1", stuck());
    const still: LoootRunner = { run: async () => Promise.reject(new Error("no")), getRun: async (id) => ({ runId: id, status: "running" }) };
    const soft = await reconcileReservations({ store, client: still, now: new Date(Date.now() + 30 * 60_000) });
    expect(soft).toMatchObject({ kept: 1, released: 0 });
    expect((await daily(store)).reservedMicros).toBe(1_000);
    const hard = await reconcileReservations({ store, client: still, now: new Date(Date.now() + 2 * DAY) });
    expect(hard.released).toBe(1);
    expect((await daily(store)).reservedMicros).toBe(0);
  });

  it("an expired reservation that cannot be fetched stays held until the hard expiry", async () => {
    const { store, quote } = await setup({ daily: 5_000 });
    await go(store, await quote(), "expire-run-2", stuck());
    const down: LoootRunner = { run: async () => Promise.reject(new Error("no")), getRun: async () => Promise.reject(new Error("offline")) };
    expect((await reconcileReservations({ store, client: down, now: new Date(Date.now() + 30 * 60_000) })).kept).toBe(1);
    expect((await reconcileReservations({ store, client: null, now: new Date(Date.now() + 2 * DAY) })).released).toBe(1);
  });

  it("a crashed process leaves a running run; its reservation is reconciled after the soft expiry", async () => {
    const { store, project } = await setup({ daily: 5_000 });
    // The process died after the run row was written and before any call finished.
    expect((await store.reserveBudget({ key: "crash-run-1", amountMicros: 1_000, now: new Date() })).ok).toBe(true);
    await store.insertRun({ project_id: project.id, quote_id: null, action: "check_rankings", idempotency_key: "crash-run-1", items_total: 1, quoted_micros: 1_000, max_cost_micros: 1_000, simulated: false }, [
      { itemKey: "kw:x:p1", lineKey: "rank", group: "kw:x", operationId: "serper-search", input: {}, unitPriceMicros: 1_000 },
    ]);
    const client = mockRunner();
    expect((await reconcileReservations({ store, client, now: new Date(Date.now() + 30 * 60_000) })).kept).toBe(1);
    expect((await daily(store)).reservedMicros).toBe(1_000);
    expect((await reconcileReservations({ store, client, now: new Date(Date.now() + 2 * DAY) })).released).toBe(1);
    expect(await daily(store)).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
  });

  it("the caller cannot raise the budget: budget fields in the run request are ignored", async () => {
    const { store, quote } = await setup({ daily: 1_000 });
    const client = mockRunner();
    expect((await go(store, await quote(), "raise-run-1", client)).status).toBe(201);
    const second = await go(store, await quote(), "raise-run-2", client, { dailyBudgetMicros: 9e12, monthlyBudgetMicros: 9e12, budget: { daily: 9e12 }, daily_budget_micros: 9e12 });
    expect(second.status).toBe(422);
    expect(client.calls).toHaveLength(1);
    expect((await daily(store)).budgetMicros).toBe(1_000);
  });

  it("a repeated identical request is not charged twice", async () => {
    const { store, quote } = await setup({ daily: 10_000 }, 3);
    const q = await quote();
    const client = mockRunner();
    const a = await go(store, q, "same-run-key-1", client);
    const b = await go(store, q, "same-run-key-1", client);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(runOf(b).replayed).toBe(true);
    expect(client.calls).toHaveLength(3);
    expect((await daily(store)).spentMicros).toBe(3_000);
  });

  it("the same key cannot be reserved twice", async () => {
    const { store } = await setup({ daily: 10_000 });
    expect((await store.reserveBudget({ key: "dup-key-1234", amountMicros: 1_000, now: new Date() })).ok).toBe(true);
    expect(await store.reserveBudget({ key: "dup-key-1234", amountMicros: 1_000, now: new Date() })).toEqual({ ok: false, reason: "duplicate" });
    expect((await daily(store)).reservedMicros).toBe(1_000);
  });

  it("deleting a project does not reset the spend", async () => {
    const { store, quote, project } = await setup({ daily: 5_000 });
    await go(store, await quote(), "wipe-run-1", mockRunner());
    await store.deleteProject(project.id);
    expect((await daily(store)).spentMicros).toBe(1_000);
  });

  it("a day that rolled over does not count against the daily budget, but counts for the month", async () => {
    const { store } = await setup({ daily: 1_000, monthly: 10_000 });
    const yesterday = new Date(Date.now() - DAY);
    const early = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 1));
    await store.reserveBudget({ key: "old-run-1234", amountMicros: 900, now: early });
    await store.settleReservation("old-run-1234", 900, early);
    const now = new Date();
    const s = await store.budgetStatus(now);
    expect(s.daily.spentMicros).toBe(0);
    // On the first of the month "yesterday" is last month, so the month check only applies after that.
    if (now.getUTCDate() > 1) expect(s.monthly.spentMicros).toBe(900);
  });
});

describe("budget rule", () => {
  const base = { dailyBudgetMicros: 1000, monthlyBudgetMicros: 5000, spentDayMicros: 0, spentMonthMicros: 0, reservedMicros: 0, amountMicros: 400 };
  it("fits up to the budget exactly and refuses one micro above", () => {
    expect(overBudget({ ...base, spentDayMicros: 600 })).toBeNull();
    expect(overBudget({ ...base, spentDayMicros: 601 })).toBe("daily");
    expect(overBudget({ ...base, dailyBudgetMicros: 9e9, spentMonthMicros: 4601 })).toBe("monthly");
  });
  it("counts held amounts like spent ones", () => {
    expect(overBudget({ ...base, reservedMicros: 700 })).toBe("daily");
  });
  it("the refusal names the period and the numbers", () => {
    const b = { daily: windowOf(1000, 300, 500), monthly: windowOf(5000, 300, 500) };
    expect(budgetRefusal("daily", b, 400)).toContain("The daily budget of $0.001 cannot cover this run ($0.0004): $0.0003 spent, $0.0005 held for runs in progress, $0.0002 left.");
  });
});
