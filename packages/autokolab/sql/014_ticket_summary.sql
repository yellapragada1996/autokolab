-- AutoKolab schema 14: a one-line plain summary of what a ticket did (AK-39, DEC-21).
-- Set when the ticket moves to Review, by whoever can edit the ticket (its assignee, the lead, people).
-- Shown on board cards, All issues, the ticket page and the Overview's activity. Old tickets stay empty.

alter table public.tickets
  add column summary text check (summary is null or char_length(summary) <= 200);

-- The secret check, like title and description (004's tickets_guard).
create or replace function public.tickets_summary_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.summary is not null and btrim(new.summary) = '' then new.summary := null; end if;
  if public.looks_like_secret(new.summary) then
    raise exception 'AUTOKOLAB_SECRET: the ticket''s summary looks like it contains a key or token';
  end if;
  return new;
end $$;

create trigger tickets_summary_guard before insert or update of summary on public.tickets
  for each row execute function public.tickets_summary_guard();

-- Activity history, like a title change.
create or replace function public.tickets_summary_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.summary is distinct from old.summary then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, auth.uid(), public.actor_type(), 'summary',
              jsonb_build_object('from', old.summary, 'to', new.summary));
  end if;
  return new;
end $$;

create trigger tickets_summary_history after update on public.tickets
  for each row execute function public.tickets_summary_history();

grant update (summary) on public.tickets to authenticated;

update public.autokolab_meta set value = '14' where key = 'schema_version';
