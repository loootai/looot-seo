import { applyGroup } from "@/lib/looot/apply";
import { budgetRefusal } from "@/lib/looot/budget";
import { endStatus, isOpenItem, itemsCost, reconcileReservations } from "@/lib/looot/reservations";
import type { PriceSource } from "@/lib/looot/catalog";
import type { LoootRunner } from "@/lib/looot/client";
import { buildQuote, QuoteError, selectLines } from "@/lib/looot/quote";
import { executeRun, type ItemOutcome } from "@/lib/looot/run";
import type { DataStore } from "@/lib/data/store";
import type { ActionKind, CallItem, Quote, Run, RunItem } from "@/lib/types";

export const QUOTE_TTL_MS = 10 * 60 * 1000;

export interface ServiceResult<T> {
  status: number;
  body: T | { error: { code: string; message: string } };
}

const err = (status: number, code: string, message: string): ServiceResult<never> => ({ status, body: { error: { code, message } } });

export interface QuoteResponse {
  quoteId: string;
  action: ActionKind;
  title: string;
  lines: Quote["lines"];
  total: number;
  expiresAt: string;
  pricesReadAt: string;
  simulated: boolean;
}

export interface QuoteDeps {
  price: PriceSource;
  simulated: boolean;
  clock?: () => number;
}

/** Builds the call list for an action, stores it as a quote that lives 10 minutes, and returns the lines to show. */
export async function createQuote(store: DataStore, body: unknown, deps: QuoteDeps): Promise<ServiceResult<QuoteResponse>> {
  const b = (body ?? {}) as { projectId?: unknown; action?: unknown; scope?: unknown };
  if (typeof b.projectId !== "string" || typeof b.action !== "string") return err(400, "bad_request", "projectId and action are required.");
  const scope = (b.scope && typeof b.scope === "object" ? b.scope : {}) as Record<string, unknown>;
  const project = await store.getProject(b.projectId);
  if (!project) return err(404, "project_not_found", "That project was not found.");
  const [keywords, competitors] = await Promise.all([store.listKeywords(project.id), store.listCompetitors(project.id)]);
  let retry: { run: Run; items: RunItem[] } | undefined;
  if (b.action === "retry_failed") {
    const run = typeof scope.runId === "string" ? await store.getRun(scope.runId) : null;
    if (!run || run.project_id !== project.id) return err(404, "run_not_found", "That run was not found.");
    retry = { run, items: await store.listRunItems(run.id) };
  }
  const now = (deps.clock ?? Date.now)();
  try {
    const built = buildQuote(b.action as ActionKind, scope, { project, keywords, competitors, price: deps.price, retry, today: store.now().slice(0, 10) });
    const quote = await store.insertQuote({
      project_id: project.id,
      action: built.action,
      title: built.title,
      lines: built.lines,
      items: built.items,
      scope,
      total_micros: built.totalMicros,
      expires_at: new Date(now + QUOTE_TTL_MS).toISOString(),
    });
    return { status: 200, body: { quoteId: quote.id, action: built.action, title: built.title, lines: built.lines, total: built.totalMicros, expiresAt: quote.expires_at, pricesReadAt: new Date(now).toISOString(), simulated: deps.simulated } };
  } catch (e) {
    if (e instanceof QuoteError) return err(400, "nothing_to_run", e.message);
    throw e;
  }
}

