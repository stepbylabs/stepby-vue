#!/usr/bin/env bash
# b69 定向复验启动器：--feature=32,36 单跑（三判据取证）
set -uo pipefail
cd "$(dirname "$0")" || exit 2
export STEPBY_TEST_USER=admin
export STEPBY_TEST_PASS=admin123
export STEPBY_BASE_URL=http://localhost:8080
export FRONTEND_URL=http://localhost:8080
export PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers"
node main.mjs --headless --feature=32,36 2>&1 | tail -25
rc=${PIPESTATUS[0]}
echo "=== E2E-EXIT: $rc ==="
exit "$rc"

