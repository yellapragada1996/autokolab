-- AutoKolab schema 27: status belongs to the project where the agent is working (AK-141).
-- SELECT follows the existing agents RLS; authenticated clients have no UPDATE grant on this column.
alter table public.agents
  add column status_project_id uuid references public.projects(id) on delete set null;

drop function public.agent_status(text, text, uuid, text, text);
create function public.agent_status(p_status text, p_note text default null, p_ticket uuid default null,
                                    p_model text default null, p_effort text default null,
                                    p_project uuid default null)
returns public.agents
language plpgsql security definer set search_path = public as $$
declare
  a public.agents;
  scoped_project uuid := p_project;
  ticket_project uuid;
begin
  if public.looks_like_secret(p_model) or public.looks_like_secret(p_effort) then
    raise exception 'AUTOKOLAB_SECRET: the model looks like it contains a key or token';
  end if;
  if p_ticket is not null then
    select project_id into ticket_project from public.tickets where id = p_ticket;
    scoped_project := coalesce(scoped_project, ticket_project);
  end if;
  if scoped_project is not null and not public.is_project_member(scoped_project) then
    raise exception 'AUTOKOLAB_NOT_MEMBER: you are not a member of this project';
  end if;
  if ticket_project is not null and not public.is_project_member(ticket_project) then
    raise exception 'AUTOKOLAB_NOT_MEMBER: you are not a member of the ticket project';
  end if;
  if p_project is not null and ticket_project is not null and p_project <> ticket_project then
    raise exception 'AUTOKOLAB_BAD_TICKET: the ticket belongs to a different project';
  end if;
  if p_status in ('idle', 'offline') then scoped_project := null; end if;
  update public.agents
     set status = p_status, status_note = p_note, current_ticket_id = p_ticket, status_project_id = scoped_project, last_seen_at = now(),
         effective_model  = case when p_model  is null then effective_model  else nullif(p_model, '')  end,
         effective_effort = case when p_effort is null then effective_effort else nullif(p_effort, '') end,
         effective_at     = case when p_model is null and p_effort is null then effective_at else now() end
   where id = auth.uid()
     and (status is distinct from p_status or status_note is distinct from p_note
          or current_ticket_id is distinct from p_ticket
          or status_project_id is distinct from scoped_project
          or (p_model is not null and effective_model is distinct from nullif(p_model, ''))
          or (p_effort is not null and effective_effort is distinct from nullif(p_effort, ''))
          or last_seen_at is null or last_seen_at < now() - interval '20 seconds')
  returning * into a;
  if a.id is null then select * into a from public.agents where id = auth.uid(); end if;
  if a.id is null then raise exception 'AUTOKOLAB_NOT_AGENT: only agents report status'; end if;
  return a;
end $$;

revoke all on function public.agent_status(text, text, uuid, text, text, uuid) from public, anon;
grant execute on function public.agent_status(text, text, uuid, text, text, uuid) to authenticated, service_role;

update public.autokolab_meta set value = '27' where key = 'schema_version';
