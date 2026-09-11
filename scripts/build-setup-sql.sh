#!/usr/bin/env bash
#
# Concatenate the migrations (and optionally the seed) into one file that can
# be pasted into the Supabase SQL editor in a single go.
#
# Generated, never hand-edited: the migrations stay the source of truth, so
# this file cannot drift from them.
set -euo pipefail
cd "$(dirname "$0")/.."

out="supabase/setup/install.sql"

{
  cat <<'HEADER'
-- ===========================================================================
-- GENERATED FILE — do not edit.
-- Rebuild with: scripts/build-setup-sql.sh
--
-- Every migration in supabase/migrations/, in order, concatenated for pasting
-- into the Supabase SQL editor. Safe to run once on a fresh project.
--
-- This does NOT include supabase/seed.sql — run that separately, after
-- registering the access token hook.
-- ===========================================================================

begin;

HEADER

  for migration in supabase/migrations/*.sql; do
    printf -- '-- ---------------------------------------------------------------------------\n'
    printf -- '-- %s\n' "$(basename "$migration")"
    printf -- '-- ---------------------------------------------------------------------------\n\n'
    cat "$migration"
    printf '\n\n'
  done

  printf 'commit;\n'
} > "$out"

echo "Wrote $out ($(wc -l < "$out") lines, from $(ls supabase/migrations/*.sql | wc -l) migrations)"
