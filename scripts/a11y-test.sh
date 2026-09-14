#!/usr/bin/env bash
#
# Build, serve, audit, stop. Self-contained so the gate has no setup ritual
# to forget.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${A11Y_PORT:-3100}"

# The pages under test render without a database; dummy values just get past
# the "Supabase isn't configured" screen so the real markup is audited.
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://example.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-dummy-anon-key}"

npx next start --port "$PORT" >/tmp/a11y-server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null; then break; fi
  sleep 1
done

BASE_URL="http://127.0.0.1:$PORT" node scripts/a11y-test.mjs
