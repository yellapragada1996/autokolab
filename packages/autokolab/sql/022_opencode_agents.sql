-- AutoKolab schema 22: API-model agents can join a project (AK-108, DEC-20, DEC-26, CON-25).
-- Besides Claude Code and Codex, an agent's vendor can be "opencode": any provider's model through
-- OpenCode, on its owner's computer, with its key kept there. Pairing accepts it, and its room
-- identity's client is "opencode". The provider and model aren't stored here: the agent reports the
-- model it ran (effective_model, e.g. "deepseek/deepseek-chat") on its first run.
--
-- Existing rows don't change: every agent today is claude or codex, which stay allowed.

alter table public.agents drop constraint if exists agents_vendor_check;
alter table public.agents add constraint agents_vendor_check check (vendor in ('claude', 'codex', 'opencode'));

-- As in schema 8, with "opencode" allowed and its client named after it.
create or replace function public.pair_agent_internal(p_code text, p_agent uuid, p_vendor text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.device_pairings; owner_m public.members; m public.members; pr public.projects;
begin
  select * into d from public.device_pairings where code = public.norm_code(p_code);
  if d.code is null or d.expires_at < now() then
    raise exception 'AUTOKOLAB_BAD_PAIRING: that code has expired; get a new one on the website';
  end if;
  if p_vendor is null or p_vendor not in ('claude', 'codex', 'opencode') then
    raise exception 'AUTOKOLAB_BAD_PAIRING: unknown agent %', p_vendor;
  end if;
  owner_m := public.ensure_profile_member(d.profile_id);
  select * into m from public.members where id = p_agent;
  if m.id is null then
    insert into public.members (id, name, kind, owner_id, client)
      values (p_agent, public.unique_member_name(p_name), 'agent', owner_m.id,
              case p_vendor when 'claude' then 'claude-code' else p_vendor end)
      returning * into m;
  elsif m.kind <> 'agent' or m.owner_id <> owner_m.id then
    raise exception 'AUTOKOLAB_FORBIDDEN: that agent belongs to someone else';
  elsif m.revoked then
    raise exception 'AUTOKOLAB_FORBIDDEN: that agent was retired';
  end if;
  insert into public.agents (id, owner_profile_id, owner_label, vendor, display_name)
    values (m.id, d.profile_id, owner_m.name, p_vendor, m.name)
    on conflict (id) do update set owner_profile_id = coalesce(public.agents.owner_profile_id, excluded.owner_profile_id);
  insert into public.project_members (project_id, actor_id, actor_type) values (d.project_id, m.id, 'agent')
    on conflict do nothing;
  update public.device_pairings set used_at = coalesce(used_at, now()) where code = d.code;
  select * into pr from public.projects where id = d.project_id;
  return jsonb_build_object('agent_id', m.id, 'name', m.name, 'project', pr.name, 'slug', pr.slug, 'repo', pr.repo);
end $$;

-- An agent that already exists on the computer, joining another project by itself: an OpenCode agent
-- stays one (schema 7 counted every client but codex as Claude Code).
create or replace function public.pair_existing_agent(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where id = auth.uid() and kind = 'agent';
  if m.id is null then raise exception 'AUTOKOLAB_FORBIDDEN: only an agent can join with its own sign-in'; end if;
  return public.pair_agent_internal(p_code, m.id, case m.client when 'codex' then 'codex' when 'opencode' then 'opencode' else 'claude' end, m.name);
end $$;

-- Grants as in schema 7: only the server pairs new agents; agents pair themselves.
revoke all on function public.pair_agent_internal(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.pair_existing_agent(text) from public, anon;
grant execute on function public.pair_existing_agent(text) to authenticated, service_role;

update public.autokolab_meta set value = '22' where key = 'schema_version';
