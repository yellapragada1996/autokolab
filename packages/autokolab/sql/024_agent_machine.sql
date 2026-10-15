-- AutoKolab schema 24: which computer an agent runs on, and an API-model agent's daily dollar limit
-- (AK-112, CON-25). Both live only in the runner's settings on that computer, so People could say no
-- more than "its owner's computer" and "daily limit set on its computer". The runner now reports:
--   machine     the computer's name (its hostname, without ".local")
--   daily_usd   the API-model agent's active daily_usd; 0 is no limit, null for other agents
-- Never a key or the settings file itself. Written only by the agent itself, through report_machine
-- (the column grants in 004 don't include them). A separate function, so report_usage and older
-- helpers are untouched. Existing agents get two empty columns and nothing else changes.

alter table public.agents
  add column machine   text check (machine is null or machine ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$'),
  add column daily_usd numeric(10, 2) check (daily_usd is null or daily_usd between 0 and 10000);

-- A name that isn't a plain hostname, or looks like a key, is stored as unknown rather than refused,
-- so a strange computer name never stops the runner.
create function public.report_machine(p_machine text, p_daily_usd numeric)
returns public.agents
language plpgsql security definer set search_path = public as $$
declare
  a public.agents;
  m text := case when p_machine ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$' and not public.looks_like_secret(p_machine) then p_machine end;
  d numeric(10, 2) := case when p_daily_usd between 0 and 10000 then round(p_daily_usd, 2) end;
begin
  update public.agents
     set machine = m, daily_usd = d
   where id = auth.uid()
     and (machine is distinct from m or daily_usd is distinct from d)
  returning * into a;
  if a.id is null then select * into a from public.agents where id = auth.uid(); end if;
  if a.id is null then raise exception 'AUTOKOLAB_NOT_AGENT: only agents report their computer'; end if;
  return a;
end $$;

revoke all on function public.report_machine(text, numeric) from public, anon;
grant execute on function public.report_machine(text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------- schema version

update public.autokolab_meta set value = '24' where key = 'schema_version';
