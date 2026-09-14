-- 0000_schema_migrations
--
-- The ledger that makes supabase/setup/install.sql re-runnable: each migration
-- records itself here and is skipped if it is already present.
--
-- It lives as a migration, not only in the generated bundle, so that both
-- paths into a database — the bundle, and applying migrations directly — end
-- with the same schema. A table that exists on one path and not the other is
-- how the structural RLS audit comes to be checking something the live
-- database does not have.
--
-- `if not exists` because install.sql has to create it in its header, before
-- the first guard can read it. This migration then runs under its own guard
-- and finds it already there.

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- No policies, and no grants. This is deployment bookkeeping, not application
-- data: nothing reaching the database through PostgREST has any business
-- reading it. RLS with zero policies denies everything, and the revoke means
-- the API never advertises the table at all.
alter table schema_migrations enable row level security;
alter table schema_migrations force row level security;

revoke all on schema_migrations from anon, authenticated;
