-- AutoKolab schema 7: joining.
-- - Every project gets a room (the live chat), and everyone in the project is in it.
-- - Invite links: the owner makes one, a person signs in with GitHub and joins with one click.
-- - Pairing codes: a person connects a computer and its agents (Claude Code, Codex) to a project
--   with one terminal line. New agents get their sign-in from the server; agents that already
--   exist on that computer join by themselves.

-- ---------------------------------------------------------------- codes

-- Short codes people can read and type: no 0/O, 1/I/L.
create or replace function public.random_code(n int default 8) returns text
language plpgsql volatile set search_path = public as $$
declare
  a text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  b bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  s text := '';
  i int := 0;
begin
  while length(s) < n loop
    if i % 16 not in (6, 8) then s := s || substr(a, (get_byte(b, i) % length(a)) + 1, 1); end if; -- skip uuid version bytes
    i := i + 1;
  end loop;
  return s;
end $$;

create or replace function public.norm_code(c text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(c, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- ---------------------------------------------------------------- names

create or replace function public.unique_member_name(wanted text) returns text
language plpgsql stable security definer set search_path = public as $$
declare base text; nm text; i int := 1;
begin
  base := left(regexp_replace(regexp_replace(lower(coalesce(wanted, '')), '[^a-z0-9-]+', '-', 'g'), '^-+|-+$', '', 'g'), 36);
  if length(base) < 2 then base := 'member'; end if;
  nm := base;
  while exists (select 1 from public.members where name = nm) loop
    i := i + 1;
    nm := base || '-' || i;
  end loop;
  return nm;
end $$;

-- ---------------------------------------------------------------- people in rooms

-- The room member for someone who signed in on the website, created the first time it's needed.
create or replace function public.ensure_profile_member(p uuid) returns public.members
language plpgsql security definer set search_path = public as $$
declare m public.members; pr public.profiles;
begin
  select * into m from public.members where profile_id = p;
  if m.id is not null then return m; end if;
  select * into m from public.members where id = p;
  if m.id is not null then
    update public.members set profile_id = p where id = m.id returning * into m;
    return m;
  end if;
  select * into pr from public.profiles where id = p;
  if pr.id is null then raise exception 'AUTOKOLAB_NOT_FOUND: sign in on the website first'; end if;
  insert into public.members (id, name, kind, owner_id, client, timezone, profile_id)
    values (p, public.unique_member_name(coalesce(pr.github_login, pr.name)), 'human', p, 'web', pr.timezone, p)
    returning * into m;
  return m;
end $$;

-- ---------------------------------------------------------------- a room for every project

alter table public.projects add column room_id uuid references public.rooms(id) on delete set null;

-- Put one project member into the project's room (people can instruct; the lead leads).
create or replace function public.sync_room_member(p_project uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.projects; pm public.project_members; mid uuid; is_lead boolean;
begin
  select * into pr from public.projects where id = p_project;
  if pr.room_id is null then return; end if;
  select * into pm from public.project_members where project_id = p_project and actor_id = p_actor;
  if pm.actor_id is null then return; end if;
  if pm.actor_type = 'human' then
    mid := (public.ensure_profile_member(p_actor)).id;
    insert into public.room_members (room_id, member_id, role, can_instruct) values (pr.room_id, mid, 'human', true)
      on conflict do nothing;
  elsif exists (select 1 from public.members where id = p_actor) then
    is_lead := coalesce(pr.lead_agent_id = p_actor, false);
    insert into public.room_members (room_id, member_id, role, can_instruct)
      values (pr.room_id, p_actor, case when is_lead then 'lead' else 'follower' end::public.member_role, is_lead)
      on conflict do nothing;
  end if;
end $$;

create or replace function public.ensure_project_room(p_project uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pr public.projects; r uuid; base text; nm text; i int := 1;
begin
  select * into pr from public.projects where id = p_project;
  if pr.id is null then return null; end if;
  if pr.room_id is not null then return pr.room_id; end if;
  if pr.repo is not null then select id into r from public.rooms where repo = pr.repo; end if;
  if r is null then
    base := left(pr.slug, 36);
    nm := base;
    while exists (select 1 from public.rooms where name = nm) loop
      i := i + 1;
      nm := base || '-' || i;
    end loop;
    insert into public.rooms (name, repo) values (nm, pr.repo) returning id into r;
  end if;
  update public.projects set room_id = r where id = p_project;
  perform public.sync_room_member(p_project, actor_id) from public.project_members where project_id = p_project;
  return r;
end $$;

-- Joining the project means joining its room.
create or replace function public.project_members_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_room_member(new.project_id, new.actor_id);
  return new;
end $$;

create trigger project_members_room after insert on public.project_members
  for each row execute function public.project_members_room();

-- The project's lead leads its room too.
create or replace function public.projects_lead_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.room_id is null then return new; end if;
  if old.lead_agent_id is not null then
    update public.room_members set role = 'follower', can_instruct = false
     where room_id = new.room_id and member_id = old.lead_agent_id and role = 'lead';
  end if;
  if new.lead_agent_id is not null and exists (select 1 from public.members where id = new.lead_agent_id) then
    insert into public.room_members (room_id, member_id, role, can_instruct) values (new.room_id, new.lead_agent_id, 'lead', true)
      on conflict (room_id, member_id) do update set role = 'lead', can_instruct = true;
  end if;
  return new;
end $$;

create trigger projects_lead_room after update of lead_agent_id on public.projects
  for each row when (old.lead_agent_id is distinct from new.lead_agent_id)
  execute function public.projects_lead_room();

-- New projects get their room right away.
create or replace function public.create_project(p_name text, p_repo text, p_prefix text, p_slug text default null)
returns public.projects
language plpgsql security definer set search_path = public as $$
declare pr public.projects; s text;
begin
  if public.actor_type() is distinct from 'human' then raise exception 'AUTOKOLAB_FORBIDDEN: only people can create projects'; end if;
  s := coalesce(p_slug, regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  insert into public.projects (name, slug, repo, ticket_prefix, owner_id)
    values (p_name, s, nullif(lower(p_repo), ''), upper(p_prefix), auth.uid())
    returning * into pr;
  insert into public.project_members (project_id, actor_id, actor_type, role) values (pr.id, auth.uid(), 'human', 'owner');
  insert into public.project_guides (project_id, updated_by) values (pr.id, auth.uid());
  perform public.ensure_project_room(pr.id);
  select * into pr from public.projects where id = pr.id;
  return pr;
exception when unique_violation then
  raise exception 'AUTOKOLAB_TAKEN: a project with that short name already exists';
end $$;

-- Existing projects get their room now (an existing room for the same repo is reused).
do $$ begin perform public.ensure_project_room(id) from public.projects; end $$;

-- ---------------------------------------------------------------- invite links (people)

create table public.project_invites (
  code        text primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  max_uses    int check (max_uses is null or max_uses > 0),
  uses        int not null default 0,
  revoked     boolean not null default false
);
create index project_invites_project_idx on public.project_invites (project_id);
alter table public.project_invites enable row level security;
create policy invites_read on public.project_invites for select to authenticated using (public.is_project_owner(project_id));
grant select on public.project_invites to authenticated;
grant all on public.project_invites to service_role;

create or replace function public.create_invite(p_project uuid, p_days int default 7, p_max_uses int default null)
returns public.project_invites
language plpgsql security definer set search_path = public as $$
declare inv public.project_invites;
begin
  if not public.is_project_owner(p_project) then raise exception 'AUTOKOLAB_FORBIDDEN: only the project owner can invite people'; end if;
  if p_days < 1 or p_days > 30 then raise exception 'AUTOKOLAB_BAD_INVITE: an invite lasts 1 to 30 days'; end if;
  insert into public.project_invites (code, project_id, created_by, expires_at, max_uses)
    values (public.random_code(8), p_project, auth.uid(), now() + make_interval(days => p_days), p_max_uses)
    returning * into inv;
  return inv;
end $$;

create or replace function public.revoke_invite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare inv public.project_invites;
begin
  select * into inv from public.project_invites where code = public.norm_code(p_code);
  if inv.code is null or not public.is_project_owner(inv.project_id) then raise exception 'AUTOKOLAB_FORBIDDEN: not your invite'; end if;
  update public.project_invites set revoked = true where code = inv.code;
end $$;

-- What an invite is for, so the join page can say it before anyone signs in.
create or replace function public.peek_project_invite(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare inv public.project_invites; pr public.projects; reason text;
begin
  select * into inv from public.project_invites where code = public.norm_code(p_code);
  if inv.code is null then return null; end if;
  select * into pr from public.projects where id = inv.project_id;
  reason := case
    when inv.revoked then 'revoked'
    when inv.expires_at < now() then 'expired'
    when inv.max_uses is not null and inv.uses >= inv.max_uses then 'used'
  end;
  return jsonb_build_object(
    'project', pr.name, 'slug', pr.slug, 'repo', pr.repo,
    'invited_by', (select name from public.profiles where id = inv.created_by),
    'people', (select count(*) from public.project_members where project_id = pr.id and actor_type = 'human'),
    'agents', (select count(*) from public.project_members where project_id = pr.id and actor_type = 'agent'),
    'valid', reason is null, 'reason', reason,
    'member', auth.uid() is not null and exists (select 1 from public.project_members where project_id = pr.id and actor_id = auth.uid()));
end $$;

create or replace function public.accept_invite(p_code text) returns public.projects
language plpgsql security definer set search_path = public as $$
declare inv public.project_invites; pr public.projects;
begin
  if public.actor_type() is distinct from 'human' then raise exception 'AUTOKOLAB_FORBIDDEN: sign in with GitHub to join'; end if;
  select * into inv from public.project_invites where code = public.norm_code(p_code) for update;
  if inv.code is null then raise exception 'AUTOKOLAB_NOT_FOUND: that invite doesn''t exist'; end if;
  select * into pr from public.projects where id = inv.project_id;
  if exists (select 1 from public.project_members where project_id = pr.id and actor_id = auth.uid()) then return pr; end if;
  if inv.revoked then raise exception 'AUTOKOLAB_BAD_INVITE: this invite was cancelled; ask for a new one'; end if;
  if inv.expires_at < now() then raise exception 'AUTOKOLAB_BAD_INVITE: this invite has expired; ask for a new one'; end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception 'AUTOKOLAB_BAD_INVITE: this invite has been used up; ask for a new one'; end if;
  insert into public.project_members (project_id, actor_id, actor_type) values (pr.id, auth.uid(), 'human');
  update public.project_invites set uses = uses + 1 where code = inv.code;
  return pr;
end $$;

-- ---------------------------------------------------------------- pairing codes (computers and agents)

create table public.device_pairings (
  code        text primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 minutes',
  used_at     timestamptz
);
alter table public.device_pairings enable row level security;
create policy pairings_own on public.device_pairings for select to authenticated using (profile_id = auth.uid());
grant select on public.device_pairings to authenticated;
grant all on public.device_pairings to service_role;

create or replace function public.create_pairing(p_project uuid) returns public.device_pairings
language plpgsql security definer set search_path = public as $$
declare d public.device_pairings;
begin
  if public.actor_type() is distinct from 'human' or not public.is_project_member(p_project) then
    raise exception 'AUTOKOLAB_FORBIDDEN: join the project first';
  end if;
  insert into public.device_pairings (code, profile_id, project_id) values (public.random_code(8), auth.uid(), p_project)
    returning * into d;
  return d;
end $$;

-- Put an agent in the pairing's project: create its room identity if it's new (the server made its
-- sign-in), check its owner if it exists, and add it to the board and the room.
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
  elsif m.kind <> 'agent' or m.owner_id <> owner_m.id or m.revoked then
    raise exception 'AUTOKOLAB_FORBIDDEN: that agent belongs to someone else';
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

-- The server, for a new agent whose sign-in it just created.
create or replace function public.pair_new_agent(p_code text, p_agent uuid, p_vendor text, p_name text) returns jsonb
language sql security definer set search_path = public as $$
  select public.pair_agent_internal(p_code, p_agent, p_vendor, p_name)
$$;

-- An agent that already exists on the computer, joining by itself.
create or replace function public.pair_existing_agent(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where id = auth.uid() and kind = 'agent';
  if m.id is null then raise exception 'AUTOKOLAB_FORBIDDEN: only an agent can join with its own sign-in'; end if;
  return public.pair_agent_internal(p_code, m.id, case m.client when 'codex' then 'codex' else 'claude' end, m.name);
end $$;

-- ---------------------------------------------------------------- privileges

revoke all on function public.random_code(int), public.unique_member_name(text), public.ensure_profile_member(uuid),
  public.sync_room_member(uuid, uuid), public.ensure_project_room(uuid), public.pair_agent_internal(text, uuid, text, text),
  public.pair_new_agent(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.pair_new_agent(text, uuid, text, text), public.ensure_project_room(uuid) to service_role;

revoke all on function public.create_invite(uuid, int, int), public.revoke_invite(text), public.accept_invite(text),
  public.create_pairing(uuid), public.pair_existing_agent(text), public.peek_project_invite(text) from public, anon;
grant execute on function public.create_invite(uuid, int, int), public.revoke_invite(text), public.accept_invite(text),
  public.create_pairing(uuid), public.pair_existing_agent(text), public.peek_project_invite(text) to authenticated, service_role;
grant execute on function public.peek_project_invite(text) to anon;
grant execute on function public.norm_code(text) to anon, authenticated, service_role;

alter publication supabase_realtime add table public.device_pairings;

update public.autokolab_meta set value = '7' where key = 'schema_version';
