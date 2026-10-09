-- Access-rule tests. Run with supabase/tests/run-local.sh. Any failed check raises and stops.
\set ON_ERROR_STOP on

-- Members: ana (human, instructs), ana-claude (lead), lee (human), lee-claude (follower),
-- watcher (observer), eve (only in her own room). Each person owns themselves and their agents.
insert into public.members (id, name, kind, owner_id, client) values
  ('00000000-0000-0000-0000-000000000002', 'ana', 'human', '00000000-0000-0000-0000-000000000002', 'web'),
  ('00000000-0000-0000-0000-000000000001', 'ana-claude', 'agent', '00000000-0000-0000-0000-000000000002', 'claude-code'),
  ('00000000-0000-0000-0000-000000000004', 'lee', 'human', '00000000-0000-0000-0000-000000000004', 'web'),
  ('00000000-0000-0000-0000-000000000003', 'lee-claude', 'agent', '00000000-0000-0000-0000-000000000004', 'claude-code'),
  ('00000000-0000-0000-0000-000000000006', 'lee-codex', 'agent', '00000000-0000-0000-0000-000000000004', 'codex'),
  ('00000000-0000-0000-0000-000000000005', 'watcher', 'human', '00000000-0000-0000-0000-000000000005', 'web'),
  ('00000000-0000-0000-0000-000000000009', 'eve', 'agent', '00000000-0000-0000-0000-000000000009', 'claude-code');

insert into public.rooms (id, name, repo) values
  ('00000000-0000-0000-0000-0000000000a1', 'app', 'ana/app'),
  ('00000000-0000-0000-0000-0000000000a2', 'other', 'eve/other'),
  ('00000000-0000-0000-0000-0000000000a3', 'second-repo', 'ana/second-repo');

insert into public.room_members (room_id, member_id, role, can_instruct) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'lead', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 'human', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'follower', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000004', 'human', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', 'observer', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000006', 'follower', false),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000009', 'lead', true),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001', 'lead', true),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000003', 'follower', false);

-- followers and observers can never be allowed to instruct
do $$ begin
  insert into public.room_members values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000003', 'follower', true);
  raise exception 'EXPECTED FAILURE: follower with can_instruct';
exception when check_violation then null;
end $$;

create or replace function pg_temp.expect_error(stmt text, pattern text) returns void
language plpgsql as $$
begin
  execute stmt;
  raise exception 'EXPECTED FAILURE (%) but statement succeeded: %', pattern, stmt;
exception when others then
  if sqlerrm like 'EXPECTED FAILURE%' then raise; end if;
  if sqlerrm !~* pattern then
    raise exception 'wrong error for %: got "%", wanted /%/', stmt, sqlerrm, pattern;
  end if;
end $$;

create or replace function pg_temp.expect(cond boolean, what text) returns void
language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'CHECK FAILED: %', what; end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into public.invites (code_hash, payload, person, expires_at) values
  ('hash-ok', 'ciphertext', 'lee', now() + interval '7 days'),
  ('hash-old', 'ciphertext', 'lee', now() - interval '1 day');

-- ------------------------------------------------ lead agent posts a task to lee-claude
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.messages (room_id, sender_id, to_id, kind, body)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000003', 'task', 'Build the Zones API on branch zones-api');
select pg_temp.expect((select count(*) from public.rooms) = 2, 'lead sees both of its rooms');
select pg_temp.expect((select count(*) from public.members) = 6, 'lead sees members it shares a room with');
select pg_temp.expect(not exists (select 1 from public.members where name = 'eve'), 'eve is invisible');
select pg_temp.expect((select count(*) from public.room_members) = 8, 'lead sees memberships of its rooms');

-- secrets are rejected
select pg_temp.expect_error($q$insert into public.messages (room_id, sender_id, kind, body) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','chat',
   'use key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA')$q$, 'AUTOKOLAB_SECRET');
select pg_temp.expect_error($q$insert into public.messages (room_id, sender_id, kind, body) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','chat',
   '-----BEGIN OPENSSH PRIVATE KEY----- xyz')$q$, 'AUTOKOLAB_SECRET');

-- cannot impersonate, post into a room it isn't in, message someone outside the room, edit or delete
select pg_temp.expect_error($q$insert into public.messages (room_id, sender_id, kind, body) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000002','chat','hi')$q$,
  'row-level security');
select pg_temp.expect_error($q$insert into public.messages (room_id, sender_id, kind, body) values
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000001','chat','hi')$q$,
  'row-level security');
