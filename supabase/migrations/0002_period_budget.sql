-- Period budget with atomic reservation. Additive: two new tables and seven functions.
-- Nothing is dropped or rewritten, so it is safe to apply over 0001_init.sql with data in it.
--
-- The owner sets a daily and a monthly budget. Before a paid run the app reserves the most that run
-- can cost (its cap) with reserve_budget(). The function locks the owner's spend_budgets row, adds
-- spent + reserved + the new amount and writes the reservation in the same transaction, so two
-- simultaneous runs cannot both pass. The budgets are read from the table here, never from the request.
--
-- Money is integer micros, as in 0001_init.sql. What was spent lives in budget_reservations
-- (spent_micros), not in runs, so deleting a project or all data does not reset the counters.

create table public.spend_budgets (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  daily_budget_micros bigint not null default 5000000 check (daily_budget_micros >= 0),
  monthly_budget_micros bigint not null default 50000000 check (monthly_budget_micros >= 0)
);
alter table public.spend_budgets enable row level security;
alter table public.spend_budgets force row level security;
create policy spend_budgets_select on public.spend_budgets for select to authenticated using (owner_id = (select auth.uid()));
create policy spend_budgets_insert on public.spend_budgets for insert to authenticated with check (owner_id = (select auth.uid()));
create policy spend_budgets_update on public.spend_budgets for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy spend_budgets_delete on public.spend_budgets for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.spend_budgets to authenticated;

-- One row per run that was reserved. state: reserved (amount_micros counts against the budget),
-- settled (the run ended, spent_micros is its real cost), released (nothing was spent).
create table public.budget_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The run's idempotency key. A second reservation for it is refused, so a pending run is never repeated.
  idempotency_key text not null,
  -- The part of the run's cap still held, in micros. Shrinks to the price of unresolved calls when a run ends.
  amount_micros bigint not null check (amount_micros >= 0),
  -- What the run has cost so far. Counts against the budget in the period the reservation was made.
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  state text not null default 'reserved' check (state in ('reserved', 'settled', 'released')),
  -- After this the reservation is checked against looot's real status (GET /v1/runs/{id}).
  expires_at timestamptz not null,
  -- After this a reservation that could not be resolved is released.
  hard_expires_at timestamptz not null,
  settled_at timestamptz,
  unique (owner_id, idempotency_key)
);
create index budget_reservations_owner_state on public.budget_reservations (owner_id, state);
create index budget_reservations_owner_created on public.budget_reservations (owner_id, created_at);
alter table public.budget_reservations enable row level security;
alter table public.budget_reservations force row level security;
create policy budget_reservations_select on public.budget_reservations for select to authenticated using (owner_id = (select auth.uid()));
create policy budget_reservations_insert on public.budget_reservations for insert to authenticated with check (owner_id = (select auth.uid()));
create policy budget_reservations_update on public.budget_reservations for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy budget_reservations_delete on public.budget_reservations for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.budget_reservations to authenticated;

-- Reserves one run. Returns jsonb:
--   { ok: true, daily: {budget, spent, reserved}, monthly: {...} }
--   { ok: false, reason: 'duplicate' | 'budget', scope: 'daily' | 'monthly', daily, monthly }
-- daily and monthly carry the numbers as they were before this call. Runs with the caller's rights,
-- so row level security stops a user from reserving against another owner.
create function public.reserve_budget(
  p_owner uuid,
  p_key text,
  p_amount bigint,
  p_now timestamptz,
  p_day_start timestamptz,
  p_month_start timestamptz,
  p_soft_seconds int,
  p_hard_seconds int
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_daily bigint;
  v_monthly bigint;
  v_spent_day bigint;
  v_spent_month bigint;
  v_reserved bigint;
  v_numbers jsonb;
begin
  insert into public.spend_budgets (owner_id) values (p_owner) on conflict (owner_id) do nothing;
  -- The row lock is the whole point: every reservation for this owner waits here, one at a time.
  select s.daily_budget_micros, s.monthly_budget_micros into v_daily, v_monthly
    from public.spend_budgets s where s.owner_id = p_owner for update;
  if v_daily is null then
    raise exception 'no budget row for owner %', p_owner using errcode = '42501';
  end if;

  select coalesce(sum(b.spent_micros), 0) into v_spent_day from public.budget_reservations b where b.owner_id = p_owner and b.created_at >= p_day_start;
  select coalesce(sum(b.spent_micros), 0) into v_spent_month from public.budget_reservations b where b.owner_id = p_owner and b.created_at >= p_month_start;
  select coalesce(sum(b.amount_micros), 0) into v_reserved from public.budget_reservations b where b.owner_id = p_owner and b.state = 'reserved';

  v_numbers := jsonb_build_object(
    'daily', jsonb_build_object('budget', v_daily, 'spent', v_spent_day, 'reserved', v_reserved),
    'monthly', jsonb_build_object('budget', v_monthly, 'spent', v_spent_month, 'reserved', v_reserved)
  );

  if exists (select 1 from public.budget_reservations b where b.owner_id = p_owner and b.idempotency_key = p_key) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate') || v_numbers;
  end if;
  if v_spent_day + v_reserved + p_amount > v_daily then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'daily') || v_numbers;
  end if;
  if v_spent_month + v_reserved + p_amount > v_monthly then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'monthly') || v_numbers;
  end if;

  insert into public.budget_reservations (owner_id, idempotency_key, amount_micros, created_at, expires_at, hard_expires_at)
  values (p_owner, p_key, p_amount, p_now, p_now + make_interval(secs => p_soft_seconds), p_now + make_interval(secs => p_hard_seconds));
  return jsonb_build_object('ok', true) || v_numbers;
