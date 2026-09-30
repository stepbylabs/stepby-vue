// 全页面视觉巡查：登录 → 遍历可达路由 → 逐页截图 + 控制台错误收集
import { createRequire } from 'module'
import { mkdirSync, writeFileSync } from 'fs'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SHOT_DIR = 'D:/Projects/stepby/.ux-responsive-screens/full-audit'
mkdirSync(SHOT_DIR, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text().slice(0, 200) })
})
page.on('pageerror', (err) => {
  consoleErrors.push({ url: page.url(), text: String(err).slice(0, 200) })
})

// 登录
await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await sleep(2000)
const agree = page.locator('button:has-text("同意")').first()
if (await agree.isVisible({ timeout: 600 }).catch(() => false)) await agree.click().catch(() => {})
await page.locator('input[type="text"], .el-input input').first().fill(TEST_USER)
await page.locator('input[type="password"]').first().fill(TEST_PASS)
await page.locator('.el-button--primary').first().click()
await page.waitForURL(/index|dashboard|\/$/, { timeout: 30000 }).catch(() => {})
await sleep(2500)
const skip = page.getByRole('button', { name: /跳过|结束|完成|Skip|Done/ }).first()
if (await skip.count().catch(() => 0)) await skip.click({ timeout: 1200 }).catch(() => {})
await page.evaluate(() => {
  document.querySelectorAll('[class*="tour-mask"], [class*="tour-popover"]').forEach((el) => el.remove())
}).catch(() => {})
// 跳过新手引导（Tour 的 storageKey）：audit 环境每次都是新 context，避免每页遮罩污染截图
await page.evaluate(() => {
  try {
    localStorage.setItem('stepby-layout-tour', 'completed')
    sessionStorage.setItem('stepby-layout-tour', 'completed')
  } catch {}
})
// 刷新使标记生效
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await sleep(2000)

// token/路由：node 侧直连后端 8080（绕开 preview 代理的不确定性）
const loginRes = await fetch('http://127.0.0.1:8080/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: TEST_USER, password: TEST_PASS })
}).then((r) => r.json()).catch(() => null)
const token = loginRes?.token || ''
console.log('login token:', token ? 'ok' : 'FAIL')
const routersRes = token
  ? await fetch('http://127.0.0.1:8080/getRouters', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => r.json()).catch(() => null)
  : null
const routes = []
{
  const walk = (nodes, prefix) => {
    for (const n of nodes || []) {
      if (n.hidden) continue
      const path = n.path.startsWith('/') ? n.path : `${prefix}/${n.path}`
      if (n.children && n.children.length) {
        walk(n.children, path)
      } else if (n.component && n.component !== 'Layout') {
        routes.push({ path, name: n.meta?.title || path })
      }
    }
  }
  walk(routersRes?.data || [], '')
}
console.log('reachable routes:', routes.length)
writeFileSync(`${SHOT_DIR}/routes.json`, JSON.stringify(routes, null, 2))

// 逐页截图
const audit = []
for (const r of routes) {
  const slug = r.path.replace(/\//g, '_').replace(/^_/, '') || 'root'
  try {
    await page.goto(`${UI_URL}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await sleep(2200)
    // 移除 Tour 遮罩/弹窗（类名 stepby-tour-mask / tour-wrapper；项目 cache 工具的存储格式与裸 localStorage 不通，逐页移除 DOM）
    await page
      .evaluate(() => {
        document
          .querySelectorAll('[class*="stepby-tour"], [class*="tour-wrapper"], [class*="tour-mask"], [class*="tour-popover"]')
          .forEach((el) => el.remove())
      })
      .catch(() => {})
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    await page.screenshot({ path: `${SHOT_DIR}/${slug}.png` })
    audit.push({ path: r.path, name: r.name, overflow, ok: overflow <= 0 })
    console.log(`[${overflow <= 0 ? 'OK ' : 'OVF'}] ${r.path} overflow=+${overflow}`)
  } catch (e) {
    audit.push({ path: r.path, name: r.name, error: String(e).slice(0, 120) })
    console.log(`[ERR] ${r.path}: ${String(e).slice(0, 100)}`)
  }
}

writeFileSync(`${SHOT_DIR}/audit.json`, JSON.stringify({ audit, consoleErrors }, null, 2))
console.log(`\n===== AUDIT: ${audit.filter((a) => a.ok).length}/${audit.length} pages no-overflow; consoleErrors=${consoleErrors.length} =====`)
await browser.close()
