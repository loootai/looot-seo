"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Skeleton } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import type { QuoteResponse, RunView } from "@/lib/looot/service";
import { formatMoney } from "@/lib/money";
import type { ActionKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ACTION_LABELS } from "@/lib/view/project";

export interface QuoteRequest {
  projectId: string;
  action: ActionKind;
  scope?: Record<string, unknown>;
  /** Called once when the run ends, with its final state. */
  onDone?: (view: RunView) => void;
}

interface ActiveRun {
  runId: string;
  projectId: string;
  title: string;
  action: ActionKind;
  simulated: boolean;
  view: RunView | null;
  done: boolean;
  onDone?: (view: RunView) => void;
}

interface Ctx {
  open: (req: QuoteRequest) => void;
  /** Changes every time a run ends, so tables can flash the rows that were refreshed. */
  finishedAt: number;
  running: boolean;
}

const QuoteCtx = React.createContext<Ctx>({ open: () => undefined, finishedAt: 0, running: false });
/** Opens the quote dialog. Every paid button goes through it; there is no other way to start a run. */
export const useQuote = () => React.useContext(QuoteCtx);

type ApiError = { error: { code: string; message: string } };
type QuoteState = (QuoteResponse & { balanceMicros: number | null }) | null;

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T | ApiError }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data: T | ApiError;
  try {
    data = (await res.json()) as T | ApiError;
  } catch {
    data = { error: { code: `http_${res.status}`, message: "The server sent an answer this page could not read." } };
  }
  return { status: res.status, data };
}

const isError = (d: unknown): d is ApiError => Boolean(d && typeof d === "object" && "error" in d);

