/**
 * 前端 dev server 启动器（detached 托管）：以 node 孤儿模式拉起 vite dev server，
 * 规避 PowerShell 后台任务超时/回收连带杀 vite 的问题（与 start-backend.mjs 同款方案）。
 * e2e 前置：UI_URL 默认 http://localhost:5173（test-config.mjs）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CWD = path.resolve(__dirname, '..', '..')
const VITE = path.join(CWD, 'node_modules', 'vite', 'bin', 'vite.js')
const PROBE = 'http://localhost:5173'

async function up() {
  try {
    const r = await fetch(PROBE, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

if (!existsSync(VITE)) {
  console.log('VITE_NOT_FOUND (先 npm install)')
  process.exit(1)
}

if (await up()) {
  console.log('ALREADY_UP')
  process.exit(0)
}

const child = spawn(process.execPath, [VITE, '--port', '5173', '--strictPort'], {
  cwd: CWD,
  detached: true,
  stdio: 'ignore'
})
child.unref()

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  if (await up()) {
    console.log(`FRONTEND_UP pid=${child.pid} after=${(i + 1) * 2}s`)
    process.exit(0)
  }
}
console.log('TIMEOUT_NOT_UP')
process.exit(1)
