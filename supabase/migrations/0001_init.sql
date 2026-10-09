-- looot-seo schema. Every table carries owner_id and row level security.
-- A signed-in user reads and writes only rows where owner_id = auth.uid(). There is no policy for anon,
-- and the app holds no service role key, so nothing in it can read across users.
-- Money is integer micros: millionths of a US dollar, the unit the looot catalog uses.

-- A child row must belong to the same user as its parent. Row level security hides other users'
-- parents from the lookup, so pointing a row at someone else's project or run fails here.
create function public.check_project_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.owner_id = new.owner_id) then
    raise exception 'project % does not belong to this user', new.project_id using errcode = '42501';
  end if;
  return new;
end $$;

create function public.check_run_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.runs r where r.id = new.run_id and r.owner_id = new.owner_id) then
    raise exception 'run % does not belong to this user', new.run_id using errcode = '42501';
  end if;
  return new;
end $$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  domain text not null,
  country text not null,
  language text not null,
  location_name text not null,
  depth int not null default 30 check (depth in (10, 20, 30, 50)),
  include_subdomains boolean not null default false,
  serp_operation text not null default 'serper-search',
  unique (owner_id, domain, country, language)
);
create index projects_owner on public.projects (owner_id, created_at);
alter table public.projects enable row level security;
alter table public.projects force row level security;
create policy projects_select on public.projects for select to authenticated using (owner_id = (select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated with check (owner_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy projects_delete on public.projects for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.projects to authenticated;

create table public.keywords (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phrase text not null,
  phrase_norm text not null,
  target_url text,
  tags text[] not null default '{}',
  track_ai_overview boolean not null default false,
  engine text not null default 'google',
  archived_at timestamptz,
  unique (project_id, phrase_norm, engine)
);
create index keywords_owner on public.keywords (owner_id, project_id);
alter table public.keywords enable row level security;
alter table public.keywords force row level security;
create policy keywords_select on public.keywords for select to authenticated using (owner_id = (select auth.uid()));
create policy keywords_insert on public.keywords for insert to authenticated with check (owner_id = (select auth.uid()));
create policy keywords_update on public.keywords for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy keywords_delete on public.keywords for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.keywords to authenticated;
create trigger keywords_owner_check before insert or update on public.keywords for each row execute function public.check_project_owner();

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  action text not null,
  title text not null default '',
  lines jsonb not null,
  items jsonb not null default '[]',
  scope jsonb not null default '{}',
  total_micros bigint not null check (total_micros >= 0),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index quotes_owner on public.quotes (owner_id, project_id);
alter table public.quotes enable row level security;
alter table public.quotes force row level security;
create policy quotes_select on public.quotes for select to authenticated using (owner_id = (select auth.uid()));
create policy quotes_insert on public.quotes for insert to authenticated with check (owner_id = (select auth.uid()));
create policy quotes_update on public.quotes for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy quotes_delete on public.quotes for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.quotes to authenticated;
create trigger quotes_owner_check before insert or update on public.quotes for each row execute function public.check_project_owner();

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  action text not null,
  idempotency_key text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed', 'cancelled')),
  items_total int not null default 0,
  items_done int not null default 0,
  quoted_micros bigint not null,
  max_cost_micros bigint not null,
  actual_cost_micros bigint not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  simulated boolean not null default false,
  over_cap_micros bigint not null default 0,
  unique (owner_id, idempotency_key),
  constraint runs_cap_at_or_under_quote check (max_cost_micros <= quoted_micros),
  constraint runs_cost_at_or_under_cap check (actual_cost_micros <= max_cost_micros)
);
create index runs_owner on public.runs (owner_id, project_id);
alter table public.runs enable row level security;
alter table public.runs force row level security;
create policy runs_select on public.runs for select to authenticated using (owner_id = (select auth.uid()));
create policy runs_insert on public.runs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy runs_update on public.runs for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy runs_delete on public.runs for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.runs to authenticated;
create trigger runs_owner_check before insert or update on public.runs for each row execute function public.check_project_owner();

create table public.run_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  run_id uuid not null references public.runs(id) on delete cascade,
  item_key text not null,
  operation_id text not null,
  input jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'skipped_budget', 'timed_out')),
  looot_run_id text,
  unit_price_micros bigint not null,
  actual_cost_micros bigint not null default 0,
  error_code text,
  error_message text,
  finished_at timestamptz,
  parse_ok boolean not null default true,
  result jsonb,
  unique (run_id, item_key)
);
create index run_items_owner on public.run_items (owner_id, run_id);
create index run_items_run on public.run_items (run_id);
alter table public.run_items enable row level security;
alter table public.run_items force row level security;
create policy run_items_select on public.run_items for select to authenticated using (owner_id = (select auth.uid()));
create policy run_items_insert on public.run_items for insert to authenticated with check (owner_id = (select auth.uid()));
create policy run_items_update on public.run_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy run_items_delete on public.run_items for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.run_items to authenticated;
create trigger run_items_owner_check before insert or update on public.run_items for each row execute function public.check_run_owner();

