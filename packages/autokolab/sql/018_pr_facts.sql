-- AutoKolab schema 18: what GitHub said about a ticket's PR, for "How do you know?" (AK-57).
-- The website can't call GitHub or the helper (DEC-3, DEC-6), so the lead's runner, which reads the
-- PR every time it decides on a review or a merge, writes a small snapshot to the ticket:
--   sha         the PR's head commit the facts are about
--   checks      { passed, total, state: success | pending | failure }
--   files       { total, risky: the files that wait for a person's OK }
--   additions, deletions   lines added and removed
--   checked_at  when the runner recorded it (the database's time)
-- The column changes only through record_pr_facts (the column grants in 004 don't include it), and
-- goes when the PR link changes. Recording it doesn't move updated_at: nothing a person did changed.
-- Existing tickets get an empty value and nothing else changes.

alter table public.tickets add column pr_facts jsonb;

-- Checks a snapshot and returns it with unknown keys dropped and checked_at set. null stays null.
create or replace function public.clean_pr_facts(f jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  checks jsonb; files jsonb; risky jsonb;
  passed int; total int; state text;
  k text; n jsonb;
begin
  if f is null or jsonb_typeof(f) = 'null' then return null; end if;
  if jsonb_typeof(f) <> 'object' then
    raise exception 'AUTOKOLAB_BAD_PR_FACTS: The PR facts must be a set of named fields.';
  end if;
  if jsonb_typeof(f -> 'sha') is distinct from 'string' or (f ->> 'sha') !~ '^[0-9a-f]{40}$' then
    raise exception 'AUTOKOLAB_BAD_PR_FACTS: "sha" must be the full 40-character commit id, in lowercase.';
  end if;

  for k in select unnest(array['additions', 'deletions']) loop
    n := f -> k;
    if jsonb_typeof(n) is distinct from 'number' or (n #>> '{}') !~ '^[0-9]{1,9}$' then
      raise exception 'AUTOKOLAB_BAD_PR_FACTS: "%" must be a whole number of lines.', k;
    end if;
  end loop;

  checks := f -> 'checks';
  if jsonb_typeof(checks) is distinct from 'object'
     or jsonb_typeof(checks -> 'passed') is distinct from 'number' or (checks ->> 'passed') !~ '^[0-9]{1,4}$'
     or jsonb_typeof(checks -> 'total') is distinct from 'number' or (checks ->> 'total') !~ '^[0-9]{1,4}$' then
    raise exception 'AUTOKOLAB_BAD_PR_FACTS: "checks" needs how many passed and how many there are.';
  end if;
  passed := (checks ->> 'passed')::int; total := (checks ->> 'total')::int; state := checks ->> 'state';
  if passed > total then
    raise exception 'AUTOKOLAB_BAD_PR_FACTS: More checks passed than there are.';
  end if;
  if state is null or state not in ('success', 'pending', 'failure') then
    raise exception 'AUTOKOLAB_BAD_PR_FACTS: "checks.state" must be success, pending or failure.';
  end if;

  files := f -> 'files';
  if jsonb_typeof(files) is distinct from 'object'
     or jsonb_typeof(files -> 'total') is distinct from 'number' or (files ->> 'total') !~ '^[0-9]{1,6}$' then
    raise exception 'AUTOKOLAB_BAD_PR_FACTS: "files" needs how many files the PR changes.';
  end if;
  risky := coalesce(files -> 'risky', '[]'::jsonb);
  if jsonb_typeof(risky) <> 'array' or jsonb_array_length(risky) > 20
     or exists (select 1 from jsonb_array_elements(risky) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 300) then
    raise exception 'AUTOKOLAB_BAD_PR_FACTS: "files.risky" must be a list of up to 20 file paths.';
  end if;

  f := jsonb_build_object(
    'sha', f ->> 'sha',
    'checks', jsonb_build_object('passed', passed, 'total', total, 'state', state),
    'files', jsonb_build_object('total', (files ->> 'total')::int, 'risky', risky),
    'additions', (f ->> 'additions')::int,
    'deletions', (f ->> 'deletions')::int,
    'checked_at', now());
  if public.looks_like_secret(f::text) then
    raise exception 'AUTOKOLAB_SECRET: the PR facts look like they contain a key or token';
  end if;
  return f;
end $$;

-- Only the project's lead records them: its runner is the one that reads the PR.
create or replace function public.record_pr_facts(p_ticket uuid, p_facts jsonb)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; proj uuid := public.ticket_project(p_ticket); lead uuid;
begin
  select lead_agent_id into lead from public.projects where id = proj;
  if proj is null or lead is distinct from auth.uid() then
    raise exception 'AUTOKOLAB_FORBIDDEN: Only the project''s lead records what GitHub says about a PR.';
  end if;
  update public.tickets set pr_facts = public.clean_pr_facts(p_facts) where id = p_ticket
  returning * into t;
  return t;
end $$;

revoke all on function public.record_pr_facts(uuid, jsonb), public.clean_pr_facts(jsonb) from public, anon;
grant execute on function public.record_pr_facts(uuid, jsonb) to authenticated, service_role;

-- A new snapshot alone isn't a change to the ticket: keep updated_at as it was. Fires after
-- tickets_guard (triggers run in name order), which has just set it to now().
create or replace function public.tickets_pr_facts_quiet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(new) - 'pr_facts' - 'updated_at') = (to_jsonb(old) - 'pr_facts' - 'updated_at') then
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

create trigger tickets_pr_facts_quiet before update of pr_facts on public.tickets
  for each row execute function public.tickets_pr_facts_quiet();

-- A new PR link: the facts were about the old PR, so they go too (schema 17 otherwise unchanged).
create or replace function public.tickets_pr_resets_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pr_url is distinct from old.pr_url or new.assignee_id is distinct from old.assignee_id then
    new.approved_sha := null; new.approved_by := null; new.approved_at := null; new.review := null;
    new.merge_ok_by := null; new.merge_ok_at := null;
  end if;
  if new.pr_url is distinct from old.pr_url then
    new.pr_facts := null;
  end if;
  return new;
end $$;

update public.autokolab_meta set value = '18' where key = 'schema_version';
