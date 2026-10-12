// UX-RESPONSIVE-PLAN 阶段二：多视口截图核查（Playwright）
// 视口：手机 375×812 / 平板竖 768×1024 / iPad Air 竖 820×1180 / 桌面 1366×900
// 核查：登录页、看板、用户列表；手机/平板档额外验证抽屉/折叠侧边栏交互（S2/S3）。
// 用法：STEPBY_UI_URL=http://localhost:4173 node ux-responsive-screenshot.mjs
import { createRequire } from 'module'
import { mkdirSync } from 'fs'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SHOT_DIR = process.env.UX_SHOT_DIR || 'D:/Projects/stepby/.ux-responsive-screens'
mkdirSync(SHOT_DIR, { recursive: true })

const VIEWPORTS = [
  { tag: 'mobile', width: 375, height: 812 },
  { tag: 'tablet-p', width: 768, height: 1024 },
  { tag: 'tablet-air', width: 820, height: 1180 },
  { tag: 'desktop', width: 1366, height: 900 }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function loginIfNeeded(page) {
  if (!page.url().includes('/login')) return
  const agree = page.locator('button:has-text("同意")').first()
  if (await agree.isVisible({ timeout: 600 }).catch(() => false)) await agree.click().catch(() => {})
  await page.locator('input[type="text"], .el-input input').first().fill(TEST_USER)
  await page.locator('input[type="password"]').first().fill(TEST_PASS)
  await page.locator('.el-button--primary').first().click()
  await page.waitForURL(/index|dashboard|\/$/, { timeout: 30000 }).catch(() => {})
  await sleep(2500)
  const skip = page.getByRole('button', { name: /跳过|结束|完成|Skip|Done/ }).first()
  if (await skip.count().catch(() => 0)) await skip.click({ timeout: 1200 }).catch(() => {})
  await page
    .evaluate(() => {
      document.querySelectorAll('[class*="tour-mask"], [class*="tour-popover"]').forEach((el) => el.remove())
    })
    .catch(() => {})
}

async function snapshot(page, vp, tag) {
  await sleep(900)
  const info = await page.evaluate(() => {
    const de = document.documentElement
    const sidebar = document.querySelector('.sidebar-container')
    const wrapper = document.querySelector('.app-wrapper')
    const hamburger = document.querySelector('.hamburger, [class*="hamburger"]')
    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      overflow: de.scrollWidth > de.clientWidth,
      deviceClass: wrapper ? wrapper.className.match(/mobile|tablet|desktop/)?.[0] || '(none)' : '(no wrapper)',
      wrapperClass: wrapper ? wrapper.className.slice(0, 120) : '(no wrapper)',
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
      sidebarVisible: sidebar ? getComputedStyle(sidebar).visibility !== 'hidden' : false,
      hamburgerClickable: hamburger
        ? (() => {
            const r = hamburger.getBoundingClientRect()
            const topEl = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            return topEl ? hamburger.contains(topEl) || topEl === hamburger : false
          })()
        : null
    }
  })
  const shot = `${vp.tag}-${tag}.png`
  await page.screenshot({ path: `${SHOT_DIR}/${shot}`, fullPage: false })
  const pass = !info.overflow
  console.log(
    `[${pass ? 'PASS' : 'FAIL'}] ${vp.tag}/${tag} device=${info.deviceClass} wrapper=[${info.wrapperClass}] ` +
      `sidebar=${info.sidebarWidth}px hamClick=${info.hamburgerClickable} overflow=${info.overflow}`
  )
  return info
}

async function runViewport(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'zh-CN' })
  const page = await ctx.newPage()
  try {
    await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await sleep(2500)
    await snapshot(page, vp, 'login')
    await loginIfNeeded(page)

    await page.goto(`${UI_URL}/index`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await sleep(2200)
    await snapshot(page, vp, 'dashboard')

    // 手机/平板档：验证侧边栏交互（S2/S3）
    if (vp.tag !== 'desktop') {
      const hamburger = page.locator('.hamburger, [class*="hamburger"]').first()
      if (await hamburger.count().catch(() => 0)) {
        // 展开
        await hamburger.click({ timeout: 3000 }).catch(() => {})
        await sleep(700)
        const openInfo = await snapshot(page, vp, 'sidebar-open')
        // 展开态再点汉堡收起（S3 核心验证：汉堡必须可点击）
        const canClickAgain = openInfo.hamburgerClickable
        await hamburger.click({ timeout: 3000 }).catch(() => {})
        await sleep(600)
        const closed = await page.evaluate(() => {
          const s = document.querySelector('.sidebar-container')
          return s ? Math.round(s.getBoundingClientRect().width) : 0
        })
        console.log(
          `   [S3] ${vp.tag}: expand→sidebar=${openInfo.sidebarWidth}px, hamburger clickable=${canClickAgain}, ` +
            `re-click→width=${closed}px ${canClickAgain ? 'PASS' : 'FAIL'}`
        )
      }
    }

    await page.goto(`${UI_URL}/system/user`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await sleep(2800)
    await snapshot(page, vp, 'userlist')
  } finally {
    await ctx.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n===== VIEWPORT ${vp.tag} ${vp.width}x${vp.height} =====`)
      await runViewport(browser, vp)
    }
  } finally {
    await browser.close()
  }
  console.log(`\nScreenshots: ${SHOT_DIR}`)
}

main().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