export function QuoteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [req, setReq] = React.useState<QuoteRequest | null>(null);
  const [quote, setQuote] = React.useState<QuoteState>(null);
  const [error, setError] = React.useState<{ code: string; message: string } | null>(null);
  const [off, setOff] = React.useState<Set<string>>(new Set());
  const [cap, setCap] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [run, setRun] = React.useState<ActiveRun | null>(null);
  const [finishedAt, setFinishedAt] = React.useState(0);
  const idem = React.useRef("");
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const load = React.useCallback(async (r: QuoteRequest) => {
    setQuote(null);
    setError(null);
    setOff(new Set());
    idem.current = crypto.randomUUID();
    const { data } = await postJson<NonNullable<QuoteState>>("/api/quotes", { projectId: r.projectId, action: r.action, scope: r.scope ?? {} });
    if (isError(data)) setError(data.error);
    else {
      setQuote(data);
      setCap((data.total / 1_000_000).toString());
    }
  }, []);

  const open = React.useCallback(
    (r: QuoteRequest) => {
      setReq(r);
      void load(r);
    },
    [load],
  );

  const total = quote ? quote.lines.filter((l) => !off.has(l.key)).reduce((s, l) => s + l.subtotalMicros, 0) : 0;
  React.useEffect(() => {
    if (quote) setCap((total / 1_000_000).toString());
    // The cap follows the total when lines are ticked or unticked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  React.useEffect(() => {
    if (!quote) return;
    // Small totals start on the confirm button, larger ones on Cancel.
    const t = window.setTimeout(() => (quote.total < 250_000 ? confirmRef : cancelRef).current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [quote]);

  const capMicros = Math.round(Number(cap) * 1_000_000);
  const capError = !quote ? null : !Number.isFinite(capMicros) || capMicros <= 0 ? "Enter a cap above zero." : capMicros > total ? `The cap cannot be above the total of ${formatMoney(total)}.` : null;
  const short = quote && quote.balanceMicros !== null && quote.balanceMicros < total ? total - quote.balanceMicros : 0;

  const confirm = async () => {
    if (!quote || !req || capError || short > 0 || submitting || total === 0) return;
    setSubmitting(true);
    const { data } = await postJson<{ runId: string }>("/api/runs", { quoteId: quote.quoteId, maxCostMicros: capMicros, idempotencyKey: idem.current, disabledLines: [...off] });
    setSubmitting(false);
    if (isError(data)) {
      setError(data.error);
      return;
    }
    setRun({ runId: data.runId, projectId: req.projectId, title: quote.title, action: quote.action, simulated: quote.simulated, view: null, done: false, onDone: req.onDone });
    setReq(null);
  };

  // Poll the run until it ends.
  const runId = run?.runId;
  const runDone = run?.done;
  const simulated = run?.simulated;
  React.useEffect(() => {
    if (!runId || runDone) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        const view = (await res.json()) as RunView | ApiError;
        if (stop || isError(view)) return;
        const done = view.run.status !== "running";
        setRun((r) => (r && r.runId === runId ? { ...r, view, done } : r));
        if (done) {
          setFinishedAt(Date.now());
          router.refresh();
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
    };
    void tick();
    const t = window.setInterval(tick, simulated ? 500 : 1500);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [runId, runDone, simulated, router]);

  const notified = React.useRef("");
  React.useEffect(() => {
    if (run?.done && run.view && notified.current !== run.runId) {
      notified.current = run.runId;
      run.onDone?.(run.view);
    }
  }, [run]);

  const cancelRun = async () => {
    if (run) await postJson(`/api/runs/${run.runId}`, { action: "cancel" });
  };

  const ctx = React.useMemo(() => ({ open, finishedAt, running: Boolean(run && !run.done) }), [open, finishedAt, run]);
  const readAt = quote ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(quote.pricesReadAt)) : "";

  return (
    <QuoteCtx.Provider value={ctx}>
      {run ? <RunBanner run={run} onCancel={cancelRun} onDismiss={() => setRun(null)} onRetry={() => open({ projectId: run.projectId, action: "retry_failed", scope: { runId: run.runId }, onDone: run.onDone })} /> : null}
      {children}
      <Dialog open={Boolean(req)} onOpenChange={(o) => !o && !submitting && setReq(null)}>
        {req ? (
          <DialogContent title={quote?.title ?? `${ACTION_LABELS[req.action] ?? "Run"}: getting the price`} description="Nothing runs until you confirm." onOpenAutoFocus={(e) => e.preventDefault()}>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {error ? (
                  <div role="alert" className="flex items-start gap-2.5">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-neg" strokeWidth={1.5} aria-hidden />
                    <div>
                      <p className="font-medium">{error.code === "quote_expired" ? "This quote is older than 10 minutes" : error.code === "missing_token" ? "No looot token on the server" : "This could not be priced or started"}</p>
                      <p className="mt-0.5 text-muted">
                        {error.message} <span className="num">({error.code})</span>
                      </p>
                      {error.code === "missing_token" ? <p className="mt-1 text-muted">Add the token to the server environment and restart. Nothing was charged.</p> : null}
                      <Button className="mt-3" size="sm" onClick={() => void load(req)}>
                        Get a new quote
                      </Button>
                    </div>
                  </div>
                ) : !quote ? (
                  <div role="status" aria-label="Getting the price" className="space-y-3 py-1">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="mt-5 h-8 w-40" />
                  </div>
                ) : (
                  <>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="label text-left">
                          <th scope="col" className="pb-1.5 font-medium">What</th>
                          <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Calls</th>
                          <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Each</th>
                          <th scope="col" className="pb-1.5 pl-3 text-right font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.lines.map((l) => {
                          const on = !off.has(l.key);
                          return (
                            <tr key={l.key} className={cn("border-t border-rule align-top", !on && "text-muted")}>
                              <td className="py-2 pr-2">
                                <label className="flex items-start gap-2">
                                  {l.optional ? <Checkbox className="mt-0.5" checked={on} onCheckedChange={(v) => setOff((s) => { const n = new Set(s); if (v) n.delete(l.key); else n.add(l.key); return n; })} aria-label={`Include ${l.label}`} /> : null}
                                  <span>
                                    <span className={cn("block", on && "text-ink")}>{l.label}</span>
                                    <span className="caption block">
                                      {l.detail ? `${l.detail} · ` : ""}
                                      <span className="num">{l.operationId}</span>
                                    </span>
                                  </span>
                                </label>
                              </td>
                              <td className="num py-2 pl-3 text-right">{l.calls}</td>
                              <td className="num py-2 pl-3 text-right">{formatMoney(l.unitPriceMicros)}</td>
                              <td className="num py-2 pl-3 text-right">{on ? formatMoney(l.subtotalMicros) : "–"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-rule-strong">
                          <td colSpan={3} className="pt-2.5 font-semibold">Total</td>
                          <td className="num pt-2.5 text-right text-[15px] font-semibold">{formatMoney(total)}</td>
                        </tr>
                      </tfoot>
                    </table>

                    <div className="mt-5 flex flex-col gap-1.5">
                      <label htmlFor="quote-cap" className="label text-ink">Cap for this run</label>
                      <div className="flex items-center gap-2">
                        <span className="num text-muted">$</span>
                        <Input id="quote-cap" name="cap" inputMode="decimal" autoComplete="off" spellCheck={false} className="num w-32" value={cap} onChange={(e) => setCap(e.target.value)} aria-invalid={Boolean(capError)} aria-describedby="quote-cap-hint" />
                      </div>
                      <p id="quote-cap-hint" className={cn("caption", capError && "text-neg")} role={capError ? "alert" : undefined}>
                        {capError ?? "You can lower it, never raise it. The run stops when the next call would pass the cap. Finished checks are kept."}
                      </p>
                    </div>

                    {quote.balanceMicros !== null ? (
                      <p className={cn("mt-4 text-[12px]", short > 0 ? "text-neg" : "text-muted")}>
                        {short > 0 ? `Your looot balance is ${formatMoney(quote.balanceMicros)}, ${formatMoney(short)} short of this run. Top up at looot.ai first.` : `Balance after this run: about ${formatMoney(quote.balanceMicros - Math.min(total, Number.isFinite(capMicros) ? capMicros : total))}.`}
                      </p>
                    ) : null}
                    {quote.simulated ? <p className="mt-4 rounded-ctl border border-warn/50 px-2.5 py-1.5 text-[12px] text-warn">Demo data. Nothing is charged and no request is sent.</p> : null}
                    <p className="caption mt-3">Prices from the looot catalog, read {readAt}. A failed call costs $0.</p>
                  </>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-rule px-5 py-3">
                <Button ref={cancelRef} onClick={() => setReq(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button ref={confirmRef} type="submit" variant="primary" disabled={!quote || Boolean(error) || Boolean(capError) || short > 0 || submitting || total === 0} className="min-w-32">
                  {submitting ? <Loader2 className="animate-spin" aria-label="Starting" /> : quote?.simulated ? "Simulate run" : `Run · ${quote ? formatMoney(Math.min(total, Number.isFinite(capMicros) && capMicros > 0 ? capMicros : total)) : ""}`}
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </QuoteCtx.Provider>
  );
}

function RunBanner({ run, onCancel, onDismiss, onRetry }: { run: ActiveRun; onCancel: () => void; onDismiss: () => void; onRetry: () => void }) {
  const v = run.view;
  const r = v?.run;
  // The banner is fixed under the top bar. This flag moves the page down so it never covers the title.
  React.useEffect(() => {
    document.documentElement.setAttribute("data-run-banner", "");
    return () => document.documentElement.removeAttribute("data-run-banner");
  }, []);
  const pct = r && r.items_total ? Math.round((r.items_done / r.items_total) * 100) : 0;
  const failed = v?.counts.failed ?? 0;
  const failedCost = failed && r ? Math.max(0, r.quoted_micros - r.actual_cost_micros) : 0;
  return (
    <div role="status" aria-live="polite" className="with-rail fixed inset-x-0 top-14 z-30 lg:top-12">
      <div className="relative flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-raised px-4 py-1.5 text-[12px] shadow-[0_6px_16px_-12px_rgb(11_46_34/0.4)] md:px-6">
        {!run.done ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-accent-text" strokeWidth={2} aria-hidden />
            <span className="font-medium">{run.title}</span>
            <span className="num text-muted">
              {r ? `${r.items_done} of ${r.items_total} calls · ${formatMoney(r.actual_cost_micros)} of ${formatMoney(r.max_cost_micros)}` : "starting"}
            </span>
            {run.simulated ? <span className="text-warn">simulated</span> : null}
            <Button size="sm" variant="ghost" className="ml-auto h-6" onClick={onCancel}>
              Cancel
            </Button>
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-rule" aria-hidden>
              <span className="block h-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
            </span>
          </>
        ) : r && v ? (
          <>
            {r.status === "completed" ? <CircleCheck className="size-3.5 text-accent-text" strokeWidth={2} aria-hidden /> : <CircleAlert className={cn("size-3.5", r.status === "failed" ? "text-neg" : "text-warn")} strokeWidth={2} aria-hidden />}
            <span className="font-medium">
              {r.status === "completed" ? "Done" : r.status === "cancelled" ? "Cancelled" : r.status === "failed" ? "Nothing finished" : "Finished in part"}: {run.title.charAt(0).toLowerCase() + run.title.slice(1)}
            </span>
            <span className="num text-muted">
              {v.counts.completed} done{failed ? `, ${failed} failed` : ""}
              {v.counts.skipped ? `, ${v.counts.skipped} not sent` : ""}
              {v.counts.unreadable ? `, ${v.counts.unreadable} unreadable` : ""} · {run.simulated ? `${formatMoney(r.actual_cost_micros)} simulated, $0.00 charged` : `${formatMoney(r.actual_cost_micros)} spent`}
            </span>
            {failed && v.failures[0]?.errorCode ? <span className="num text-neg">{v.failures[0].errorCode}</span> : null}
            <span className="ml-auto flex items-center gap-1">
              {failed ? (
                <Button size="sm" className="h-6" onClick={onRetry}>
                  Retry {failed} failed · up to {formatMoney(failedCost || failed * 1000)}
                </Button>
              ) : null}
              <Button size="iconSm" variant="ghost" className="size-6" aria-label="Dismiss" onClick={onDismiss}>
                <X strokeWidth={1.5} />
              </Button>
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** A button that spends money. Its label always carries the price, and it opens the quote dialog. */
export function PaidButton({ label, priceMicros, request, shortcut, variant = "primary", size = "md", className, disabled }: { label: string; priceMicros: number | null; request: QuoteRequest; shortcut?: boolean; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md"; className?: string; disabled?: boolean }) {
  const { open, running } = useQuote();
  const reqRef = React.useRef(request);
  React.useEffect(() => {
    reqRef.current = request;
  });
  React.useEffect(() => {
    if (!shortcut) return;
    const on = () => open(reqRef.current);
    window.addEventListener("seo:refresh", on);
    return () => window.removeEventListener("seo:refresh", on);
  }, [shortcut, open]);
  return (
    <Button variant={variant} size={size} className={className} disabled={disabled || running} onClick={() => open(request)} title={shortcut ? "Shortcut: r" : undefined}>
      <span>{label}</span>
      {priceMicros !== null ? (
        <>
          <span aria-hidden className="opacity-50">·</span>
          <span className="num">{formatMoney(priceMicros)}</span>
        </>
      ) : null}
    </Button>
  );
}
