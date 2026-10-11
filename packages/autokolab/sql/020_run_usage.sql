-- AutoKolab schema 20: what each run used, for the Results page's "Where the usage went" (AK-92).
-- Every time a runner starts its agent (to build a ticket, review one, reply in the room or look at
-- a worker's question) it records one row when the run ends, failed runs included:
--   kind                build | review | reply | question
--   model               the model the tool said it ran; null when it doesn't say (Codex)
--   input_tokens        tokens read fresh
--   cache_read_tokens   tokens read from the cache
--   cache_write_tokens  tokens written to the cache
--   output_tokens       tokens written as output
--   turns, cost_usd     as the tool reports them
--   seconds             how long the run took, measured by the runner
-- Every figure is what the tool reported; null means it didn't say. Nothing is estimated.
-- The table holds numbers and a model name only: no message, prompt or reply text.
-- Rows are written only through record_run_usage, by the agent the run belongs to; a project's
-- members can read them. The table starts empty and fills from each machine's next run.

create table public.run_usage (
  id                 bigint generated always as identity primary key,
  project_id         uuid not null references public.projects(id) on delete cascade,
  agent_id           uuid not null references public.agents(id) on delete cascade,
  ticket_id          uuid references public.tickets(id) on delete set null,
  kind               text not null check (kind in ('build', 'review', 'reply', 'question')),
  model              text check (model is null or model ~ '^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,79}$'),
  input_tokens       bigint check (input_tokens is null or input_tokens >= 0),
  cache_read_tokens  bigint check (cache_read_tokens is null or cache_read_tokens >= 0),
  cache_write_tokens bigint check (cache_write_tokens is null or cache_write_tokens >= 0),
  output_tokens      bigint check (output_tokens is null or output_tokens >= 0),
  turns              integer check (turns is null or turns >= 0),
  seconds            integer not null check (seconds between 0 and 86400),
  cost_usd           numeric(12, 6) check (cost_usd is null or cost_usd >= 0),
  created_at         timestamptz not null default now()
);
create index run_usage_project_idx on public.run_usage (project_id, created_at);

alter table public.run_usage enable row level security;
create policy run_usage_read on public.run_usage for select to authenticated using (public.is_project_member(project_id));
-- No insert, update or delete policy and no such grant: rows come only from record_run_usage.
revoke all on public.run_usage from anon, authenticated;
grant select on public.run_usage to authenticated;
grant all on public.run_usage to service_role;

-- The agent records its own run. A figure that isn't a sane count is stored as "not reported"
-- rather than refused, so one odd number never loses the rest of the row.
create function public.record_run_usage(
  p_project uuid, p_kind text, p_seconds integer,
  p_ticket uuid default null, p_model text default null,
  p_input_tokens bigint default null, p_cache_read_tokens bigint default null,
  p_cache_write_tokens bigint default null, p_output_tokens bigint default null,
  p_turns integer default null, p_cost_usd numeric default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint; ticket uuid;
begin
  if not exists (select 1 from public.agents where id = auth.uid()) then
    raise exception 'AUTOKOLAB_NOT_AGENT: only agents record what their runs used';
  end if;
  if not public.is_project_member(p_project) then
    raise exception 'AUTOKOLAB_FORBIDDEN: not a member of this project';
  end if;
  if p_kind is null or p_kind not in ('build', 'review', 'reply', 'question') then
    raise exception 'AUTOKOLAB_BAD_USAGE: The kind of run must be build, review, reply or question.';
  end if;
  -- A ticket from another project is left off, not trusted.
  select id into ticket from public.tickets where id = p_ticket and project_id = p_project;
  insert into public.run_usage (project_id, agent_id, ticket_id, kind, model, input_tokens, cache_read_tokens,
                                cache_write_tokens, output_tokens, turns, seconds, cost_usd)
  values (p_project, auth.uid(), ticket, p_kind,
          case when p_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,79}$' and not public.looks_like_secret(p_model) then p_model end,
          case when p_input_tokens >= 0 then p_input_tokens end,
          case when p_cache_read_tokens >= 0 then p_cache_read_tokens end,
          case when p_cache_write_tokens >= 0 then p_cache_write_tokens end,
          case when p_output_tokens >= 0 then p_output_tokens end,
          case when p_turns >= 0 then p_turns end,
          least(greatest(coalesce(p_seconds, 0), 0), 86400),
          case when p_cost_usd >= 0 and p_cost_usd < 1000000 then round(p_cost_usd, 6) end)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.record_run_usage(uuid, text, integer, uuid, text, bigint, bigint, bigint, bigint, integer, numeric) from public, anon;
grant execute on function public.record_run_usage(uuid, text, integer, uuid, text, bigint, bigint, bigint, bigint, integer, numeric) to authenticated, service_role;

update public.autokolab_meta set value = '20' where key = 'schema_version';