create table public.keyword_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phrase_norm text not null,
  country text not null,
  language text not null,
  volume int,
  cpc numeric(10, 2),
  competition numeric(4, 3),
  difficulty int check (difficulty between 0 and 100),
  intent text,
  monthly jsonb,
  fetched_at timestamptz not null default now(),
  run_id uuid references public.runs(id) on delete set null,
  unique (project_id, phrase_norm, country, language)
);
create index keyword_metrics_owner on public.keyword_metrics (owner_id, project_id);
alter table public.keyword_metrics enable row level security;
alter table public.keyword_metrics force row level security;
create policy keyword_metrics_select on public.keyword_metrics for select to authenticated using (owner_id = (select auth.uid()));
create policy keyword_metrics_insert on public.keyword_metrics for insert to authenticated with check (owner_id = (select auth.uid()));
create policy keyword_metrics_update on public.keyword_metrics for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy keyword_metrics_delete on public.keyword_metrics for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.keyword_metrics to authenticated;
create trigger keyword_metrics_owner_check before insert or update on public.keyword_metrics for each row execute function public.check_project_owner();

create table public.serp_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  fetched_at timestamptz not null default now(),
  operation_id text not null,
  organic jsonb not null default '[]',
  ai_overview jsonb,
  aio_checked boolean not null default false,
  people_also_ask jsonb not null default '[]',
  related jsonb not null default '[]',
  answer_box jsonb,
  knowledge jsonb,
  raw jsonb,
  parse_ok boolean not null default true,
  cost_micros bigint not null default 0,
  looot_run_id text
);
create index serp_snapshots_owner on public.serp_snapshots (owner_id, project_id);
create index serp_snapshots_keyword_time on public.serp_snapshots (keyword_id, fetched_at desc);
alter table public.serp_snapshots enable row level security;
alter table public.serp_snapshots force row level security;
create policy serp_snapshots_select on public.serp_snapshots for select to authenticated using (owner_id = (select auth.uid()));
create policy serp_snapshots_insert on public.serp_snapshots for insert to authenticated with check (owner_id = (select auth.uid()));
create policy serp_snapshots_update on public.serp_snapshots for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy serp_snapshots_delete on public.serp_snapshots for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.serp_snapshots to authenticated;
create trigger serp_snapshots_owner_check before insert or update on public.serp_snapshots for each row execute function public.check_project_owner();

create table public.rank_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  checked_at timestamptz not null default now(),
  depth int not null,
  position int check (position is null or position >= 1),
  url text,
  other_urls text[] not null default '{}',
  is_cannibalised boolean not null default false,
  features jsonb not null default '{}',
  snapshot_id uuid references public.serp_snapshots(id) on delete set null
);
create index rank_checks_owner on public.rank_checks (owner_id, project_id);
create index rank_checks_keyword_time on public.rank_checks (keyword_id, checked_at desc);
alter table public.rank_checks enable row level security;
alter table public.rank_checks force row level security;
create policy rank_checks_select on public.rank_checks for select to authenticated using (owner_id = (select auth.uid()));
create policy rank_checks_insert on public.rank_checks for insert to authenticated with check (owner_id = (select auth.uid()));
create policy rank_checks_update on public.rank_checks for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy rank_checks_delete on public.rank_checks for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.rank_checks to authenticated;
create trigger rank_checks_owner_check before insert or update on public.rank_checks for each row execute function public.check_project_owner();

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  label text,
  color_slot int not null check (color_slot between 1 and 8),
  unique (project_id, domain)
);
create index competitors_owner on public.competitors (owner_id, project_id);
alter table public.competitors enable row level security;
alter table public.competitors force row level security;
create policy competitors_select on public.competitors for select to authenticated using (owner_id = (select auth.uid()));
create policy competitors_insert on public.competitors for insert to authenticated with check (owner_id = (select auth.uid()));
create policy competitors_update on public.competitors for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy competitors_delete on public.competitors for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.competitors to authenticated;
create trigger competitors_owner_check before insert or update on public.competitors for each row execute function public.check_project_owner();

