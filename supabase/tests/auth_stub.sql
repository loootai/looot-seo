-- Stand-in for the Supabase auth schema and roles, so the migration can run on a plain local Postgres.
-- Used only by scripts/test-postgres-rls.sh. Never apply this to a Supabase project.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
-- Supabase gives anon table privileges by default and leaves the filtering to row level security. Same here.
alter default privileges in schema public grant select on tables to anon;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
