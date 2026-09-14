#!/usr/bin/env bash
#
# Start the production server on a free port, run a command against it, stop it.
#
#   scripts/with-server.sh node scripts/e2e-test.mjs
#
# Every guard here exists because of a specific failure. The first version of
# the browser gates started `next start` on a fixed port, waited for *anything*
# to answer, and ran the tests. When a previous run's server was still holding
# that port, `next start` died with EADDRINUSE, the wait loop was satisfied by
# the stale process, and the suite tested an old build — reporting a pass for
# code that was never loaded. Both the accessibility and end-to-end gates did
# this, and the accessibility gate reported "0 violations" while doing it.
#
# So: a port nobody else holds, a server we can prove is ours, a failure if it
# does not come up, and a shutdown that takes the whole process tree with it.
set -euo pipefail
cd "$(dirname "$0")/.."

export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://example.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-dummy-anon-key}"

# An ephemeral port, asked for from the OS rather than picked and hoped for.
PORT="$(node -e 'const s=require("net").createServer();s.listen(0,()=>{console.log(s.address().port);s.close();});')"
LOG="$(mktemp)"

# setsid puts the server in its own process group, so the kill below reaches
# the next-server child and not just the npx wrapper that spawned it. Leaked
# children are what filled the port in the first place.
setsid npx next start --port "$PORT" >"$LOG" 2>&1 &
server=$!

cleanup() {
  kill -- "-$server" 2>/dev/null || kill "$server" 2>/dev/null || true
  rm -f "$LOG"
}
trap cleanup EXIT

up=""
for _ in $(seq 1 60); do
  # The server has to still be running AND answering. Either alone can be true
  # while the other is false, and that combination is what went wrong before.
  if ! kill -0 "$server" 2>/dev/null; then
    echo "Server exited before it was ready. Log:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null; then
    up=yes
    break
  fi
  sleep 1
done

if [ -z "$up" ]; then
  echo "Server never became ready on port $PORT. Log:" >&2
  cat "$LOG" >&2
  exit 1
fi

BASE_URL="http://127.0.0.1:$PORT" "$@"
