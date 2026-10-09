import { applyGroup } from "@/lib/looot/apply";
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
  /** Runs the work after the response is sent. Tests pass a function that awaits it. */
  schedule: (work: () => Promise<void>) => void;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The only way a paid call starts: a stored quote, a cap at or under its total, and an idempotency key.
 * 409 for an expired or used quote, 422 for a cap above the quote, the first run again for a repeated key.
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
  if (!deps.simulated && !deps.client) return err(503, "missing_token", "LOOOT_TOKEN is not set on the server, so nothing can run.");

  if (!(await store.markQuoteUsed(quote.id))) return err(409, "quote_used", "This quote already started a run. Ask for a new one.");
  const { run, created } = await store.insertRun(
    { project_id: project.id, quote_id: quote.id, action: quote.action, idempotency_key: b.idempotencyKey, items_total: selected.items.length, quoted_micros: selected.totalMicros, max_cost_micros: cap, simulated: deps.simulated },
    selected.items,
  );
  if (!created) return { status: 200, body: { runId: run.id, replayed: true } };
  const client = deps.client as LoootRunner;
  deps.schedule(() => runAndStore(store, run, selected.items, quote.scope, client, deps));
  return { status: 201, body: { runId: run.id, replayed: false } };
}

/** Executes a stored run: sends the calls under the cap, writes each item as it ends, stores results per group, closes the run. */
export async function runAndStore(store: DataStore, run: Run, items: CallItem[], scope: Record<string, unknown>, client: LoootRunner, deps: Pick<RunDeps, "livePrice" | "pollIntervalMs" | "pollTimeoutMs" | "sleep">): Promise<void> {
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
      },
    });
    // The table refuses a cost above the cap. If a provider billed more than its quoted price, the excess is kept in over_cap_micros.
    const over = Math.max(0, result.spentMicros - run.max_cost_micros);
    await store.updateRun(run.id, { status: result.status, items_done: result.outcomes.length, actual_cost_micros: Math.min(result.spentMicros, run.max_cost_micros), over_cap_micros: over, finished_at: new Date().toISOString() });
  } catch (e) {
    console.error("looot-seo: run failed", run.id, e);
    await store.updateRun(run.id, { status: "failed", finished_at: new Date().toISOString() }).catch(() => undefined);
  }
}

export interface RunView {
  run: Run;
  counts: { completed: number; failed: number; skipped: number; pending: number; unreadable: number };
  failures: { itemKey: string; errorCode: string | null; errorMessage: string | null }[];
  /** Small results kept on items, such as competitor suggestions. */
  results: unknown[];
}

/** A run with the item counts the progress line needs. */
export async function readRun(store: DataStore, id: string): Promise<RunView | null> {
  const run = await store.getRun(id);
  if (!run) return null;
  const items = await store.listRunItems(id);
  const counts = { completed: 0, failed: 0, skipped: 0, pending: 0, unreadable: 0 };
  for (const i of items) {
    if (i.status === "completed") counts.completed += 1;
    else if (i.status === "failed" || i.status === "timed_out") counts.failed += 1;
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
