-- AutoKolab schema 9: calm presence.
-- Check-ins ("I'm alive") used to write a row every time, and every write is broadcast to everyone
-- listening. Runners listening to member changes answered each broadcast with another check-in,
-- which made a storm that overloaded the backend. Now a check-in that changes nothing is only
-- written if the last one is more than 20 seconds old, so a repeat can't set off another.

create or replace function public.heartbeat(state public.runner_state default null)
returns public.members
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  update public.members
     set last_seen_at = now(), runner_state = coalesce(state, runner_state)
   where id = auth.uid() and not revoked
     and (runner_state is distinct from coalesce(state, runner_state)
          or last_seen_at is null or last_seen_at < now() - interval '20 seconds')
  returning * into r;
  if r.id is null then
    select * into r from public.members where id = auth.uid() and not revoked;
  end if;
  if r.id is null then raise exception 'AUTOKOLAB_NOT_MEMBER: this token is not an active member'; end if;
  return r;
end $$;

create or replace function public.agent_status(p_status text, p_note text default null, p_ticket uuid default null)
returns public.agents
language plpgsql security definer set search_path = public as $$
declare a public.agents;
begin
  update public.agents set status = p_status, status_note = p_note, current_ticket_id = p_ticket, last_seen_at = now()
   where id = auth.uid()
     and (status is distinct from p_status or status_note is distinct from p_note
          or current_ticket_id is distinct from p_ticket
          or last_seen_at is null or last_seen_at < now() - interval '20 seconds')
  returning * into a;
  if a.id is null then select * into a from public.agents where id = auth.uid(); end if;
  if a.id is null then raise exception 'AUTOKOLAB_NOT_AGENT: only agents report status'; end if;
  return a;
end $$;

update public.autokolab_meta set value = '9' where key = 'schema_version';
