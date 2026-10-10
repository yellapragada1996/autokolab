-- AutoKolab schema 13: nobody approves their own work (AK-34).
-- DEC-19's "the lead approved the change" only means something if the approver isn't the author.
-- approve_ticket now refuses the ticket's assignee. Who may approve:
--   the project's lead (for tickets it didn't build),
--   a person in the project,
--   any other agent in the project, but only for a ticket the lead built.
-- Clearing an approval (p_sha null) follows the same rules.

create or replace function public.approve_ticket(p_ticket uuid, p_sha text)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; proj uuid := public.ticket_project(p_ticket);
        lead uuid; assignee uuid; member_type text;
begin
  select lead_agent_id into lead from public.projects where id = proj;
  select assignee_id into assignee from public.tickets where id = p_ticket;
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

revoke all on function public.approve_ticket(uuid, text) from public, anon;
grant execute on function public.approve_ticket(uuid, text) to authenticated, service_role;

update public.autokolab_meta set value = '13' where key = 'schema_version';
