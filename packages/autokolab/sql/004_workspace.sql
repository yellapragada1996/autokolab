-- AutoKolab schema, version 4: the workspace (v2). Projects, tickets (Linear-style, with parent
-- tickets for epics), board order, plan steps, blocked-by links, comments, activity history,
-- decisions and the Project Guide that every agent reads first.
--
-- Actors: a person is a `profiles` row (GitHub sign-in); an agent is an `agents` row. Both are
-- Supabase Auth users, so auth.uid() identifies whoever acts, and RLS checks project membership.

-- ---------------------------------------------------------------- tables

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 60),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  repo            text check (repo ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$'),       -- "owner/name", lowercase
  default_branch  text not null default 'main',
  ticket_prefix   text not null check (ticket_prefix ~ '^[A-Z][A-Z0-9]{1,5}$'),
  next_ticket     int not null default 1,
  next_decision   int not null default 1,
  owner_id        uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

-- Agents (v2). id = the agent's Auth user. owner_profile_id links to the person once they've
-- signed in on the website; owner_label shows a name until then.
create table public.agents (
  id                uuid primary key,
  owner_profile_id  uuid references public.profiles(id),
  owner_label       text not null,
  vendor            text not null check (vendor in ('claude', 'codex')),
  display_name      text not null check (char_length(display_name) between 1 and 60),
  status            text not null default 'idle'
                    check (status in ('idle', 'planning', 'building', 'waiting_human', 'blocked', 'paused', 'offline')),
  status_note       text,
  current_ticket_id uuid,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now()
);

create table public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  actor_id    uuid not null,
  actor_type  text not null check (actor_type in ('human', 'agent')),
  role        text not null default 'member' check (role in ('owner', 'member')),
  joined_at   timestamptz not null default now(),
  primary key (project_id, actor_id)
);
create index project_members_actor_idx on public.project_members (actor_id);

create table public.tickets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  number        int not null,
  key           text not null,
  title         text not null check (char_length(title) between 1 and 200),
  description   text not null default '' check (char_length(description) <= 20000),
  type          text not null default 'task' check (type in ('feature', 'bug', 'task', 'chore', 'epic')),
  priority      text not null default 'none' check (priority in ('urgent', 'high', 'medium', 'low', 'none')),
  status        text not null default 'backlog' check (status in ('backlog', 'ready', 'in_progress', 'review', 'done', 'canceled')),
  labels        text[] not null default '{}',
  parent_id     uuid references public.tickets(id) on delete set null,
  assignee_id   uuid,
  assignee_type text check (assignee_type in ('human', 'agent')),
  reporter_id   uuid not null,
  done_means    text[] not null default '{}',
  branch        text,
  pr_url        text,
  needs_human   text,                       -- why a person is needed right now (null = nothing)
  sort_order    double precision not null default extract(epoch from clock_timestamp()),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  unique (project_id, number),
  check ((assignee_id is null) = (assignee_type is null))
);
create index tickets_board_idx on public.tickets (project_id, status, sort_order);
create index tickets_assignee_idx on public.tickets (assignee_id, status);

create table public.ticket_steps (
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  idx         int not null check (idx >= 0),
  label       text not null check (char_length(label) between 1 and 200),
  status      text not null default 'todo' check (status in ('todo', 'now', 'done')),
  note        text check (char_length(note) <= 500),
  updated_at  timestamptz not null default now(),
  primary key (ticket_id, idx)
);

create table public.ticket_links (
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  blocked_by  uuid not null references public.tickets(id) on delete cascade,
  primary key (ticket_id, blocked_by),
  check (ticket_id <> blocked_by)
);

create table public.ticket_comments (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid not null,
  author_type text not null check (author_type in ('human', 'agent')),
  body        text not null check (char_length(body) between 1 and 16000),
  created_at  timestamptz not null default now()
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, id);

-- Activity history: who changed what on a ticket, and when. Written by triggers only.
create table public.ticket_events (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  project_id  uuid not null,
  actor_id    uuid,
  actor_type  text,
  kind        text not null,      -- created | status | assignee | priority | title | comment | step | link | branch | pr
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, id);
create index ticket_events_project_idx on public.ticket_events (project_id, id);

