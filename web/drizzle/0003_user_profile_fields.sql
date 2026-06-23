-- web/drizzle/0003_user_profile_fields.sql
-- Public profile fields: a short plain-text bio (length-capped) + a flat social_links jsonb map.
-- The DB does NOT validate link CONTENTS — the POST /api/v1/profile route runs the pure normalizer
-- (web/src/lib/profile/social-links.ts): closed platform allowlist, scheme-safe https URLs built
-- server-side, per-value length caps. The bio CHECK is a belt-and-suspenders length cap; the app also
-- caps it (zod max 280 + textarea maxLength + the normalizer). Idempotent (IF NOT EXISTS + a guarded
-- constraint add) so a re-run is clean. Mirrors the 0001/0002 style + the trailing PostgREST reload.
--
-- RLS: NO new policy/GRANT/REVOKE. users_select_public (0000) is a ROW-level policy (banned_at is
-- null) with no column restriction, so bio/social_links are publicly readable — intended public
-- profile data, so unlike 0002's is_admin we do NOT revoke the column. users_update_self exists, but
-- the edit goes through the service-role Drizzle route (whitelisted to bio + social_links +
-- updated_at), never client PostgREST.
alter table users add column if not exists bio text;

-- A bare `add constraint` THROWS on re-run (unlike `add column if not exists`); guard it so the
-- migration is safely re-runnable.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_bio_len_chk') then
    alter table users add constraint users_bio_len_chk
      check (bio is null or length(bio) <= 280);
  end if;
end $$;

alter table users add column if not exists social_links jsonb not null default '{}'::jsonb;

-- Defense in depth: the app reads via Drizzle/postgres-js, not PostgREST. Mirrors 0001/0002.
select pg_notify('pgrst', 'reload schema');
