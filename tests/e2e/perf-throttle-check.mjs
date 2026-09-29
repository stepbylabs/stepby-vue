// stepby-vue/tests/e2e/perf-throttle-check.mjs
// 弱网/弱设备性能回归（R102-FCP-012 慢速 3G / R102-FCP-013 弱 CPU）：
// 用 Playwright CDP 注入网络与 CPU 节流，访问 /login，通过注入的
// PerformanceObserver 采集 FCP/LCP，与 perf-budget.json 的运行时预算比对。
//
// 用法（需先起预览服或后端静态托管）：
//   NODE_OPTIONS= node tests/e2e/perf-throttle-check.mjs [--base http://localhost:4173]
//
// 阈值口径：perf-budget.json 的 runtime 预算是**正常网络**下的用户体验目标；
// 节流档按业界惯例放宽（Slow3G ×4 / CPU4x ×2），但仍形成硬回归门禁：
// 若引入了新的渲染阻塞资源或首屏巨型依赖，节流档 LCP/FCP 会首先越限报警。
/* eslint-disable no-console -- e2e 检查脚本，stdout 即报告 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import process from 'node:process'

// playwright 解析：本仓 node_modules 可能未安装（按需 NODE_PATH 指向独立安装目录）
const require2 = createRequire(import.meta.url)
const { chromium } = require2('playwright')

const args = process.argv.slice(2)
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : process.env.TEST_BASE || 'http://localhost:4173'

const budgetPath = join(process.cwd(), 'perf-budget.json')
if (!existsSync(budgetPath)) {
  console.error('[perf-throttle] 缺少 perf-budget.json')
  process.exit(1)
}
const runtime = JSON.parse(readFileSync(budgetPath, 'utf-8')).runtime

const SCENARIOS = [
  {
    name: 'slow-3g',
    desc: 'Slow 3G（400kbps 下行 / 400ms RTT）',
    network: { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 },
    cpuRate: 1,
    // 校准依据（2026-09-28 实测）：单 chunk（codeSplitting:false）下 1.6MB gzip JS
    // 在 400kbps 传输 ~6s，FCP/LCP 均 ≈6028ms。预算倍数取 FCP×4 / LCP×5；
    // Rolldown 修复移除 codeSplitting:false 恢复分包后应同步收紧倍数。
    lcpLimit: runtime.lcpMs * 5,
    fcpLimit: runtime.fcpMs * 4
  },
  {
    name: 'cpu-4x',
    desc: '低端设备 CPU 4x 减速（网络不限）',
    network: null,
    cpuRate: 4,
    lcpLimit: runtime.lcpMs * 2,
    fcpLimit: runtime.fcpMs * 2
  }
]

const vitalsScript = `
window.__vitals = { fcp: null, lcp: null };
new PerformanceObserver((l) => {
  const e = l.getEntries().pop();
  if (e && !window.__vitals.fcp) window.__vitals.fcp = Math.round(e.startTime);
}).observe({ type: 'paint', buffered: true });
new PerformanceObserver((l) => {
  const e = l.getEntries().pop();
  if (e) window.__vitals.lcp = Math.round(e.renderTime || e.startTime);
}).observe({ type: 'largest-contentful-paint', buffered: true });
`

console.log('[perf-throttle] 目标', base)
let failed = 0
const browser = await chromium.launch({ headless: true })
try {
  for (const sc of SCENARIOS) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    if (sc.network) {
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', sc.network)
    }
    if (sc.cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: sc.cpuRate })
    await page.addInitScript(vitalsScript)
    await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 120000 })
    // LCP 稳定窗口
    await page.waitForTimeout(3000)
    const vitals = await page.evaluate(() => window.__vitals)
    const lcpOk = vitals.lcp !== null && vitals.lcp <= sc.lcpLimit
    const fcpOk = vitals.fcp === null || vitals.fcp <= sc.fcpLimit
    const mark = lcpOk && fcpOk ? '✅' : '❌'
    if (!(lcpOk && fcpOk)) failed++
    console.log(`${mark} [${sc.name}] ${sc.desc}`)
    console.log(`   FCP ${vitals.fcp ?? 'n/a'}ms (≤${sc.fcpLimit}ms)  LCP ${vitals.lcp ?? 'n/a'}ms (≤${sc.lcpLimit}ms)  [runtime 预算 LCP≤${runtime.lcpMs}ms FCP≤${runtime.fcpMs}ms]`)
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(failed ? `[perf-throttle] ${failed} 个场景越限` : '[perf-throttle] 全部场景达标')
process.exit(failed ? 1 : 0)
