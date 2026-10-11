-- AutoKolab schema 19: how much of its day an agent has used, for Overview's Team block (AK-76).
-- Each owner sets how long their agent may work per day (DEC-12); the time used is counted on the
-- agent's own machine. Until now nobody else could see it, so "who is free, who is out of time"
-- had to be asked. The runner now reports:
--   used_today_s    seconds worked on usage_day
--   daily_limit_s   the owner's daily limit, in seconds
--   usage_day       the local day on the agent's machine those seconds belong to
--   waiting_until   when it expects to work again while it waits out a limit; null otherwise
-- All four are written only by the agent itself, through report_usage (the column grants in 004
-- don't include them). Existing agents get four empty columns and nothing else changes.

alter table public.agents
  add column used_today_s  integer check (used_today_s is null or used_today_s between 0 and 86400),
  add column daily_limit_s integer check (daily_limit_s is null or daily_limit_s between 0 and 86400),
  add column usage_day     date,
  add column waiting_until timestamptz;

create function public.report_usage(p_used_s integer, p_limit_s integer, p_day date, p_waiting_until timestamptz default null)
returns public.agents
language plpgsql security definer set search_path = public as $$
declare a public.agents;
begin
  update public.agents
     set used_today_s = least(greatest(p_used_s, 0), 86400), daily_limit_s = least(greatest(p_limit_s, 0), 86400),
         usage_day = p_day, waiting_until = p_waiting_until
   where id = auth.uid()
     and (used_today_s is distinct from least(greatest(p_used_s, 0), 86400)
          or daily_limit_s is distinct from least(greatest(p_limit_s, 0), 86400)
          or usage_day is distinct from p_day or waiting_until is distinct from p_waiting_until)
  returning * into a;
  if a.id is null then select * into a from public.agents where id = auth.uid(); end if;
  if a.id is null then raise exception 'AUTOKOLAB_NOT_AGENT: only agents report their usage'; end if;
  return a;
end $$;

revoke all on function public.report_usage(integer, integer, date, timestamptz) from public, anon;
grant execute on function public.report_usage(integer, integer, date, timestamptz) to authenticated, service_role;

update public.autokolab_meta set value = '19' where key = 'schema_version';
