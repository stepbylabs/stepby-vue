// stepby-vue/tests/e2e/perf-throttle-check.mjs
// 弱网/弱设备性能回归（R102-FCP-012 慢速 3G / R102-FCP-013 弱 CPU）：
// 用 Playwright CDP 注入网络与 CPU 节流，访问 /login，通过注入的
// PerformanceObserver 采集 FCP/LCP，与 perf-budget.json 的运行时预算比对。
//
// 用法（默认打 :8080，即后端内嵌托管 frontend-dist 的那个入口；预览服自行指）：
//   node tests/e2e/perf-throttle-check.mjs [--base http://localhost:4173]
//   node tests/e2e/perf-throttle-check.mjs --selftest     # 不启浏览器，纯函数双向自检
//
// 阈值口径：perf-budget.json 的 runtime 预算是**正常网络**下的用户体验目标；
// 节流档按业界惯例放宽（Slow3G FCP×4 / LCP×5、CPU4x ×2），但仍形成硬回归门禁：
// 若引入了新的渲染阻塞资源或首屏巨型依赖，节流档 LCP/FCP 会首先越限报警。
//
// 退出码（与 `backend-log-audit` / `test-data-audit` 同一套三态纪律）：
//   0 两档场景都达标 / 1 有场景越限 / 2 **判据没跑成**（预算文件不可用、目标地址不可达、
//     浏览器起不来）——"没跑"与"跑了且干净"必须可区分，否则门禁停摆时汇总照样打 PASS。
//     这一条不是理论关切：本脚本此前在 run-gates.py 与 CI 里**零条目**，而它读的是与
//     `check-perf-budget.mjs` 同一份预算文件的 runtime 段；越限判红写在代码里却没有任何
//     载体执行（AGENTS《测试门禁全景》"只打提示、没有动作通道的信号等于没判"）。
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import process from 'node:process'

// 预算文件在 stepby-vue 仓根（本文件在 tests/e2e 下两层）——按脚本位置反推，
// 不得用 process.cwd()：从 tests/e2e 启动时 cwd 写法会报"缺少 perf-budget.json"，
// 而这条报错看着像"配置没建"，实际是判据读错了树（AGENTS《测试门禁全景》②）。
const HERE = dirname(fileURLToPath(import.meta.url))
const require2 = createRequire(import.meta.url)

const args = process.argv.slice(2)
// 默认取 `:8080`——与其余 e2e 套件同一个入口（后端内嵌托管 frontend-dist）。
// 留 4173 当默认会让这条常驻门禁**永远 UNRUN**（预览服平时不起），载体就成了装饰。
const BASE = args.includes('--base')
  ? args[args.indexOf('--base') + 1]
  : process.env.TEST_BASE || 'http://localhost:8080'
const BUDGET_PATH = join(HERE, '..', '..', 'perf-budget.json')

/**
 * 节流档的**倍数表**（数据，不是散落在断言里的数字）。
 *
 * 拆出来的理由：预算倍数原先直接写在两个对象字面量里，而"runtime 预算 × 几倍"这件事
 * 只有在与预算文件同时对账时才有意义——有人把 `lcpMs * 5` 改成 `lcpMs * 50`，
 * 判据依然绿，只是再也不会红。自检因此必须断言这张表本身（见 `--selftest` ㉑）。
 */
const SCENARIO_MULTIPLIERS = [
  {
    name: 'slow-3g',
    desc: 'Slow 3G（400kbps 下行 / 400ms RTT）',
    // 校准依据（2026-09-28 实测）：单 chunk（codeSplitting:false）下 1.6MB gzip JS
    // 在 400kbps 传输 ~6s，FCP/LCP 均 ≈6028ms。Rolldown 修复移除 codeSplitting:false
    // 恢复分包后应同步收紧倍数。
    network: { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 },
    cpuRate: 1,
    lcpMul: 5,
    fcpMul: 4
  },
  {
    name: 'cpu-4x',
    desc: '低端设备 CPU 4x 减速（网络不限）',
    network: null,
    cpuRate: 4,
    lcpMul: 2,
    fcpMul: 2
  }
]

const isFin = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0

/** 由 runtime 预算算出两档场景的硬上限；预算坏时返回的上限非有限，由 `budgetIssues` 拦下。 */
function buildScenarios(runtime) {
  return SCENARIO_MULTIPLIERS.map((sc) => ({
    ...sc,
    lcpLimit: runtime.lcpMs * sc.lcpMul,
    fcpLimit: runtime.fcpMs * sc.fcpMul
  }))
}