export interface RunDeps {
  /** The looot client, or null when no token is set. */
  client: LoootRunner | null;
  simulated: boolean;
  livePrice?: (operationId: string) => number | undefined;
  clock?: () => number;
  /** Server-side ceiling for one run, in micros. A run whose cap would exceed it is refused. */
  maxRunMicros?: number;
  /** Runs the work after the response is sent. Tests pass a function that awaits it. */
  schedule: (work: () => Promise<void>) => void;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The only way a paid call starts: a stored quote, a cap at or under its total, and an idempotency key.
 * Order: quote, per-run cap, then the period budget. The cap is held against the daily and monthly budget
 * in one atomic database step before any call goes out. 409 for an expired or used quote, 422 for a cap
 * above the quote or a budget that cannot cover it, the first run again for a repeated key. The budgets
 * come from the owner's stored settings, never from the request body.
 */
export async function startRun(store: DataStore, body: unknown, deps: RunDeps): Promise<ServiceResult<{ runId: string; replayed: boolean }>> {
  const b = (body ?? {}) as { quoteId?: unknown; maxCostMicros?: unknown; maxCost?: unknown; idempotencyKey?: unknown; disabledLines?: unknown };
  if (typeof b.quoteId !== "string") return err(400, "quote_required", "A run needs a quoteId. Ask for a quote first.");
  if (typeof b.idempotencyKey !== "string" || b.idempotencyKey.length < 8 || b.idempotencyKey.length > 200) return err(400, "idempotency_key_required", "A run needs an idempotencyKey of 8 to 200 characters.");
  const existing = await store.getRunByKey(b.idempotencyKey);
  if (existing) return { status: 200, body: { runId: existing.id, replayed: true } };

  const quote = await store.getQuote(b.quoteId);
  if (!quote) return err(404, "quote_not_found", "That quote was not found.");
  const now = (deps.clock ?? Date.now)();
  if (new Date(quote.expires_at).getTime() <= now) return err(409, "quote_expired", "This quote is older than 10 minutes. Ask for a new one.");
  if (quote.used_at) return err(409, "quote_used", "This quote already started a run. Ask for a new one.");
  const project = await store.getProject(quote.project_id);
  if (!project) return err(404, "project_not_found", "That project was not found.");

  const disabled = Array.isArray(b.disabledLines) ? b.disabledLines.filter((x): x is string => typeof x === "string") : [];
  const selected = selectLines(quote, disabled, project);
  if (selected.items.length === 0) return err(422, "nothing_selected", "Every line is unticked. There is nothing to run.");
  const cap = typeof b.maxCostMicros === "number" ? Math.round(b.maxCostMicros) : typeof b.maxCost === "number" ? Math.round(b.maxCost * 1_000_000) : NaN;
  if (!Number.isFinite(cap) || cap <= 0) return err(422, "cap_required", "A run needs a cap above zero.");
  if (cap > selected.totalMicros) return err(422, "cap_above_quote", "The cap cannot be higher than the quote total.");
  if (deps.maxRunMicros !== undefined && cap > deps.maxRunMicros) return err(422, "cap_above_limit", `The cap cannot be higher than the server limit of ${(deps.maxRunMicros / 1_000_000).toFixed(2)} dollars per run.`);
  if (!deps.simulated && !deps.client) return err(503, "missing_token", "LOOOT_TOKEN is not set on the server, so nothing can run.");

  const at = new Date(now);
  // Runs that ended without a result (a crash, a call that stayed open) are resolved first, so their held money is counted right.
  await reconcileReservations({ store, client: deps.client, now: at }).catch((e) => console.error("looot-seo: reconcile failed", e));
  const held = await store.reserveBudget({ key: b.idempotencyKey, amountMicros: cap, now: at });
  if (!held.ok) {
    if (held.reason === "duplicate") {
      const first = await store.getRunByKey(b.idempotencyKey);
      return first ? { status: 200, body: { runId: first.id, replayed: true } } : err(409, "run_in_progress", "A run with this key is starting. Try again in a moment.");
    }
    return err(422, "budget_reached", budgetRefusal(held.scope, held.budget, cap));
  }
  const give = () => store.releaseReservation(b.idempotencyKey as string, at).catch((e) => console.error("looot-seo: release failed", e));
  let inserted;
  try {
    if (!(await store.markQuoteUsed(quote.id))) {
      await give();
      return err(409, "quote_used", "This quote already started a run. Ask for a new one.");
    }
    inserted = await store.insertRun(
      { project_id: project.id, quote_id: quote.id, action: quote.action, idempotency_key: b.idempotencyKey, items_total: selected.items.length, quoted_micros: selected.totalMicros, max_cost_micros: cap, simulated: deps.simulated },
      selected.items,
    );
  } catch (e) {
    await give();
    throw e;
  }
  const { run, created } = inserted;
  if (!created) {
    await give();
    return { status: 200, body: { runId: run.id, replayed: true } };
  }
  const client = deps.client as LoootRunner;
  deps.schedule(() => runAndStore(store, run, selected.items, quote.scope, client, deps));
  return { status: 201, body: { runId: run.id, replayed: false } };
}

/** Executes a stored run: sends the calls under the cap, writes each item as it ends, stores results per group, closes the run. */
export async function runAndStore(store: DataStore, run: Run, items: CallItem[], scope: Record<string, unknown>, client: LoootRunner, deps: Pick<RunDeps, "livePrice" | "pollIntervalMs" | "pollTimeoutMs" | "sleep">): Promise<void> {
  const price = (operationId: string, unit: number) => Math.max(unit, deps.livePrice?.(operationId) ?? 0);
  try {
    const project = await store.getProject(run.project_id);
    if (!project) throw new Error("project is gone");
    const [keywords, competitors] = await Promise.all([store.listKeywords(project.id), store.listCompetitors(project.id)]);
    const ctx = { store, project, keywords, competitors, runId: run.id, action: run.action, scope, simulated: run.simulated };
    const left = new Map<string, number>();
    const byGroup = new Map<string, ItemOutcome[]>();
    for (const it of items) left.set(it.group, (left.get(it.group) ?? 0) + 1);

    const result = await executeRun({
      runId: run.id,
      items,
      maxCostMicros: run.max_cost_micros,
      client,
      livePrice: deps.livePrice,
      pollIntervalMs: deps.pollIntervalMs,
      pollTimeoutMs: deps.pollTimeoutMs,
      sleep: deps.sleep,
      isCancelled: async () => (await store.getRun(run.id))?.status === "cancelled",
      onItem: async (o, progress) => {
        await store.updateRunItem(run.id, o.item.itemKey, { status: o.status, looot_run_id: o.loootRunId, actual_cost_micros: o.costMicros, error_code: o.errorCode, error_message: o.errorMessage, finished_at: new Date().toISOString() });
        byGroup.set(o.item.group, [...(byGroup.get(o.item.group) ?? []), o]);
        const remaining = (left.get(o.item.group) ?? 1) - 1;
        left.set(o.item.group, remaining);
        if (remaining === 0) {
          try {
            const notes = await applyGroup(ctx, o.item.group, byGroup.get(o.item.group) ?? []);
            for (const [key, note] of notes) await store.updateRunItem(run.id, key, { parse_ok: note.parse_ok, ...(note.result !== undefined ? { result: note.result } : {}) });
          } catch (e) {
            console.error("looot-seo: storing results failed for", o.item.group, e);
            for (const g of byGroup.get(o.item.group) ?? []) if (g.status === "completed") await store.updateRunItem(run.id, g.item.itemKey, { parse_ok: false });
          }
        }
        await store.updateRun(run.id, { items_done: progress.done, actual_cost_micros: Math.min(progress.spentMicros, run.max_cost_micros) });
        // A live run is not reconciled: each finished call moves the soft expiry on.
        await store.touchReservation(run.idempotency_key, new Date()).catch(() => undefined);
      },
    });
    // The table refuses a cost above the cap. If a provider billed more than its quoted price, the excess is kept in over_cap_micros.
    const over = Math.max(0, result.spentMicros - run.max_cost_micros);
    // items_done counts calls that were sent. Calls held back by the cap are not "done".
    const sent = result.outcomes.filter((o) => o.status !== "skipped_budget").length;
    await store.updateRun(run.id, { status: result.status, items_done: sent, actual_cost_micros: Math.min(result.spentMicros, run.max_cost_micros), over_cap_micros: over, finished_at: new Date().toISOString() });
    // Settle to what the calls really cost. A call still open keeps its price held until looot reports it.
    const open = result.outcomes.filter((o) => o.status === "timed_out").reduce((n, o) => n + price(o.item.operationId, o.item.unitPriceMicros), 0);
    await finishReservation(store, run, result.spentMicros, open);
  } catch (e) {
    console.error("looot-seo: run failed", run.id, e);
    // Calls may have gone out before the error. Read what the items say and hold the price of any that are open.
    const rows = await store.listRunItems(run.id).catch(() => null);
    const open = rows ? rows.filter(isOpenItem).reduce((n, i) => n + i.unit_price_micros, 0) : run.max_cost_micros;
    const spent = rows ? itemsCost(rows) : 0;
    // A run with calls that may still be charged is never written as failed.
    const status = open > 0 ? "partial" : rows ? endStatus("running", rows) : "failed";
    await store.updateRun(run.id, { status, finished_at: new Date().toISOString() }).catch(() => undefined);
    await finishReservation(store, run, spent, open).catch((e2) => console.error("looot-seo: settle failed", run.id, e2));
  }
}

/** Ends the run's reservation: keep holding the open calls' price, else settle to the real cost, or release when nothing was spent. */
async function finishReservation(store: DataStore, run: Run, spentMicros: number, openMicros: number): Promise<void> {
  const now = new Date();
  if (openMicros > 0) await store.resizeReservation(run.idempotency_key, Math.min(openMicros, run.max_cost_micros), spentMicros, now);
  else if (spentMicros > 0) await store.settleReservation(run.idempotency_key, spentMicros, now);
  else await store.releaseReservation(run.idempotency_key, now);
}

export interface RunView {
  run: Run;
  /** open: calls sent and not answered yet. Their price stays held against the budget. */
  counts: { completed: number; failed: number; skipped: number; pending: number; open: number; unreadable: number };
  failures: { itemKey: string; errorCode: string | null; errorMessage: string | null }[];
  /** Small results kept on items, such as competitor suggestions. */
  results: unknown[];
}

/** A run with the item counts the progress line needs. */
export async function readRun(store: DataStore, id: string): Promise<RunView | null> {
  const run = await store.getRun(id);
  if (!run) return null;
  const items = await store.listRunItems(id);
  const counts = { completed: 0, failed: 0, skipped: 0, pending: 0, open: 0, unreadable: 0 };
  for (const i of items) {
    if (i.status === "completed") counts.completed += 1;
    else if (i.status === "failed") counts.failed += 1;
    else if (i.status === "timed_out") counts.open += 1;
    else if (i.status === "skipped_budget") counts.skipped += 1;
    else counts.pending += 1;
    if (i.status === "completed" && !i.parse_ok) counts.unreadable += 1;
  }
  return {
    run,
    counts,
    failures: items.filter((i) => i.status === "failed" || i.status === "timed_out").map((i) => ({ itemKey: i.item_key, errorCode: i.error_code, errorMessage: i.error_message })),
    results: items.filter((i) => i.result !== null && i.result !== undefined).map((i) => i.result),
  };
}

/** Stops a running run from sending new calls. Finished calls are kept. */
export async function cancelRun(store: DataStore, id: string): Promise<boolean> {
  const run = await store.getRun(id);
  if (!run || run.status !== "running") return false;
  await store.updateRun(id, { status: "cancelled" });
  return true;
}
