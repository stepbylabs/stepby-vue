#!/usr/bin/env bash
# b68 e2e 全量启动器（自定位 cwd，规避后台 shell cwd 漂移）
set -uo pipefail
cd "$(dirname "$0")" || exit 2
export STEPBY_TEST_USER=admin
export STEPBY_TEST_PASS=admin123
export STEPBY_BASE_URL=http://localhost:8080
export FRONTEND_URL=http://localhost:8080
export PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers"
node main.mjs 2>&1 | tail -40
rc=${PIPESTATUS[0]}
echo "=== E2E-EXIT: $rc ==="
exit "$rc"
