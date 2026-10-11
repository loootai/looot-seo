/**
 * The reservation functions in supabase/migrations, run on a throwaway local Postgres (initdb and
 * pg_ctl on PATH, no containers). Skips with a note when PostgreSQL is not installed. Concurrent
 * callers are real psql processes held at an advisory-lock barrier and released together.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const PG_BIN = ["/opt/homebrew/opt/postgresql@17/bin", ...(process.env.PATH ?? "").split(":")];
const bin = (name: string) => PG_BIN.map((d) => path.join(d, name)).find((p) => existsSync(p));
const have = Boolean(bin("initdb") && bin("pg_ctl") && bin("psql"));
if (!have) console.warn("budgetSql tests skipped: initdb, pg_ctl and psql are not on PATH. Install PostgreSQL to run them.");

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const NOW = "2026-10-08T09:10:00Z";
const DAY = "2026-10-08T00:00:00Z";
const MONTH = "2026-10-01T00:00:00Z";

let dir = "";
let port = 0;
let pgBinDir = "";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

const psqlArgs = (extra: string[]) => ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...extra];
const psql = (...extra: string[]) => execFileSync(path.join(pgBinDir, "psql"), psqlArgs(extra), { encoding: "utf8" }).trim();
const sql = (q: string) => psql("-c", q);

interface Window {
  budget: number;
  spent: number;
  reserved: number;
}
interface Reply {
  ok: boolean;
  reason?: string;
  scope?: string;
  daily: Window;
  monthly: Window;
}
const reserveSql = (owner: string, key: string, amount: number, now = NOW) => `select public.reserve_budget('${owner}', '${key}', ${amount}, '${now}', '${DAY}', '${MONTH}', 900, 86400)`;
const reserve = (owner: string, key: string, amount: number, now = NOW) => JSON.parse(sql(reserveSql(owner, key, amount, now))) as Reply;
const setBudget = (owner: string, daily: number, monthly: number) => sql(`update public.spend_budgets set daily_budget_micros = ${daily}, monthly_budget_micros = ${monthly} where owner_id = '${owner}'`);
const reservedSum = (owner: string) => Number(sql(`select coalesce(sum(amount_micros), 0) from public.budget_reservations where owner_id = '${owner}' and state = 'reserved'`));
const reset = () => sql(`truncate public.budget_reservations; update public.spend_budgets set daily_budget_micros = 1000000, monthly_budget_micros = 100000000`);
const state = (key: string) => sql(`select state from public.budget_reservations where idempotency_key = '${key}'`);

/** Starts n psql clients that all wait on one advisory lock, then releases them together. */
async function race(n: number, query: (i: number) => string): Promise<string[]> {
  const holder = spawn(path.join(pgBinDir, "psql"), psqlArgs([]), { stdio: ["pipe", "ignore", "ignore"] });
  holder.stdin.write("select pg_advisory_lock(4242);\n");
  await new Promise((r) => setTimeout(r, 300));
  const clients = Array.from({ length: n }, (_, i) => {
    const p = spawn(path.join(pgBinDir, "psql"), psqlArgs(["-c", "select pg_advisory_lock_shared(4242)", "-c", query(i)]), { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    return new Promise<string>((resolve) => p.on("close", () => resolve(out.split("\n").filter((l) => l.startsWith("{")).join("\n"))));
  });
  // Wait until every client is blocked on the lock, then let them all go at once.
  for (let t = 0; t < 100; t++) {
    if (Number(sql("select count(*) from pg_locks where locktype = 'advisory' and not granted")) >= n) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  holder.stdin.write("select pg_advisory_unlock(4242);\n\\q\n");
  return Promise.all(clients);
}

describe.skipIf(!have)("reserve_budget on Postgres", () => {
  beforeAll(async () => {
    pgBinDir = path.dirname(bin("psql")!);
    dir = path.resolve(root, ".pgtest-budget");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    port = await freePort();
    execFileSync(path.join(pgBinDir, "initdb"), ["-D", path.join(dir, "db"), "-U", "postgres", "-A", "trust"], { stdio: "ignore" });
    execFileSync(path.join(pgBinDir, "pg_ctl"), ["-D", path.join(dir, "db"), "-o", `-p ${port} -k '' -c listen_addresses=127.0.0.1 -c max_connections=60`, "-l", path.join(dir, "log"), "-w", "start"], { stdio: "ignore" });
    psql("-f", path.join(root, "supabase/tests/auth_stub.sql"));
    for (const f of readdirSync(path.join(root, "supabase/migrations")).sort()) psql("-f", path.join(root, "supabase/migrations", f));
    sql(`insert into public.spend_budgets (owner_id) values ('${U1}'), ('${U2}')`);
  }, 60_000);

  afterAll(() => {
    if (!dir) return;
    spawnSync(path.join(pgBinDir, "pg_ctl"), ["-D", path.join(dir, "db"), "stop", "-m", "fast"], { stdio: "ignore" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("the default budgets are $5 a day and $50 a month", () => {
    expect(sql(`select daily_budget_micros || ',' || monthly_budget_micros from public.spend_budgets where owner_id = '${U2}'`)).toBe("5000000,50000000");
  });

  it("ten simultaneous reservations of 400000 against a 1000000 budget: exactly two succeed", async () => {
    reset();
    const outs = await race(10, (i) => reserveSql(U1, `k${i}`, 400000));
    const replies = outs.map((o) => JSON.parse(o) as Reply);
    expect(replies).toHaveLength(10);
    expect(replies.filter((r) => r.ok)).toHaveLength(2);
    expect(replies.filter((r) => !r.ok && r.scope === "daily")).toHaveLength(8);
    expect(reservedSum(U1)).toBe(800000);
  }, 60_000);

  it("two simultaneous reservations of 600000 against a 1000000 budget: exactly one succeeds", async () => {
    reset();
    const outs = await race(2, (i) => reserveSql(U1, `two${i}`, 600000));
    expect(outs.map((o) => (JSON.parse(o) as Reply).ok).sort()).toEqual([false, true]);
    expect(reservedSum(U1)).toBe(600000);
  }, 60_000);

  it("the race harness can see a race: a read-then-write version lets several through", async () => {
    reset();
    sql(`create or replace function public.naive_reserve(p_owner uuid, p_key text, p_amount bigint) returns boolean language plpgsql as $$
      declare held bigint;
      begin
        select coalesce(sum(amount_micros), 0) into held from public.budget_reservations where owner_id = p_owner and state = 'reserved';
        perform pg_sleep(0.3);
        if held + p_amount > 1000000 then return false; end if;
        insert into public.budget_reservations (owner_id, idempotency_key, amount_micros, expires_at, hard_expires_at) values (p_owner, p_key, p_amount, now(), now());
        return true;
      end $$`);
    const outs = await race(4, (i) => `select jsonb_build_object('ok', public.naive_reserve('${U1}', 'n${i}', 600000))`);
    expect(outs.filter((o) => (JSON.parse(o) as { ok: boolean }).ok).length).toBeGreaterThan(1);
    sql("drop function public.naive_reserve(uuid, text, bigint)");
  }, 60_000);

  it("refuses at the monthly budget and says which one", () => {
    reset();
    setBudget(U1, 100000000, 1500000);
    expect(reserve(U1, "m1", 1000000).ok).toBe(true);
    const r = reserve(U1, "m2", 1000000);
    expect(r).toMatchObject({ ok: false, scope: "monthly" });
    expect(r.monthly).toMatchObject({ budget: 1500000, reserved: 1000000, spent: 0 });
  });

  it("counts spent and held together, and a day that rolled over does not count against the daily budget", () => {
    reset();
    reserve(U1, "old", 900000, "2026-10-07T12:00:00Z");
    sql(`select public.settle_reservation('${U1}', 'old', 900000, '2026-10-07T12:00:00Z')`);
    setBudget(U1, 1000000, 2000000);
    expect(reserve(U1, "d1", 1000000).ok).toBe(true); // yesterday's 900000 is not in today
    expect(reserve(U1, "d2", 200000)).toMatchObject({ ok: false, scope: "daily" });
    sql(`select public.release_reservation('${U1}', 'd1', '${NOW}')`);
    setBudget(U1, 5000000, 2000000);
    expect(reserve(U1, "d3", 1200000)).toMatchObject({ ok: false, scope: "monthly" }); // 900000 spent this month + 1200000 > 2000000
    reserve(U1, "today", 800000);
    sql(`select public.settle_reservation('${U1}', 'today', 800000, '${NOW}')`);
    setBudget(U1, 1000000, 2000000);
    expect(reserve(U1, "d4", 300000)).toMatchObject({ ok: false, scope: "daily" });
    expect(reserve(U1, "d5", 200000).ok).toBe(true);
  });

  it("refuses a repeated key and writes nothing", () => {
    reset();
    expect(reserve(U1, "dup", 100000).ok).toBe(true);
    expect(reserve(U1, "dup", 100000)).toMatchObject({ ok: false, reason: "duplicate" });
    expect(Number(sql(`select count(*) from public.budget_reservations where idempotency_key = 'dup'`))).toBe(1);
  });

  it("settle, release and resize change only a reserved row", () => {
    reset();
    for (const k of ["s", "r", "h"]) reserve(U1, k, 100000);
    sql(`select public.settle_reservation('${U1}', 's', 30000, '${NOW}')`);
    sql(`select public.release_reservation('${U1}', 'r', '${NOW}')`);
    sql(`select public.resize_reservation('${U1}', 'h', 40000, 20000, '${NOW}', 900)`);
    expect(sql(`select state || ':' || idempotency_key || ':' || amount_micros || ':' || spent_micros from public.budget_reservations order by idempotency_key`).split("\n")).toEqual(["reserved:h:40000:20000", "released:r:100000:0", "settled:s:100000:30000"]);
    // A settled row cannot be released or resized afterwards, so a late call never frees money that was spent.
    sql(`select public.release_reservation('${U1}', 's', '${NOW}')`);
    sql(`select public.resize_reservation('${U1}', 's', 0, 0, '${NOW}', 900)`);
    expect(sql(`select state || ':' || spent_micros from public.budget_reservations where idempotency_key = 's'`)).toBe("settled:30000");
    expect(reservedSum(U1)).toBe(40000);
  });

  it("a resize never raises the hold above what was reserved", () => {
    reset();
    reserve(U1, "up", 100000);
    sql(`select public.resize_reservation('${U1}', 'up', 999999, 0, '${NOW}', 900)`);
    expect(reservedSum(U1)).toBe(100000);
  });

  it("a pending reservation keeps counting until it is released", () => {
    reset();
    expect(reserve(U1, "p", 800000).ok).toBe(true);
    expect(reserve(U1, "q", 800000)).toMatchObject({ ok: false, scope: "daily" });
    sql(`select public.release_reservation('${U1}', 'p', '${NOW}')`);
    expect(reserve(U1, "q", 800000).ok).toBe(true);
  });

  it("stores the soft and hard expiry, and touch moves only the soft one", () => {
    reset();
    reserve(U1, "e", 100000);
    const gaps = `select extract(epoch from expires_at - created_at)::int || ',' || extract(epoch from hard_expires_at - created_at)::int from public.budget_reservations where idempotency_key = 'e'`;
    expect(sql(gaps)).toBe("900,86400");
    sql(`select public.touch_reservation('${U1}', 'e', '2026-10-08T09:20:00Z', 900)`);
    expect(sql(gaps)).toBe("1500,86400");
  });

  it("budget_status returns used, held and left without writing", () => {
    reset();
    reserve(U1, "u", 250000);
    sql(`select public.settle_reservation('${U1}', 'u', 250000, '${NOW}')`);
    reserve(U1, "b", 500000);
    const s = JSON.parse(sql(`select public.budget_status('${U1}', '${DAY}', '${MONTH}')`)) as Reply;
    expect(s.daily).toMatchObject({ budget: 1000000, spent: 250000, reserved: 500000 });
    expect(s.monthly).toMatchObject({ budget: 100000000, spent: 250000, reserved: 500000 });
  });

  it("spend survives deleting the user's other data: it lives in the reservation rows", () => {
    reset();
    reserve(U1, "keep", 100000);
    sql(`select public.settle_reservation('${U1}', 'keep', 100000, '${NOW}')`);
    sql("delete from public.runs");
    expect((JSON.parse(sql(`select public.budget_status('${U1}', '${DAY}', '${MONTH}')`)) as Reply).daily.spent).toBe(100000);
  });

  it("another user cannot reserve against, read, release or resize the owner's budget", () => {
    reset();
    reserve(U1, "own", 100000);
    const asU2 = (q: string) => spawnSync(path.join(pgBinDir, "psql"), psqlArgs(["-c", "set role authenticated", "-c", `select set_config('request.jwt.claim.sub', '${U2}', false)`, "-c", q]), { encoding: "utf8" });
    const r = asU2(reserveSql(U1, "theft", 100000));
    expect(r.status === 0 && r.stdout.includes('"ok": true')).toBe(false);
    expect(asU2("select count(*) from public.budget_reservations").stdout.trim().split("\n").pop()).toBe("0");
    asU2(`select public.release_reservation('${U1}', 'own', '${NOW}')`);
    asU2(`select public.resize_reservation('${U1}', 'own', 0, 0, '${NOW}', 900)`);
    expect(state("own")).toBe("reserved");
    expect(reservedSum(U1)).toBe(100000);
    expect(Number(sql(`select count(*) from public.budget_reservations where idempotency_key = 'theft'`))).toBe(0);
  });

  it("the owner can change the budget, and a budget cannot be negative", () => {
    expect(spawnSync(path.join(pgBinDir, "psql"), psqlArgs(["-c", `update public.spend_budgets set daily_budget_micros = -1 where owner_id = '${U1}'`]), { encoding: "utf8" }).status).not.toBe(0);
    setBudget(U1, 7000000, 70000000);
    expect(sql(`select daily_budget_micros from public.spend_budgets where owner_id = '${U1}'`)).toBe("7000000");
  });
});
