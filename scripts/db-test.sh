#!/usr/bin/env bash
#
# Rebuild the local test database and apply every migration in order.
#
# This runs against a plain PostgreSQL cluster, not Supabase. The Supabase
# pieces the migrations depend on — the auth schema, auth.uid(), and the anon /
# authenticated / service_role roles — come from supabase/tests/00_supabase_shim.sql,
# which is test-only and never applied to a real project.
#
# Usage:
#   scripts/db-test.sh            # rebuild and apply migrations
#   scripts/db-test.sh --seed     # also apply supabase/seed.sql
#
# Env: PGHOST (default /tmp), PGPORT (default 5433), PGUSER (default postgres),
#      TEST_DB (default heron_test)
set -euo pipefail

export PATH="$PATH:/usr/lib/postgresql/16/bin"
PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
TEST_DB="${TEST_DB:-heron_test}"

"$(dirname "$0")/db-start.sh" >/dev/null

psql_root() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -q "$@"; }
psql_db() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> Rebuilding $TEST_DB"
psql_root -c "drop database if exists $TEST_DB;" >/dev/null
psql_root -c "create database $TEST_DB;" >/dev/null

echo "==> Supabase shim"
psql_db -f supabase/tests/00_supabase_shim.sql

for migration in supabase/migrations/*.sql; do
  echo "==> $(basename "$migration")"
  psql_db -f "$migration"
done

if [[ "${1:-}" == "--seed" && -f supabase/seed.sql ]]; then
  echo "==> seed"
  psql_db -f supabase/seed.sql
fi

echo "==> Done"