/**
 * 预算文件 → 问题列表（空列表 = 可用）。
 *
 * 为什么要有这个函数：原先只判 `existsSync`，而 `JSON.parse` 坏文件会直接抛裸栈（退出码 1，
 * 说成"越限"）；`runtime` 缺栏时 `undefined * 5 = NaN`，`lcp <= NaN` 恒 false ⇒ 报的是
 * "性能回归"，实际是**判据读不到数**。同一族还有 `Number(null) === 0`（AGENTS 前言 ⑤）。
 */
function budgetIssues(text, missing = false) {
  if (missing) return [`缺少 ${BUDGET_PATH}（判据输入不可用，不是"没有越限"）`]
  let doc
  try {
    doc = JSON.parse(text)
  } catch (e) {
    return [`perf-budget.json 不可解析：${e.message}`]
  }
  const runtime = doc && doc.runtime
  if (!runtime || typeof runtime !== 'object') return ['perf-budget.json 缺 runtime 段']
  const out = []
  for (const k of ['lcpMs', 'fcpMs']) {
    if (!isFin(runtime[k])) out.push(`runtime.${k} 必须是有限正数（实得 ${JSON.stringify(runtime[k]) ?? 'null'}）`)
  }
  if (out.length) return out
  for (const sc of buildScenarios(runtime)) {
    if (!isFin(sc.lcpLimit) || !isFin(sc.fcpLimit)) {
      out.push(`场景 ${sc.name} 的上限算不出有限值（lcp ${sc.lcpLimit} / fcp ${sc.fcpLimit}）`)
    }
  }
  return out
}

/**
 * 单场景判定。**取不到数一律判不达标**（返回 `{ ok:false }`）。
 *
 * 改造前两档不对称：`lcp === null` 判失败，而 `fcp === null` 判通过——注入的 observer
 * 没跑起来（脚本被 CSP 拦、页面根本没 paints 出来、采集窗口太短）时 FCID 那一侧就是
 * "因为测不到所以合格"，正是 AGENTS 前言 ⑤ 那条"取不到数被读成没有退步"。
 */
function judgeVitals(vitals, sc) {
  if (!vitals || typeof vitals !== 'object') return { ok: false, why: '采集器没有回传 __vitals（注入失败）' }
  const f = vitals.fcp
  const l = vitals.lcp
  if (!isFin(l)) return { ok: false, why: `LCP 未测得（${JSON.stringify(l) ?? 'null'}）——取不到数不得读成达标` }
  if (!isFin(f)) return { ok: false, why: `FCP 未测得（${JSON.stringify(f) ?? 'null'}）——取不到数不得读成达标` }
  if (l > sc.lcpLimit) return { ok: false, why: `LCP ${l}ms > 上限 ${sc.lcpLimit}ms` }
  if (f > sc.fcpLimit) return { ok: false, why: `FCP ${f}ms > 上限 ${sc.fcpLimit}ms` }
  return { ok: true, why: `FCP ${f}ms ≤ ${sc.fcpLimit}ms，LCP ${l}ms ≤ ${sc.lcpLimit}ms` }
}