select pg_temp.expect_error($q$insert into public.messages (room_id, sender_id, to_id, kind, body) values
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000004','chat','hi')$q$, 'AUTOKOLAB_BAD_RECIPIENT');
select pg_temp.expect_error($q$update public.messages set body = 'changed'$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.messages$q$, 'permission denied');
select pg_temp.expect_error($q$update public.room_members set can_instruct = true$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.room_members values
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000001','lead',true)$q$, 'permission denied');
select pg_temp.expect_error($q$select * from public.invites$q$, 'permission denied');

-- ------------------------------------------------ follower
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.expect((select count(*) from public.messages where kind = 'task') = 1, 'follower sees the task');
select pg_temp.expect_error($q$insert into public.messages (room_id, sender_id, kind, body) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000003','task','do X')$q$,
  'row-level security');
insert into public.messages (room_id, sender_id, thread_id, kind, body)
  select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', min(id), 'status', 'Started'
  from public.messages;
insert into public.task_runs (room_id, message_id, runner_id, thread_root, state)
  select room_id, id, '00000000-0000-0000-0000-000000000003', id, 'running' from public.messages where kind = 'task';
select pg_temp.expect_error($q$insert into public.task_runs (room_id, message_id, runner_id, thread_root)
  select room_id, id, '00000000-0000-0000-0000-000000000003', id from public.messages where kind = 'task'$q$,
  'duplicate key');
select pg_temp.expect((public.heartbeat('working')).runner_state = 'working', 'heartbeat sets state');
select pg_temp.expect(public.mark_read('00000000-0000-0000-0000-0000000000a1', 5) = 5, 'cursor advances');
select pg_temp.expect(public.mark_read('00000000-0000-0000-0000-0000000000a1', 2) = 5, 'cursor never moves back');
select pg_temp.expect_error($q$select public.mark_read('00000000-0000-0000-0000-0000000000a2', 1)$q$, 'not in this room');
insert into public.bulletin (room_id, kind, title, state, assignee_id, created_by, updated_by)
  values ('00000000-0000-0000-0000-0000000000a1', 'task', 'Zones API', 'open',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003');
update public.bulletin set state = 'in_progress', updated_by = '00000000-0000-0000-0000-000000000003';
select pg_temp.expect((select count(*) from public.bulletin_history) = 1, 'bulletin history kept');

-- ------------------------------------------------ pause rules
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.expect_error($q$select public.set_paused('lee-claude', true)$q$, 'AUTOKOLAB_FORBIDDEN');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.expect((public.set_paused('lee-claude', true)).paused, 'owner pauses own agent');

-- ------------------------------------------------ people name themselves and their agents
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.expect((public.update_member('00000000-0000-0000-0000-000000000004', 'lee-k', 'Europe/Stockholm')).name = 'lee-k', 'rename self');
select pg_temp.expect((public.update_member('00000000-0000-0000-0000-000000000003', 'lee-builder')).name = 'lee-builder', 'rename own agent');
select pg_temp.expect_error($q$select public.update_member('00000000-0000-0000-0000-000000000003', 'ana')$q$, 'AUTOKOLAB_NAME_TAKEN');
select pg_temp.expect_error($q$select public.update_member('00000000-0000-0000-0000-000000000003', 'Bad Name')$q$, 'AUTOKOLAB_BAD_NAME');
select pg_temp.expect_error($q$select public.update_member('00000000-0000-0000-0000-000000000001', 'stolen')$q$, 'AUTOKOLAB_FORBIDDEN');
select pg_temp.expect_error($q$select public.update_member('00000000-0000-0000-0000-000000000004', retire => true)$q$, 'AUTOKOLAB_FORBIDDEN');
select pg_temp.expect((public.update_member('00000000-0000-0000-0000-000000000006', retire => true)).revoked, 'retire own unused agent');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.expect((public.update_member('00000000-0000-0000-0000-000000000003', new_timezone => 'Europe/Stockholm')).timezone = 'Europe/Stockholm', 'agent sets own zone');
select pg_temp.expect((public.set_paused('lee-builder', false)).paused = false, 'agent can resume itself');
reset role;
update public.members set name = 'lee', timezone = null where id = '00000000-0000-0000-0000-000000000004';
update public.members set name = 'lee-claude', paused = true where id = '00000000-0000-0000-0000-000000000003';
set role authenticated;

-- ------------------------------------------------ observers are read-only
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.expect((select count(*) from public.messages) = 2, 'observer reads');
select pg_temp.expect_error($q$insert into public.messages (room_id, sender_id, kind, body) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000005','chat','hi')$q$,
  'row-level security');

-- ------------------------------------------------ other rooms are invisible
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000009';
select pg_temp.expect((select count(*) from public.messages) = 0, 'eve sees no messages');
select pg_temp.expect((select count(*) from public.members) = 1, 'eve sees only herself');
select pg_temp.expect((select count(*) from public.task_runs) = 0, 'eve sees no runs');

-- ------------------------------------------------ revoked members lose access at once
reset role;
update public.members set revoked = true where name = 'lee-claude';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.expect((select count(*) from public.messages) = 0, 'revoked member sees nothing');
select pg_temp.expect_error($q$select public.heartbeat()$q$, 'AUTOKOLAB_NOT_MEMBER');

-- ------------------------------------------------ invites: once, unexpired, anonymous OK
reset request.jwt.claim.sub;
set role anon;
select pg_temp.expect(public.redeem_invite('hash-ok') = 'ciphertext', 'invite redeems once');
select pg_temp.expect_error($q$select public.redeem_invite('hash-ok')$q$, 'AUTOKOLAB_INVITE');
select pg_temp.expect_error($q$select public.redeem_invite('hash-old')$q$, 'AUTOKOLAB_INVITE');
select pg_temp.expect_error($q$select public.redeem_invite('nope')$q$, 'AUTOKOLAB_INVITE');
select pg_temp.expect_error($q$select * from public.messages$q$, 'permission denied');
select pg_temp.expect_error($q$select public.heartbeat()$q$, 'permission denied');
-- invite previews: anyone holding the code sees the non-secret details, never the payload
reset role;
update public.invites set info = '{"invited_by":"ana","rooms":["app"]}' where code_hash = 'hash-old';
set role anon;
select pg_temp.expect((public.peek_invite('hash-old')) ->> 'invited_by' = 'ana', 'invite preview shows inviter');
select pg_temp.expect((public.peek_invite('hash-old')) ->> 'expired' = 'true', 'invite preview shows expiry');
select pg_temp.expect((public.peek_invite('hash-ok')) ->> 'used' = 'true', 'invite preview shows it was used');
select pg_temp.expect(not (public.peek_invite('hash-ok') ? 'payload'), 'preview never includes the payload');
select pg_temp.expect_error($q$select public.peek_invite('nope')$q$, 'AUTOKOLAB_INVITE');

-- ------------------------------------------------ the admin's secret key manages the team
set role service_role;
insert into public.rooms (name, repo) values ('third', 'ana/third');
select pg_temp.expect((select count(*) from public.invites) = 2, 'service role reads invites');
select pg_temp.expect((select count(*) from public.members) = 7, 'service role sees everyone');
update public.room_members set can_instruct = false where member_id = '00000000-0000-0000-0000-000000000005';
reset role;

-- ------------------------------------------------ v2 profiles: GitHub sign-ins only, own row only
reset role;
insert into auth.users (id, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', '{"provider":"github"}', '{"user_name":"octo","full_name":"Octo Cat","avatar_url":"https://x/a.png"}'),
  ('00000000-0000-0000-0000-0000000000b2', '{"provider":"github"}', '{"user_name":"mona"}'),
  ('00000000-0000-0000-0000-0000000000b3', '{"provider":"email"}', '{}');
select pg_temp.expect((select name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'Octo Cat', 'profile from GitHub full name');
select pg_temp.expect((select name from public.profiles where id = '00000000-0000-0000-0000-0000000000b2') = 'mona', 'falls back to GitHub login');
select pg_temp.expect(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000b3'), 'non-GitHub logins get no profile');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect((select count(*) from public.profiles) = 1, 'you see only your own profile');
update public.profiles set name = 'Octo', timezone = 'Europe/Stockholm', city = 'Gothenburg', onboarded = true;
select pg_temp.expect((select city from public.profiles) = 'Gothenburg', 'you can edit your profile');
select pg_temp.expect_error($q$update public.profiles set github_login = 'someone-else'$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.profiles (id, name) values ('00000000-0000-0000-0000-0000000000b3', 'x')$q$, 'permission denied');
select pg_temp.expect((public.ensure_my_profile()).name = 'Octo', 'ensure_my_profile returns your profile');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
update public.profiles set name = 'hijack' where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select pg_temp.expect((select name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'Octo', 'others cannot edit your profile');

-- ------------------------------------------------ v2 workspace: projects, tickets, guide, decisions
reset role;
-- Octo (b1) owns a project; Mona (b2) is a person who signed in but isn't in it yet.
-- Agent c1 (Octo's Claude) and c2 (an outsider's agent) are Auth users with agents rows.
insert into public.agents (id, owner_profile_id, owner_label, vendor, display_name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'octo', 'claude', 'Octo''s Claude'),
  ('00000000-0000-0000-0000-0000000000c2', null, 'eve', 'codex', 'Eve''s Codex');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect((public.create_project('Vajra Vision', 'Octo/Vajra-Vision', 'vv')).ticket_prefix = 'VV', 'owner creates a project');
select pg_temp.expect((select count(*) from public.project_members) = 1, 'owner is the first member');
select pg_temp.expect((select count(*) from public.project_guides) = 1, 'a guide is started');
select pg_temp.expect_error($q$select public.create_project('Vajra Vision', 'x/y', 'VX')$q$, 'AUTOKOLAB_TAKEN');
-- add the agent (by the service, as pairing will) and Mona (by GitHub login)
reset role;
insert into public.project_members (project_id, actor_id, actor_type) select id, '00000000-0000-0000-0000-0000000000c1', 'agent' from public.projects;
set role authenticated;
select pg_temp.expect((public.add_project_person((select id from public.projects), 'MONA')).name = 'mona', 'owner adds a person by GitHub login');
select pg_temp.expect_error($q$select public.add_project_person((select id from public.projects), 'nobody')$q$, 'AUTOKOLAB_NOT_FOUND');
-- tickets get sequential keys; assignee must be in the project
select pg_temp.expect((public.create_ticket((select id from public.projects), 'Login screen', '', 'feature', 'high', 'ready',
  '00000000-0000-0000-0000-0000000000c1', null, array['auth'], array['Google button on /login'])).key = 'VV-1', 'first ticket is VV-1');
select pg_temp.expect((public.create_ticket((select id from public.projects), 'OAuth callback')).key = 'VV-2', 'second ticket is VV-2');
select pg_temp.expect_error($q$select public.create_ticket((select id from public.projects), 'x', '', 'task', 'none', 'backlog', '00000000-0000-0000-0000-0000000000c2')$q$, 'AUTOKOLAB_BAD_ASSIGNEE');
select pg_temp.expect((select assignee_type from public.tickets where key = 'VV-1') = 'agent', 'assignee type is filled in');
select pg_temp.expect_error($q$select public.create_ticket((select id from public.projects), 'leak sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA')$q$, 'AUTOKOLAB_SECRET');
-- links, decisions
insert into public.ticket_links (ticket_id, blocked_by) select a.id, b.id from public.tickets a, public.tickets b where a.key = 'VV-2' and b.key = 'VV-1';
select pg_temp.expect((public.create_decision((select id from public.projects), 'Use Supabase Auth')).key = 'DEC-1', 'decisions are numbered');
update public.project_guides set concept = 'Behavior-based CCTV alerts', rules = 'Never touch .env.prod';
-- the agent works the ticket: status, steps, comment; history records it all
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.expect((select count(*) from public.tickets) = 2, 'agent sees the project tickets');
select pg_temp.expect((select rules from public.project_guides) = 'Never touch .env.prod', 'agent reads the guide');
update public.tickets set status = 'in_progress', branch = 'vv-1-login' where key = 'VV-1';
insert into public.ticket_steps (ticket_id, idx, label, status) select id, 0, 'Button component', 'now' from public.tickets where key = 'VV-1';
update public.ticket_steps set status = 'done';
insert into public.ticket_comments (ticket_id, author_id, author_type, body) select id, '00000000-0000-0000-0000-0000000000c1', 'agent', 'Started; using components/ui/Button.' from public.tickets where key = 'VV-1';
select pg_temp.expect((public.agent_status('building', 'VV-1', (select id from public.tickets where key = 'VV-1'))).status = 'building', 'agent reports status');
select pg_temp.expect((select started_at is not null from public.tickets where key = 'VV-1'), 'start time recorded');
select pg_temp.expect((select string_agg(kind, ',' order by id) from public.ticket_events where ticket_id = (select id from public.tickets where key = 'VV-1'))
  = 'created,status,branch,step,comment', 'history records every change');
select pg_temp.expect_error($q$insert into public.ticket_comments (ticket_id, author_id, author_type, body) select id, '00000000-0000-0000-0000-0000000000b1', 'human', 'impersonating' from public.tickets limit 1$q$, 'row-level security');
select pg_temp.expect_error($q$update public.tickets set key = 'XX-9'$q$, 'permission denied');
select pg_temp.expect_error($q$select public.create_project('Agent project', 'a/b', 'AP')$q$, 'AUTOKOLAB_FORBIDDEN');
-- outsiders see nothing
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.expect((select count(*) from public.tickets) = 0, 'outside agent sees no tickets');
select pg_temp.expect((select count(*) from public.project_guides) = 0, 'outside agent sees no guide');
update public.tickets set status = 'done';
select pg_temp.expect_error($q$select public.create_ticket((select id from public.projects limit 1), 'x')$q$, 'AUTOKOLAB_FORBIDDEN|null');
-- people in the project see each other's profiles; Mona can work tickets but not add people
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect((select count(*) from public.profiles) = 2, 'members see each other''s profiles');
select pg_temp.expect((select count(*) from public.agents) = 1, 'members see the project''s agents');
select pg_temp.expect_error($q$select public.add_project_person((select id from public.projects), 'octo')$q$, 'AUTOKOLAB_FORBIDDEN');
update public.tickets set status = 'review' where key = 'VV-1';
select pg_temp.expect((select status from public.tickets where key = 'VV-1') = 'review', 'members move tickets');
reset role;
select pg_temp.expect((select status from public.tickets where key = 'VV-1') = 'review', 'outsider update had no effect');

-- ------------------------------------------------ the project lead (schema 5)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
update public.projects set lead_agent_id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.expect((select lead_agent_id from public.projects) = '00000000-0000-0000-0000-0000000000c1', 'owner picks the lead');
select pg_temp.expect_error($q$update public.projects set lead_agent_id = '00000000-0000-0000-0000-0000000000c2'$q$, 'AUTOKOLAB_BAD_LEAD');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
update public.projects set lead_agent_id = null;
reset role;
select pg_temp.expect((select lead_agent_id from public.projects) = '00000000-0000-0000-0000-0000000000c1', 'only the owner changes the lead');
delete from public.project_members where actor_id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.expect((select lead_agent_id from public.projects) is null, 'a lead that leaves stops being lead');

-- ------------------------------------------------ the room on the website (schema 6)
reset role;
-- Octo's website sign-in (b1) is linked to room member ana; Mona's (b2) to the observer.
update public.members set profile_id = '00000000-0000-0000-0000-0000000000b1' where name = 'ana';
update public.members set profile_id = '00000000-0000-0000-0000-0000000000b2' where name = 'watcher';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect((select count(*) from public.rooms) = 1, 'website user sees the linked member''s room only');
select pg_temp.expect((select count(*) from public.messages where room_id = '00000000-0000-0000-0000-0000000000a2') = 0, 'website user sees no other rooms'' messages');
select pg_temp.expect((select count(*) from public.messages) > 0, 'website user reads the room');
select pg_temp.expect((select count(*) from public.members where name = 'lee-codex') = 1, 'website user sees the room''s members');
select pg_temp.expect((select count(*) from public.members where name = 'eve') = 0, 'but not members of other rooms');
select pg_temp.expect((public.web_post('00000000-0000-0000-0000-0000000000a1', '@lee-codex please look at the login page', '00000000-0000-0000-0000-000000000006')).sender_id
  = '00000000-0000-0000-0000-000000000002', 'website posts as the linked member');
select pg_temp.expect_error($q$select public.web_post('00000000-0000-0000-0000-0000000000a1', 'key ghp_abcdefghijklmnopqrstuvwxyz0123456789')$q$, 'AUTOKOLAB_SECRET');
select pg_temp.expect_error($q$select public.web_post('00000000-0000-0000-0000-0000000000a2', 'hello')$q$, 'AUTOKOLAB_FORBIDDEN');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect_error($q$select public.web_post('00000000-0000-0000-0000-0000000000a1', 'hi')$q$, 'AUTOKOLAB_FORBIDDEN');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
select pg_temp.expect((select count(*) from public.messages) = 0, 'an unlinked sign-in sees no messages');
reset role;

-- ------------------------------------------------ secret patterns match the client-side list
reset role;
select pg_temp.expect(public.looks_like_secret(s), 'secret pattern: ' || s) from unnest(array[
  'sk-ant-api03-abcdefghijklmnopqrstuv', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'AKIAIOSFODNN7EXAMPLE',
  '-----BEGIN RSA PRIVATE KEY-----', 'xoxb-1234567890-abcdefghij', 'sk_live_abcdefghijklmnop',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'ak1.3f1c2a9e-1b2c-4d5e-8f90-123456789abc.xxxxxxxxxxxxxxxxxxxxxxxx',
  'sb_secret_abcdefghijklmnopqrstuvwxyz', 'akinv_abcdefghijklmnopqrstuvwxyz']) s;
select pg_temp.expect(not public.looks_like_secret(s), 'not a secret: ' || s) from unnest(array[
  'Fix the zones API', 'See PR #12, branch zones-api', 'sk-learn is a library', 'commit 3f1c2a9e1b2c']) s;

\echo ALL POLICY TESTS PASSED
