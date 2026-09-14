#!/usr/bin/env bash
#
# Concatenate the migrations into one file that can be pasted into the
# Supabase SQL editor.
#
# Generated, never hand-edited: the migrations stay the source of truth, so
# this file cannot drift from them.
#
# The output is RE-RUNNABLE. Each migration is wrapped in a guard that checks
# a ledger table and skips it if it has already been applied, so pasting the
# whole file after adding a migration applies only the new one. Without that,
# re-running stops at the first `create type` — Postgres has no
# `create type if not exists` — and the person pasting it has no way to tell
# which migrations they still need.
#
# The wrapping uses the $mig$ dollar tag, which the migrations themselves do
# not use ($$ and $p$ are theirs), so a function body nested inside is quoted
# correctly.
set -euo pipefail
cd "$(dirname "$0")/.."

out="supabase/setup/install.sql"

{
  cat <<'HEADER'
-- ===========================================================================
-- GENERATED FILE — do not edit.
-- Rebuild with: scripts/build-setup-sql.sh
--
-- Every migration in supabase/migrations/, in order, for pasting into the
-- Supabase SQL editor.
--
-- Safe to run more than once. Each migration records itself in
-- schema_migrations and is skipped if it is already there, so re-pasting this
-- file after new migrations are added applies only those.
--
-- This does NOT include supabase/seed.sql — run that separately, after
-- registering the access token hook.
-- ===========================================================================

begin;

-- Which migrations this database already has. Created first so the guards
-- below have something to read on a brand-new project; migration 0000 creates
-- it too, idempotently, so applying migrations directly gives the same schema.
--
-- Locked down here as well as there, so it is never briefly readable through
-- the API on a fresh install.
create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

alter table schema_migrations enable row level security;
alter table schema_migrations force row level security;
revoke all on schema_migrations from anon, authenticated;

HEADER

  for migration in supabase/migrations/*.sql; do
    version="$(basename "$migration" .sql)"

    printf -- '-- ---------------------------------------------------------------------------\n'
    printf -- '-- %s\n' "$version"
    printf -- '-- ---------------------------------------------------------------------------\n'
    printf 'do $mig$\nbegin\n'
    printf "if exists (select 1 from schema_migrations where version = '%s') then\n" "$version"
    printf "  raise notice 'already applied, skipping: %%', '%s';\n" "$version"
    printf 'else\n\n'
    cat "$migration"
    printf "\n\ninsert into schema_migrations (version) values ('%s');\n" "$version"
    printf "raise notice 'applied: %%', '%s';\n" "$version"
    printf 'end if;\nend\n$mig$;\n\n'
  done

  printf 'commit;\n'
} > "$out"

echo "Wrote $out ($(wc -l < "$out") lines, from $(ls supabase/migrations/*.sql | wc -l) migrations)"

# ---------------------------------------------------------------------------
# adopt.sql — for a database installed before the ledger existed.
#
# A project set up from an earlier install.sql has the tables but no
# schema_migrations row for any of them, so the guards in install.sql would
# try to re-apply migration 0001 and stop at `create type`. This file fills
# the ledger in by DETECTION: for each migration it looks for an object that
# migration creates, and records it as applied only if that object is there.
#
# Detection rather than assumption, because a list of "what you probably have"
# is exactly the kind of thing that is wrong on the one database that matters.
# ---------------------------------------------------------------------------
adopt="supabase/setup/adopt.sql"

# The sentinel each migration leaves behind. Derived from the migration itself
# where it is the first object created; named here where it is not.
sentinel_for() {
  case "$1" in
    0015_storage)
      # Checked through pg_policies rather than storage.buckets. A sentinel
      # naming storage.buckets directly fails to parse where the storage
      # schema is absent — plpgsql resolves the whole expression before the
      # AND can short-circuit. pg_policies is a catalogue view; it is always
      # there, and is empty rather than missing.
      printf "%s" "exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'tenant reads its own private objects')" ;;
    0028_create_paths)
      printf "%s" "exists (select 1 from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum where c.relname = 'tasks' and a.attname = 'reference')" ;;
    *)
      local file="supabase/migrations/$1.sql"
      local kind name
      kind=$(grep -oiE '^create (table|or replace function|policy)' "$file" | head -1 | tr 'A-Z' 'a-z')
      name=$(grep -oiE "^create (table|or replace function|policy) [a-z_]+" "$file" | head -1 | sed -E 's/^create (table|or replace function|policy) //I')
      case "$kind" in
        "create table")
          printf "to_regclass('public.%s') is not null" "$name" ;;
        "create or replace function")
          printf "exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '%s')" "$name" ;;
        "create policy")
          printf "exists (select 1 from pg_policies where schemaname = 'public' and policyname = '%s')" "$name" ;;
        *)
          echo "no sentinel for $1" >&2; exit 1 ;;
      esac ;;
  esac
}

{
  cat <<'AHEADER'
-- ===========================================================================
-- GENERATED FILE — do not edit.
-- Rebuild with: scripts/build-setup-sql.sh
--
-- Run this ONCE, and only on a Supabase project that was set up from an
-- install.sql produced BEFORE the schema_migrations ledger existed.
--
-- It does not change your schema. For each migration it checks whether an
-- object that migration creates is actually present, and records it as
-- applied only if it is. Anything genuinely missing is left unrecorded, so
-- the next install.sql run applies it.
--
-- After this, run supabase/setup/install.sql. It will skip what you have and
-- apply only what you do not.
--
-- On a brand-new project you do not need this file at all — install.sql
-- handles a fresh database on its own.
-- ===========================================================================

begin;

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- Deployment bookkeeping, not application data. Locked down here too, because
-- this file is the first of the two to run.
alter table schema_migrations enable row level security;
alter table schema_migrations force row level security;
revoke all on schema_migrations from anon, authenticated;

do $adopt$
begin
AHEADER

  for migration in supabase/migrations/*.sql; do
    version="$(basename "$migration" .sql)"
    printf '  if %s then\n' "$(sentinel_for "$version")"
    printf "    insert into schema_migrations (version) values ('%s') on conflict do nothing;\n" "$version"
    printf "    raise notice 'present, recorded: %%', '%s';\n" "$version"
    printf '  else\n'
    printf "    raise notice 'NOT present, left for install.sql: %%', '%s';\n" "$version"
    printf '  end if;\n\n'
  done

  printf 'end\n$adopt$;\n\ncommit;\n'
} > "$adopt"

echo "Wrote $adopt"
