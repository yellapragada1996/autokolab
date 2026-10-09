-- AutoKolab schema 11: the model and effort a run actually used (AK-11).
-- What the owner or lead picks (schema 10) and what runs can differ: the machine can lock its own
-- settings (model_locked), an account or workspace can refuse or swap a model, and the tools quietly
-- clamp an effort a model doesn't support. The runner reports what it launched with, so the People
-- page can show when the two differ instead of a refused model looking like a plain failed run.
-- `effective_model` is the model the tool said it ran (Claude Code's init event) or, when the tool
-- doesn't say, the one the runner passed. `effective_effort` is always the effort the runner passed:
-- no tool reports it back. Both are written only by the agent itself, through agent_status.

alter table public.agents
  add column effective_model  text check (effective_model is null or char_length(effective_model) between 1 and 100),
  add column effective_effort text check (effective_effort is null or effective_effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  add column effective_at     timestamptz;

-- agent_status gains two optional arguments. Callers that leave them out (the MCP tools) keep what
-- the runner last reported; '' means "the tool's own default" and is stored as null.
drop function public.agent_status(text, text, uuid);
create function public.agent_status(p_status text, p_note text default null, p_ticket uuid default null,
                                    p_model text default null, p_effort text default null)
returns public.agents
language plpgsql security definer set search_path = public as $$
declare a public.agents;
begin
  if public.looks_like_secret(p_model) or public.looks_like_secret(p_effort) then
    raise exception 'AUTOKOLAB_SECRET: the model looks like it contains a key or token';
  end if;
  update public.agents
     set status = p_status, status_note = p_note, current_ticket_id = p_ticket, last_seen_at = now(),
         effective_model  = case when p_model  is null then effective_model  else nullif(p_model, '')  end,
         effective_effort = case when p_effort is null then effective_effort else nullif(p_effort, '') end,
         effective_at     = case when p_model is null and p_effort is null then effective_at else now() end
   where id = auth.uid()
     and (status is distinct from p_status or status_note is distinct from p_note
          or current_ticket_id is distinct from p_ticket
          or (p_model is not null and effective_model is distinct from nullif(p_model, ''))
          or (p_effort is not null and effective_effort is distinct from nullif(p_effort, ''))
          or last_seen_at is null or last_seen_at < now() - interval '20 seconds')
  returning * into a;
  if a.id is null then select * into a from public.agents where id = auth.uid(); end if;
  if a.id is null then raise exception 'AUTOKOLAB_NOT_AGENT: only agents report status'; end if;
  return a;
end $$;

revoke all on function public.agent_status(text, text, uuid, text, text) from public, anon;
grant execute on function public.agent_status(text, text, uuid, text, text) to authenticated, service_role;

update public.autokolab_meta set value = '11' where key = 'schema_version';
