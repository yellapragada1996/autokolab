-- Minimal stand-ins for what a Supabase project provides, so the migration can be tested on
-- plain Postgres: the anon/authenticated roles, auth.uid(), and the realtime publication.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create publication supabase_realtime;

-- The strict setup Supabase recommends ("Automatically expose new tables" off): no default
-- privileges at all, and functions not executable by everyone. The schema must grant what it needs.
revoke all on schema public from public;
alter default privileges in schema public revoke execute on functions from public;
