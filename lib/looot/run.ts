import { TERMINAL_STATUSES, LoootError, type LoootRun, type LoootRunner } from "@/lib/looot/client";
import { toMicros, type Micros } from "@/lib/money";
import type { CallItem, ItemStatus } from "@/lib/types";

export interface ItemOutcome {
  item: CallItem;
  status: Exclude<ItemStatus, "pending">;
  costMicros: Micros;
  loootRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  raw: unknown;
}

export interface ExecuteOptions {
  runId: string;
  items: CallItem[];
  /** The cap the user confirmed. The sum of charges never passes it. */
  maxCostMicros: Micros;
  client: LoootRunner;
  /** Live price per operation. The budget check uses the higher of this and the quoted unit price. */
  livePrice?: (operationId: string) => Micros | undefined;
  /** Called after every item ends, in the order they end. */
  onItem?: (outcome: ItemOutcome, progress: { done: number; spentMicros: Micros }) => Promise<void> | void;
  /** Checked before every new call. Returning true stops scheduling and keeps what finished. */
  isCancelled?: () => Promise<boolean> | boolean;
  concurrency?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ExecuteResult {
  outcomes: ItemOutcome[];
  spentMicros: Micros;
  cancelled: boolean;
  status: "completed" | "partial" | "failed" | "cancelled";
}

/** The idempotency key looot sees for one call: the run id and the item key, or the key of the first attempt on a retry. */
export function idempotencyKeyFor(runId: string, item: CallItem): string {
  return item.idempotencyKey ?? `${runId}:${item.itemKey}`;
}

function costOf(run: LoootRun): Micros {
  if ((run as { replayed?: boolean }).replayed === true) return 0;
  return toMicros(run.actualCost ?? 0);
}

/**
 * Runs a list of looot calls, at most `concurrency` at a time, without ever passing the cap.
 * Before each call it checks spent + reserved + price against the cap; when the next call
 * would pass it, every remaining item is marked skipped_budget and nothing more is sent.
 * A failed call costs nothing. A call that reports a charge above its price stops the run.
 */
export async function executeRun(opts: ExecuteOptions): Promise<ExecuteResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollInterval = opts.pollIntervalMs ?? 2000;
  const pollTimeout = opts.pollTimeoutMs ?? 90_000;
  const queue = [...opts.items];
  const outcomes: ItemOutcome[] = [];
  let spent = 0;
  let reserved = 0;
  let done = 0;
  let stopped: "budget" | "cancelled" | null = null;
  // onItem calls run one after another so store writes keep their order.
  let chain: Promise<void> = Promise.resolve();

  const finish = (o: ItemOutcome) => {
    outcomes.push(o);
    done += 1;
    const progress = { done, spentMicros: spent };
    chain = chain.then(() => opts.onItem?.(o, progress)).catch(() => undefined);
  };
  const skip = (item: CallItem) => finish({ item, status: "skipped_budget", costMicros: 0, loootRunId: null, errorCode: null, errorMessage: null, raw: null });

  const callOne = async (item: CallItem, price: Micros): Promise<void> => {
    let keepReserved = false;
    try {
      let run = await opts.client.run(item.operationId, item.input, idempotencyKeyFor(opts.runId, item));
      const deadline = Date.now() + pollTimeout;
      while (!TERMINAL_STATUSES.has(run.status) && Date.now() < deadline) {
        await sleep(pollInterval);
        run = await opts.client.getRun(run.runId);
      }
      if (!TERMINAL_STATUSES.has(run.status)) {
        // The charge is unknown, so the price stays reserved against the cap.
        keepReserved = true;
        finish({ item, status: "timed_out", costMicros: 0, loootRunId: run.runId ?? null, errorCode: "timed_out", errorMessage: "looot did not finish this call in 90 seconds.", raw: null });
        return;
      }
      if (run.status === "completed") {
        const cost = costOf(run);
        spent += cost;
        if (cost > price) stopped = stopped ?? "budget";
        finish({ item, status: "completed", costMicros: cost, loootRunId: run.runId, errorCode: null, errorMessage: null, raw: run.result });
        return;
      }
      finish({ item, status: "failed", costMicros: 0, loootRunId: run.runId ?? null, errorCode: run.error?.code ?? run.status, errorMessage: run.error?.message ?? `The call ended as ${run.status}.`, raw: null });
    } catch (e) {
      const code = e instanceof LoootError ? e.code : "network_error";
      finish({ item, status: "failed", costMicros: 0, loootRunId: null, errorCode: code, errorMessage: e instanceof Error ? e.message : "The request failed.", raw: null });
    } finally {
      if (!keepReserved) reserved -= price;
    }
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      if (!stopped && (await opts.isCancelled?.())) stopped = "cancelled";
      const price = Math.max(item.unitPriceMicros, opts.livePrice?.(item.operationId) ?? 0);
      if (!stopped && spent + reserved + price > opts.maxCostMicros) stopped = "budget";
      if (stopped) {
        skip(item);
        continue;
      }
      reserved += price;
      await callOne(item, price);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, opts.items.length)) }, () => worker()));
  await chain;

  const completed = outcomes.filter((o) => o.status === "completed").length;
  const cancelled = stopped === "cancelled";
  const status = cancelled ? "cancelled" : completed === outcomes.length ? "completed" : completed === 0 ? "failed" : "partial";
  return { outcomes, spentMicros: spent, cancelled, status };
}
