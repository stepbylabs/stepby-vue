/**
 * README 截图采集 v2（修正：跳过引导浮层 / 真实动态路由 / 未登录 context 拍登录页）
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../docs/images')
fs.mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE_URL || 'http://localhost:8080'
const routes = [
  ['dashboard', '/index'],
  ['user-management', '/system/user'],
  ['role-management', '/system/role'],
  ['flow-approval', '/system/flow/todo'],
  ['tenant-management', '/system/tenant'],
  ['sso-clients', '/system/oauth/client'],
  ['audit-dashboard', '/monitor/audit-dashboard'],
]

const browser = await chromium.launch({ headless: true })

// ① 登录页（独立未登录 context）
const loginCtx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 })
const lp = await loginCtx.newPage()
await lp.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await lp.waitForTimeout(1500)
await lp.screenshot({ path: path.join(OUT, 'login.png') })
console.log('shot: login')
await loginCtx.close()

// ② 登录态页面（跳过新手引导浮层）
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('admin123')
await page.locator('button:has-text("登")').first().click()
await page.waitForURL(/\/(index|dashboard)/, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(2000)
// 跳过引导浮层（若出现）
const skip = page.locator('button:has-text("跳过引导")').first()
if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
  await skip.click()
  console.log('tour skipped')
}
await page.waitForTimeout(1500)

for (const [name, route] of routes) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('shot:', name)
}

await browser.close()
console.log('ALL DONE')
