/**
 * The budget against a real HTTP server standing in for looot. The client is the app's own
 * LoootClient pointed at a local port with a fake token, so the only fake is the server.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fallbackPrices } from "@/lib/looot/catalog";
import { LoootClient } from "@/lib/looot/client";
import { createQuote, startRun, type QuoteResponse } from "@/lib/looot/service";
import { scheduler, seededStore } from "./helpers";

let server: Server;
let url = "";
const seen: { path: string; key: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const key = body ? ((JSON.parse(body) as { idempotencyKey?: string }).idempotencyKey ?? "") : "";
      seen.push({ path: `${req.method} ${req.url}`, key });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ runId: `fake_${seen.length}`, status: "completed", result: { organic: [] }, actualCost: 0.001 }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("budget against a fake looot server", () => {
  it("makes the HTTP call while the budget fits and refuses with a message once it does not", async () => {
    const client = new LoootClient({ token: "fake-token-for-test", baseUrl: url });
    const { store, project } = await seededStore(1, 10);
    await store.setBudgets(2_500, 50_000_000);
    const out: { status: number; body: unknown }[] = [];
    for (let i = 0; i < 4; i++) {
      const q = (await createQuote(store, { projectId: project.id, action: "check_rankings" }, { price: fallbackPrices, simulated: false })).body as QuoteResponse;
      const sch = scheduler();
      out.push(await startRun(store, { quoteId: q.quoteId, maxCostMicros: q.total, idempotencyKey: `fake-server-run-${i}` }, { client, simulated: false, schedule: sch.schedule }));
      await sch.done();
    }
    const posts = seen.filter((s) => s.path.startsWith("POST /v1/runs"));
    console.log("requests that reached the fake server:", posts.length);
    console.log("refusal shown to the user:", (out[2]!.body as { error: { message: string } }).error.message);
    expect(posts).toHaveLength(2);
    expect(out.map((o) => o.status)).toEqual([201, 201, 422, 422]);
    expect((out[2]!.body as { error: { message: string } }).error.message).toBe("The daily budget of $0.0025 cannot cover this run ($0.001): $0.002 spent, $0.00 held for runs in progress, $0.0005 left. No call was made. Change the budget in Settings.");
  });
});
