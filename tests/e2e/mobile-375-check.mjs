// U3 移动端 375px 视口验证/E2E（Playwright）
// 真实验证：连接真实后端 + vite dev(5173)，视口 375×812（iPhone X 典型宽度）。
// 用法：
//   STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 STEPBY_BASE_URL=http://localhost:8080 node mobile-375-check.mjs
import { createRequire } from 'module'
import { mkdirSync } from 'fs'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SHOT_DIR = process.env.MOBILE_SHOT_DIR || 'D:/Projects/stepby/.mobile375-screens'
mkdirSync(SHOT_DIR, { recursive: true })

const VIEWPORT = { width: 375, height: 812 }

async function main() {
  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'zh-CN' })
    const page = await ctx.newPage()
    const consoleErrors = []
    const failedRequests = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
    })
    page.on('pageerror', (err) => consoleErrors.push('[PAGEERR] ' + String(err).slice(0, 300)))
    page.on('response', (resp) => {
      const s = resp.status()
      if (s >= 400 && !resp.url().includes('favicon') && !resp.url().includes('@vite')) {
        failedRequests.push({ url: resp.url().replace(UI_URL, ''), status: s })
      }
    })

    // 侧边栏收起/展开交互验证（窄屏）
    async function checkSidebarCollapse() {
      const hamburger = page
        .locator('.hamburger, [class*="hamburger"], .sidebar-trigger, [class*="sidebar-trigger"]')
        .first()
      const before = await page.evaluate(() => {
        const s = document.querySelector('.sidebar-container, [class*="sidebar"]')
        return s ? Math.round(s.getBoundingClientRect().width) : 0
      })
      let after = before
      let collapsed = false
      if (await hamburger.count().catch(() => 0)) {
        await hamburger.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(700)
        after = await page.evaluate(() => {
          const s = document.querySelector('.sidebar-container, [class*="sidebar"]')
          return s ? Math.round(s.getBoundingClientRect().width) : 0
        })
        collapsed = after !== before
        // 恢复
        await hamburger.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(500)
      }
      return { hamburger: (await hamburger.count().catch(() => 0)) > 0, before, after, collapsed }
    }

    // 窄屏体检：横向溢出 + 关键交互状态
    async function checkNarrow(tag) {
      await page.waitForTimeout(800)
      const info = await page.evaluate(() => {
        const de = document.documentElement
        const sw = de.scrollWidth
        const cw = de.clientWidth
        // 找出比视口宽的候选元素（跳过 html/body）
        const widers = []
        document.querySelectorAll('body *').forEach((el, idx) => {
          if (idx > 4000) return
          const r = el.getBoundingClientRect()
          const rw = Math.ceil(r.width)
          if (rw > cw + 2 && r.width > 100) {
            widers.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 60),
              w: Math.round(rw)
            })
          }
        })
        const sidebar = document.querySelector('.sidebar-container, [class*="sidebar"]')
        const topnav = document.querySelector('.navbar, .topbar-container, [class*="topbar"]')
        const main = document.querySelector('.app-main, [class*="app-main"], main')
        return {
          scrollWidth: sw,
          clientWidth: cw,
          hasHorizontal: sw > cw,
          overflowX: getComputedStyle(de).overflowX,
          widers: widers.slice(0, 12),
          hasSidebar: !!sidebar && getComputedStyle(sidebar).display !== 'none',
          sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
          sidebarOverflow: sidebar ? sidebar.scrollWidth > sidebar.clientWidth + 2 : false,
          topnavWrap: topnav ? topnav.scrollHeight > topnav.clientHeight + 2 : false,
          mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0
        }
      })
      const shot = `${tag}-375`
      await page.screenshot({ path: `${SHOT_DIR}/${shot}.png`, fullPage: true })
      results.push({ tag, shot, info })
      const pass = !info.hasHorizontal
      console.log(
        `[${pass ? 'PASS' : 'FAIL'}] ${tag} scrollW=${info.scrollWidth} clientW=${info.clientWidth} ` +
          `hasH=${info.hasHorizontal}`
      )
      if (info.widers.length) {
        console.log('   widers:')
        info.widers.forEach((w) => console.log(`     <${w.tag} class="${w.cls}" w=${w}>`))
      }
      console.log(
        `   detail: overflowX=${info.overflowX} sidebar=${info.hasSidebar}(${info.sidebarWidth}px` +
          `,over=${info.sidebarOverflow}) navWrap=${info.topnavWrap} mainW=${info.mainWidth}`
      )
      return info
    }

    // ===== 1. 登录页（未登录直达）=====
    await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(3000)
    console.log('--- LOGIN PAGE ---')
    const loginInfo = await checkNarrow('login')

    // 关闭 Cookie 同意条（若出现）
    const agree = page.locator('button:has-text("同意")').first()
    if (await agree.isVisible({ timeout: 800 }).catch(() => false)) await agree.click().catch(() => {})
    await page.waitForTimeout(300)

    // 登录
    const userSel = page.locator('input[type="text"], .el-input input').first()
    await userSel.fill(TEST_USER)
    const passSel = page.locator('input[type="password"]').first()
    await passSel.fill(TEST_PASS)
    const loginBtn = page.locator('.el-button--primary').first()
    await loginBtn.click()
    await page.waitForURL(/index|dashboard|\/$/, { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(3500)
    console.log('AFTER LOGIN URL ->', page.url())

    // 关闭新手引导 Tour（遮罩会拦截点击）
    const skip = page.getByRole('button', { name: /跳过|结束|完成|Skip|Done/ }).first()
    if (await skip.count().catch(() => 0)) {
      await skip.click({ timeout: 1500 }).catch(() => {})
      await page.waitForTimeout(500)
    }
    await page
      .evaluate(() => {
        document.querySelectorAll('[class*="tour-mask"], [class*="tour-popover"]').forEach((el) => el.remove())
      })
      .catch(() => {})

    // ===== 2. 数据看板 /index =====
    await page.goto(`${UI_URL}/index`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    console.log('--- DASHBOARD /index ---')
    const dash = await checkNarrow('dashboard')
    const dashSidebar = await checkSidebarCollapse()
    console.log(
      `   SIDEBAR: has=${dashSidebar.hamburger} width ${dashSidebar.before}->${dashSidebar.after} collapsed=${dashSidebar.collapsed}`
    )
    console.log(`   NAV: exists=${!!dash.info && 'topnavWrap' in dash.info}`)

    // ===== 3. 用户列表 /system/user =====
    await page.goto(`${UI_URL}/system/user`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3500)
    console.log('--- USER LIST /system/user ---')
    await checkNarrow('userlist')

    // ===== 汇总 =====
    console.log('\n===== U3 MOBILE SUMMARY =====')
    console.log('Console/page errors:', consoleErrors.length)
    consoleErrors.slice(0, 8).forEach((e) => console.log('  [ERR]', e))
    console.log('Failed requests (>=400):', failedRequests.length)
    failedRequests.slice(0, 10).forEach((r) => console.log('  [HTTP', r.status + ']', r.url))
    console.log('Screenshots dir:', SHOT_DIR)
    console.log('Screens:', results.map((r) => `${r.tag}</${r.shot}>`).join(', '))
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
