#!/usr/bin/env bash
# b69 循环测试 e2e 启动器（自定位 cwd）
set -uo pipefail
cd "$(dirname "$0")" || exit 2
export STEPBY_TEST_USER=admin
export STEPBY_TEST_PASS=admin123
export STEPBY_BASE_URL=http://localhost:8080
export FRONTEND_URL=http://localhost:8080
export PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers"
node main.mjs 2>&1 | tail -60
rc=${PIPESTATUS[0]}
echo "=== E2E-EXIT: $rc ==="
exit "$rc"

