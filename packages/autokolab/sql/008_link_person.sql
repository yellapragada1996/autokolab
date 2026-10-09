-- AutoKolab schema 8: one person, one identity.
-- People who joined a room before the website existed have a room identity (a token on their
-- computer) and now also a GitHub sign-in on the website. When they run the connect line, the
-- helper signs in with their room identity and links the two: the pairing code proves the website
-- side, the token proves the computer side. If the website already made a room identity for that
-- sign-in (when they joined with an invite link), it's merged into the old one.

create or replace function public.link_my_profile(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.device_pairings; me public.members; dup public.members;
begin
  select * into d from public.device_pairings where code = public.norm_code(p_code);
  if d.code is null or d.expires_at < now() then
    raise exception 'AUTOKOLAB_BAD_PAIRING: that code has expired; get a new one on the website';
  end if;
  select * into me from public.members where id = auth.uid() and kind = 'human' and not revoked;
  if me.id is null then raise exception 'AUTOKOLAB_FORBIDDEN: only a person can link their sign-in'; end if;
  if me.profile_id = d.profile_id then return jsonb_build_object('name', me.name, 'merged', false); end if;
  if me.profile_id is not null then
    raise exception 'AUTOKOLAB_FORBIDDEN: this computer belongs to someone else signed in on the website';
  end if;

  select * into dup from public.members where profile_id = d.profile_id and id <> me.id;
  if dup.id is not null then
    -- Move everything the website-made identity has to the person's existing one.
    update public.messages set sender_id = me.id where sender_id = dup.id;
    update public.messages set to_id = me.id where to_id = dup.id;
    insert into public.room_members (room_id, member_id, role, can_instruct)
      select room_id, me.id, role, can_instruct from public.room_members where member_id = dup.id
      on conflict do nothing;
    delete from public.room_members where member_id = dup.id;
    delete from public.read_cursors where member_id = dup.id;
    update public.members set owner_id = me.id where owner_id = dup.id and id <> dup.id;
    update public.members set profile_id = null where id = dup.id;
    delete from public.members where id = dup.id;
  end if;
  update public.members set profile_id = d.profile_id where id = me.id;
  update public.agents set owner_profile_id = d.profile_id where owner_profile_id is null and id in (select id from public.members where owner_id = me.id);
  return jsonb_build_object('name', me.name, 'merged', dup.id is not null);
end $$;

-- A retired agent says so (it used to say "someone else's").
create or replace function public.pair_agent_internal(p_code text, p_agent uuid, p_vendor text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.device_pairings; owner_m public.members; m public.members; pr public.projects;
begin
  select * into d from public.device_pairings where code = public.norm_code(p_code);
  if d.code is null or d.expires_at < now() then
    raise exception 'AUTOKOLAB_BAD_PAIRING: that code has expired; get a new one on the website';
  end if;
  if p_vendor not in ('claude', 'codex') then raise exception 'AUTOKOLAB_BAD_PAIRING: unknown agent %', p_vendor; end if;
  owner_m := public.ensure_profile_member(d.profile_id);
  select * into m from public.members where id = p_agent;
  if m.id is null then
    insert into public.members (id, name, kind, owner_id, client)
      values (p_agent, public.unique_member_name(p_name), 'agent', owner_m.id,
              case p_vendor when 'claude' then 'claude-code' else 'codex' end)
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

revoke all on function public.link_my_profile(text) from public, anon;
grant execute on function public.link_my_profile(text) to authenticated, service_role;

update public.autokolab_meta set value = '8' where key = 'schema_version';
