-- AutoKolab schema 23: the secret check also catches Groq and xAI API keys (AK-110, DEC-26).
-- API-model agents use their owner's provider key. The runner scrubs that key from its own output,
-- but a key pasted by hand into a comment or the room would get through. Groq keys are "gsk_" and
-- 52 letters/digits; xAI keys are "xai-" and 80 letters, digits or underscores. Mirrored in
-- packages/autokolab/src/core/secrets.ts.

-- As in schema 1, with the two new patterns at the end.
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

update public.autokolab_meta set value = '23' where key = 'schema_version';
