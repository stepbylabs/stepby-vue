/**
 * 逐页采集运行时信号：console(warning/error)、未捕获异常(pageerror)、
 * 请求失败(requestfailed)、HTTP 4xx/5xx 响应(response)、element-plus toast、
 * 弹窗(MessageBox/Dialog)、真实 404 页面。
 *
 * 用于分析"界面警告/错误"的根因，覆盖每一轮 E2E 循环中"可能有用的信息"。
 *
 * 运行：
 *   PLAYWRIGHT_BROWSERS_PATH=<repo>/.pw-browsers \
 *   node collect-warnings.mjs
 * 环境变量覆盖：FRONTEND_URL / YEBOT_TEST_USER / YEBOT_TEST_PASS。
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4173'
const USER = process.env.YEBOT_TEST_USER || 'admin'
const PASS = process.env.YEBOT_TEST_PASS || 'admin123'

// 覆盖 sys_menu 中已注册（status=0）的全部可达功能页面。
// 路径按 RuoYi 规则组合：/父目录path/子path。动态菜单路径的唯一权威来源是 sys_menu，
// 手写猜测会命中 404 兜底页造成误报（如 /message/* 实为 /system/msg/*，
// changelog/about 在 /help-center 下，webHook/authRole/server 并非可直达的已注册菜单页）。
const ROUTES = [
  '/index',
  '/dashboard/index',
  '/dashboard/workbench',
  '/system/user',
  '/system/role',
  '/system/dept',
  '/system/menu',
  '/system/post',
  '/system/dict',
  '/system/config',
  '/system/notice',
  '/system/notice-center',
  '/system/file',
  '/system/msg/channel',
  '/system/msg/template',
  '/system/msg/log',
  '/system/oauth/provider',
  '/system/report/index',
  '/system/report/sub',
  '/system/webHook/index',
  '/system/webHook/log',
  '/monitor/online',
  '/monitor/job',
  '/monitor/cache',
  '/monitor/audit-dashboard',
  '/monitor/ip-location',
  '/monitor/health',
  '/monitor/operlog',
  '/monitor/logininfor',
  '/monitor/logtail',
  '/monitor/observability',
  '/monitor/rateLimit',
  '/tool/build',
  '/tool/gen',
  '/tool/swagger',
  '/tool/http-debugger',
  '/tool/backup',
  '/tool/task',
  '/help-center/shortcuts',
  '/help-center/help',
  '/help-center/changelog',
  '/help-center/about',
  '/user/profile/index',
  '/user/profile/msgPref',
  '/user/profile/oauth',
  '/user/profile/resetPwd',
  '/user/profile/totp',
  '/user/profile/userAvatar',
  '/user/profile/userInfo'
]

// 已知良性、无需告警的响应（favicon 缺失、登出/无 token 的 401、验证码等）
function benignResponse(url, status) {
  if (/favicon\.(ico|png)/i.test(url)) return true
  // 未授权 401 在个别页属正常鉴权反馈，记录但不计入"错误"
  if (status === 401) return true
  return false
}

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
  const pageErrors = []
  const reqFail = []
  const badResp = []
  const onConsole = (msg) => {
    const t = msg.type()
    if (t === 'warning' || t === 'error') msgs.push(`[${t}] ${msg.text()}`)
  }
  const onPageError = (err) => pageErrors.push(String(err && err.message ? err.message : err))
  const onFail = (req) => reqFail.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`)
  const onResponse = (resp) => {
    const st = resp.status()
    if (st >= 400 && !benignResponse(resp.url(), st)) badResp.push(`${resp.request().method()} ${resp.url()} -> ${st}`)
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onFail)
  page.on('response', onResponse)
  await page.goto(`${FRONTEND_URL}${route}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
  await sleep(1800)
  const overlay = await page
    .evaluate(() => {
      const out = { toasts: [], dialogs: [] }
      document.querySelectorAll('.el-message, .el-notification').forEach((el) => {
        const t = el.textContent.trim()
        if (t) out.toasts.push(t)
      })
      // MessageBox / 可见 Dialog 标题与正文（不改状态，仅读取已弹出的内容）
      document.querySelectorAll('.el-message-box__message, .el-message-box__title').forEach((el) => {
        const t = el.textContent.trim()
        if (t) out.dialogs.push(`[msgbox] ${t}`)
      })
      document.querySelectorAll('.el-dialog').forEach((el) => {
        const box = el.closest('.el-dialog__wrapper')
        if (box && getComputedStyle(box).display === 'none') return
        const title = el.querySelector('.el-dialog__title')
        const t = (title ? title.textContent : el.textContent).trim()
        if (t) out.dialogs.push(`[dialog] ${t.slice(0, 120)}`)
      })
      return out
    })
    .catch(() => ({ toasts: [], dialogs: [] }))
  // 用真实 404 页根元素类名判定，避免 changelog 等页面正文含 "404问题" 字样造成的误报
  const p404 = await page.evaluate(() => !!document.querySelector('.wscn-http404-container')).catch(() => false)
  page.removeListener('console', onConsole)
  page.removeListener('pageerror', onPageError)
  page.removeListener('requestfailed', onFail)
  page.removeListener('response', onResponse)
  results.push({
    route,
    p404,
    console: [...msgs],
    pageErrors: [...pageErrors],
    requestsFailed: [...reqFail],
    badResponses: [...badResp],
    toasts: overlay.toasts,
    dialogs: overlay.dialogs
  })
  const flagCount =
    msgs.length +
    pageErrors.length +
    reqFail.length +
    badResp.length +
    overlay.toasts.length +
    overlay.dialogs.length +
    (p404 ? 1 : 0)
  console.log(
    `[${route}] sig=${flagCount} console=${msgs.length} pageErr=${pageErrors.length} reqFail=${reqFail.length} http>=400=${badResp.length} toast=${overlay.toasts.length} dialog=${overlay.dialogs.length} 404=${p404}`
  )
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const ok = await login(page)
  console.log(`\n登录: ${ok ? '成功' : '失败'}\n`)
  for (const route of ROUTES) {
    await scanPage(page, route)
  }

  console.log('\n===== 采集汇总 =====')
  let total = 0
  for (const r of results) {
    const sig =
      r.console.length +
      r.pageErrors.length +
      r.requestsFailed.length +
      r.badResponses.length +
      r.toasts.length +
      r.dialogs.length +
      (r.p404 ? 1 : 0)
    if (sig) {
      total++
      console.log(`\n### ${r.route}  (404=${r.p404})`)
      r.console.forEach((m) => console.log(`  CONSOLE ${m}`))
      r.pageErrors.forEach((m) => console.log(`  PAGEERROR ${m}`))
      r.requestsFailed.forEach((m) => console.log(`  REQFAIL ${m}`))
      r.badResponses.forEach((m) => console.log(`  HTTP ${m}`))
      r.toasts.forEach((m) => console.log(`  TOAST ${m}`))
      r.dialogs.forEach((m) => console.log(`  DIALOG ${m}`))
    }
  }
  console.log(`\n有信号的路由数: ${total}/${results.length}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
