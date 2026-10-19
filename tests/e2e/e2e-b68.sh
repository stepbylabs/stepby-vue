#!/usr/bin/env bash
# b68 e2e 全量启动器（自定位 cwd，规避后台 shell cwd 漂移）
set -uo pipefail
cd "$(dirname "$0")" || exit 2
export STEPBY_TEST_USER=admin
export STEPBY_TEST_PASS=admin123
export STEPBY_BASE_URL=http://localhost:8080
export FRONTEND_URL=http://localhost:8080
# 浏览器目录不写死：需要的构建号由本仓 playwright 版本决定（1.61.1→chromium-1228，
# 1.62.1→headless_shell-1234）。写死一个目录 = 换版本即起手 `Executable doesn't exist`；
# 确实要指定时由调用方显式 export PLAYWRIGHT_BROWSERS_PATH=…，本脚本不再替人猜。
node main.mjs 2>&1 | tail -40
rc=${PIPESTATUS[0]}
echo "=== E2E-EXIT: $rc ==="
exit "$rc"
