-- AutoKolab schema, version 2: invite previews.
-- The join page shows who invited you and to which repos before the (one-time) invite is used.
-- Only non-secret details are stored in `info`; the members' tokens stay encrypted in `payload`.

alter table public.invites add column if not exists info jsonb not null default '{}'::jsonb;

create or replace function public.peek_invite(code_hash text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites i where i.code_hash = peek_invite.code_hash;
  if inv.id is null then
    raise exception 'AUTOKOLAB_INVITE: this invite is invalid. Ask for a new one.';
  end if;
  return inv.info || jsonb_build_object(
    'expires_at', inv.expires_at,
    'used', inv.used_at is not null,
    'expired', inv.expires_at <= now()
  );
end $$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to anon, authenticated, service_role;

update public.autokolab_meta set value = '2' where key = 'schema_version';
