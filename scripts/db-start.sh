#!/usr/bin/env bash
#
# Start a local PostgreSQL cluster for testing the migrations and RLS policies.
#
# This is a plain PostgreSQL cluster, not Supabase — the Supabase pieces the
# migrations need come from supabase/tests/00_supabase_shim.sql. It exists so
# the security model can be executed and asserted locally, which is the only
# way to know the policies do what they look like they do.
#
# Idempotent: safe to run when the cluster is already up.
set -euo pipefail

export PATH="$PATH:/usr/lib/postgresql/16/bin"
PGDATA="${PGDATA:-/tmp/pgdata-heron}"
PGPORT="${PGPORT:-5433}"

if psql -h /tmp -p "$PGPORT" -U postgres -c 'select 1' >/dev/null 2>&1; then
  echo "PostgreSQL already running on port $PGPORT"
  exit 0
fi

# The cluster lives under /tmp and does not survive a machine restart. Rebuild
# it rather than failing — it holds only test data.
if [ ! -d "$PGDATA/base" ]; then
  echo "Initialising cluster at $PGDATA"
  rm -rf "$PGDATA"
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  su postgres -c "PATH=$PATH initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
fi

su postgres -c "PATH=$PATH pg_ctl -D $PGDATA -l /tmp/pg.log -o '-p $PGPORT -k /tmp' start" >/dev/null
sleep 2
psql -h /tmp -p "$PGPORT" -U postgres -qc "select 'PostgreSQL ready' as status;"
