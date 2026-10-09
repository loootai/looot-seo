import { describe, expect, it } from "vitest";
import { executeRun, idempotencyKeyFor } from "@/lib/looot/run";
import { LoootError } from "@/lib/looot/client";
import { mockRunner, serpItems } from "./helpers";

const noSleep = async () => undefined;

describe("executeRun, the cost guard", () => {
  it("stops at the cap: $0.010 over 42 calls at $0.001 makes exactly 10 calls", async () => {
    const client = mockRunner();
    const r = await executeRun({ runId: "run-a", items: serpItems(42), maxCostMicros: 10_000, client });
    expect(client.calls).toHaveLength(10);
    expect(r.outcomes.filter((o) => o.status === "completed")).toHaveLength(10);
    expect(r.outcomes.filter((o) => o.status === "skipped_budget")).toHaveLength(32);
    expect(r.status).toBe("partial");
    expect(r.spentMicros).toBe(10_000);
  });

  it("never passes the cap at any concurrency", async () => {
    for (const concurrency of [1, 2, 4, 8, 16]) {
      const client = mockRunner(async () => (await new Promise((res) => setTimeout(res, Math.random() * 3)), {}));
      const r = await executeRun({ runId: "run-b", items: serpItems(40), maxCostMicros: 7_500, client, concurrency });
      expect(r.spentMicros).toBeLessThanOrEqual(7_500);
      expect(client.calls).toHaveLength(7);
    }
  });

  it("sends runId:itemKey as the idempotency key of every call", async () => {
    const client = mockRunner();
    await executeRun({ runId: "run-c", items: serpItems(5), maxCostMicros: 5_000, client });
    expect(client.calls.map((c) => c.idempotencyKey).sort()).toEqual([1, 2, 3, 4, 5].map((n) => `run-c:kw:k${n}:p1`));
  });

  it("keeps the key of the first attempt on a retry", () => {
    const [item] = serpItems(1);
    expect(idempotencyKeyFor("run-new", { ...item!, idempotencyKey: "run-old:kw:k1:p1" })).toBe("run-old:kw:k1:p1");
    expect(idempotencyKeyFor("run-new", item!)).toBe("run-new:kw:k1:p1");
  });

  it("charges nothing for a failed call and keeps its error code", async () => {
    const client = mockRunner((_c, n) => (n === 2 ? { status: "failed", actualCost: 0.001, error: { code: "provider_timeout", message: "The provider took too long." } } : {}));
    const r = await executeRun({ runId: "run-d", items: serpItems(3), maxCostMicros: 3_000, client, concurrency: 1 });
    const failed = r.outcomes.find((o) => o.status === "failed");
    expect(failed?.costMicros).toBe(0);
    expect(failed?.errorCode).toBe("provider_timeout");
    expect(r.spentMicros).toBe(2_000);
    expect(r.status).toBe("partial");
  });

  it("treats a thrown request as a failed call at $0, with looot's code", async () => {
    const client = mockRunner(() => {
      throw new LoootError("Balance too low", 402, "insufficient_balance");
    });
    const r = await executeRun({ runId: "run-e", items: serpItems(2), maxCostMicros: 2_000, client });
    expect(r.status).toBe("failed");
    expect(r.spentMicros).toBe(0);
    expect(r.outcomes.every((o) => o.errorCode === "insufficient_balance")).toBe(true);
  });

  it("budgets with the higher of the quoted and the live price", async () => {
    const client = mockRunner(() => ({ actualCost: 0.002 }));
    const r = await executeRun({ runId: "run-f", items: serpItems(10), maxCostMicros: 10_000, client, livePrice: () => 2000 });
    expect(client.calls).toHaveLength(5);
    expect(r.spentMicros).toBe(10_000);
  });

  it("stops scheduling when a provider reports a charge above its price", async () => {
    const client = mockRunner((_c, n) => (n === 1 ? { actualCost: 0.005 } : {}));
    const r = await executeRun({ runId: "run-g", items: serpItems(10), maxCostMicros: 10_000, client, concurrency: 1 });
    expect(client.calls).toHaveLength(1);
    expect(r.outcomes.filter((o) => o.status === "skipped_budget")).toHaveLength(9);
  });

  it("polls a call that is still running, and times out with the price kept reserved", async () => {
    const client = mockRunner(() => ({ status: "running", actualCost: null, result: undefined }));
    const ok = await executeRun({ runId: "run-h", items: serpItems(1), maxCostMicros: 1_000, client, sleep: noSleep, pollIntervalMs: 1 });
    expect(client.polls).toEqual(["run_1"]);
    expect(ok.outcomes[0]?.status).toBe("completed");

    const stuck = mockRunner(() => ({ status: "running" }));
    stuck.getRun = async (runId) => ({ runId, status: "running" });
    const r = await executeRun({ runId: "run-i", items: serpItems(3), maxCostMicros: 2_000, client: stuck, sleep: noSleep, pollIntervalMs: 1, pollTimeoutMs: 5, concurrency: 1 });
    expect(r.outcomes.filter((o) => o.status === "timed_out")).toHaveLength(2);
    // Two timed-out calls hold $0.002 of the cap, so the third is never sent.
    expect(stuck.calls).toHaveLength(2);
    expect(r.outcomes[2]?.status).toBe("skipped_budget");
  });

  it("stops sending calls after a cancel and keeps what finished", async () => {
    const client = mockRunner();
    let cancelled = false;
    const r = await executeRun({ runId: "run-j", items: serpItems(6), maxCostMicros: 6_000, client, concurrency: 1, isCancelled: () => cancelled, onItem: (_o, p) => void (cancelled = p.done >= 2) });
    expect(r.status).toBe("cancelled");
    expect(r.outcomes.filter((o) => o.status === "completed").length).toBeLessThanOrEqual(3);
    expect(r.spentMicros).toBeLessThan(6_000);
  });

  it("does not charge for a replayed call", async () => {
    const client = mockRunner(() => ({ actualCost: 0.001, replayed: true }) as never);
    const r = await executeRun({ runId: "run-k", items: serpItems(2), maxCostMicros: 2_000, client });
    expect(r.spentMicros).toBe(0);
    expect(r.status).toBe("completed");
  });
});
