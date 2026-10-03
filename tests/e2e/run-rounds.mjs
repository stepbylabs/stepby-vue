/**
 * 轮次批跑器：第 4-10 轮连续执行 main.mjs 全量，每轮独立日志与结果汇总。
 * 完成后写 _rounds_done.json（主线程轮询该文件判断结束）。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const NODE = 'C:/Users/Jeff/.workbuddy/binaries/node/versions/22.22.2-5/node.exe'
const DIR = 'D:/Projects/stepby/stepby-vue/tests/e2e'
const summary = []
for (let round = 4; round <= 10; round++) {
  const logPath = `${DIR}/r10_R${round}.log`
  const res = spawnSync(NODE, ['main.mjs'], {
    cwd: DIR,
    encoding: 'utf8',
    timeout: 40 * 60 * 1000,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      STEPBY_TEST_USER: 'admin',
      STEPBY_TEST_PASS: 'admin123'
    }
  })
  const out = (res.stdout || '') + (res.stderr || '')
  writeFileSync(logPath, out, 'utf8')
  const pass = (out.match(/PASS \[/g) || []).length
  const failLines = out.match(/❌ FAIL.*/g) || []
  summary.push({ round, exit: res.status, pass, failCount: failLines.length, fails: failLines.slice(0, 10) })
  writeFileSync(`${DIR}/_rounds_done.json`, JSON.stringify(summary, null, 2), 'utf8')
  console.log(`round ${round}: exit=${res.status} pass=${pass} fail=${failLines.length}`)
  if (!existsSync(`${DIR}/main.mjs`)) break // 仓异常保护
}
console.log('ROUNDS-COMPLETE')
writeFileSync(`${DIR}/_rounds_done.json`, JSON.stringify({ complete: true, summary }, null, 2), 'utf8')