create table public.decisions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  number         int not null,
  key            text not null,
  kind           text not null default 'decision' check (kind in ('decision', 'contract')),
  title          text not null check (char_length(title) between 1 and 200),
  body           text not null default '' check (char_length(body) <= 20000),
  ticket_id      uuid references public.tickets(id) on delete set null,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  superseded_by  uuid references public.decisions(id),
  unique (project_id, number)
);

-- The Project Guide: what every agent reads before touching the project.
create table public.project_guides (
  project_id    uuid primary key references public.projects(id) on delete cascade,
  concept       text not null default '' check (char_length(concept) <= 20000),       -- what we're building, for whom
  architecture  text not null default '' check (char_length(architecture) <= 20000),  -- how it's built, conventions
  rules         text not null default '' check (char_length(rules) <= 20000),         -- what agents must and must not do
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function public.actor_type() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.profiles where id = auth.uid()) then 'human'
    when exists (select 1 from public.agents where id = auth.uid()) then 'agent'
  end
$$;

create or replace function public.is_project_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and actor_id = auth.uid())
$$;

create or replace function public.is_project_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and actor_id = auth.uid() and role = 'owner')
$$;

create or replace function public.shares_project_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
    where a.actor_id = auth.uid() and b.actor_id = other)
$$;

create or replace function public.ticket_project(t uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.tickets where id = t
$$;

-- ---------------------------------------------------------------- functions for clients

-- Create a project for a repo; the caller (a person) becomes its owner. A Guide is started.
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
  return pr;
exception when unique_violation then
  raise exception 'AUTOKOLAB_TAKEN: a project with that short name already exists';
end $$;

-- Create a ticket with the next key (VV-12). Any member, person or agent.
create or replace function public.create_ticket(
  p_project uuid, p_title text, p_description text default '', p_type text default 'task',
  p_priority text default 'none', p_status text default 'backlog', p_assignee uuid default null,
  p_parent uuid default null, p_labels text[] default '{}', p_done_means text[] default '{}')
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare n int; pr public.projects; t public.tickets; atype text;
begin
  if not public.is_project_member(p_project) then raise exception 'AUTOKOLAB_FORBIDDEN: not a member of this project'; end if;
  if p_assignee is not null then
    select actor_type into atype from public.project_members where project_id = p_project and actor_id = p_assignee;
    if atype is null then raise exception 'AUTOKOLAB_BAD_ASSIGNEE: the assignee is not in this project'; end if;
  end if;
  if p_parent is not null and public.ticket_project(p_parent) is distinct from p_project then
    raise exception 'AUTOKOLAB_BAD_PARENT: the parent ticket is in another project';
  end if;
  update public.projects set next_ticket = next_ticket + 1 where id = p_project returning * into pr;
  n := pr.next_ticket - 1;
  insert into public.tickets (project_id, number, key, title, description, type, priority, status, labels,
                              parent_id, assignee_id, assignee_type, reporter_id, done_means)
    values (p_project, n, pr.ticket_prefix || '-' || n, p_title, coalesce(p_description, ''), p_type, p_priority, p_status,
            coalesce(p_labels, '{}'), p_parent, p_assignee, atype, auth.uid(), coalesce(p_done_means, '{}'))
    returning * into t;
  return t;
end $$;

create or replace function public.create_decision(p_project uuid, p_title text, p_body text default '',
                                                  p_kind text default 'decision', p_ticket uuid default null)
returns public.decisions
language plpgsql security definer set search_path = public as $$
declare n int; d public.decisions;
begin
  if not public.is_project_member(p_project) then raise exception 'AUTOKOLAB_FORBIDDEN: not a member of this project'; end if;
  update public.projects set next_decision = next_decision + 1 where id = p_project returning next_decision - 1 into n;
  insert into public.decisions (project_id, number, key, kind, title, body, ticket_id, created_by)
    values (p_project, n, case when p_kind = 'contract' then 'CON-' else 'DEC-' end || n, p_kind, p_title,
            coalesce(p_body, ''), p_ticket, auth.uid())
    returning * into d;
  return d;
end $$;

-- Add a person who has signed in on the website (by GitHub username) to a project. Owners only.
create or replace function public.add_project_person(p_project uuid, p_github_login text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.is_project_owner(p_project) then raise exception 'AUTOKOLAB_FORBIDDEN: only the project owner can add people'; end if;
  select * into p from public.profiles where lower(github_login) = lower(p_github_login);
  if p.id is null then raise exception 'AUTOKOLAB_NOT_FOUND: % hasn''t signed in to AutoKolab yet', p_github_login; end if;
  insert into public.project_members (project_id, actor_id, actor_type) values (p_project, p.id, 'human')
    on conflict do nothing;
  return p;
end $$;

-- Agents report their status (shown on the board and in People).
create or replace function public.agent_status(p_status text, p_note text default null, p_ticket uuid default null)
returns public.agents
language plpgsql security definer set search_path = public as $$
declare a public.agents;
begin
  update public.agents set status = p_status, status_note = p_note, current_ticket_id = p_ticket, last_seen_at = now()
   where id = auth.uid() returning * into a;
  if a.id is null then raise exception 'AUTOKOLAB_NOT_AGENT: only agents report status'; end if;
  return a;
end $$;

-- ---------------------------------------------------------------- triggers

create or replace function public.tickets_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare atype text;
begin
  if public.looks_like_secret(new.title) or public.looks_like_secret(new.description) then
    raise exception 'AUTOKOLAB_SECRET: the ticket looks like it contains a key or token';
  end if;
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id; new.number := old.number; new.key := old.key;
    new.reporter_id := old.reporter_id; new.created_at := old.created_at;
    if new.assignee_id is distinct from old.assignee_id then
      if new.assignee_id is null then new.assignee_type := null;
      else
        select actor_type into atype from public.project_members where project_id = new.project_id and actor_id = new.assignee_id;
        if atype is null then raise exception 'AUTOKOLAB_BAD_ASSIGNEE: the assignee is not in this project'; end if;
        new.assignee_type := atype;
      end if;
    end if;
    if new.status = 'in_progress' and old.status <> 'in_progress' and new.started_at is null then new.started_at := now(); end if;
    if new.status = 'done' and old.status <> 'done' then new.completed_at := now(); end if;
    if new.status <> 'done' then new.completed_at := null; end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger tickets_guard before insert or update on public.tickets
  for each row execute function public.tickets_guard();

-- Activity history.
create or replace function public.tickets_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); typ text := public.actor_type();
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'created', jsonb_build_object('status', new.status));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'assignee', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.title is distinct from old.title then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'title', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.branch is distinct from old.branch and new.branch is not null then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'branch', jsonb_build_object('branch', new.branch));
  end if;
  if new.pr_url is distinct from old.pr_url and new.pr_url is not null then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'pr', jsonb_build_object('url', new.pr_url));
  end if;
  if new.needs_human is distinct from old.needs_human and new.needs_human is not null then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'needs_human', jsonb_build_object('note', new.needs_human));
  end if;
  return new;
