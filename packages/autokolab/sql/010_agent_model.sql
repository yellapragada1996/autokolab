-- AutoKolab schema 10: each agent's model and effort.
-- The website and the project's lead choose which model an agent runs and how hard it thinks; the
-- runner reads it before each run (AK-9), so the website never talks to the helper. null means
-- "not set from AutoKolab": the runner falls back to the agent's toml, then to the tool's default.
-- `model` is free text on purpose: names differ per vendor and change with every release, and the
-- tool itself rejects one it doesn't know. `effort` is the five levels Claude Code and Codex accept.
-- Who may set it (DEC-18): the agent's owner, and the lead agent of a project the agent is in.

alter table public.agents
  add column model        text check (model is null or char_length(model) between 1 and 60),
  add column effort       text check (effort is null or effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  add column model_set_by uuid,          -- the profile or agent that last set model/effort
  add column model_set_at timestamptz;

-- agents stays select-only for authenticated (004): these columns change only through here.
create or replace function public.set_agent_model(p_agent uuid, p_model text, p_effort text)
returns public.agents
language plpgsql security definer set search_path = public as $$
declare a public.agents;
begin
  if not exists (select 1 from public.agents where id = p_agent and owner_profile_id = auth.uid())
     and not exists (select 1 from public.projects p
                       join public.project_members pm
                         on pm.project_id = p.id and pm.actor_type = 'agent' and pm.actor_id = p_agent
                      where p.lead_agent_id = auth.uid()) then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only this agent''s owner or the project''s lead can change its model.';
  end if;
  if public.looks_like_secret(p_model) or public.looks_like_secret(p_effort) then
    raise exception 'AUTOKOLAB_SECRET: the model looks like it contains a key or token';
  end if;
  update public.agents
     set model = p_model, effort = p_effort, model_set_by = auth.uid(), model_set_at = now()
   where id = p_agent
  returning * into a;
  return a;
end $$;

revoke all on function public.set_agent_model(uuid, text, text) from public, anon;
grant execute on function public.set_agent_model(uuid, text, text) to authenticated, service_role;

update public.autokolab_meta set value = '10' where key = 'schema_version';
