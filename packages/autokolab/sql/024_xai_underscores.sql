-- AutoKolab schema 24: xAI keys with underscores are caught by the secret check too (AK-113).
-- xAI keys are "xai-" and 80 letters, digits or underscores, so 023's xai-[a-z0-9]{60,} let through a
-- key with an underscore in its first 60 characters. A new migration rather than an edit to 023, so
-- databases that already ran 023 get the fix. Mirrored in packages/autokolab/src/core/secrets.ts.

-- As in schema 23, with underscores allowed in the xAI pattern.
create or replace function public.looks_like_secret(t text) returns boolean
language sql immutable as $$
  select t ~* any (array[
    'sk-ant-[a-z0-9_-]{16,}',
    'sk-(proj-|svcacct-)?[a-z0-9_-]{32,}',
    'gh[pousr]_[a-z0-9]{30,}',
    'github_pat_[a-z0-9_]{40,}',
    'AKIA[0-9A-Z]{16}',
    'aws_secret_access_key\s*[:=]',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'xox[abprs]-[a-z0-9-]{10,}',
    'AIza[0-9A-Za-z_-]{35}',
    'sbp_[a-f0-9]{40}',
    'sb_secret_[a-z0-9_-]{20,}',
    'eyJ[a-z0-9_-]{10,}\.eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}',
    'ak1\.[a-z0-9_-]{20,}',
    'akinv_[a-z0-9_-]{20,}',
    'sk_live_[a-z0-9]{16,}',
    'rk_live_[a-z0-9]{16,}',
    'gsk_[a-z0-9]{40,}',
    'xai-[a-z0-9_]{60,}'
  ])
$$;

-- ---------------------------------------------------------------- schema version

update public.autokolab_meta set value = '24' where key = 'schema_version';
