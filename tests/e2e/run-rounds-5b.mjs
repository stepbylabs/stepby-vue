/**
 * 批次五连续轮次批跑器（第 4-10 遍）：v2 模式复用（spawn + 增量落盘 + 停滞自愈）
 * 产物：r5b_R{n}.log / _rounds5b_done.json
 */
import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, appendFileSync, statSync } from 'node:fs'

const DIR = 'D:/Projects/stepby/stepby-vue/tests/e2e'
const NODE = 'C:/Users/Jeff/.workbuddy/binaries/node/versions/22.22.2-6/node.exe'
const RUNNER_LOG = `${DIR}/_rounds5b_runner.log`
const DONE_JSON = `${DIR}/_rounds5b_done.json`

console.log = (...args) => appendFileSync(RUNNER_LOG, args.join(' ') + '\n', 'utf8')

const summary = []
const STALL_MS = 15 * 60 * 1000

for (let round = 4; round <= 10; round++) {
  const logPath = `${DIR}/r5b_R${round}.log`
  const child = spawn(NODE, ['main.mjs', '--headless'], {
    cwd: DIR,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      STEPBY_TEST_USER: 'admin',
      STEPBY_TEST_PASS: 'admin123',
      STEPBY_BASE_URL: 'http://localhost:8080',
      FRONTEND_URL: 'http://localhost:8080',
      PLAYWRIGHT_BROWSERS_PATH: 'D:/Projects/.pw-browsers'
    }
  })
  let out = ''
  const sink = (d) => {
    out += d
    appendFileSync(logPath, d, 'utf8')
  }
  child.stdout.on('data', sink)
  child.stderr.on('data', sink)

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
  const total = (out.match(/总计: (\d+)/) || [])[1] || ''
  summary.push({ round, exit: code, hung, pass, total, failCount: failLines.length, fails: failLines.slice(0, 12) })
  writeFileSync(DONE_JSON, JSON.stringify({ complete: false, summary }, null, 2), 'utf8')
  console.log(`round ${round}: exit=${code} hung=${hung} total=${total} pass=${pass} fail=${failLines.length}`)
  if (!existsSync(`${DIR}/main.mjs`)) break
}
console.log('ROUNDS-5B-COMPLETE')
writeFileSync(DONE_JSON, JSON.stringify({ complete: true, summary }, null, 2), 'utf8')
