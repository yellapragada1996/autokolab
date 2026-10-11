-- AutoKolab schema 21: a ticket's builders are the members who worked on it, not the ones who were named (AK-95).
-- Schema 17 counted whoever was the assignee while a ticket was In progress or Review as one of its
-- builders for good, and builders can't approve. On 11 Oct 2026 Captain was AK-90's assignee for a
-- minute by mistake, which locked it out of approving a ticket it never touched. From now on a member
-- is added to built_by only when:
--   1. as the ticket's assignee, they themselves change it so that it is In progress or Review, in any
--      way other than who it's assigned to (status, title, description, done means, branch, PR link,
--      summary, a question for a person, ...), or change its steps while it's In progress or Review;
--   2. a build run for the ticket is recorded for them (run_usage, schema 20).
-- Being assigned by someone else, or taking a ticket and handing it back without touching it, doesn't
-- count. Moving a ticket on the board isn't working on it either. Everything else in schema 17 stays:
-- reassigning clears the approval, and builders can't approve.
--
-- Also:
--   * forget_builder: the project's owner takes a wrongly recorded builder off a ticket, with a reason,
--     and history records who did it and why.
--   * A ticket given the PR link of another ticket takes on that ticket's builders, so a second ticket
--     can't be used to approve a pull request its builders can't.
--
-- Existing rows keep their built_by as it is; the new rule applies from now on.

-- The pull request a link points to, so that ".../pull/12", ".../pull/12/files" and ".../PULL/12#x" match.
create or replace function public.pr_key(url text) returns text
language sql immutable set search_path = public as $$
  select coalesce(lower(substring(url from '(?i)github\.com/[^/]+/[^/#?]+/pull/[0-9]+')), nullif(lower(rtrim(btrim(url), '/')), ''))
$$;

-- built_by changes only in tickets_track_builders, or here with the flag that trigger trusts.
-- Not callable by clients (revoked below): forget_builder and the triggers use it.
create or replace function public.add_builder(p_ticket uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_ticket is null or p_member is null then return; end if;
  perform set_config('autokolab.builders', 'on', true);
  update public.tickets set built_by = built_by || p_member where id = p_ticket and not (p_member = any(built_by));
  perform set_config('autokolab.builders', '', true);
end $$;

create or replace function public.tickets_track_builders() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); worked boolean; others uuid[];
begin
  -- add_builder and forget_builder set built_by themselves; nobody else can (no column grant).
  if not (tg_op = 'UPDATE' and coalesce(current_setting('autokolab.builders', true), '') = 'on') then
    new.built_by := case when tg_op = 'UPDATE' then old.built_by else '{}' end;
  end if;

  -- Another ticket's PR link brings that ticket's builders with it.
  if new.pr_url is not null and (tg_op = 'INSERT' or public.pr_key(new.pr_url) is distinct from public.pr_key(old.pr_url)) then
    select array_agg(distinct b) into others
      from public.tickets o, unnest(o.built_by) b
     where o.project_id = new.project_id and o.id <> new.id and public.pr_key(o.pr_url) = public.pr_key(new.pr_url);
    new.built_by := new.built_by || array(select x from unnest(coalesce(others, '{}')) x where not (x = any(new.built_by)));
  end if;

  -- The assignee changing the ticket while it's In progress or Review, other than who it's assigned to.
  if tg_op = 'UPDATE' and who is not null and who = new.assignee_id and new.status in ('in_progress', 'review')
     and not (who = any(new.built_by)) then
    worked := new.status is distinct from old.status
           or new.title is distinct from old.title
           or new.description is distinct from old.description
           or new.type is distinct from old.type
           or new.priority is distinct from old.priority
           or new.labels is distinct from old.labels
           or new.parent_id is distinct from old.parent_id
           or new.done_means is distinct from old.done_means
           or new.branch is distinct from old.branch
           or new.pr_url is distinct from old.pr_url
           or new.needs_human is distinct from old.needs_human
           or new.summary is distinct from old.summary;
    if worked then new.built_by := new.built_by || who; end if;
  end if;
  return new;
end $$;

-- Steps are the assignee's work too.
create or replace function public.steps_track_builders() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid uuid := case when tg_op = 'DELETE' then old.ticket_id else new.ticket_id end;
begin
  if exists (select 1 from public.tickets
              where id = tid and assignee_id = auth.uid() and status in ('in_progress', 'review')
                and not (auth.uid() = any(built_by))) then
    perform public.add_builder(tid, auth.uid());
  end if;
  return null;
end $$;

create trigger steps_track_builders after insert or update or delete on public.ticket_steps
  for each row execute function public.steps_track_builders();

-- A recorded build run for a ticket makes the agent one of its builders.
create or replace function public.run_usage_track_builders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'build' and new.ticket_id is not null then
    perform public.add_builder(new.ticket_id, new.agent_id);
  end if;
  return null;
end $$;

do $$ begin
  if to_regclass('public.run_usage') is not null then
    create trigger run_usage_track_builders after insert on public.run_usage
      for each row execute function public.run_usage_track_builders();
  end if;
end $$;

-- The project's owner corrects a mistake: one member off one ticket's builders, with a reason.
create or replace function public.forget_builder(p_ticket uuid, p_member uuid, p_reason text)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; proj uuid := public.ticket_project(p_ticket); why text := btrim(coalesce(p_reason, ''));
begin
  if proj is null or public.actor_type() is distinct from 'human' or not public.is_project_owner(proj) then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only the project''s owner can say someone didn''t work on a ticket.';
  end if;
  if why = '' then
    raise exception 'AUTOKOLAB_BAD_REASON: Say in a few words why they didn''t work on it.';
  end if;
  if char_length(why) > 300 then
    raise exception 'AUTOKOLAB_BAD_REASON: The reason is too long (300 characters at most).';
  end if;
  if public.looks_like_secret(why) then
    raise exception 'AUTOKOLAB_SECRET: the reason looks like it contains a key or token';
  end if;
  if not exists (select 1 from public.tickets where id = p_ticket and p_member = any(built_by)) then
    raise exception 'AUTOKOLAB_NOT_FOUND: They aren''t recorded as having worked on this ticket.';
  end if;
  perform set_config('autokolab.builders', 'on', true);
  update public.tickets set built_by = array_remove(built_by, p_member) where id = p_ticket returning * into t;
  perform set_config('autokolab.builders', '', true);
  insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
    values (p_ticket, proj, auth.uid(), 'human', 'builder_forgotten', jsonb_build_object('member', p_member, 'reason', why));
  return t;
end $$;

revoke all on function public.pr_key(text), public.add_builder(uuid, uuid), public.forget_builder(uuid, uuid, text),
  public.steps_track_builders(), public.run_usage_track_builders() from public, anon, authenticated;
grant execute on function public.forget_builder(uuid, uuid, text) to authenticated, service_role;

update public.autokolab_meta set value = '21' where key = 'schema_version';
