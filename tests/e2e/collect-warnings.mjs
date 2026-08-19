/**
 * 临时工具：登录后逐页采集运行时 console warning/error 与 element-plus toast
 * 用于分析"界面警告/错误"的根因。
 * 运行：先设 PLAYWRIGHT_BROWSERS_PATH=d:\桌面\yebot\.pw-browsers
 *       node collect-warnings.mjs
 * FRONTEND_URL / YEBOT_TEST_USER / YEBOT_TEST_PASS 可用环境变量覆盖。
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4173'
const USER = process.env.YEBOT_TEST_USER || 'admin'
const PASS = process.env.YEBOT_TEST_PASS || 'admin123'

const ROUTES = [
  '/index',
  '/dashboard/index',
  '/dashboard/workbench',
  '/system/user',
  '/system/role',
  '/system/notice',
  '/system/notice-center',
  '/system/dict',
  '/monitor/rateLimit',
  '/monitor/audit-dashboard',
  '/monitor/operlog',
  '/monitor/logininfor',
  '/monitor/online',
  '/monitor/ip-location',
  '/monitor/logtail',
  '/tool/backup',
  '/tool/task',
  '/help-center/changelog',
  '/user/profile',
  '/help-center/shortcuts',
  '/help-center/help'
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []

async function login(page) {
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' }).catch(() => {})
  await sleep(1500)
  const cb = page.locator('button:has-text("同意")').first()
  if (await cb.isVisible({ timeout: 500 }).catch(() => false)) {
    await cb.click({ timeout: 2000 }).catch(() => {})
    await sleep(300)
  }
  const u = page.locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]').first()
  await u.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  await u.fill(USER)
  const p = page.locator('input[placeholder="密码"], input[placeholder="Password"], input[type="password"]').first()
  await p.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  await p.fill(PASS)
  const code = page.locator('input[placeholder="验证码"], input[placeholder="Captcha"]').first()
  if (await code.isVisible({ timeout: 500 }).catch(() => false)) await code.fill('1234')
  const btn = page
    .locator('button:has-text("登 录"), button:has-text("登录"), button:has-text("Login"), button[type="submit"]')
    .first()
  await btn.click().catch(() => {})
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }).catch(() => {})
  await sleep(3000)
  return !page.url().includes('login')
}

async function scanPage(page, route) {
  const msgs = []
  const reqFail = []
  const onConsole = (msg) => {
    const t = msg.type()
    if (t === 'warning' || t === 'error') msgs.push(`[${t}] ${msg.text()}`)
  }
  const onFail = (req) => {
    reqFail.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`)
  }
  page.on('console', onConsole)
  page.on('requestfailed', onFail)
  await page.goto(`${FRONTEND_URL}${route}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
  await sleep(2000)
  const toasts = await page
    .evaluate(() => {
      const out = []
      document.querySelectorAll('.el-message, .el-notification').forEach((el) => out.push(el.textContent.trim()))
      return out
    })
    .catch(() => [])
  // 用真实 404 页根元素类名判定，避免 changelog 等页面正文含 "404问题" 字样造成的误报
  // （错误记忆：body.innerText.includes('404') 会把合法内容也当成 404）
  const p404 = await page.evaluate(() => !!document.querySelector('.wscn-http404-container')).catch(() => false)
  page.removeListener('console', onConsole)
  page.removeListener('requestfailed', onFail)
  results.push({ route, p404, console: [...msgs], requestsFailed: [...reqFail], toasts })
  console.log(`[${route}] 404=${p404} console=${msgs.length} reqFail=${reqFail.length} toast=${toasts.length}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const ok = await login(page)
  console.log(`\n登录: ${ok ? '成功' : '失败'}\n`)
  await scanPage(page, '/index')
  for (const route of ROUTES.slice(1)) {
    await scanPage(page, route)
  }

  console.log('\n===== 采集汇总 =====')
  let total = 0
  for (const r of results) {
    if (r.console.length || r.requestsFailed.length || r.p404 || r.toasts.length) {
      total++
      console.log(`\n### ${r.route}  (404=${r.p404})`)
      if (r.console.length) r.console.forEach((m) => console.log(`  CONSOLE ${m}`))
      if (r.requestsFailed.length) r.requestsFailed.forEach((m) => console.log(`  REQFAIL ${m}`))
      if (r.toasts.length) r.toasts.forEach((m) => console.log(`  TOAST ${m}`))
    }
  }
  console.log(`\n有问题的路由数: ${total}/${results.length}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
