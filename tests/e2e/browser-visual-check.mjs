// 浏览器视觉/界面/动效巡检脚本（Playwright）
// 用法：node tests/browser-visual-check.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { TEST_USER, TEST_PASS } from './test-config.mjs'

const BASE = process.env.TEST_BASE || 'http://localhost:4173'
const SHOT_DIR = 'D:/桌面/stepby/screenshots/browser-test'
mkdirSync(SHOT_DIR, { recursive: true })

const consoleErrors = [] // { page, text }
const pageErrors = [] // { page, text }
const failedRequests = [] // { page, url, status }

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })
  const page = await ctx.newPage()

  let currentTag = 'init'
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ page: currentTag, text: msg.text().slice(0, 300) })
  })
  page.on('pageerror', (err) => pageErrors.push({ page: currentTag, text: String(err).slice(0, 300) }))
  page.on('response', (resp) => {
    const s = resp.status()
    if (s >= 400 && !resp.url().includes('favicon')) {
      failedRequests.push({ page: currentTag, url: resp.url().replace(BASE, ''), status: s })
    }
  })

  async function shot(name) {
    await page.screenshot({ path: `${SHOT_DIR}/${name}.png` })
  }

  // ===== 1. 登录 =====
  currentTag = 'login'
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot('10-login')
  await page.getByRole('textbox', { name: '账号' }).fill(TEST_USER)
  await page.getByRole('textbox', { name: '密码' }).fill(TEST_PASS)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await page.waitForURL(/index|dashboard|\/$/, { timeout: 20000 })
  await page.waitForTimeout(2500)
  console.log('LOGIN OK ->', page.url())
  await shot('11-home')

  // 关闭新手引导 Tour（首次访问自动弹出，遮罩会拦截所有点击）
  async function dismissTour() {
    const skip = page.getByRole('button', { name: /跳过|结束|完成|Skip|Done/ }).first()
    if (await skip.count().catch(() => 0)) {
      await skip.click().catch(() => {})
      await page.waitForTimeout(500)
    }
    // 兜底：直接移除遮罩
    await page
      .evaluate(() => {
        document
          .querySelectorAll('.stepby-tour-mask, [class*="tour-mask"], [class*="tour-popover"]')
          .forEach((el) => el.remove())
      })
      .catch(() => {})
  }
  await dismissTour()

  // ===== 2. 逐页巡检 =====
  const routes = [
    ['dashboard/index', '数据看板'],
    ['system/user', '用户管理'],
    ['system/role', '角色管理'],
    ['system/menu', '菜单管理'],
    ['system/dept', '部门管理'],
    ['system/dict', '字典管理'],
    ['system/config', '参数设置'],
    ['system/notice', '公告管理'],
    ['monitor/operlog', '操作日志'],
    ['monitor/logininfor', '登录日志'],
    ['system/notice-center', '我的通知'],
    ['system/file', '文件管理'],
    ['monitor/online', '在线用户'],
    ['monitor/job', '定时任务'],
    ['monitor/health', '服务监控'],
    ['monitor/cache', '缓存监控'],
    ['tool/gen', '代码生成'],
    ['user/profile', '个人中心']
  ]
  let i = 20
  for (const [route, name] of routes) {
    currentTag = route
    try {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1800)
      // 检查未翻译 i18n key（形如 xxx.yyy.zzz 的裸 key 文本）
      const rawKeys = await page.evaluate(() => {
        const re = /^[a-z][a-zA-Z]*(\.[a-zA-Z][a-zA-Z0-9]*){2,}$/
        const bad = new Set()
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let n
        while ((n = walker.nextNode())) {
          const t = n.textContent.trim()
          if (t && re.test(t)) bad.add(t)
        }
        return [...bad].slice(0, 5)
      })
      // 空页判断：主内容区存在且有可见文本（>50 字符）才算正常
      const empty = await page.evaluate(() => {
        const main = document.querySelector('.app-main, main, #main-content, .el-main')
        const host = main || document.body
        return (host.innerText || '').trim().length < 50
      })
      await shot(`${i}-${route.replace(/\//g, '_')}`)
      console.log(
        `PAGE ${name} (${route}): ${empty ? 'EMPTY!' : 'ok'}${rawKeys.length ? ' RAW-I18N:' + JSON.stringify(rawKeys) : ''}`
      )
    } catch (e) {
      console.log(`PAGE ${name} (${route}): FAIL ${String(e).slice(0, 120)}`)
    }
    i++
  }

  // ===== 3. 暗色模式切换 =====
  currentTag = 'dark-mode'
  await page.goto(BASE + '/index', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await dismissTour()
  const themeBtn = page.getByRole('button', { name: '主题模式' })
  if (await themeBtn.count()) {
    await themeBtn.click()
    await page.waitForTimeout(800)
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    await shot('50-dark-mode')
    console.log('DARK MODE toggle:', isDark ? 'ok (html.dark)' : 'NOT APPLIED')
    // 暗色下检查正文文字与背景对比（粗检：背景应为深色）
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    console.log('DARK body bg:', bg)
    await themeBtn.click()
    await page.waitForTimeout(500)
    const backLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'))
    console.log('LIGHT restore:', backLight ? 'ok' : 'STUCK IN DARK')
  } else {
    console.log('DARK MODE: theme button not found')
  }

  // ===== 4. 语言切换 =====
  currentTag = 'i18n-switch'
  const langBtns = await page.locator('.right-menu button, .navbar button').all()
  // 语言按钮无 aria 名，用 title/tooltip 找
  const langTrigger = page.locator('[aria-label*="语言"], [title*="语言"], .international, .lang-select').first()
  if (await langTrigger.count()) {
    await langTrigger.click()
    await page.waitForTimeout(500)
    const en = page.getByText(/English/i).first()
    if (await en.count()) {
      await en.click()
      await page.waitForTimeout(1000)
      const navText = await page.evaluate(() => document.body.innerText.slice(0, 400))
      const hasEnglish = /Dashboard|System|Home|Workbench/i.test(navText)
      await shot('51-english')
      console.log('I18N switch to EN:', hasEnglish ? 'ok' : 'SUSPECT (still Chinese?)')
      // 切回中文
      await langTrigger.click()
      await page.waitForTimeout(400)
      const zh = page.getByText(/简体中文/).first()
      if (await zh.count()) {
        await zh.click()
        await page.waitForTimeout(600)
      }
    } else {
      console.log('I18N: English option not found after opening dropdown')
    }
  } else {
    console.log('I18N: language trigger not found (selector needs updating)')
  }

  // ===== 5. 命令面板 (Ctrl+K) 动效 =====
  currentTag = 'command-palette'
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(600)
  const paletteVisible = await page
    .locator('.command-palette, [class*="command"], .el-dialog:visible')
    .first()
    .isVisible()
    .catch(() => false)
  await shot('52-command-palette')
  console.log('COMMAND PALETTE (Ctrl+K):', paletteVisible ? 'ok' : 'NOT VISIBLE')
  await page.keyboard.press('Escape')

  // ===== 6. 标签页动效（多开页签 + 关闭）=====
  currentTag = 'tags-view'
  await page.goto(BASE + '/system/user', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.goto(BASE + '/system/role', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const tagCount = await page.locator('.tags-view-item, [class*="tags"] a, [class*="tag-item"]').count()
  await shot('53-tags-view')
  console.log('TAGS VIEW: tag elements =', tagCount)

  // ===== 汇总 =====
  console.log('\n===== SUMMARY =====')
  console.log('Console errors:', consoleErrors.length)
  consoleErrors.slice(0, 10).forEach((e) => console.log('  [CONSOLE]', e.page, '::', e.text))
  console.log('Page errors:', pageErrors.length)
  pageErrors.slice(0, 10).forEach((e) => console.log('  [PAGEERR]', e.page, '::', e.text))
  console.log('Failed requests (>=400):', failedRequests.length)
  failedRequests.slice(0, 15).forEach((e) => console.log('  [HTTP', e.status + ']', e.page, '::', e.url))
} finally {
  await browser.close()
}
