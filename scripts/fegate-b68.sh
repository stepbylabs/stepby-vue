#!/usr/bin/env bash
# b68 前端门禁四连：typecheck + eslint + vitest 全量 + 生产构建
# 用法：bash scripts/fegate-b68.sh  （退出码 0 = 全绿）
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
export NODE_OPTIONS=""
FAIL=0

echo "=== [1/4] vue-tsc --noEmit ==="
if ./node_modules/.bin/vue-tsc --noEmit; then echo "TSC-OK"; else echo "TSC-FAIL"; FAIL=1; fi

echo "=== [2/4] eslint . ==="
if ./node_modules/.bin/eslint .; then echo "ESLINT-OK"; else echo "ESLINT-FAIL"; FAIL=1; fi

echo "=== [3/4] vitest run ==="
if ./node_modules/.bin/vitest run 2>&1 | tail -8; then echo "VITEST-OK"; else echo "VITEST-FAIL"; FAIL=1; fi

echo "=== [4/4] vite build ==="
if sh node_modules/.bin/vite build 2>&1 | tail -6; then echo "BUILD-OK"; else echo "BUILD-FAIL"; FAIL=1; fi

echo "=== RESULT: $([ $FAIL -eq 0 ] && echo ALL-GREEN || echo HAS-FAILURES) ==="
exit $FAIL
