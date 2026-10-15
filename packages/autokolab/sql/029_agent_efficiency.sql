-- AK-151: numeric daily runner counters. Names are a fixed vocabulary; values are non-negative
-- integers. No prompts, messages, URLs, response bodies, or arbitrary JSON fields are stored.
create table public.agent_efficiency_daily (
  agent_id uuid not null references public.agents(id) on delete cascade,
  day date not null,
  counters jsonb not null default '{}'::jsonb,
  primary key (agent_id, day),
  constraint agent_efficiency_object check (jsonb_typeof(counters) = 'object')
);
create index agent_efficiency_day_idx on public.agent_efficiency_daily (day);
alter table public.agent_efficiency_daily enable row level security;
create policy agent_efficiency_read on public.agent_efficiency_daily for select to authenticated
  using (public.shares_project_with(agent_id));
revoke all on public.agent_efficiency_daily from anon, authenticated;
grant select on public.agent_efficiency_daily to authenticated;
grant all on public.agent_efficiency_daily to service_role;

create function public.report_agent_efficiency(p_day date, p_delta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  metric text;
  amount jsonb;
  next_values jsonb;
  allowed constant text[] := array[
    'rest_tickets_board','rest_tickets_ticket','rest_tickets_other','rest_ticket_comments_comments',
    'rest_messages_messages','rest_project_guides_guide','rest_decisions_decisions','rest_other_other',
    'rest_projects_membership','rest_project_members_membership','rest_profiles_identity','rest_agents_identity',
    'rest_ticket_steps_steps','rest_ticket_links_board','rest_members_identity','rest_room_members_membership',
    'rest_rooms_membership','rest_task_runs_runs','rest_bulletin_board','rest_read_cursors_messages','rest_rpc_other',
    'realtime_events','prompt_guide','prompt_decisions','prompt_ticket','prompt_comments','prompt_other',
    'wake_message_chat','wake_message_question','wake_message_task','wake_message_review','wake_message_other',
    'wake_comment','wake_ready','wake_review','wake_triage',
    'fail_env_git','fail_env_network','fail_provider','fail_ci','fail_conflict','fail_other'
  ];
begin
  if not exists (select 1 from public.agents where id = auth.uid()) then
    raise exception 'AUTOKOLAB_NOT_AGENT: Only agents can report their efficiency counters.';
  end if;
  if p_day is null or p_day < current_date - 2 or p_day > current_date + 2 or
     p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    raise exception 'AUTOKOLAB_BAD_METRICS: The day or numeric counters are invalid.';
  end if;
  for metric, amount in select key, value from jsonb_each(p_delta) loop
    if not metric = any(allowed) or jsonb_typeof(amount) <> 'number' or
       amount::text !~ '^[0-9]{1,15}$' then
      raise exception 'AUTOKOLAB_BAD_METRICS: Only known non-negative integer counters are accepted.';
    end if;
  end loop;
  insert into public.agent_efficiency_daily (agent_id, day) values (auth.uid(), p_day)
    on conflict do nothing;
  select counters into next_values from public.agent_efficiency_daily
    where agent_id = auth.uid() and day = p_day for update;
  for metric, amount in select key, value from jsonb_each(p_delta) loop
    next_values := jsonb_set(next_values, array[metric],
      to_jsonb(coalesce((next_values ->> metric)::bigint, 0) + (amount::text)::bigint));
  end loop;
  update public.agent_efficiency_daily set counters = next_values
    where agent_id = auth.uid() and day = p_day;
end $$;
revoke all on function public.report_agent_efficiency(date, jsonb) from public, anon;
grant execute on function public.report_agent_efficiency(date, jsonb) to authenticated, service_role;

update public.autokolab_meta set value = '29' where key = 'schema_version';