create table public.competitor_overlaps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  fetched_at timestamptz not null default now(),
  both_count int not null default 0,
  rows jsonb not null default '[]'
);
create index competitor_overlaps_owner on public.competitor_overlaps (owner_id, project_id);
alter table public.competitor_overlaps enable row level security;
alter table public.competitor_overlaps force row level security;
create policy competitor_overlaps_select on public.competitor_overlaps for select to authenticated using (owner_id = (select auth.uid()));
create policy competitor_overlaps_insert on public.competitor_overlaps for insert to authenticated with check (owner_id = (select auth.uid()));
create policy competitor_overlaps_update on public.competitor_overlaps for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy competitor_overlaps_delete on public.competitor_overlaps for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.competitor_overlaps to authenticated;
create trigger competitor_overlaps_owner_check before insert or update on public.competitor_overlaps for each row execute function public.check_project_owner();

create table public.domain_overviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  run_id uuid references public.runs(id) on delete set null,
  fetched_at timestamptz not null default now(),
  organic_keywords int,
  est_traffic numeric,
  distribution jsonb
);
create index domain_overviews_owner on public.domain_overviews (owner_id, project_id);
alter table public.domain_overviews enable row level security;
alter table public.domain_overviews force row level security;
create policy domain_overviews_select on public.domain_overviews for select to authenticated using (owner_id = (select auth.uid()));
create policy domain_overviews_insert on public.domain_overviews for insert to authenticated with check (owner_id = (select auth.uid()));
create policy domain_overviews_update on public.domain_overviews for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy domain_overviews_delete on public.domain_overviews for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.domain_overviews to authenticated;
create trigger domain_overviews_owner_check before insert or update on public.domain_overviews for each row execute function public.check_project_owner();

create table public.backlink_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  run_id uuid references public.runs(id) on delete set null,
  fetched_at timestamptz not null default now(),
  backlinks bigint,
  referring_domains int,
  domain_rank int,
  spam_score int,
  broken_backlinks int,
  new_lost jsonb,
  top_domains jsonb
);
create index backlink_snapshots_owner on public.backlink_snapshots (owner_id, project_id);
alter table public.backlink_snapshots enable row level security;
alter table public.backlink_snapshots force row level security;
create policy backlink_snapshots_select on public.backlink_snapshots for select to authenticated using (owner_id = (select auth.uid()));
create policy backlink_snapshots_insert on public.backlink_snapshots for insert to authenticated with check (owner_id = (select auth.uid()));
create policy backlink_snapshots_update on public.backlink_snapshots for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy backlink_snapshots_delete on public.backlink_snapshots for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.backlink_snapshots to authenticated;
create trigger backlink_snapshots_owner_check before insert or update on public.backlink_snapshots for each row execute function public.check_project_owner();

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  seeds text[] not null default '{}',
  sources text[] not null default '{}',
  country text not null,
  language text not null,
  results jsonb not null default '[]'
);
create index research_runs_owner on public.research_runs (owner_id, project_id);
alter table public.research_runs enable row level security;
alter table public.research_runs force row level security;
create policy research_runs_select on public.research_runs for select to authenticated using (owner_id = (select auth.uid()));
create policy research_runs_insert on public.research_runs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy research_runs_update on public.research_runs for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy research_runs_delete on public.research_runs for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.research_runs to authenticated;
create trigger research_runs_owner_check before insert or update on public.research_runs for each row execute function public.check_project_owner();

create table public.chart_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  noted_on date not null,
  body text not null check (char_length(body) <= 140)
);
create index chart_notes_owner on public.chart_notes (owner_id, project_id);
alter table public.chart_notes enable row level security;
alter table public.chart_notes force row level security;
create policy chart_notes_select on public.chart_notes for select to authenticated using (owner_id = (select auth.uid()));
create policy chart_notes_insert on public.chart_notes for insert to authenticated with check (owner_id = (select auth.uid()));
create policy chart_notes_update on public.chart_notes for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy chart_notes_delete on public.chart_notes for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.chart_notes to authenticated;
create trigger chart_notes_owner_check before insert or update on public.chart_notes for each row execute function public.check_project_owner();
