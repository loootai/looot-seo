-- Row level security checks. Prints one "label|value" line per check; scripts/test-postgres-rls.sh compares them.
\set a '11111111-1111-1111-1111-111111111111'
\set b '22222222-2222-2222-2222-222222222222'
\set QUIET on
\pset tuples_only on
\pset format unaligned

select 'tables without forced rls|' || count(*) from pg_tables t join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
  where t.schemaname = 'public' and not (c.relrowsecurity and c.relforcerowsecurity);
select 'public tables|' || count(*) from pg_tables where schemaname = 'public';

-- User A fills one row in every table.
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false) \gset
insert into projects (id, name, domain, country, language, location_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'A site', 'a-site.example', 'US', 'en', 'United States');
insert into keywords (id, project_id, phrase, phrase_norm) values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'alpha', 'alpha');
insert into quotes (id, project_id, action, lines, total_micros, expires_at) values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'check_rankings', '[]', 3000, now() + interval '10 minutes');
insert into runs (id, project_id, quote_id, action, idempotency_key, quoted_micros, max_cost_micros) values ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'check_rankings', 'key-1', 3000, 3000);
insert into run_items (run_id, item_key, operation_id, unit_price_micros) values ('aaaaaaaa-0000-0000-0000-000000000004', 'kw:1:p1', 'serper-search', 1000);
insert into keyword_metrics (project_id, phrase_norm, country, language, volume) values ('aaaaaaaa-0000-0000-0000-000000000001', 'alpha', 'US', 'en', 100);
insert into serp_snapshots (id, project_id, keyword_id, operation_id) values ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'serper-search');
insert into rank_checks (project_id, keyword_id, depth, position) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 30, 4);
insert into competitors (id, project_id, domain, color_slot) values ('aaaaaaaa-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'rival.example', 2);
insert into competitor_overlaps (project_id, competitor_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000006');
insert into domain_overviews (project_id, domain) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a-site.example');
insert into backlink_snapshots (project_id, domain) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a-site.example');
insert into research_runs (project_id, country, language) values ('aaaaaaaa-0000-0000-0000-000000000001', 'US', 'en');
insert into chart_notes (project_id, noted_on, body) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-08', 'note');
insert into spend_budgets (daily_budget_micros) values (1000000);
insert into budget_reservations (idempotency_key, amount_micros, expires_at, hard_expires_at) values ('key-1', 3000, now(), now());

create temp table counts (who text, tbl text, n bigint);
grant all on counts to authenticated, anon;
do $$ declare t text; n bigint; begin
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    execute format('select count(*) from public.%I', t) into n; insert into counts values ('a', t, n);
  end loop; end $$;
select 'tables where A sees its row|' || count(*) from counts where who = 'a' and n = 1;

-- The same repeat of an idempotency key is refused, so one key is one run.
do $$ begin
  insert into runs (project_id, action, idempotency_key, quoted_micros, max_cost_micros) values ('aaaaaaaa-0000-0000-0000-000000000001', 'check_rankings', 'key-1', 3000, 3000);
  raise notice 'FAIL duplicate key accepted';
exception when unique_violation then perform set_config('test.dup', 'refused', false); end $$;
select 'duplicate idempotency key|' || current_setting('test.dup', true);

-- Money constraints.
do $$ begin
  update runs set actual_cost_micros = 3001 where id = 'aaaaaaaa-0000-0000-0000-000000000004';
  raise notice 'FAIL cost above cap accepted';
exception when check_violation then perform set_config('test.cost', 'refused', false); end $$;
select 'actual cost above cap|' || current_setting('test.cost', true);
do $$ begin
  insert into runs (project_id, action, idempotency_key, quoted_micros, max_cost_micros) values ('aaaaaaaa-0000-0000-0000-000000000001', 'check_rankings', 'key-2', 3000, 3001);
  raise notice 'FAIL cap above quote accepted';
exception when check_violation then perform set_config('test.cap', 'refused', false); end $$;
select 'cap above quote|' || current_setting('test.cap', true);

-- User B.
select set_config('request.jwt.claim.sub', :'b', false) \gset
do $$ declare t text; n bigint; begin
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    execute format('select count(*) from public.%I', t) into n; insert into counts values ('b', t, n);
  end loop; end $$;
select 'rows of A that B sees|' || coalesce(sum(n), 0) from counts where who = 'b';

do $$ declare t text; n bigint; total bigint := 0; begin
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    execute format('with x as (update public.%I set created_at = created_at returning 1) select count(*) from x', t) into n; total := total + n;
  end loop; perform set_config('test.upd', total::text, false); end $$;
select 'rows of A that B updated|' || current_setting('test.upd', true);
do $$ declare t text; n bigint; total bigint := 0; begin
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    execute format('with x as (delete from public.%I returning 1) select count(*) from x', t) into n; total := total + n;
  end loop; perform set_config('test.del', total::text, false); end $$;
select 'rows of A that B deleted|' || current_setting('test.del', true);

do $$ begin
  insert into projects (owner_id, name, domain, country, language, location_name) values ('11111111-1111-1111-1111-111111111111', 'spoof', 'spoof.example', 'US', 'en', 'United States');
  raise notice 'FAIL spoofed owner accepted';
exception when insufficient_privilege then perform set_config('test.spoof', 'refused', false); end $$;
select 'B inserts with owner_id of A|' || current_setting('test.spoof', true);

do $$ begin
  insert into keywords (project_id, phrase, phrase_norm) values ('aaaaaaaa-0000-0000-0000-000000000001', 'sneak', 'sneak');
  raise notice 'FAIL keyword on another user project accepted';
exception when insufficient_privilege then perform set_config('test.sneak', 'refused', false); end $$;
select 'B adds a keyword to a project of A|' || current_setting('test.sneak', true);

do $$ begin
  insert into run_items (run_id, item_key, operation_id, unit_price_micros) values ('aaaaaaaa-0000-0000-0000-000000000004', 'x', 'serper-search', 1000);
  raise notice 'FAIL run item on another user run accepted';
exception when insufficient_privilege then perform set_config('test.item', 'refused', false); end $$;
select 'B adds an item to a run of A|' || current_setting('test.item', true);

-- B cannot reserve against, release or resize A's budget, and cannot read it.
select 'B reads budget rows of A|' || ((select count(*) from spend_budgets) + (select count(*) from budget_reservations));
do $$ begin
  perform public.release_reservation('11111111-1111-1111-1111-111111111111', 'key-1', now());
  perform public.resize_reservation('11111111-1111-1111-1111-111111111111', 'key-1', 0, 0, now(), 900);
  perform set_config('test.fn', 'no effect', false);
end $$;
select 'B releases or resizes a reservation of A|' || current_setting('test.fn', true);
do $$ begin
  perform public.reserve_budget('11111111-1111-1111-1111-111111111111', 'steal', 1, now(), now(), now(), 900, 86400);
  raise notice 'FAIL reserve against another owner accepted';
exception when insufficient_privilege then perform set_config('test.res', 'refused', false); end $$;
select 'B reserves against the budget of A|' || current_setting('test.res', true);

-- anon: no policy, so no rows.
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ declare t text; n bigint; begin
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    execute format('select count(*) from public.%I', t) into n; insert into counts values ('anon', t, n);
  end loop; end $$;
select 'rows anon sees|' || coalesce(sum(n), 0) from counts where who = 'anon';
reset role;

-- A still has everything after B's attempts.
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false) \gset
select 'reservation of A still held|' || (select state from budget_reservations where idempotency_key = 'key-1');
select 'rows A still has|' || (select count(*) from projects) + (select count(*) from keywords) + (select count(*) from runs) + (select count(*) from run_items);
