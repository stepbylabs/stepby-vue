// stepby-vue/tests/e2e/visual-regression.mjs
// 首屏截图基线像素回归（R102-FCP-006 配套）：
// 对 /login 首屏截图，与 tests/e2e/__baselines__/login.png 基线做像素级比对，
// 差异像素占比超过阈值（默认 1%）即失败 —— 防止样式/布局意外回归。
//
// 用法：
//   node tests/e2e/visual-regression.mjs                # 与基线比对
//   node tests/e2e/visual-regression.mjs --update       # 重新生成基线（评审后使用）
//   node tests/e2e/visual-regression.mjs --threshold 2  # 自定义差异阈值 %
//
// 依赖：playwright / pixelmatch / pngjs（本地回归工具，不进 CI）。
// 解析顺序：本仓 node_modules → NODE_PATH（如受管 workspace 的 node_modules）。
// 基线入库（__baselines__/），供本地复现与比对。
/* eslint-disable no-console -- e2e 检查脚本，stdout 即报告 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import process from 'node:process'

// playwright/pixelmatch/pngjs 解析：本仓 node_modules 可能未安装（按需 NODE_PATH 指向独立安装目录）
const require2 = createRequire(import.meta.url)
const { chromium } = require2('playwright')

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : process.env.TEST_BASE || 'http://localhost:4173'
const update = args.includes('--update')
const thresholdPct = args.includes('--threshold') ? Number(args[args.indexOf('--threshold') + 1]) : 1

const { PNG } = require2('pngjs')
const _pm = require2('pixelmatch')
// pixelmatch 5.x = 直接函数；7.x = ESM namespace（require() 转 namespace.default）
const pixelmatch = typeof _pm === 'function' ? _pm : _pm.default

const baselineDir = join(here, '__baselines__')
const baselinePath = join(baselineDir, 'login.png')
const W = 1366
const H = 768

console.log('[visual-regression] 目标', base, update ? '（--update 生成基线）' : `（阈值 ≤${thresholdPct}%）`)
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'zh-CN' })
const page = await ctx.newPage()
await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForTimeout(1500)
const shotBuf = await page.screenshot({ type: 'png' })
await browser.close()

if (update) {
  mkdirSync(baselineDir, { recursive: true })
  writeFileSync(baselinePath, shotBuf)
  console.log(`[visual-regression] 基线已更新：${baselinePath}`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  console.error('[visual-regression] 基线不存在，先执行 --update 生成：', baselinePath)
  process.exit(2)
}

const imgA = PNG.sync.read(readFileSync(baselinePath))
const imgB = PNG.sync.read(shotBuf)
if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
  console.error(`[visual-regression] 尺寸不一致：基线 ${imgA.width}x${imgA.height} vs 当前 ${imgB.width}x${imgB.height}（视口/布局变化需重新生成基线）`)
  process.exit(1)
}
const diff = new PNG({ width: imgA.width, height: imgA.height })
const diffPixels = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0.1 })
const diffPct = (diffPixels / (imgA.width * imgA.height)) * 100
const ok = diffPct <= thresholdPct
console.log(`${ok ? '✅' : '❌'} [visual-regression] 差异像素 ${diffPct.toFixed(3)}%（阈值 ≤${thresholdPct}%）`)
if (!ok) {
  const out = join(here, '__baselines__', 'login.diff.png')
  writeFileSync(out, PNG.sync.write(diff))
  console.error(`[visual-regression] 超阈值，差异图已写入 ${out}；若为有意变更，请评审后执行 --update`)
  process.exit(1)
}
