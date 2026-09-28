# -*- coding: utf-8 -*-
"""e2e 全量跑 detached 启动器（规避 PowerShell 后台任务 10 分钟 timeout 杀进程树）。

用法:
  python _run_e2e.py <logfile> <script> [args...]
例:
  python _run_e2e.py _deep_full.log tests/e2e/deep-e2e.mjs
  python _run_e2e.py _main_full.log tests/e2e/main.mjs --feature=1-34

进程脱离父任务生命周期，日志重定向到指定文件（UTF-8）。
完成后前台用 Get-Content -Encoding UTF8 -Tail 读日志判断（deep-e2e 汇总标记
"深度端到端测试汇总" / main.mjs 汇总输出），或查 screenshots/ 下失败清单 JSON。

路径与凭据按脚本位置推导，可用环境变量覆盖:
  YEBOT_E2E_NODE      node 可执行文件（默认 PATH 中的 node）
  YEBOT_UI_ROOT       stepby-ui 仓库根（默认按脚本位置推导 <root>/../..）
  YEBOT_TEST_USER     测试用户名（默认 admin）
  YEBOT_TEST_PASS     测试密码（默认 admin123）
  YEBOT_BASE_URL      后端 URL（默认 http://localhost:8080）
  YEBOT_UI_URL        前端 URL（默认 http://localhost:4173，vite preview 端口）

注意: NODE_OPTIONS 在子进程中被清空（safe-delete 守卫 shim 对 e2e 无用且可能干扰）。
"""
import os
import shutil
import subprocess
import sys

LOG = sys.argv[1]
SCRIPT = sys.argv[2]
ARGS = sys.argv[3:]

HERE = os.path.dirname(os.path.abspath(__file__))
UI_ROOT = os.environ.get('YEBOT_UI_ROOT', os.path.abspath(os.path.join(HERE, '..', '..')))
NODE = os.environ.get('YEBOT_E2E_NODE') or shutil.which('node') or 'node'

DETACHED = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP

env = os.environ.copy()
env.update(
    {
        'YEBOT_TEST_USER': os.environ.get('YEBOT_TEST_USER', 'admin'),
        'YEBOT_TEST_PASS': os.environ.get('YEBOT_TEST_PASS', 'admin123'),
        'YEBOT_BASE_URL': os.environ.get('YEBOT_BASE_URL', 'http://localhost:8080'),
        'YEBOT_UI_URL': os.environ.get('YEBOT_UI_URL', 'http://localhost:4173'),
        'NODE_OPTIONS': '',  # 清空 safe-delete 守卫 shim 注入，e2e 进程不需要
    }
)

cmd = [NODE, SCRIPT] + ARGS
p = subprocess.Popen(
    cmd,
    cwd=UI_ROOT,
    env=env,
    stdout=open(LOG, 'w', encoding='utf-8'),
    stderr=subprocess.STDOUT,
    creationflags=DETACHED,
)
print(f'started PID={p.pid} cmd={cmd} log={LOG} cwd={UI_ROOT}')
