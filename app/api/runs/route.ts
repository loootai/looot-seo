import { after, NextResponse } from "next/server";
import { getStore } from "@/lib/data";
import { fakeRunner } from "@/lib/demo/fakeProvider";
import { IS_DEMO } from "@/lib/env";
import { CATALOG } from "@/lib/looot/catalog";
import type { LoootRunner } from "@/lib/looot/client";
import { livePrices, loootFromEnv } from "@/lib/looot/server";
import { startRun } from "@/lib/looot/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Starts a run from a stored quote. The calls go out after the response, under the cap in the request. */
export async function POST(request: Request) {
  let body: { quoteId?: unknown } & Record<string, unknown>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "bad_request", message: "The request body is not JSON." } }, { status: 400 });
  }
  try {
    const store = await getStore();
    let client: LoootRunner | null = null;
    let livePrice: ((op: string) => number | undefined) | undefined;
    if (IS_DEMO) {
      // Demo mode never builds the real client. The runner below answers from seeded data inside this process.
      const quote = typeof body.quoteId === "string" ? await store.getQuote(body.quoteId) : null;
      const project = quote ? await store.getProject(quote.project_id) : null;
      if (quote && project) client = fakeRunner(project, quote.items.length);
    } else {
      client = loootFromEnv();
      if (client) {
        const live = await livePrices(CATALOG.map((c) => c.operationId));
        livePrice = (op) => live.get(op);
      }
    }
    const result = await startRun(store, body, { client, simulated: IS_DEMO, livePrice, schedule: (work) => after(work) });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("looot-seo: run start failed", e);
    return NextResponse.json({ error: { code: "run_failed", message: "The run could not be started. Nothing was charged." } }, { status: 500 });
  }
}
