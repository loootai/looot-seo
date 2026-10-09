import { NextResponse } from "next/server";
import { getStore } from "@/lib/data";
import { cancelRun, readRun } from "@/lib/looot/service";

export const dynamic = "force-dynamic";

/** Progress of one run. With ?items=1 it also lists every call of the run. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const view = await readRun(store, id);
  if (!view) return NextResponse.json({ error: { code: "run_not_found", message: "That run was not found." } }, { status: 404 });
  if (new URL(request.url).searchParams.get("items") === "1") {
    const items = (await store.listRunItems(id)).map((i) => ({ item_key: i.item_key, operation_id: i.operation_id, input: i.input, status: i.status, looot_run_id: i.looot_run_id, unit_price_micros: i.unit_price_micros, actual_cost_micros: i.actual_cost_micros, error_code: i.error_code, parse_ok: i.parse_ok }));
    return NextResponse.json({ ...view, items });
  }
  return NextResponse.json(view);
}

/** { "action": "cancel" } stops a running run from sending new calls. Finished calls are kept. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "cancel") return NextResponse.json({ error: { code: "bad_request", message: "The only action is cancel." } }, { status: 400 });
  const store = await getStore();
  return NextResponse.json({ cancelled: await cancelRun(store, id) });
}
