-- AutoKolab schema 26: the areas a ticket touches (AK-126).
-- A list of repo paths or globs, such as "packages/autokolab/src/runner/**". A runner doesn't start
-- a Ready ticket whose areas overlap a ticket that is In progress or in Review (the overlap check is
-- in the helper, packages/autokolab/src/core/areas.ts). Shown on the ticket page as "Touches".
-- Set by whoever can edit the ticket, like labels. Existing tickets get an empty list, which means
-- no check: they start exactly as before.

alter table public.tickets
  add column areas text[] not null default '{}'
    check (cardinality(areas) <= 30 and char_length(array_to_string(areas, '')) <= 3000);

-- Trims each area, drops blanks and repeats, and refuses anything that looks like a key.
create or replace function public.tickets_areas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.areas := coalesce(array(
    select a from (
      select distinct on (btrim(x)) btrim(x) as a, n
        from unnest(coalesce(new.areas, '{}')) with ordinality as u(x, n)
       where btrim(x) <> ''
       order by btrim(x), n
    ) d order by n
  ), '{}');
  if exists (select 1 from unnest(new.areas) a where char_length(a) > 200) then
    raise exception 'AUTOKOLAB_BAD_AREA: each area is one path or glob of up to 200 characters';
  end if;
  if public.looks_like_secret(array_to_string(new.areas, ' ')) then
    raise exception 'AUTOKOLAB_SECRET: the ticket''s areas look like they contain a key or token';
  end if;
  return new;
end $$;

create trigger tickets_areas_guard before insert or update of areas on public.tickets
  for each row execute function public.tickets_areas_guard();

-- Activity history, like a summary change.
create or replace function public.tickets_areas_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.areas is distinct from old.areas then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, auth.uid(), public.actor_type(), 'areas',
              jsonb_build_object('from', to_jsonb(old.areas), 'to', to_jsonb(new.areas)));
  end if;
  return new;
end $$;

create trigger tickets_areas_history after update on public.tickets
  for each row execute function public.tickets_areas_history();

grant update (areas) on public.tickets to authenticated;

update public.autokolab_meta set value = '26' where key = 'schema_version';
