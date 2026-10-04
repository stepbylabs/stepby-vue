/**
 * 轮次批跑器（2026-10-04 v2）：轮 1-10 连续执行 main.mjs 全量（82 features）。
 * v2 改进：
 * - spawn + 增量落盘：main.mjs 输出实时追加到 r2026_R{n}.log（卡死时可实时诊断卡点）
 * - 停滞自愈：日志 15 分钟无增量判定卡死 → 杀掉本轮子进程，记录 HANG 标记继续下一轮
 * - 进度文件 _rounds2026_done.json 逐轮更新；自身输出落 _rounds2026_runner.log
 */
import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, appendFileSync, statSync } from 'node:fs'

const DIR = 'D:/Projects/stepby/stepby-vue/tests/e2e'
const NODE = 'C:/Users/Jeff/.workbuddy/binaries/node/versions/22.22.2-5/node.exe'
const RUNNER_LOG = `${DIR}/_rounds2026_runner.log`
const DONE_JSON = `${DIR}/_rounds2026_done.json`

console.log = (...args) => appendFileSync(RUNNER_LOG, args.join(' ') + '\n', 'utf8')

const summary = []
const STALL_MS = 15 * 60 * 1000

for (let round = 1; round <= 10; round++) {
  const logPath = `${DIR}/r2026_R${round}.log`
  const child = spawn(NODE, ['main.mjs'], {
    cwd: DIR,
    env: { ...process.env, NODE_OPTIONS: '', STEPBY_TEST_USER: 'admin', STEPBY_TEST_PASS: 'admin123' }
  })
  let out = ''
  const sink = (d) => {
    out += d
    appendFileSync(logPath, d, 'utf8')
  }
  child.stdout.on('data', sink)
  child.stderr.on('data', sink)

  // 停滞检测：日志 mtime 15 分钟无增量 → 判卡死杀进程
  let hung = false
  const watcher = setInterval(() => {
    try {
      const idle = Date.now() - statSync(logPath).mtimeMs
      if (idle > STALL_MS && !hung) {
        hung = true
        appendFileSync(logPath, `\n[HANG-DETECT] 日志停滞 ${Math.round(idle / 60000)} 分钟，判定卡死，杀进程续跑\n`, 'utf8')
        console.log(`round ${round}: HANG-DETECT kill pid=${child.pid}`)
        child.kill()
      }
    } catch {}
  }, 60 * 1000)

  const code = await new Promise((resolve) => child.on('close', (c) => { clearInterval(watcher); resolve(c) }))

  const pass = (out.match(/✅ PASS/g) || []).length
  const failLines = (out.match(/❌ FAIL.*/g) || [])
  const errSignals = (out.match(/500 |ERROR|panic|timed out/g) || []).length
  summary.push({ round, exit: code, hung, pass, failCount: failLines.length, errSignals, fails: failLines.slice(0, 12) })
  writeFileSync(DONE_JSON, JSON.stringify({ complete: false, summary }, null, 2), 'utf8')
  console.log(`round ${round}: exit=${code} hung=${hung} pass=${pass} fail=${failLines.length} errSignals=${errSignals}`)
  if (!existsSync(`${DIR}/main.mjs`)) break // 仓异常保护
}
console.log('ROUNDS-COMPLETE')
writeFileSync(DONE_JSON, JSON.stringify({ complete: true, summary }, null, 2), 'utf8')
