-- AutoKolab schema 16: what the reviewer recorded when it approved a commit (AK-45, DEC-22).
-- "How do you know?" on the website needs facts written down at the moment of approval, not
-- reconstructed later. approve_ticket takes them as p_review and stores them in tickets.review:
--   summary    one plain sentence on what the change does
--   question   for a risky change, the one yes/no question a person is asked before it merges
--   line       { file, code, plain }: the line that matters, and what it means in plain words
--   decisions  the decision keys the change was checked against (["DEC-19", "CON-15"])
--   less_sure  where the reviewer is less sure (required whenever a review is given)
-- The column changes only through approve_ticket (the column grants in 004 don't include it), and
-- goes when the approval goes: cleared with it, or reset by a new PR link.

alter table public.tickets add column review jsonb;

-- Checks a review and returns it trimmed, with unknown keys dropped. null stays null.
create or replace function public.clean_review(r jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  cleaned jsonb := '{}'::jsonb;
  k text; v text; lim int;
  line jsonb; line_out jsonb := '{}'::jsonb;
  d jsonb;
begin
  if r is null or jsonb_typeof(r) = 'null' then return null; end if;
  if jsonb_typeof(r) <> 'object' then
    raise exception 'AUTOKOLAB_BAD_REVIEW: The review must be a set of named fields.';
  end if;

  for k, lim in select * from (values ('summary', 300), ('question', 300), ('less_sure', 600)) as f(k, lim) loop
    if not (r ? k) or jsonb_typeof(r -> k) = 'null' then continue; end if;
    if jsonb_typeof(r -> k) <> 'string' then raise exception 'AUTOKOLAB_BAD_REVIEW: "%" must be text.', k; end if;
    v := btrim(r ->> k);
    if char_length(v) > lim then raise exception 'AUTOKOLAB_BAD_REVIEW: "%" is too long (% characters at most).', k, lim; end if;
    if v <> '' then cleaned := cleaned || jsonb_build_object(k, v); end if;
  end loop;
  if not (cleaned ? 'less_sure') then
    raise exception 'AUTOKOLAB_BAD_REVIEW: Say where you''re less sure ("less_sure"), or that there''s nothing you''re unsure about.';
  end if;

  line := r -> 'line';
  if line is not null and jsonb_typeof(line) <> 'null' then
    if jsonb_typeof(line) <> 'object' then raise exception 'AUTOKOLAB_BAD_REVIEW: "line" must have a file and the code.'; end if;
    for k, lim in select * from (values ('file', 300), ('code', 1000), ('plain', 300)) as f(k, lim) loop
      if not (line ? k) or jsonb_typeof(line -> k) = 'null' then continue; end if;
      if jsonb_typeof(line -> k) <> 'string' then raise exception 'AUTOKOLAB_BAD_REVIEW: "line.%" must be text.', k; end if;
      v := case when k = 'code' then rtrim(line ->> k) else btrim(line ->> k) end;
      if char_length(v) > lim then raise exception 'AUTOKOLAB_BAD_REVIEW: "line.%" is too long (% characters at most).', k, lim; end if;
      if btrim(v) <> '' then line_out := line_out || jsonb_build_object(k, v); end if;
    end loop;
    if not (line_out ? 'file' and line_out ? 'code') then
      raise exception 'AUTOKOLAB_BAD_REVIEW: "line" needs both the file and the code.';
    end if;
    cleaned := cleaned || jsonb_build_object('line', line_out);
  end if;

  d := r -> 'decisions';
  if d is not null and jsonb_typeof(d) <> 'null' then
    if jsonb_typeof(d) <> 'array' or jsonb_array_length(d) > 20
       or exists (select 1 from jsonb_array_elements(d) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Z]{2,5}-[0-9]{1,6}$') then
      raise exception 'AUTOKOLAB_BAD_REVIEW: "decisions" must be a list of up to 20 decision keys, like DEC-19.';
    end if;
    if jsonb_array_length(d) > 0 then cleaned := cleaned || jsonb_build_object('decisions', d); end if;
  end if;

  if public.looks_like_secret(cleaned::text) then
    raise exception 'AUTOKOLAB_SECRET: the review looks like it contains a key or token';
  end if;
  return cleaned;
end $$;

-- One function with an optional third argument, so helpers from before schema 16 keep working.
drop function public.approve_ticket(uuid, text);

-- Who may approve is unchanged from schema 13. p_review is stored with the approval.
create function public.approve_ticket(p_ticket uuid, p_sha text, p_review jsonb default null)
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
         approved_at  = case when p_sha is null then null else now() end,
         review       = case when p_sha is null then null else public.clean_review(p_review) end
   where id = p_ticket
  returning * into t;
  return t;
end $$;

revoke all on function public.approve_ticket(uuid, text, jsonb), public.clean_review(jsonb) from public, anon;
grant execute on function public.approve_ticket(uuid, text, jsonb) to authenticated, service_role;

-- A new PR link means a different PR: the review goes with the approval.
create or replace function public.tickets_pr_resets_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pr_url is distinct from old.pr_url then
    new.approved_sha := null; new.approved_by := null; new.approved_at := null; new.review := null;
    new.merge_ok_by := null; new.merge_ok_at := null;
  end if;
  return new;
end $$;

-- History keeps the review that came with each approval.
create or replace function public.tickets_approval_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); typ text := public.actor_type();
        why text := case when new.pr_url is distinct from old.pr_url then 'pr_changed' end;
begin
  if new.approved_sha is distinct from old.approved_sha or new.review is distinct from old.review then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'approval',
              jsonb_build_object('from', old.approved_sha, 'to', new.approved_sha, 'reason', why)
                || case when new.review is null then '{}'::jsonb else jsonb_build_object('review', new.review) end);
  end if;
  if new.merge_ok_at is distinct from old.merge_ok_at then
    insert into public.ticket_events (ticket_id, project_id, actor_id, actor_type, kind, data)
      values (new.id, new.project_id, who, typ, 'merge_ok',
              jsonb_build_object('by', new.merge_ok_by, 'reason', why));
  end if;
  return new;
end $$;

update public.autokolab_meta set value = '16' where key = 'schema_version';
