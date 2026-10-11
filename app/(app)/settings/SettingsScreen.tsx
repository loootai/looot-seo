"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Loader2, LogOut } from "lucide-react";
import { deleteMyData, saveBudgets, saveDefaults, signOut } from "@/app/actions";
import { PageHead } from "@/components/shell/PageHead";
import { useToast } from "@/components/shell/toast";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/controls";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import type { BudgetStatus } from "@/lib/looot/budget";
import { COUNTRIES, DEPTHS, LANGUAGES } from "@/lib/markets";
import { formatMoney } from "@/lib/money";
import type { Depth, UserDefaults } from "@/lib/types";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "looot", label: "looot connection" },
  { id: "budget", label: "Budget" },
  { id: "defaults", label: "Defaults" },
];

type Test = { state: "idle" | "testing" } | { state: "ok"; balanceMicros: number | null } | { state: "bad"; message: string };

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-rule px-4 py-6 md:px-6">
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[220px_minmax(0,560px)]">
        <div>
          <h2 id={`${id}-title`} className="text-[14px] font-semibold leading-5">{title}</h2>
          <p className="mt-1 text-muted">{sub}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function SettingsScreen({ email, defaults, budget, demo, hasToken, tokenEnv, failed, serpPrices }: { email: string | null; defaults: UserDefaults; budget: BudgetStatus | null; demo: boolean; hasToken: boolean; tokenEnv: string; failed: boolean; serpPrices: Record<string, number> }) {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = React.useState(defaults);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [test, setTest] = React.useState<Test>({ state: "idle" });
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(defaults);
  const [daily, setDaily] = React.useState(budget ? String(budget.daily.budgetMicros / 1_000_000) : "5");
  const [monthly, setMonthly] = React.useState(budget ? String(budget.monthly.budgetMicros / 1_000_000) : "50");
  const [budgetSaving, setBudgetSaving] = React.useState(false);
  const [budgetError, setBudgetError] = React.useState<string | null>(null);
  const inRange = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 9999;
  const budgetDirty = budget ? Number(daily) * 1_000_000 !== budget.daily.budgetMicros || Number(monthly) * 1_000_000 !== budget.monthly.budgetMicros : true;

  const runTest = async () => {
    setTest({ state: "testing" });
    try {
      const res = await fetch("/api/balance", { cache: "no-store" });
      const body = (await res.json()) as { demo: boolean; hasToken: boolean; balanceMicros: number | null; reachable?: boolean };
      if (body.demo) setTest({ state: "bad", message: "Demo mode never calls looot, so there is nothing to test." });
      else if (!body.hasToken) setTest({ state: "bad", message: `${tokenEnv} is not set on the server.` });
      else if (!body.reachable) setTest({ state: "bad", message: "looot did not accept the token or did not answer. Check the token and try again." });
      else setTest({ state: "ok", balanceMicros: body.balanceMicros });
    } catch {
      setTest({ state: "bad", message: "The server did not answer. Nothing was charged." });
    }
  };

  return (
    <>
      <PageHead title="Settings" sub="Project settings such as domain, market and competitors are in the project switcher, under the project's menu." />
      <div className="bg-surface">
        <nav aria-label="Sections" className="flex gap-5 border-t border-rule px-4 md:px-6">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="flex h-9 items-center text-[13px] font-medium text-muted hover:text-ink">
              {s.label}
            </a>
          ))}
        </nav>

        <Section id="account" title="Account" sub="Who is signed in, and the way out.">
          {failed ? <p className="mb-3 text-neg" role="alert">Your account details could not be loaded. Error code <code className="num">settings_load_failed</code>.</p> : null}
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2">
            <dt className="label pt-0.5">Email</dt>
            <dd className="num flex items-center gap-2 truncate">
              {email ?? "–"} {demo ? <Tag tone="warn">Demo data</Tag> : null}
            </dd>
            <dt className="label pt-0.5">Sign-in</dt>
            <dd className="text-muted">{demo ? "Demo mode has no accounts. Every visitor shares the same seeded workspace." : "Email and password, or an emailed link, through Supabase Auth."}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={signOut}>
              <Button type="submit" disabled={demo} title={demo ? "There is no session in demo mode" : undefined}>
                <LogOut strokeWidth={1.5} /> Sign out
              </Button>
            </form>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete my data</Button>
          </div>
          <p className="caption mt-2">Deleting removes every project, keyword, snapshot and run you own. {demo ? "In demo mode the seeded workspace comes back when the server restarts." : "It cannot be undone. Your sign-in stays."}</p>
        </Section>

        <Section id="looot" title="looot connection" sub="One token pays for every data call. It stays on the server and is never sent to the browser.">
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2">
            <dt className="label pt-0.5">Token</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {demo ? <Tag tone="warn">Not needed in demo mode</Tag> : hasToken ? <Tag tone="accent">Present</Tag> : <Tag tone="neg">Missing</Tag>}
              <span className="text-muted">
                read from <code className="num text-ink">{tokenEnv}</code> on the server
              </span>
            </dd>
            <dt className="label pt-0.5">Get one</dt>
            <dd className="text-muted">
              Sign in at{" "}
              <a className="text-accent-text hover:underline" href="https://looot.ai" target="_blank" rel="noreferrer noopener">looot.ai</a>, create a token, top up from $5. A failed call costs nothing.
            </dd>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={runTest} disabled={test.state === "testing"} className="min-w-[132px]">
              {test.state === "testing" ? <Loader2 className="animate-spin" strokeWidth={2} /> : null} Test connection
            </Button>
            <p className={cn("flex min-w-0 items-center gap-1.5", test.state === "bad" ? "text-neg" : test.state === "ok" ? "text-accent-text" : "text-muted")} role="status" aria-live="polite">
              {test.state === "ok" ? <CircleCheck className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden /> : test.state === "bad" ? <CircleX className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden /> : null}
              {test.state === "ok" ? (
                <span>looot answered.{test.balanceMicros !== null ? <> Balance <span className="num">{formatMoney(test.balanceMicros)}</span>.</> : null}</span>
              ) : test.state === "bad" ? (
                test.message
              ) : (
                "Calls Balance only, which is free."
              )}
            </p>
          </div>
        </Section>

        <Section id="budget" title="Budget" sub="The most this workspace may spend on looot, per UTC day and per UTC month.">
          <p className="mb-3 text-muted">
            Before a paid run starts, the app holds the cap of the run against both budgets. A run that would pass either one is refused and makes no call. Held money counts until the run ends, then it settles to the real cost. Only you can change these numbers, here. A run request cannot.
          </p>
          {budget ? (
            <dl className="mb-4 grid grid-cols-[130px_minmax(0,1fr)] gap-y-2">
              {([["Today", budget.daily], ["This month", budget.monthly]] as const).map(([label, w]) => (
                <React.Fragment key={label}>
                  <dt className="label pt-0.5">{label}</dt>
                  <dd className="num">{formatMoney(w.spentMicros)} used, {formatMoney(w.reservedMicros)} held, {formatMoney(w.remainingMicros)} left</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inRange(daily) || !inRange(monthly)) return setBudgetError("Enter amounts from 0 to 9999 dollars.");
              setBudgetSaving(true);
              const res = await saveBudgets(Number(daily), Number(monthly));
              setBudgetSaving(false);
              if (!res.ok) return setBudgetError(res.error);
              setBudgetError(null);
              toast.demoEdit();
              toast.push("Budget saved.");
              router.refresh();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Daily budget (USD)" htmlFor="budget-daily" hint="Resets at 00:00 UTC.">
                <Input id="budget-daily" name="daily" type="number" inputMode="decimal" min={0} max={9999} step="0.5" value={daily} onChange={(e) => setDaily(e.target.value)} className="num" />
              </Field>
              <Field label="Monthly budget (USD)" htmlFor="budget-monthly" hint="Resets on the 1st, 00:00 UTC.">
                <Input id="budget-monthly" name="monthly" type="number" inputMode="decimal" min={0} max={9999} step="1" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="num" />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" disabled={!budgetDirty || budgetSaving} className="min-w-[116px]">
                {budgetSaving ? <Loader2 className="animate-spin" strokeWidth={2} /> : null} Save budget
              </Button>
              {budgetError ? <p className="text-neg" role="alert">{budgetError}</p> : null}
            </div>
          </form>
        </Section>

        <Section id="defaults" title="Defaults" sub="What a new project starts with. Each project can change them later.">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const res = await saveDefaults(d);
              setSaving(false);
              if (!res.ok) return setSaveError(res.error);
              setSaveError(null);
              toast.demoEdit();
              toast.push("Defaults saved.");
              router.refresh();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Depth" htmlFor="def-depth" hint={`${formatMoney((d.depth / 10) * (serpPrices[d.serp_operation] ?? 1000))} per keyword per check`}>
                <Select id="def-depth" name="depth" value={d.depth} onChange={(e) => setD({ ...d, depth: Number(e.target.value) as Depth })}>
                  {DEPTHS.map((x) => <option key={x} value={x}>Top {x}</option>)}
                </Select>
              </Field>
              <Field label="Country" htmlFor="def-country">
                <Select id="def-country" name="country" autoComplete="country" value={d.country} onChange={(e) => setD({ ...d, country: e.target.value })}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Language" htmlFor="def-language">
                <Select id="def-language" name="language" autoComplete="language" value={d.language} onChange={(e) => setD({ ...d, language: e.target.value })}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </Select>
              </Field>
            </div>
            <fieldset className="min-w-0">
              <legend className="label text-ink">SERP provider for rank checks</legend>
              <div className="mt-1.5 divide-y divide-rule rounded-ctl border border-rule-strong">
                {Object.entries(serpPrices).map(([op, micros]) => (
                  <label key={op} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 has-[:checked]:bg-selected">
                    <input type="radio" name="serp_operation" value={op} checked={d.serp_operation === op} onChange={() => setD({ ...d, serp_operation: op })} className="size-3.5 accent-[var(--brand)]" />
                    <span className="min-w-0 flex-1">
                      <span className="num block truncate">{op}</span>
                      <span className="caption block">{op === "serper-search" ? "Also returns People also ask, related searches and the answer box in the same call." : "Slightly cheaper. Organic results only in this version."}</span>
                    </span>
                    <span className="num whitespace-nowrap">{formatMoney(micros)} <span className="text-muted">per page</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" disabled={!dirty || saving} className="min-w-[116px]">
                {saving ? <Loader2 className="animate-spin" strokeWidth={2} /> : null} Save defaults
              </Button>
              {saveError ? <p className="text-neg" role="alert">{saveError}</p> : dirty ? <p className="caption">Unsaved changes</p> : null}
            </div>
          </form>
        </Section>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => (setConfirmOpen(o), setTyped(""), setDeleteError(null))}>
        <DialogContent title="Delete my data" description="Every project, keyword, snapshot, quote and run you own is removed.">
          <form
            className="space-y-4 px-5 py-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setDeleting(true);
              const res = await deleteMyData(typed);
              setDeleting(false);
              if (!res.ok) return setDeleteError(res.error);
              setConfirmOpen(false);
              toast.push("Your data was deleted.");
              router.push("/");
              router.refresh();
            }}
          >
            <Field label='Type "delete my data" to confirm' htmlFor="confirm-delete" error={deleteError}>
              <Input id="confirm-delete" name="confirmation" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="delete my data…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={typed !== "delete my data" || deleting}>
                Delete everything
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
