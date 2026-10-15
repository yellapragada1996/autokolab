-- AutoKolab schema 26: which path each run took, so the Results page can compare them (AK-120).
-- AK-117 added re-reviews (only the new commits) and light reviews (small, safe changes on a cheaper
-- model), and AK-124 sends a PR that conflicts with its base back to its builder. run_usage.path says
-- which of these a run was:
--   full          a review of the whole PR on the usual model
--   re_review     a review of only the commits since the last one
--   light         a review of the whole PR on the cheaper model
--   conflict_fix  a build run that resumes after a conflict send-back
-- Every other run (other builds, replies, questions) has no path. record_run_usage takes it as
-- p_path, last and optional, so older helpers that don't send it keep recording, with no path.
-- A path that doesn't fit the kind of run is stored as unknown rather than refused, like the figures.
-- Existing rows keep a null path; nothing is backfilled.

alter table public.run_usage
  add column path text check (path is null or path in ('full', 're_review', 'light', 'conflict_fix'));

-- Replaced, not overloaded: two versions would make a call without p_path ambiguous.
drop function public.record_run_usage(uuid, text, integer, uuid, text, bigint, bigint, bigint, bigint, integer, numeric);

create function public.record_run_usage(
  p_project uuid, p_kind text, p_seconds integer,
  p_ticket uuid default null, p_model text default null,
  p_input_tokens bigint default null, p_cache_read_tokens bigint default null,
  p_cache_write_tokens bigint default null, p_output_tokens bigint default null,
  p_turns integer default null, p_cost_usd numeric default null,
  p_path text default null)
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
                                cache_write_tokens, output_tokens, turns, seconds, cost_usd, path)
  values (p_project, auth.uid(), ticket, p_kind,
          case when p_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,79}$' and not public.looks_like_secret(p_model) then p_model end,
          case when p_input_tokens >= 0 then p_input_tokens end,
          case when p_cache_read_tokens >= 0 then p_cache_read_tokens end,
          case when p_cache_write_tokens >= 0 then p_cache_write_tokens end,
          case when p_output_tokens >= 0 then p_output_tokens end,
          case when p_turns >= 0 then p_turns end,
          least(greatest(coalesce(p_seconds, 0), 0), 86400),
          case when p_cost_usd >= 0 and p_cost_usd < 1000000 then round(p_cost_usd, 6) end,
          case when p_kind = 'review' and p_path in ('full', 're_review', 'light') then p_path
               when p_kind = 'build' and p_path = 'conflict_fix' then p_path end)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.record_run_usage(uuid, text, integer, uuid, text, bigint, bigint, bigint, bigint, integer, numeric, text) from public, anon;
grant execute on function public.record_run_usage(uuid, text, integer, uuid, text, bigint, bigint, bigint, bigint, integer, numeric, text) to authenticated, service_role;

update public.autokolab_meta set value = '26' where key = 'schema_version';
