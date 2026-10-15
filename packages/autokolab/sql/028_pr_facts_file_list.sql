-- AutoKolab schema 28: the list of files a PR changes, for "Show the work" (AK-134).
-- pr_facts.files held only how many files changed and which were risky (schema 18), so the ticket
-- page had nothing per file to link. The runner already sees the list: `gh pr view --json files`
-- returns path/additions/deletions for each file. clean_pr_facts now keeps that as `files.list`,
-- capped at 100 (gh lists at most that many), so the page can list each file and link to its diff.
-- A missing list becomes an empty list, so rows written by an earlier runner still pass, and
-- `files.total` and `files.risky` keep their meaning.

create or replace function public.clean_pr_facts(f jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  checks jsonb; files jsonb; risky jsonb; list jsonb; entry jsonb;
  passed int; total int; state text;
  k text; n jsonb;
  kept jsonb := '[]'::jsonb;
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

  -- The changed files with their own +/−, at most 100 of them. A missing list is an empty one.
  list := files -> 'list';
  if list is not null and jsonb_typeof(list) <> 'null' then
    if jsonb_typeof(list) <> 'array' then
      raise exception 'AUTOKOLAB_BAD_PR_FACTS: "files.list" must be a list of changed files.';
    end if;
    for entry in select value from jsonb_array_elements(list) with ordinality as t(value, ord) where ord <= 100 loop
      if jsonb_typeof(entry) <> 'object'
         or jsonb_typeof(entry -> 'path') is distinct from 'string' or char_length(entry ->> 'path') not between 1 and 300
         or jsonb_typeof(entry -> 'additions') is distinct from 'number' or (entry ->> 'additions') !~ '^[0-9]{1,9}$'
         or jsonb_typeof(entry -> 'deletions') is distinct from 'number' or (entry ->> 'deletions') !~ '^[0-9]{1,9}$' then
        raise exception 'AUTOKOLAB_BAD_PR_FACTS: each file in "files.list" needs a path and whole-number additions and deletions.';
      end if;
      kept := kept || jsonb_build_object('path', entry ->> 'path', 'additions', (entry ->> 'additions')::int, 'deletions', (entry ->> 'deletions')::int);
    end loop;
  end if;

  f := jsonb_build_object(
    'sha', f ->> 'sha',
    'checks', jsonb_build_object('passed', passed, 'total', total, 'state', state),
    'files', jsonb_build_object('total', (files ->> 'total')::int, 'risky', risky, 'list', kept),
    'additions', (f ->> 'additions')::int,
    'deletions', (f ->> 'deletions')::int,
    'checked_at', now());
  if public.looks_like_secret(f::text) then
    raise exception 'AUTOKOLAB_SECRET: the PR facts look like they contain a key or token';
  end if;
  return f;
end $$;

update public.autokolab_meta set value = '28' where key = 'schema_version';
