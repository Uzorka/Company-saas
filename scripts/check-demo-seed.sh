#!/usr/bin/env bash
#
# The demo seed must be re-runnable, including on a later date.
#
# Its header claimed "running this twice changes nothing the second time".
# That was true only on the same day: attendance ids were derived from
# `current_date - work_date`, so the same person-and-day got a different id on
# a different run date, `on conflict (id)` never fired, and the real constraint
# — unique (employee_id, work_date) — raised. It failed for a user in a live
# project, a month after the file was written.
#
# So the claim is now a test. Three runs: today, five days on, and five days on
# again. The second is the one that used to fail; the third proves the fix did
# not simply stop skipping.
set -euo pipefail

export PATH="$PATH:/usr/lib/postgresql/16/bin"
PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
TEST_DB="${TEST_DB:-heron_test}"

cd "$(dirname "$0")/.."
./scripts/db-start.sh >/dev/null
./scripts/db-test.sh >/dev/null 2>&1

run_sql() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -q "$@"; }

# `set -e` would abort here with psql's exit code and nothing said, which is
# how a gate ends up failing without explaining itself.
run_seed() {
  local file="$1" label="$2" output
  if ! output=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TEST_DB" \
                     -v ON_ERROR_STOP=1 -q -f "$file" 2>&1); then
    echo >&2
    echo "The demo seed failed on $label:" >&2
    echo "$output" | grep -E "ERROR|DETAIL" | head -4 >&2
    echo >&2
    echo "It is meant to be re-runnable. Check that every insert conflicts on" >&2
    echo "the constraint that decides whether the row already exists, and that" >&2
    echo "no generated id depends on the date the file is run." >&2
    exit 1
  fi
}

run_sql -f supabase/seed.sql >/dev/null 2>&1

# The demo seed needs one management account to name as task author, approver
# and payroll submitter. Created here rather than in the seed, which is
# deliberately accountless.
run_sql -c "
  insert into auth.users (id, email)
  values ('00000000-0000-4000-8fff-000000000001', 'gate@example.test')
  on conflict do nothing;
  insert into organization_members (organization_id, user_id, status)
  values ('00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8fff-000000000001', 'active')
  on conflict do nothing;
  insert into user_roles (organization_id, user_id, role_id)
  select '00000000-0000-4000-8000-000000000001',
         '00000000-0000-4000-8fff-000000000001', id
  from roles
  where organization_id = '00000000-0000-4000-8000-000000000001'
    and slug = 'management'
  on conflict do nothing;" >/dev/null

count_attendance() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TEST_DB" -At \
    -c "select count(*) from attendance_records;"
}

# Runs 2 and 3 shift every current_date forward, which is what running the file
# on a later day does.
shifted="$(mktemp)"
trap 'rm -f "$shifted"' EXIT
sed 's/current_date/(current_date + 5)/g' supabase/setup/demo-seed.sql > "$shifted"

echo "  run 1: today"
run_seed supabase/setup/demo-seed.sql "the first run"
first=$(count_attendance)

echo "  run 2: five days on — the case that failed in a live project"
run_seed "$shifted" "a run five days later"
second=$(count_attendance)

echo "  run 3: five days on, again"
run_seed "$shifted" "a repeat run"
third=$(count_attendance)

if [[ "$first" -eq 0 ]]; then
  echo "Demo seed produced no attendance at all — it is not seeding." >&2
  exit 1
fi

# A later date must add the working days that have passed, and nothing else.
if [[ "$second" -le "$first" ]]; then
  echo "Running the demo seed five days later added no attendance ($first -> $second)." >&2
  echo "It should fill in the days that have passed since the last run." >&2
  exit 1
fi

if [[ "$third" -ne "$second" ]]; then
  echo "The demo seed is not idempotent: a repeat run changed $second -> $third." >&2
  exit 1
fi

# And the teardown has to remove what it created, old ids and new.
run_sql -f supabase/setup/demo-seed-remove.sql >/dev/null 2>&1
left=$(count_attendance)
if [[ "$left" -ne 0 ]]; then
  echo "demo-seed-remove.sql left $left attendance record(s) behind." >&2
  exit 1
fi

echo "Demo seed: re-runnable across dates ($first, then $second, then $second), and removable."
