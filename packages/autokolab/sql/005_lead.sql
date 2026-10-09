-- AutoKolab schema 5: the project lead.
-- One agent per project is the lead: the person who owns it talks to it, and it turns their
-- requests into complete tickets and assigns them to the worker agents. Set by the project owner.

alter table public.projects add column lead_agent_id uuid references public.agents(id) on delete set null;

create or replace function public.projects_lead_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_agent_id is not null and not exists (
    select 1 from public.project_members
     where project_id = new.id and actor_id = new.lead_agent_id and actor_type = 'agent') then
    raise exception 'AUTOKOLAB_BAD_LEAD: the lead must be an agent in this project';
  end if;
  return new;
end $$;

create trigger projects_lead_guard before insert or update of lead_agent_id on public.projects
  for each row execute function public.projects_lead_guard();

-- The lead stops being lead if it leaves the project.
create or replace function public.members_lead_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.projects set lead_agent_id = null where id = old.project_id and lead_agent_id = old.actor_id;
  return old;
end $$;

create trigger members_lead_cleanup after delete on public.project_members
  for each row execute function public.members_lead_cleanup();

grant update (lead_agent_id) on public.projects to authenticated;

update public.autokolab_meta set value = '5' where key = 'schema_version';
