#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/db-test.sh >/dev/null 2>&1
exec node scripts/check-single-row.mjs