end;
$$;

-- Used, held and the budgets for today and this month. Reads only.
create function public.budget_status(p_owner uuid, p_day_start timestamptz, p_month_start timestamptz) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'daily', jsonb_build_object(
      'budget', coalesce(s.daily_budget_micros, 5000000),
      'spent', (select coalesce(sum(b.spent_micros), 0) from public.budget_reservations b where b.owner_id = p_owner and b.created_at >= p_day_start),
      'reserved', (select coalesce(sum(b.amount_micros), 0) from public.budget_reservations b where b.owner_id = p_owner and b.state = 'reserved')),
    'monthly', jsonb_build_object(
      'budget', coalesce(s.monthly_budget_micros, 50000000),
      'spent', (select coalesce(sum(b.spent_micros), 0) from public.budget_reservations b where b.owner_id = p_owner and b.created_at >= p_month_start),
      'reserved', (select coalesce(sum(b.amount_micros), 0) from public.budget_reservations b where b.owner_id = p_owner and b.state = 'reserved')))
  from (select 1) one left join public.spend_budgets s on s.owner_id = p_owner;
$$;

-- The run ended. spent_micros is its real cost and the hold stops counting. Only a reserved row can settle.
create function public.settle_reservation(p_owner uuid, p_key text, p_spent bigint, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'settled', spent_micros = p_spent, settled_at = p_now
    where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

-- The run failed or was refused and nothing was spent. Only a reserved row can be released.
create function public.release_reservation(p_owner uuid, p_key text, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'released', settled_at = p_now
    where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

-- Some calls of the run are still open. Keep holding their price (never more than was reserved),
-- record what was spent so far, and restart the soft expiry.
create function public.resize_reservation(p_owner uuid, p_key text, p_hold bigint, p_spent bigint, p_now timestamptz, p_soft_seconds int) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations
    set amount_micros = least(amount_micros, greatest(p_hold, 0)), spent_micros = p_spent, expires_at = p_now + make_interval(secs => p_soft_seconds)
    where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

-- The run is making progress. Moves the soft expiry on, so a live run is not reconciled.
create function public.touch_reservation(p_owner uuid, p_key text, p_now timestamptz, p_soft_seconds int) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set expires_at = p_now + make_interval(secs => p_soft_seconds)
    where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

grant execute on function public.reserve_budget(uuid, text, bigint, timestamptz, timestamptz, timestamptz, int, int) to authenticated;
grant execute on function public.budget_status(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.settle_reservation(uuid, text, bigint, timestamptz) to authenticated;
grant execute on function public.release_reservation(uuid, text, timestamptz) to authenticated;
grant execute on function public.resize_reservation(uuid, text, bigint, bigint, timestamptz, int) to authenticated;
grant execute on function public.touch_reservation(uuid, text, timestamptz, int) to authenticated;

-- Postgres lets every role run a new function unless this is revoked. Only signed-in users may.
revoke execute on function public.reserve_budget(uuid, text, bigint, timestamptz, timestamptz, timestamptz, int, int) from public, anon;
revoke execute on function public.budget_status(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.settle_reservation(uuid, text, bigint, timestamptz) from public, anon;
revoke execute on function public.release_reservation(uuid, text, timestamptz) from public, anon;
revoke execute on function public.resize_reservation(uuid, text, bigint, bigint, timestamptz, int) from public, anon;
revoke execute on function public.touch_reservation(uuid, text, timestamptz, int) from public, anon;
