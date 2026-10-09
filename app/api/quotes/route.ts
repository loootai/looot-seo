import { NextResponse } from "next/server";
import { getStore } from "@/lib/data";
import { IS_DEMO } from "@/lib/env";
import { CATALOG, fallbackPrice, fallbackPrices, type PriceSource } from "@/lib/looot/catalog";
import { livePrices, readBalance } from "@/lib/looot/server";
import { createQuote } from "@/lib/looot/service";

export const dynamic = "force-dynamic";

/** Prices an action and stores the quote. Free: it reads prices and the balance, and runs nothing. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "bad_request", message: "The request body is not JSON." } }, { status: 400 });
  }
  try {
    const store = await getStore();
    let price: PriceSource = fallbackPrices;
    let balanceMicros: number | null = null;
    if (!IS_DEMO) {
      const [live, balance] = await Promise.all([livePrices(CATALOG.map((c) => c.operationId)), readBalance()]);
      price = (op) => live.get(op) ?? fallbackPrice(op);
      balanceMicros = balance?.availableMicros ?? null;
    }
    const result = await createQuote(store, body, { price, simulated: IS_DEMO });
    return NextResponse.json("error" in result.body ? result.body : { ...result.body, balanceMicros }, { status: result.status });
  } catch (e) {
    console.error("looot-seo: quote failed", e);
    return NextResponse.json({ error: { code: "quote_failed", message: "The quote could not be built. Nothing was charged." } }, { status: 500 });
  }
}
