-- AutoKolab schema, version 3: people who sign in on autokolab.com with GitHub (v2, Phase 0).
-- A profile is created on a person's first GitHub sign-in. The member logins that v1 creates for
-- its tokens are not GitHub sign-ins and get no profile.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  github_login text,
  name         text not null check (char_length(name) between 1 and 60),
  avatar_url   text,
  timezone     text,
  city         text check (char_length(city) <= 60),
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Phase 0: you see and edit only yourself. Teammates' profiles become visible through project
-- membership in Phase 1.
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, timezone, city, onboarded) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create or replace function public.profiles_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.profiles_touch();

-- Create the profile from GitHub's details on first sign-in.
create or replace function public.profile_from_github(u auth.users) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'github' then
    return;
  end if;
  insert into public.profiles (id, github_login, name, avatar_url)
  values (
    u.id,
    u.raw_user_meta_data ->> 'user_name',
    left(coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''),
                  u.raw_user_meta_data ->> 'user_name', 'me'), 60),
    u.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
end $$;

create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.profile_from_github(new);
  return new;
end $$;

drop trigger if exists autokolab_profile_on_signup on auth.users;
create trigger autokolab_profile_on_signup after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- Safety net for people who signed in before the trigger existed: the site calls this once.
create or replace function public.ensure_my_profile() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare u auth.users; p public.profiles;
begin
  select * into u from auth.users where id = auth.uid();
  if u.id is null then raise exception 'AUTOKOLAB_NOT_SIGNED_IN: sign in first'; end if;
  perform public.profile_from_github(u);
  select * into p from public.profiles where id = u.id;
  return p;
end $$;

revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated, service_role;
revoke all on function public.profile_from_github(auth.users) from public, anon, authenticated;

update public.autokolab_meta set value = '3' where key = 'schema_version';
