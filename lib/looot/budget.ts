import { formatMoney, type Micros } from "@/lib/money";

/** Default daily budget for a new workspace: $5. */
export const DEFAULT_DAILY_BUDGET_MICROS: Micros = 5_000_000;
/** Default monthly budget for a new workspace: $50. */
export const DEFAULT_MONTHLY_BUDGET_MICROS: Micros = 50_000_000;
/** The highest budget the settings form accepts: $9,999. */
export const MAX_BUDGET_MICROS: Micros = 9_999_000_000;

/** After this long without progress a reservation is checked against looot's real run status. */
export const RESERVATION_SOFT_SECONDS = 15 * 60;
/** After this long a reservation that could not be resolved is released. */
export const RESERVATION_HARD_SECONDS = 24 * 60 * 60;

/** Spent, held and total for one period. remainingMicros never goes below zero. */
export interface BudgetWindow {
  budgetMicros: Micros;
  spentMicros: Micros;
  reservedMicros: Micros;
  remainingMicros: Micros;
}

/** The daily and monthly budget as the sidebar, the Costs screen and Settings show it. */
export interface BudgetStatus {
  daily: BudgetWindow;
  monthly: BudgetWindow;
}

export type BudgetScope = "daily" | "monthly";

/** Builds a window from a budget, what was spent and what is held. */
export const windowOf = (budgetMicros: Micros, spentMicros: Micros, reservedMicros: Micros): BudgetWindow => ({
  budgetMicros,
  spentMicros,
  reservedMicros,
  remainingMicros: Math.max(0, budgetMicros - spentMicros - reservedMicros),
});

/** The numbers the reservation rule compares. */
export interface ReserveNumbers {
  dailyBudgetMicros: Micros;
  monthlyBudgetMicros: Micros;
  spentDayMicros: Micros;
  spentMonthMicros: Micros;
  reservedMicros: Micros;
  amountMicros: Micros;
}

/**
 * The reservation rule, in the order the database function applies it: daily budget, then monthly.
 * Spent plus held plus the new amount must stay within each. null means it fits. The Postgres
 * function reserve_budget() is the same rule under a row lock.
 */
export function overBudget(n: ReserveNumbers): BudgetScope | null {
  if (n.spentDayMicros + n.reservedMicros + n.amountMicros > n.dailyBudgetMicros) return "daily";
  if (n.spentMonthMicros + n.reservedMicros + n.amountMicros > n.monthlyBudgetMicros) return "monthly";
  return null;
}

/** One run to hold money for. `key` is the run's idempotency key. */
export interface ReserveRequest {
  key: string;
  /** The most the run can cost: its cap. */
  amountMicros: Micros;
  now: Date;
}

export type ReserveResult = { ok: true; budget: BudgetStatus } | { ok: false; reason: "duplicate" } | { ok: false; reason: "budget"; scope: BudgetScope; budget: BudgetStatus };

/** A held amount. state "reserved" counts against the budget. spentMicros is what the run already cost. */
export interface Reservation {
  key: string;
  amountMicros: Micros;
  spentMicros: Micros;
  state: "reserved" | "settled" | "released";
  createdAt: string;
  expiresAt: string;
  hardExpiresAt: string;
}

/** The refusal shown when a reservation fails. Names the period and the numbers. */
export function budgetRefusal(scope: BudgetScope, b: BudgetStatus, needMicros: Micros): string {
  const w = scope === "daily" ? b.daily : b.monthly;
  return `The ${scope} budget of ${formatMoney(w.budgetMicros)} cannot cover this run (${formatMoney(needMicros)}): ${formatMoney(w.spentMicros)} spent, ${formatMoney(w.reservedMicros)} held for runs in progress, ${formatMoney(w.remainingMicros)} left. No call was made. Change the budget in Settings.`;
}

/** The start of the UTC day `at` is in. */
export const dayStart = (at: Date): Date => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
/** The start of the UTC month `at` is in. */
export const monthStart = (at: Date): Date => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));

/** Reads the jsonb the database functions return into a BudgetStatus. Missing numbers read as zero. */
export function budgetFromJson(json: unknown): BudgetStatus {
  const w = (v: unknown, fallback: Micros): BudgetWindow => {
    const o = (v ?? {}) as Record<string, unknown>;
    return windowOf(Number(o.budget ?? fallback), Number(o.spent ?? 0), Number(o.reserved ?? 0));
  };
  const o = (json ?? {}) as Record<string, unknown>;
  return { daily: w(o.daily, DEFAULT_DAILY_BUDGET_MICROS), monthly: w(o.monthly, DEFAULT_MONTHLY_BUDGET_MICROS) };
}
