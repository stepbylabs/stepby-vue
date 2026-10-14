// stepby-vue/tests/e2e/visual-regression.mjs
// 多页面首屏截图基线像素回归（R102-FCP-006 配套；批六十四质量工程扩展为基线库）：
// 对页面清单逐页截图，与 tests/e2e/__baselines__/<name>.png 做像素级比对，
// 差异像素占比超过阈值（默认 1%）即失败 —— 防止样式/布局意外回归。
// ⚠️ 页面清单只收录**零数据依赖**的静态页（登录/锁屏/404/工作台骨架）——
//    表格类页面含动态数据行，像素比对会产生假差异，不纳入。
//
// 用法：
//   node tests/e2e/visual-regression.mjs                # 与基线比对
//   node tests/e2e/visual-regression.mjs --update       # 重新生成全部基线（评审后使用）
//   node tests/e2e/visual-regression.mjs --threshold 2  # 自定义差异阈值 %
//   TEST_BASE=http://localhost:8080 node ...            # 指定后端（默认 4173 preview）
//
// 依赖：playwright / pixelmatch / pngjs（本地回归工具，不进 CI）。
// 基线入库（__baselines__/），供本地复现与比对。

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import process from "node:process"

const require2 = createRequire(import.meta.url)
const { chromium } = require2("playwright")

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : process.env.TEST_BASE || "http://localhost:4173"
const update = args.includes("--update")
const thresholdPct = args.includes("--threshold") ? Number(args[args.indexOf("--threshold") + 1]) : 1

const { PNG } = require2("pngjs")
const _pm = require2("pixelmatch")
const pixelmatch = typeof _pm === "function" ? _pm : _pm.default

const baselineDir = join(here, "__baselines__")
const W = 1366
const H = 768

// 页面清单（零数据依赖静态页；新增页面须评审——动态数据页会产生假差异）
const PAGES = [
  { name: "login", path: "/login", auth: false },
  { name: "lock", path: "/lock", auth: true },
  { name: "notfound", path: "/nonexistent-page-for-404-shot", auth: true }
]

console.log("[visual-regression] 目标", base, update ? "（--update 生成基线）" : `（阈值 ≤${thresholdPct}%）`)
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: "zh-CN" })

// 登录态注入（auth: true 的页面需要）
const cap = await fetch(`${process.env.STEPBY_BASE_URL || "http://localhost:8080"}/captchaImage`).then((r) => r.json()).catch(() => null)
let token = null
if (cap) {
  const login = await fetch(`${process.env.STEPBY_BASE_URL || "http://localhost:8080"}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.STEPBY_TEST_USER || "admin", password: process.env.STEPBY_TEST_PASS || "admin123", code: "x", uuid: cap.uuid })
  })
    .then((r) => r.json())
    .catch(() => null)
  token = login?.token || null
}
if (token) await ctx.addCookies([{ name: "Admin-Token", value: token, url: base }])
else console.log("[visual-regression] 登录失败，auth 页面将跳过")

const page = await ctx.newPage()
const failures = []
for (const p of PAGES) {
  const baselinePath = join(baselineDir, `${p.name}.png`)
  await page.goto(`${base}${p.path}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(1800)
  const shotBuf = await page.screenshot({ type: "png" })

  if (update) {
    mkdirSync(baselineDir, { recursive: true })
    writeFileSync(baselinePath, shotBuf)
    console.log(`  ✅ [${p.name}] 基线已更新：${baselinePath}`)
    continue
  }
  if (!existsSync(baselinePath)) {
    console.error(`  ⏭ [${p.name}] 基线不存在，先执行 --update 生成`)
    continue
  }
  const imgA = PNG.sync.read(readFileSync(baselinePath))
  const imgB = PNG.sync.read(shotBuf)
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    console.error(`  ❌ [${p.name}] 尺寸不一致：基线 ${imgA.width}x${imgA.height} vs 当前 ${imgB.width}x${imgB.height}`)
    failures.push(p.name)
    continue
  }
  const diff = new PNG({ width: imgA.width, height: imgA.height })
  const diffPixels = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0.1 })
  const diffPct = (diffPixels / (imgA.width * imgA.height)) * 100
  const ok = diffPct <= thresholdPct
  console.log(`  ${ok ? "✅" : "❌"} [${p.name}] 差异像素 ${diffPct.toFixed(3)}%（阈值 ≤${thresholdPct}%）`)
  if (!ok) {
    writeFileSync(join(baselineDir, `${p.name}.diff.png`), PNG.sync.write(diff))
    failures.push(p.name)
  }
}
await browser.close()
if (failures.length > 0) {
  console.error(`[visual-regression] 超阈值页面：${failures.join(", ")}；若为有意变更，请评审后执行 --update`)
  process.exit(1)
}
console.log("[visual-regression] 全部页面通过")
