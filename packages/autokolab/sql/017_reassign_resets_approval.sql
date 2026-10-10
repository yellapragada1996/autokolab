-- AutoKolab schema 17: nobody approves their own work by reassigning it (AK-48).
-- Schema 13 refuses the ticket's current assignee, but any project member can change the assignee.
-- So a worker could hand its ticket to the lead and approve it, or the lead hand its ticket to a
-- worker and approve it. Two changes close that:
--   1. Changing the assignee clears the approval, the review and the merge OK, like a new PR link.
--   2. approve_ticket refuses anyone who was the ticket's assignee while it was In progress or Review.
--
-- For 2 we keep a built_by column, filled in by a trigger, rather than reading ticket_events on every
-- approval. The rule then holds whatever writes the row, the check is one array lookup, and it doesn't
-- depend on replaying history: the 'created' event doesn't record the first assignee, and a status
-- and assignee change in one update land as two separate events. Existing tickets are filled in
-- once, below, from their history and current state.

alter table public.tickets add column built_by uuid[] not null default '{}';

-- Fill in existing tickets by replaying their status and assignee history. Events from one update
-- share a time, so the state is checked only between updates, never halfway through one.
-- tickets_guard is off meanwhile so the fill-in doesn't touch updated_at.
alter table public.tickets disable trigger tickets_guard;
do $$
declare t record; e record; st text; who uuid; prev timestamptz; builders uuid[];
begin
  for t in select id, status, assignee_id from public.tickets loop
    select data ->> 'status' into st from public.ticket_events
     where ticket_id = t.id and kind = 'created' order by id limit 1;
    if st is null then
      select data ->> 'from' into st from public.ticket_events
       where ticket_id = t.id and kind = 'status' order by id limit 1;
    end if;
    if exists (select 1 from public.ticket_events where ticket_id = t.id and kind = 'assignee') then
      select (data ->> 'from')::uuid into who from public.ticket_events
       where ticket_id = t.id and kind = 'assignee' order by id limit 1;
    else
      who := t.assignee_id;
    end if;
    builders := '{}'; prev := null;
    for e in select kind, data, created_at from public.ticket_events
              where ticket_id = t.id and kind in ('status', 'assignee') order by id loop
      if prev is not null and e.created_at <> prev
         and st in ('in_progress', 'review') and who is not null and not (who = any(builders)) then
        builders := builders || who;
      end if;
      if e.kind = 'status' then st := e.data ->> 'to'; else who := (e.data ->> 'to')::uuid; end if;
      prev := e.created_at;
    end loop;
    if st in ('in_progress', 'review') and who is not null and not (who = any(builders)) then
      builders := builders || who;
    end if;
    if t.status in ('in_progress', 'review') and t.assignee_id is not null and not (t.assignee_id = any(builders)) then
      builders := builders || t.assignee_id;
    end if;
    if builders <> '{}' then
      update public.tickets set built_by = builders where id = t.id;
    end if;
  end loop;
end $$;
alter table public.tickets enable trigger tickets_guard;

-- Whoever is the assignee while the ticket is In progress or Review is one of its builders, for good.
-- The column changes only here: the column grants in 004 and 014 don't include it.
create or replace function public.tickets_track_builders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.built_by := case when tg_op = 'UPDATE' then old.built_by else '{}' end;
  if new.status in ('in_progress', 'review') and new.assignee_id is not null
     and not (new.assignee_id = any(new.built_by)) then
    new.built_by := new.built_by || new.assignee_id;
  end if;
  return new;
end $$;

create trigger tickets_track_builders before insert or update on public.tickets
  for each row execute function public.tickets_track_builders();

-- Who may approve is unchanged from schema 13; past builders are refused as well as the assignee.
create or replace function public.approve_ticket(p_ticket uuid, p_sha text, p_review jsonb default null)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; proj uuid := public.ticket_project(p_ticket);
        lead uuid; assignee uuid; builders uuid[]; member_type text;
begin
  select lead_agent_id into lead from public.projects where id = proj;
  select assignee_id, built_by into assignee, builders from public.tickets where id = p_ticket;
  select actor_type into member_type from public.project_members where project_id = proj and actor_id = auth.uid();
  if proj is null
     or not coalesce(lead = auth.uid()
                     or member_type = 'human'
                     or (member_type = 'agent' and assignee = lead), false) then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only the project''s lead or a person in the project can approve a ticket; another agent can approve only a ticket the lead built.';
  end if;
  if assignee = auth.uid() then
    raise exception 'AUTOKOLAB_FORBIDDEN: The lead can''t approve its own work; a person or another agent has to.';
  end if;
  if auth.uid() = any(builders) then
    raise exception 'AUTOKOLAB_FORBIDDEN: You worked on this ticket, so someone else has to approve it.';
  end if;
  if p_sha is not null and p_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'AUTOKOLAB_BAD_SHA: The approval needs the full 40-character commit id, in lowercase.';
  end if;
  update public.tickets
     set approved_sha = p_sha,
         approved_by  = case when p_sha is null then null else auth.uid() end,
         approved_at  = case when p_sha is null then null else now() end,
         review       = case when p_sha is null then null else public.clean_review(p_review) end
   where id = p_ticket
  returning * into t;
  return t;
end $$;

-- A new PR link or a new assignee: the approval, the review and the merge OK don't carry over.
create or replace function public.tickets_pr_resets_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pr_url is distinct from old.pr_url or new.assignee_id is distinct from old.assignee_id then
    new.approved_sha := null; new.approved_by := null; new.approved_at := null; new.review := null;
    new.merge_ok_by := null; new.merge_ok_at := null;
  end if;
  return new;
end $$;

-- History says which of the two cleared it.
create or replace function public.tickets_approval_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); typ text := public.actor_type();
        why text := case when new.pr_url is distinct from old.pr_url then 'pr_changed'
                         when new.assignee_id is distinct from old.assignee_id then 'assignee_changed' end;
begin
  if new.approved_sha is distinct from old.approved_sha or new.review is distinct from old.review then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'approval',
              jsonb_build_object('from', old.approved_sha, 'to', new.approved_sha, 'reason', why)
                || case when new.review is null then '{}'::jsonb else jsonb_build_object('review', new.review) end);
  end if;
  if new.merge_ok_at is distinct from old.merge_ok_at then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'merge_ok',
              jsonb_build_object('by', new.merge_ok_by, 'reason', why));
  end if;
  return new;
end $$;

update public.autokolab_meta set value = '17' where key = 'schema_version';
