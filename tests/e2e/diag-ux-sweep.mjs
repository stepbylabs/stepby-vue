// UX 全量巡查：逐页截图 + 收集 console 错误 + 检测横向溢出（布局问题信号）
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import process from 'node:process'

const base = process.env.TEST_BASE || 'http://localhost:4173'
const out = 'screenshots/ux-sweep'
mkdirSync(out, { recursive: true })

const routes = [
  ['index', '/index'],
  ['dashboard', '/dashboard'],
  ['user', '/system/user'],
  ['role', '/system/role'],
  ['menu', '/system/menu'],
  ['dept', '/system/dept'],
  ['post', '/system/post'],
  ['dict', '/system/dict'],
  ['config', '/system/config'],
  ['notice', '/system/notice'],
  ['tenant', '/system/tenant/index'],
  ['online', '/monitor/online'],
  ['job', '/monitor/job'],
  ['logininfor', '/monitor/logininfor'],
  ['operlog', '/monitor/operlog'],
  ['frontendError', '/monitor/frontendError'],
  ['gen', '/tool/gen'],
  ['build', '/tool/build'],
  ['swagger', '/tool/swagger'],
  ['about', '/tool/about/index'],
  ['help', '/tool/help/index'],
  ['profile', '/user/profile']
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 160)))

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)
const u = page.locator('input[placeholder="账号"], input[name="username"]').first()
await u.waitFor({ timeout: 15000 })
await u.fill('admin')
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForTimeout(4500)

const report = []
for (const [name, path] of routes) {
  try {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2200)
    const metrics = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight,
      mainScrollH: (document.querySelector('.app-main') || {}).scrollHeight || 0,
      title: document.title,
      h1: (document.querySelector('.app-container h1, .app-container .head-container') || {}).textContent?.trim().slice(0, 40) || '',
      emptyBlocks: document.querySelectorAll('.el-empty').length
    }))
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false })
    const overflow = metrics.docW - metrics.docClient
    report.push({
      name, path,
      overflowPx: overflow,
      emptyBlocks: metrics.emptyBlocks,
      title: metrics.title.slice(0, 40),
      h1: metrics.h1.slice(0, 30)
    })
  } catch (e) {
    report.push({ name, path, error: String(e).slice(0, 90) })
  }
}

console.log('=== UX SWEEP REPORT ===')
for (const r of report) {
  if (r.error) { console.log(`${r.name} (${r.path}) ERROR: ${r.error}`); continue }
  const flag = r.overflowPx > 4 ? ' ⚠横向溢出' : ''
  const empty = r.emptyBlocks > 0 ? ` ⚠空状态x${r.emptyBlocks}` : ''
  console.log(`${r.name.padEnd(14)} ${r.path.padEnd(26)} title="${r.title}" h1="${r.h1}" overflow=${r.overflowPx}px${flag}${empty}`)
}
console.log('=== CONSOLE ERRORS ===')
const uniq = [...new Set(errors)]
uniq.slice(0, 20).forEach((e) => console.log('- ' + e))
console.log(`errorCount=${uniq.length}`)
await browser.close()
