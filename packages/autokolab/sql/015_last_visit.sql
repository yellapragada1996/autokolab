-- AutoKolab schema 15: when each person last caught up on a project (AK-44, DEC-22).
-- Captain's return message ("While you were away (9 h) 3 things shipped…") counts from here, so it
-- is the same on every device. One row per person and project. A person reads only their own row
-- and writes it only through mark_caught_up, which always stamps the server's time.

create table public.project_reads (
  project_id   uuid not null references public.projects(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  caught_up_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

alter table public.project_reads enable row level security;

create policy project_reads_own on public.project_reads for select to authenticated
  using (profile_id = auth.uid());

revoke all on public.project_reads from anon, authenticated;
grant select on public.project_reads to authenticated;

-- "I'm caught up": the next catch-up counts from now. People only; agents don't have visits.
create or replace function public.mark_caught_up(p_project uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare stamp timestamptz;
begin
  if not public.is_project_member(p_project) or public.actor_type() is distinct from 'human' then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only a person in the project can mark it as caught up.';
  end if;
  insert into public.project_reads (project_id, profile_id) values (p_project, auth.uid())
    on conflict (project_id, profile_id) do update set caught_up_at = now()
    returning caught_up_at into stamp;
  return stamp;
end $$;

revoke all on function public.mark_caught_up(uuid) from public, anon;
grant execute on function public.mark_caught_up(uuid) to authenticated, service_role;

update public.autokolab_meta set value = '15' where key = 'schema_version';
