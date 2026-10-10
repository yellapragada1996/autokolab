-- AutoKolab schema 12: each project's merge setting, and the lead's approval of an exact commit.
-- DEC-19: the project owner picks how merging works.
--   ask        a person merges, as before.
--   auto_safe  (default) the lead merges once tests pass and it has approved that exact commit;
--              risky changes wait for one click from a person (merge_ok_*).
--   auto_all   risky changes are merged automatically too.
-- The website (AK-29) and the lead's auto-merge (AK-30) build on this. The new columns change only
-- through the functions below: the column grants on projects and tickets (004, 005) don't include them.

alter table public.projects
  add column merge_policy text not null default 'auto_safe' check (merge_policy in ('ask', 'auto_safe', 'auto_all'));

alter table public.tickets
  add column approved_sha text check (approved_sha is null or approved_sha ~ '^[0-9a-f]{40}$'),  -- the PR head commit the lead approved
  add column approved_by  uuid,
  add column approved_at  timestamptz,
  add column merge_ok_by  uuid,          -- a person's one-click OK for a risky change
  add column merge_ok_at  timestamptz;

-- ---------------------------------------------------------------- functions for clients

create or replace function public.set_merge_policy(p_project uuid, p_policy text)
returns public.projects
language plpgsql security definer set search_path = public as $$
declare pr public.projects;
begin
  if not exists (select 1 from public.projects where id = p_project and owner_id = auth.uid()) then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only the project''s owner can change how merging works.';
  end if;
  if p_policy is null or p_policy not in ('ask', 'auto_safe', 'auto_all') then
    raise exception 'AUTOKOLAB_BAD_POLICY: The merge setting must be ask, auto_safe or auto_all.';
  end if;
  update public.projects set merge_policy = p_policy where id = p_project returning * into pr;
  return pr;
end $$;

-- The lead approves the PR's head commit; a person in the project may too. null clears it.
create or replace function public.approve_ticket(p_ticket uuid, p_sha text)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; proj uuid := public.ticket_project(p_ticket);
begin
  if proj is null
     or not (exists (select 1 from public.projects where id = proj and lead_agent_id = auth.uid())
             or exists (select 1 from public.project_members
                         where project_id = proj and actor_id = auth.uid() and actor_type = 'human')) then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only the project''s lead or a person in the project can approve a ticket.';
  end if;
  if p_sha is not null and p_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'AUTOKOLAB_BAD_SHA: The approval needs the full 40-character commit id, in lowercase.';
  end if;
  update public.tickets
     set approved_sha = p_sha,
         approved_by  = case when p_sha is null then null else auth.uid() end,
         approved_at  = case when p_sha is null then null else now() end
   where id = p_ticket
  returning * into t;
  return t;
end $$;

-- A person in the project OKs merging a risky change. Agents can't.
create or replace function public.allow_merge(p_ticket uuid)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; proj uuid := public.ticket_project(p_ticket);
begin
  if proj is null or public.actor_type() is distinct from 'human'
     or not exists (select 1 from public.project_members
                     where project_id = proj and actor_id = auth.uid() and actor_type = 'human') then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only a person in the project can OK a merge.';
  end if;
  update public.tickets set merge_ok_by = auth.uid(), merge_ok_at = now() where id = p_ticket
  returning * into t;
  return t;
end $$;

-- ---------------------------------------------------------------- triggers

-- A new PR link means a different PR: the approval and the merge OK don't carry over.
create or replace function public.tickets_pr_resets_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pr_url is distinct from old.pr_url then
    new.approved_sha := null; new.approved_by := null; new.approved_at := null;
    new.merge_ok_by := null; new.merge_ok_at := null;
  end if;
  return new;
end $$;

create trigger tickets_pr_resets_approval before update on public.tickets
  for each row execute function public.tickets_pr_resets_approval();

-- Activity history for approvals and merge OKs (set, or cleared by a new PR link).
create or replace function public.tickets_approval_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); typ text := public.actor_type();
        why text := case when new.pr_url is distinct from old.pr_url then 'pr_changed' end;
begin
  if new.approved_sha is distinct from old.approved_sha then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'approval',
              jsonb_build_object('from', old.approved_sha, 'to', new.approved_sha, 'reason', why));
  end if;
  if new.merge_ok_at is distinct from old.merge_ok_at then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'merge_ok',
              jsonb_build_object('by', new.merge_ok_by, 'reason', why));
  end if;
  return new;
end $$;

create trigger tickets_approval_history after update on public.tickets
  for each row execute function public.tickets_approval_history();

-- ---------------------------------------------------------------- privileges

revoke all on function public.set_merge_policy(uuid, text), public.approve_ticket(uuid, text),
  public.allow_merge(uuid) from public, anon;
grant execute on function public.set_merge_policy(uuid, text), public.approve_ticket(uuid, text),
  public.allow_merge(uuid) to authenticated, service_role;

update public.autokolab_meta set value = '12' where key = 'schema_version';
