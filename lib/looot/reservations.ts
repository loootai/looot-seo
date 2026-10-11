import type { DataStore } from "@/lib/data/store";
import { TERMINAL_STATUSES, type LoootRunner } from "@/lib/looot/client";
import { toMicros, type Micros } from "@/lib/money";
import type { RunItem, RunStatus } from "@/lib/types";

/** What reconciliation needs from looot: read a run again. The real client and the demo runner both have it. */
export type RunReader = Pick<LoootRunner, "getRun">;

export interface ReconcileResult {
  settled: number;
  released: number;
  kept: number;
}

/** Calls of a run that may still be charged: sent and not answered, or never confirmed. */
export const isOpenItem = (i: Pick<RunItem, "status">): boolean => i.status === "timed_out" || i.status === "pending";

/** The status a run ends with, from its items. A cancelled run stays cancelled. */
export function endStatus(current: RunStatus, items: Pick<RunItem, "status">[]): RunStatus {
  if (current === "cancelled") return current;
  const completed = items.filter((i) => i.status === "completed").length;
  return completed === items.length ? "completed" : completed === 0 ? "failed" : "partial";
}

/** What a run has cost: the sum over its completed items, in micros. */
export const itemsCost = (items: Pick<RunItem, "status" | "actual_cost_micros">[]): Micros => items.reduce((n, i) => n + (i.status === "completed" ? i.actual_cost_micros : 0), 0);

/**
 * Resolves reservations that outlived their soft expiry, for example after a crash or a run that
 * stayed pending. For each one:
 *  - open calls whose looot run can be read and has ended are written (completed with the real
 *    cost, or failed at $0) and stop counting;
 *  - when no call is open any more the reservation settles to the real cost (or is released when
 *    nothing was spent) and the run is closed;
 *  - calls still pending, never confirmed, or not fetchable keep their price held until the hard
 *    expiry. Then the hold is released and those calls are written as unresolved.
 * A pending call is never written as failed and its budget is never handed back early.
 */
export async function reconcileReservations(deps: { store: DataStore; client: RunReader | null; now: Date }): Promise<ReconcileResult> {
  const { store, client, now } = deps;
  const out: ReconcileResult = { settled: 0, released: 0, kept: 0 };
  for (const r of await store.listExpiredReservations(now)) {
    const hard = r.hardExpiresAt <= now.toISOString();
    const run = await store.getRunByKey(r.key);
    if (!run) {
      // The run row is gone (project deleted). Nothing can be read, so hold until the hard expiry.
      if (hard) {
        await store.releaseReservation(r.key, now);
        out.released++;
      } else out.kept++;
      continue;
    }
    const items = await store.listRunItems(run.id);
    for (const it of items) {
      if (it.status !== "timed_out" || !it.looot_run_id || !client) continue;
      let remote;
      try {
        remote = await client.getRun(it.looot_run_id);
      } catch {
        continue;
      }
      if (!TERMINAL_STATUSES.has(remote.status)) continue;
      const done = remote.status === "completed";
      const cost = done && (remote as { replayed?: boolean }).replayed !== true ? toMicros(remote.actualCost ?? 0) : 0;
      const patch = done
        ? { status: "completed" as const, actual_cost_micros: cost, error_code: null, error_message: null, parse_ok: false, finished_at: now.toISOString() }
        : { status: "failed" as const, actual_cost_micros: 0, error_code: remote.error?.code ?? remote.status, error_message: remote.error?.message ?? `The call ended as ${remote.status}.`, finished_at: now.toISOString() };
      await store.updateRunItem(run.id, it.item_key, patch);
      Object.assign(it, patch);
    }
    if (hard) {
      for (const it of items.filter(isOpenItem)) {
        const patch = { status: "failed" as const, actual_cost_micros: 0, error_code: "unresolved", error_message: "looot never confirmed this call. The hold on its price was released after 24 hours.", finished_at: now.toISOString() };
        await store.updateRunItem(run.id, it.item_key, patch);
        Object.assign(it, patch);
      }
    }
    const open = items.filter(isOpenItem);
    const spent = itemsCost(items);
    if (open.length > 0) {
      await store.resizeReservation(r.key, open.reduce((n, i) => n + i.unit_price_micros, 0), spent, now);
      out.kept++;
      continue;
    }
    const sent = items.filter((i) => i.status !== "skipped_budget" && i.status !== "pending").length;
    await store.updateRun(run.id, {
      status: endStatus(run.status, items),
      items_done: sent,
      actual_cost_micros: Math.min(spent, run.max_cost_micros),
      over_cap_micros: Math.max(0, spent - run.max_cost_micros),
      finished_at: run.finished_at ?? now.toISOString(),
    });
    if (spent > 0) {
      await store.settleReservation(r.key, spent, now);
      out.settled++;
    } else {
      await store.releaseReservation(r.key, now);
      out.released++;
    }
  }
  return out;
}