/** 自检：不启浏览器、不读预算文件（输入全部合成），故可进 run-gates 常驻清单与零依赖 CI。 */
function runSelftest() {
  const okBudget = { runtime: { lcpMs: 2500, fcpMs: 1800 } }
  const cases = []
  // 两种"失败"的形状都接受：布尔（判定函数那一族）与问题列表（预算那一族）。
  // 写成 `bad: got` 直接把列表塞进 filter 会把**空列表当 truthy 失败**——
  // `Boolean([]) === true`，于是两条正控自己红在自己的返回值类型上。
  const push = (name, got) => cases.push({ name, bad: Array.isArray(got) ? got.length > 0 : !!got })
  // ① 正控：合格预算不得报任何问题（否则下面四条可以靠"一律报"蒙过）
  push('① 合格预算不得报问题', budgetIssues(JSON.stringify(okBudget)))
  // ② 文件缺失 ⇒ 必须点名"输入不可用"
  push('② 预算文件缺失必须报', budgetIssues('', true).length === 0)
  // ③ 坏 JSON ⇒ 必须报（旧版在这里抛裸栈，退出码被说成"越限"）
  push('③ 坏 JSON 必须报', budgetIssues('{ not json').length === 0)
  // ④ 缺 runtime 段 ⇒ 必须报
  push('④ 缺 runtime 段必须报', budgetIssues('{"build":{}}').length === 0)
  // ⑤ 数值栏写成字符串 ⇒ 必须报（`'2500' * 5` = 12500 侥幸算得出数，但 JSON 里它就不是数字）
  push('⑤ lcpMs 是字符串必须报', budgetIssues('{"runtime":{"lcpMs":"2500","fcpMs":1800}}').length === 0)
  // ⑥ runtime 栏为 null ⇒ 必须报（`null * 5 = 0` ⇒ 上限 0 ⇒ 每轮必红，那是噪声不是判据）
  push('⑥ fcpMs 是 null 必须报', budgetIssues('{"runtime":{"lcpMs":2500,"fcpMs":null}}').length === 0)
  // ⑦ 预算被写成极大值 ⇒ 上限溢出成 Infinity 必须报
  push('⑦ 上限溢出成 Infinity 必须报', budgetIssues('{"runtime":{"lcpMs":1e308,"fcpMs":1800}}').length === 0)
  // ⑧~㉐ 判定函数双向
  const sc = buildScenarios(okBudget.runtime)[0] // slow-3g：lcp≤12500 / fcp≤7200
  const v = (f, l) => ({ fcp: f, lcp: l })
  const j = (x) => judgeVitals(x, sc)
  push('⑧ LCP 越限必须判不达标', j(v(6000, 99999)).ok)
  push('⑨ FCP 越限必须判不达标', j(v(7201, 9000)).ok)
  push('⑩ 两项都达标必须判达标（正控）', !j(v(6000, 9000)).ok)
  push('⑪ LCP 恰等于上限必须判达标（边界正控）', !j(v(6000, sc.lcpLimit)).ok)
  push('⑫ LCP 未测得必须判不达标', j(v(6000, null)).ok)
  // ⑬ 这一条钉住本次修掉的 fail-open：FCP 未测得原先**判通过**
  push('⑬ FCP 未测得必须判不达标（原为假绿）', j(v(null, 9000)).ok)
  const r13 = j(v(null, 9000))
  push('⑬b FCP 未测得的理由必须写明"未测得"', r13.ok || !/未测得/.test(r13.why))
  push('⑭ __vitals 整体缺失必须判不达标', j(undefined).ok)
  push('⑮ LCP 非数值字符串必须判不达标', j(v(6000, '9000')).ok)
  // ⑯ 未测得的理由不得只说"达标"（防 judgeVitals 退化成一律 ok）
  push('⑯ 达标理由必须带实测数字', !/FCP 6000ms/.test(j(v(6000, 9000)).why))
  // ⑰ 单位换算锁：CDP 的 throughput 单位是 **字节/秒**，写成 `400 * 1024` 会把限速放大 8 倍
  //     ——"慢速 3G"实际跑成 3.2Mbps 快网，判据从此测不出首屏巨型依赖，且**照样全绿**。
  push('⑰ Slow3G 限速必须是 kbps→B/s 换算', SCENARIO_MULTIPLIERS[0].network.downloadThroughput !== (400 * 1024) / 8)
  push('⑱ Slow3G 上行必须与下行同值', SCENARIO_MULTIPLIERS[0].network.uploadThroughput !== (400 * 1024) / 8)
  // ⑲ RTT 单位是 ms，写成秒就是 400s 等待
  push('⑲ Slow3G RTT 必须是 400ms', SCENARIO_MULTIPLIERS[0].network.latency !== 400)
  // ⑳ CPU 档不限速（network=null）——给它是另一回事，会把两档混成一个故障面
  push('⑳ CPU 档不得注入网络限速', SCENARIO_MULTIPLIERS[1].network !== null)
  push('㉑ CPU 档减速倍率必须是 4', SCENARIO_MULTIPLIERS[1].cpuRate !== 4)
  // ㉒ 倍数关系（改预算倍数必须同时改这里的注释与断言）
  push(
    '㉒ 两档倍数必须与倍数表一致',
    (() => {
      const b = buildScenarios({ lcpMs: 100, fcpMs: 50 })
      return !(
        b[0].lcpLimit === 100 * SCENARIO_MULTIPLIERS[0].lcpMul &&
        b[0].fcpLimit === 50 * SCENARIO_MULTIPLIERS[0].fcpMul &&
        b[1].lcpLimit === 100 * SCENARIO_MULTIPLIERS[1].lcpMul &&
        b[1].fcpLimit === 50 * SCENARIO_MULTIPLIERS[1].fcpMul
      )
    })()
  )
  // ㉓ 真实文件正控：判据读的那份 perf-budget.json 必须可用（合成夹具证明不了它自己没被改坏）
  push(
    '㉓ 仓内真实预算必须可用',
    existsSync(BUDGET_PATH) ? budgetIssues(readFileSync(BUDGET_PATH, 'utf8')) : ['真实预算文件不存在']
  )
  // ㉔ 两档场景名必须唯一且都不为空（聚合按 name 打点，重名会把两档并成一档）
  push('㉔ 场景名必须唯一', new Set(SCENARIO_MULTIPLIERS.map((s) => s.name)).size !== SCENARIO_MULTIPLIERS.length)

  const failed = cases.filter((c) => c.bad).map((c) => c.name)
  if (failed.length) {
    console.log('SYNTH_FAIL:')
    failed.forEach((f) => console.log(`  · ${f}`))
    return 1
  }
  console.log(
    `SYNTH_OK 弱网节流判据 ${cases.length} 条双向（预算可用性与三类坏输入 / 上限溢出 / 越限与达标与边界 / ` +
      `未测得不得读成达标 / CDP 单位换算与倍数表 / 真实预算文件正控）`
  )
  return 0
}

