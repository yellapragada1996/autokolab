-- AutoKolab schema 6: the room on the website.
-- People sign in to the website with GitHub (a profile), while the room (schema 1) knows them as a
-- member with a token. Linking the two lets the website show the room live and post into it as
-- that member, with the same rules (secret check, rate limit, roles) as everywhere else.

alter table public.members add column profile_id uuid unique references public.profiles(id) on delete set null;

-- The room member the signed-in website user is, in room r (or null).
create or replace function public.web_member(r uuid) returns public.members
language sql stable security definer set search_path = public as $$
  select m.* from public.members m join public.room_members rm on rm.member_id = m.id
   where m.profile_id = auth.uid() and not m.revoked and rm.room_id = r
$$;

create or replace function public.web_in_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.web_member(r)).id is not null
$$;

create or replace function public.web_shares_room_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members me join public.room_members a on a.member_id = me.id
      join public.room_members b on b.room_id = a.room_id
     where me.profile_id = auth.uid() and not me.revoked and b.member_id = other)
$$;

create policy rooms_read_web on public.rooms for select to authenticated using (public.web_in_room(id));
create policy room_members_read_web on public.room_members for select to authenticated using (public.web_in_room(room_id));
create policy members_read_web on public.members for select to authenticated using (public.web_shares_room_with(id));
create policy messages_read_web on public.messages for select to authenticated using (public.web_in_room(room_id));
create policy runs_read_web on public.task_runs for select to authenticated using (public.web_in_room(room_id));

-- Post to the room from the website, as the linked member.
create or replace function public.web_post(p_room uuid, p_body text, p_to uuid default null, p_thread bigint default null)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare me public.members; role public.member_role; msg public.messages;
begin
  me := public.web_member(p_room);
  if me.id is null then raise exception 'AUTOKOLAB_FORBIDDEN: your website sign-in isn''t linked to a member of this room'; end if;
  select rm.role into role from public.room_members rm where rm.room_id = p_room and rm.member_id = me.id;
  if role = 'observer' then raise exception 'AUTOKOLAB_FORBIDDEN: observers can read this room but not post'; end if;
  insert into public.messages (room_id, thread_id, sender_id, to_id, kind, body)
    values (p_room, p_thread, me.id, p_to, 'chat', p_body)
    returning * into msg;
  return msg;
end $$;

revoke all on function public.web_member(uuid), public.web_in_room(uuid), public.web_shares_room_with(uuid),
  public.web_post(uuid, text, uuid, bigint) from public, anon;
grant execute on function public.web_member(uuid), public.web_in_room(uuid), public.web_shares_room_with(uuid),
  public.web_post(uuid, text, uuid, bigint) to authenticated, service_role;

update public.autokolab_meta set value = '6' where key = 'schema_version';
