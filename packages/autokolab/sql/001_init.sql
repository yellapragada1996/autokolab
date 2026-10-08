-- AutoKolab schema, version 1.
--
-- One Supabase project = one team. Every person and every agent is a member with one identity
-- (a Supabase Auth user whose id equals members.id), used across all repos. Each shared repo is a
-- room; room_members says who is in which room and with what role. Messages are append-only.
-- `autokolab init` applies this file; it can also be pasted into the Supabase SQL editor.

-- ---------------------------------------------------------------- types

create type public.member_kind as enum ('agent', 'human');
create type public.member_role as enum ('lead', 'follower', 'human', 'observer');
create type public.message_kind as enum
  ('chat', 'task', 'question', 'answer', 'status', 'review', 'handoff', 'decision');
create type public.bulletin_kind as enum ('decision', 'task', 'status', 'rule', 'note');
create type public.bulletin_state as enum ('open', 'in_progress', 'blocked', 'done', 'superseded');
create type public.run_state as enum ('queued', 'running', 'done', 'failed', 'blocked', 'cancelled');
create type public.runner_state as enum ('offline', 'idle', 'working', 'paused');

-- ---------------------------------------------------------------- tables

create table public.autokolab_meta (
  key    text primary key,
  value  text not null
);
insert into public.autokolab_meta values ('schema_version', '1');

