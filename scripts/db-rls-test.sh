#!/usr/bin/env bash
#
# Rebuild the test database and run the RLS suite against it.
#
# These assertions run as the `authenticated` and `anon` database roles with a
# JWT claim set the way PostgREST sets it per request, so a pass here reflects
# what the policies actually do — not what they look like they do.
set -euo pipefail

export PATH="$PATH:/usr/lib/postgresql/16/bin"
PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
TEST_DB="${TEST_DB:-heron_test}"

"$(dirname "$0")/db-start.sh" >/dev/null

cd "$(dirname "$0")/.."
./scripts/db-test.sh >/dev/null 2>&1

output=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TEST_DB" \
  -v ON_ERROR_STOP=1 -q \
  -f supabase/tests/10_rls_test.sql \
  -f supabase/tests/11_employees_test.sql \
  -f supabase/tests/12_attendance_test.sql \
  -f supabase/tests/13_tasks_test.sql \
  -f supabase/tests/14_leave_test.sql \
  -f supabase/tests/15_payroll_test.sql \
  -f supabase/tests/16_recruitment_test.sql \
  -f supabase/tests/17_create_paths_test.sql \
  -f supabase/tests/18_reports_test.sql \
  -f supabase/tests/20_rls_audit.sql 2>&1)

echo "$output" | grep -E '^(NOTICE:\s+)?(PASS|FAIL|ERROR)' | sed 's/^NOTICE:  //' || true

if echo "$output" | grep -qE '(FAIL|ERROR)'; then
  echo
  echo "$output" | grep -A4 -E '(FAIL|ERROR)' | head -20
  echo "RLS suite FAILED"
  exit 1
fi

count=$(echo "$output" | grep -c 'PASS' || true)

# A suite that asserts nothing is not a passing suite. Guard against a silenced
# log level or a skipped block reporting a false green.
if [[ "$count" -lt 262 ]]; then
  echo "RLS suite reported only $count assertions — expected at least 262. Treating as a failure."
  exit 1
fi

echo
echo "RLS suite passed — $count assertions"