end $$;

create trigger tickets_history after insert or update on public.tickets
  for each row execute function public.tickets_history();

create or replace function public.comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.looks_like_secret(new.body) then
    raise exception 'AUTOKOLAB_SECRET: the comment looks like it contains a key or token';
  end if;
  return new;
end $$;

create trigger comments_guard before insert on public.ticket_comments
  for each row execute function public.comments_guard();

create or replace function public.comments_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
    values (new.ticket_id, public.ticket_project(new.ticket_id), new.author_id, new.author_type, 'comment', jsonb_build_object('comment_id', new.id));
  update public.tickets set updated_at = now() where id = new.ticket_id;
  return new;
end $$;

create trigger comments_history after insert on public.ticket_comments
  for each row execute function public.comments_history();

create or replace function public.steps_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.ticket_id, public.ticket_project(new.ticket_id), auth.uid(), public.actor_type(), 'step',
              jsonb_build_object('idx', new.idx, 'label', new.label, 'status', new.status));
  end if;
  return new;
end $$;

create trigger steps_history before insert or update on public.ticket_steps
  for each row execute function public.steps_history();

create or replace function public.guide_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.looks_like_secret(new.concept) or public.looks_like_secret(new.architecture) or public.looks_like_secret(new.rules) then
    raise exception 'AUTOKOLAB_SECRET: the guide looks like it contains a key or token';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

create trigger guide_guard before insert or update on public.project_guides
  for each row execute function public.guide_guard();

-- ---------------------------------------------------------------- row level security

alter table public.projects        enable row level security;
alter table public.agents          enable row level security;
alter table public.project_members enable row level security;
alter table public.tickets         enable row level security;
alter table public.ticket_steps    enable row level security;
alter table public.ticket_links    enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_events   enable row level security;
alter table public.decisions       enable row level security;
alter table public.project_guides  enable row level security;