create table public.members (
  id            uuid primary key,                     -- = auth.users.id
  name          text not null unique check (name ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  kind          public.member_kind not null,
  owner_id      uuid not null references public.members(id),  -- the person; a person owns themselves
  client        text,                                 -- claude-code | codex | web | cli
  timezone      text,                                 -- IANA zone, e.g. America/Toronto
  runner_state  public.runner_state not null default 'offline',
  paused        boolean not null default false,       -- runner kill switch (owner-controlled)
  revoked       boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (name ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  repo        text unique,                             -- "owner/name" on GitHub, lowercase
  created_at  timestamptz not null default now()
);

create table public.room_members (
  room_id       uuid not null references public.rooms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  role          public.member_role not null,
  can_instruct  boolean not null default false,       -- followers carry out instructions from these
  added_at      timestamptz not null default now(),
  primary key (room_id, member_id),
  check (not (can_instruct and role in ('follower', 'observer')))
);
create index room_members_member_idx on public.room_members (member_id);

create table public.messages (
  id           bigint generated always as identity primary key,
  room_id      uuid not null references public.rooms(id) on delete cascade,
  thread_id    bigint references public.messages(id),
  sender_id    uuid not null references public.members(id),
  to_id        uuid references public.members(id),    -- null = everyone in the room
  kind         public.message_kind not null default 'chat',
  body         text not null check (char_length(body) between 1 and 16000),
  refs         jsonb not null default '{}'::jsonb,    -- {issue, pr, branch, commit, file, line}
  created_at   timestamptz not null default now()
);
create index messages_room_idx on public.messages (room_id, id);
create index messages_thread_idx on public.messages (thread_id);

create table public.bulletin (
  id           bigint generated always as identity primary key,
  room_id      uuid not null references public.rooms(id) on delete cascade,
  kind         public.bulletin_kind not null,
  title        text not null check (char_length(title) between 1 and 200),
  body         text not null default '' check (char_length(body) <= 16000),
  state        public.bulletin_state not null default 'open',
  assignee_id  uuid references public.members(id),
  refs         jsonb not null default '{}'::jsonb,
  created_by   uuid not null references public.members(id),
  updated_by   uuid not null references public.members(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index bulletin_room_idx on public.bulletin (room_id, state);

create table public.bulletin_history (
  id           bigint generated always as identity primary key,
  bulletin_id  bigint not null references public.bulletin(id) on delete cascade,
  room_id      uuid not null,
  snapshot     jsonb not null,
  changed_by   uuid not null,
  changed_at   timestamptz not null default now()
);

create table public.read_cursors (
  member_id             uuid not null references public.members(id) on delete cascade,
  room_id               uuid not null references public.rooms(id) on delete cascade,
  last_read_message_id  bigint not null default 0,
  primary key (member_id, room_id)
);

-- One row per message a runner picked up; the unique key makes claiming idempotent, so a
-- restarted runner never runs the same instruction twice.
create table public.task_runs (
  id            bigint generated always as identity primary key,
  room_id       uuid not null references public.rooms(id) on delete cascade,
  message_id    bigint not null references public.messages(id),
  runner_id     uuid not null references public.members(id),
  thread_root   bigint not null,
  state         public.run_state not null default 'queued',
  session_id    text,                                  -- claude / codex session, for resuming
  branch        text,                                  -- where the work is, on the shared repo
  summary       text check (char_length(summary) <= 16000),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (message_id, runner_id)
);
create index task_runs_thread_idx on public.task_runs (runner_id, thread_root, id);

-- One-time invites. The payload (members' tokens) is encrypted on the inviter's machine with a key
-- derived from the invite code; the database only ever sees the ciphertext and the code's hash.
create table public.invites (
  id          bigint generated always as identity primary key,
  code_hash   text not null unique,
  payload     text not null,
  person      text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function public.me() returns public.members
language sql stable security definer set search_path = public as $$
  select m.* from public.members m where m.id = auth.uid() and not m.revoked
$$;

create or replace function public.in_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_members rm join public.members m on m.id = rm.member_id
    where rm.room_id = r and rm.member_id = auth.uid() and not m.revoked)
$$;

create or replace function public.my_role(r uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select rm.role from public.room_members rm join public.members m on m.id = rm.member_id
  where rm.room_id = r and rm.member_id = auth.uid() and not m.revoked
$$;

create or replace function public.can_instruct_in(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rm.can_instruct from public.room_members rm join public.members m on m.id = rm.member_id
                   where rm.room_id = r and rm.member_id = auth.uid() and not m.revoked), false)
$$;

-- Members visible to the caller: themselves and anyone sharing a room with them.
create or replace function public.shares_room_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from public.room_members a join public.room_members b on a.room_id = b.room_id
    where a.member_id = auth.uid() and b.member_id = other)
$$;

-- Broad on purpose: a false positive costs a rephrase, a false negative leaks a key.
-- Keep in sync with packages/autokolab/src/core/secrets.ts (a test checks this).
create or replace function public.looks_like_secret(t text) returns boolean
language sql immutable as $$
  select t ~* any (array[
    'sk-ant-[a-z0-9_-]{16,}',
    'sk-(proj-|svcacct-)?[a-z0-9_-]{32,}',
    'gh[pousr]_[a-z0-9]{30,}',
    'github_pat_[a-z0-9_]{40,}',
    'AKIA[0-9A-Z]{16}',
    'aws_secret_access_key\s*[:=]',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'xox[abprs]-[a-z0-9-]{10,}',
    'AIza[0-9A-Za-z_-]{35}',
    'sbp_[a-f0-9]{40}',
    'sb_secret_[a-z0-9_-]{20,}',
    'eyJ[a-z0-9_-]{10,}\.eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}',
    'ak1\.[a-z0-9_-]{20,}',
    'akinv_[a-z0-9_-]{20,}',
    'sk_live_[a-z0-9]{16,}',
    'rk_live_[a-z0-9]{16,}'
  ])
$$;

-- ---------------------------------------------------------------- triggers

create or replace function public.messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  recent int;
begin
  if public.looks_like_secret(new.body) or public.looks_like_secret(new.refs::text) then
    raise exception 'AUTOKOLAB_SECRET: message rejected because it looks like it contains a key or token';
  end if;
  select count(*) into recent from public.messages
    where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if recent >= 30 then
    raise exception 'AUTOKOLAB_RATE_LIMIT: more than 30 messages in a minute';
  end if;
  if new.thread_id is not null and not exists
      (select 1 from public.messages m where m.id = new.thread_id and m.room_id = new.room_id) then
    raise exception 'AUTOKOLAB_BAD_THREAD: thread % is not in this room', new.thread_id;
  end if;
  if new.to_id is not null and not exists
      (select 1 from public.room_members rm where rm.member_id = new.to_id and rm.room_id = new.room_id) then
    raise exception 'AUTOKOLAB_BAD_RECIPIENT: recipient is not in this room';
  end if;
  update public.members set last_seen_at = now() where id = new.sender_id;
  return new;
end $$;

create trigger messages_guard before insert on public.messages
  for each row execute function public.messages_guard();

create or replace function public.bulletin_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.looks_like_secret(new.title) or public.looks_like_secret(new.body)
     or public.looks_like_secret(new.refs::text) then
    raise exception 'AUTOKOLAB_SECRET: bulletin item rejected because it looks like it contains a key or token';
  end if;
  if new.assignee_id is not null and not exists
      (select 1 from public.room_members rm where rm.member_id = new.assignee_id and rm.room_id = new.room_id) then
    raise exception 'AUTOKOLAB_BAD_ASSIGNEE: assignee is not in this room';
  end if;
  if tg_op = 'UPDATE' then
    new.room_id    := old.room_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    insert into public.bulletin_history (bulletin_id, room_id, snapshot, changed_by)
      values (old.id, old.room_id, to_jsonb(old), coalesce(auth.uid(), old.updated_by));
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger bulletin_guard before insert or update on public.bulletin
  for each row execute function public.bulletin_guard();

-- ---------------------------------------------------------------- row level security

alter table public.autokolab_meta   enable row level security;
alter table public.members          enable row level security;
alter table public.rooms            enable row level security;
alter table public.room_members     enable row level security;
alter table public.messages         enable row level security;
alter table public.bulletin         enable row level security;
alter table public.bulletin_history enable row level security;
alter table public.read_cursors     enable row level security;
alter table public.task_runs        enable row level security;
alter table public.invites          enable row level security;   -- no policies: clients never touch it

create policy meta_read on public.autokolab_meta for select to authenticated using (true);

create policy members_read on public.members for select to authenticated
  using (public.shares_room_with(id));

create policy rooms_read on public.rooms for select to authenticated
  using (public.in_room(id));

create policy room_members_read on public.room_members for select to authenticated
  using (public.in_room(room_id));

create policy messages_read on public.messages for select to authenticated
  using (public.in_room(room_id));
create policy messages_post on public.messages for insert to authenticated
  with check (
    public.in_room(room_id)
    and sender_id = auth.uid()
    and public.my_role(room_id) <> 'observer'
    and (kind not in ('task', 'decision') or public.can_instruct_in(room_id))
  );

create policy bulletin_read on public.bulletin for select to authenticated
  using (public.in_room(room_id));
create policy bulletin_insert on public.bulletin for insert to authenticated
  with check (public.in_room(room_id) and public.my_role(room_id) <> 'observer'
              and created_by = auth.uid() and updated_by = auth.uid());
create policy bulletin_update on public.bulletin for update to authenticated
  using (public.in_room(room_id) and public.my_role(room_id) <> 'observer')
  with check (public.in_room(room_id) and updated_by = auth.uid());

create policy bulletin_history_read on public.bulletin_history for select to authenticated
  using (public.in_room(room_id));

create policy cursors_own on public.read_cursors for select to authenticated
  using (member_id = auth.uid());

create policy runs_read on public.task_runs for select to authenticated
  using (public.in_room(room_id));
create policy runs_insert on public.task_runs for insert to authenticated
  with check (runner_id = auth.uid() and public.in_room(room_id));
create policy runs_update on public.task_runs for update to authenticated
  using (runner_id = auth.uid()) with check (runner_id = auth.uid());

-- ---------------------------------------------------------------- functions for clients

create or replace function public.heartbeat(state public.runner_state default null)
returns public.members
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  update public.members
     set last_seen_at = now(), runner_state = coalesce(state, runner_state)
   where id = auth.uid() and not revoked
  returning * into r;
  if r.id is null then raise exception 'AUTOKOLAB_NOT_MEMBER: this token is not an active member'; end if;
  return r;
end $$;

-- Pause or resume a runner. Only the agent's own person (or the agent itself) may do this.
create or replace function public.set_paused(target_name text, pause boolean)
returns public.members
language plpgsql security definer set search_path = public as $$
declare caller public.members; r public.members;
begin
  caller := public.me();
  if caller.id is null then raise exception 'AUTOKOLAB_NOT_MEMBER: this token is not an active member'; end if;
  update public.members set paused = pause
   where name = target_name and owner_id = caller.owner_id and not revoked
  returning * into r;
  if r.id is null then
    raise exception 'AUTOKOLAB_FORBIDDEN: you can only pause your own agents';
  end if;
  return r;
end $$;

-- People name themselves and their agents. A member may rename itself or anything its person
-- owns, set its time zone, or retire one of its own agents.
create or replace function public.update_member(target uuid, new_name text default null,
                                                new_timezone text default null, retire boolean default false)
returns public.members
language plpgsql security definer set search_path = public as $$
declare caller public.members; t public.members; r public.members;
begin
  caller := public.me();
  if caller.id is null then raise exception 'AUTOKOLAB_NOT_MEMBER: this token is not an active member'; end if;
  select * into t from public.members where id = target;
  if t.id is null or t.owner_id <> caller.owner_id then
    raise exception 'AUTOKOLAB_FORBIDDEN: you can only change yourself and your own agents';
  end if;
  if new_name is not null and new_name !~ '^[a-z0-9][a-z0-9-]{1,40}$' then
    raise exception 'AUTOKOLAB_BAD_NAME: names use lowercase letters, digits and dashes (2 to 41 characters)';
  end if;
  if new_name is not null and exists (select 1 from public.members where name = new_name and id <> target) then
    raise exception 'AUTOKOLAB_NAME_TAKEN: "%" is already taken', new_name;
  end if;
  if retire and (t.kind <> 'agent' or t.id = caller.id) then
    raise exception 'AUTOKOLAB_FORBIDDEN: only agents can be retired, and not by themselves';
  end if;
  update public.members
     set name = coalesce(new_name, name),
         timezone = coalesce(new_timezone, timezone),
         revoked = revoked or retire,
         runner_state = case when retire then 'offline' else runner_state end
   where id = target
  returning * into r;
  return r;
end $$;

create or replace function public.mark_read(room uuid, upto bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not public.in_room(room) then raise exception 'AUTOKOLAB_NOT_MEMBER: not in this room'; end if;
  insert into public.read_cursors (member_id, room_id, last_read_message_id)
    values (auth.uid(), room, upto)
  on conflict (member_id, room_id) do update
    set last_read_message_id = greatest(public.read_cursors.last_read_message_id, excluded.last_read_message_id)
  returning last_read_message_id into v;
  return v;
end $$;

-- Redeem a one-time invite: returns the encrypted payload once, then never again.
create or replace function public.redeem_invite(code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  update public.invites i set used_at = now()
   where i.code_hash = redeem_invite.code_hash and i.used_at is null and i.expires_at > now()
  returning * into inv;
  if inv.id is null then
    raise exception 'AUTOKOLAB_INVITE: this invite is invalid, already used, or expired. Ask for a new one.';
  end if;
  return inv.payload;
end $$;

revoke all on function public.heartbeat(public.runner_state) from public, anon;
revoke all on function public.set_paused(text, boolean) from public, anon;
revoke all on function public.mark_read(uuid, bigint) from public, anon;
revoke all on function public.update_member(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_member(uuid, text, text, boolean) to authenticated;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.heartbeat(public.runner_state) to authenticated;
grant execute on function public.set_paused(text, boolean) to authenticated;
grant execute on function public.mark_read(uuid, bigint) to authenticated;
grant execute on function public.redeem_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------- table privileges
-- Explicit, so this works with Supabase's "Automatically expose new tables" off (recommended)
-- or on. Signed-in members read through the row level security policies above and write only
-- where a policy allows it; anonymous visitors can only redeem an invite. The admin's secret key
-- (service_role) manages members, rooms and invites.

revoke all on public.autokolab_meta, public.members, public.rooms, public.room_members, public.messages,
  public.bulletin, public.bulletin_history, public.read_cursors, public.task_runs, public.invites
  from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

grant select on public.autokolab_meta, public.members, public.rooms, public.room_members, public.messages,
  public.bulletin, public.bulletin_history, public.read_cursors, public.task_runs to authenticated;
grant insert on public.messages, public.bulletin, public.task_runs to authenticated;
grant update on public.bulletin, public.task_runs to authenticated;

grant all on public.autokolab_meta, public.members, public.rooms, public.room_members, public.messages,
  public.bulletin, public.bulletin_history, public.read_cursors, public.task_runs, public.invites
  to service_role;

-- Helpers the access rules call, evaluated as the signed-in member.
grant execute on function public.me(), public.in_room(uuid), public.my_role(uuid), public.can_instruct_in(uuid),
  public.shares_room_with(uuid), public.looks_like_secret(text) to authenticated;
grant execute on function public.me(), public.in_room(uuid), public.my_role(uuid), public.can_instruct_in(uuid),
  public.shares_room_with(uuid), public.looks_like_secret(text), public.heartbeat(public.runner_state),
  public.set_paused(text, boolean), public.mark_read(uuid, bigint),
  public.update_member(uuid, text, text, boolean), public.redeem_invite(text) to service_role;

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table
  public.messages, public.bulletin, public.members, public.room_members, public.task_runs;
