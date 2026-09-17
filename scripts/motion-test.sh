#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec scripts/with-server.sh node scripts/motion-test.mjs