create policy projects_read on public.projects for select to authenticated using (public.is_project_member(id));
create policy projects_update on public.projects for update to authenticated
  using (public.is_project_owner(id)) with check (public.is_project_owner(id));

create policy agents_read on public.agents for select to authenticated using (public.shares_project_with(id));

create policy members_read on public.project_members for select to authenticated using (public.is_project_member(project_id));
create policy members_remove on public.project_members for delete to authenticated
  using (public.is_project_owner(project_id) and role <> 'owner');

-- People in a shared project can see each other's profile (name, picture, city, time).
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.shares_project_with(id));

create policy tickets_read on public.tickets for select to authenticated using (public.is_project_member(project_id));
create policy tickets_update on public.tickets for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

create policy steps_read on public.ticket_steps for select to authenticated using (public.is_project_member(public.ticket_project(ticket_id)));
create policy steps_write on public.ticket_steps for all to authenticated
  using (public.is_project_member(public.ticket_project(ticket_id)))
  with check (public.is_project_member(public.ticket_project(ticket_id)));

create policy links_read on public.ticket_links for select to authenticated using (public.is_project_member(public.ticket_project(ticket_id)));
create policy links_write on public.ticket_links for all to authenticated
  using (public.is_project_member(public.ticket_project(ticket_id)))
  with check (public.is_project_member(public.ticket_project(ticket_id))
              and public.ticket_project(blocked_by) = public.ticket_project(ticket_id));

create policy comments_read on public.ticket_comments for select to authenticated using (public.is_project_member(public.ticket_project(ticket_id)));
create policy comments_post on public.ticket_comments for insert to authenticated
  with check (public.is_project_member(public.ticket_project(ticket_id)) and author_id = auth.uid()
              and author_type = public.actor_type());

create policy events_read on public.ticket_events for select to authenticated using (public.is_project_member(project_id));

create policy decisions_read on public.decisions for select to authenticated using (public.is_project_member(project_id));
create policy decisions_update on public.decisions for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

create policy guides_read on public.project_guides for select to authenticated using (public.is_project_member(project_id));
create policy guides_update on public.project_guides for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- ---------------------------------------------------------------- privileges

revoke all on public.projects, public.agents, public.project_members, public.tickets, public.ticket_steps,
  public.ticket_links, public.ticket_comments, public.ticket_events, public.decisions, public.project_guides
  from anon, authenticated;

grant select on public.projects, public.agents, public.project_members, public.tickets, public.ticket_steps,
  public.ticket_links, public.ticket_comments, public.ticket_events, public.decisions, public.project_guides
  to authenticated;
grant update (name, default_branch, repo) on public.projects to authenticated;
grant delete on public.project_members to authenticated;
grant update (title, description, type, priority, status, labels, parent_id, assignee_id, done_means, branch, pr_url,
              needs_human, sort_order) on public.tickets to authenticated;
grant insert, update, delete on public.ticket_steps, public.ticket_links to authenticated;
grant insert on public.ticket_comments to authenticated;
grant update (title, body, superseded_by) on public.decisions to authenticated;
grant update (concept, architecture, rules) on public.project_guides to authenticated;

grant all on public.projects, public.agents, public.project_members, public.tickets, public.ticket_steps,
  public.ticket_links, public.ticket_comments, public.ticket_events, public.decisions, public.project_guides
  to service_role;

grant execute on function public.actor_type(), public.is_project_member(uuid), public.is_project_owner(uuid),
  public.shares_project_with(uuid), public.ticket_project(uuid) to authenticated, service_role;
grant execute on function public.create_project(text, text, text, text), public.create_ticket(uuid, text, text, text, text, text, uuid, uuid, text[], text[]),
  public.create_decision(uuid, text, text, text, uuid), public.add_project_person(uuid, text),
  public.agent_status(text, text, uuid) to authenticated, service_role;
revoke all on function public.create_project(text, text, text, text), public.create_ticket(uuid, text, text, text, text, text, uuid, uuid, text[], text[]),
  public.create_decision(uuid, text, text, text, uuid), public.add_project_person(uuid, text),
  public.agent_status(text, text, uuid) from anon;

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table
  public.projects, public.agents, public.project_members, public.tickets, public.ticket_steps,
  public.ticket_links, public.ticket_comments, public.ticket_events, public.decisions, public.project_guides;

update public.autokolab_meta set value = '4' where key = 'schema_version';