async function main() {
  let text
  try {
    text = readFileSync(BUDGET_PATH, 'utf8')
  } catch {
    text = ''
  }
  const issues = budgetIssues(text, !existsSync(BUDGET_PATH))
  if (issues.length) {
    console.error(`[perf-throttle] EXIT=2 判据输入不可用，不作结论：\n  · ${issues.join('\n  · ')}`)
    process.exit(2)
  }
  const runtime = JSON.parse(text).runtime
  const SCENARIOS = buildScenarios(runtime)

  // 目标可达性先探一次：不探就直接 launch，服务没起时 `page.goto` 抛栈 ⇒ 退出码 1，
  // 汇总把这轮记成"性能回归"。没跑必须是 2。
  const probe = `${BASE}/`
  try {
    const r = await fetch(probe, { signal: AbortSignal.timeout(10000) })
    console.log(`[perf-throttle] 目标 ${BASE} 可达（入口 HTTP ${r.status}）`)
  } catch (e) {
    console.error(`[perf-throttle] EXIT=2 目标不可达：${probe}（${e.message}）——服务未起，不是达标`)
    process.exit(2)
  }

  // playwright 只在真跑批这条路径上加载：`--selftest` 与输入闸不得依赖浏览器包是否存在。
  const { chromium } = require2('playwright')
  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    console.error(`[perf-throttle] EXIT=2 浏览器起不来：${String(e.message).slice(0, 300)}`)
    process.exit(2)
  }

  const vitalsScript = `
window.__vitals = { fcp: null, lcp: null };
new PerformanceObserver((l) => {
  // 必须按 name 过滤：paint 条目里有 first-paint 与 first-contentful-paint 两种，
  // 原先取"这一批的最后一条"在 first-paint 单独成批时把 FP 记成 FCP——FP 恒 ≤ FCP，
  // 于是报出一个**比真实值更好**的数字，首屏回归可能被它洗掉。
  const e = l.getEntries().find((x) => x.name === 'first-contentful-paint');
  if (e && window.__vitals.fcp === null) window.__vitals.fcp = Math.round(e.startTime);
}).observe({ type: 'paint', buffered: true });
new PerformanceObserver((l) => {
  const e = l.getEntries().pop();
  if (e) window.__vitals.lcp = Math.round(e.renderTime || e.startTime);
}).observe({ type: 'largest-contentful-paint', buffered: true });
`

  console.log(`[perf-throttle] 目标 ${BASE}`)
  let failed = 0
  try {
    for (const sc of SCENARIOS) {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
      const page = await ctx.newPage()
      let vitals
      try {
        const cdp = await ctx.newCDPSession(page)
        if (sc.network) {
          await cdp.send('Network.enable')
          await cdp.send('Network.emulateNetworkConditions', sc.network)
        }
        if (sc.cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: sc.cpuRate })
        await page.addInitScript(vitalsScript)
        await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 120000 })
        // LCP 稳定窗口
        await page.waitForTimeout(3000)
        vitals = await page.evaluate(() => window.__vitals)
      } finally {
        await ctx.close()
      }
      const verdict = judgeVitals(vitals, sc)
      if (!verdict.ok) failed++
      console.log(`${verdict.ok ? '✅' : '❌'} [${sc.name}] ${sc.desc}`)
      console.log(
        `   ${verdict.why}  [runtime 预算 LCP≤${runtime.lcpMs}ms FCP≤${runtime.fcpMs}ms，` +
          `本档倍数 LCP×${sc.lcpMul} FCP×${sc.fcpMul}]`
      )
    }
  } finally {
    await browser.close()
  }
  console.log(failed ? `[perf-throttle] ${failed} 个场景不达标` : '[perf-throttle] 全部场景达标')
  return failed ? 1 : 0
}

// 入口先于任何副作用校参数（AGENTS ⑮）：`--selftest` 不读预算文件、不连网络、不加载 playwright。
if (args.includes('--selftest')) {
  process.exit(runSelftest())
}
main().then(
  (rc) => process.exit(rc),
  (e) => {
    // 跑到一半的浏览器/页面异常：这是"跑了但没跑完"，同样不得冒充结论。
    console.error(`[perf-throttle] EXIT=2 跑批中断：${String(e && e.stack ? e.stack : e).slice(0, 500)}`)
    process.exit(2)
  }
)
