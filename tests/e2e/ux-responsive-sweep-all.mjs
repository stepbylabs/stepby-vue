// UX-RESPONSIVE-PLAN 阶段二：全路由 × 4 视口普查（Playwright）
// 登录后从侧边栏动态抽取全部可达路由，逐视口逐页截图 + 横向溢出/挤压检测。
// 用法：STEPBY_UI_URL=http://localhost:4173 node ux-responsive-sweep-all.mjs
// 产物：D:/Projects/stepby/.ux-responsive-screens/<vp>/<name>.png + sweep-report.json
import { createRequire } from 'module'
import { mkdirSync, writeFileSync } from 'fs'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SHOT_DIR = process.env.UX_SHOT_DIR || 'D:/Projects/stepby/.ux-responsive-screens'
mkdirSync(SHOT_DIR, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VIEWPORTS = [
  { tag: 'mobile', width: 375, height: 812 },
  { tag: 'tablet-p', width: 768, height: 1024 },
  { tag: 'tablet-air', width: 820, height: 1180 },
  { tag: 'desktop', width: 1366, height: 900 }
]

async function login(page) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await sleep(2000)
  const agree = page.locator('button:has-text("同意")').first()
  if (await agree.isVisible({ timeout: 600 }).catch(() => false)) await agree.click().catch(() => {})
  await page.locator('input[type="text"], .el-input input').first().fill(TEST_USER)
  await page.locator('input[type="password"]').first().fill(TEST_PASS)
  await page.locator('.el-button--primary').first().click()
  await page.waitForURL(/index|dashboard|\/$/, { timeout: 30000 }).catch(() => {})
  await sleep(3000)
  const skip = page.getByRole('button', { name: /跳过|结束|完成|Skip|Done/ }).first()
  if (await skip.count().catch(() => 0)) await skip.click({ timeout: 1200 }).catch(() => {})
  await page
    .evaluate(() => {
      document.querySelectorAll('[class*="tour-mask"], [class*="tour-popover"]').forEach((el) => el.remove())
    })
    .catch(() => {})
}

async function collectRoutes(page) {
  // 展开全部折叠菜单（hover/点击子菜单箭头），然后收集侧边栏全部链接
  const routes = new Set()
  const links = await page.evaluate(() => {
    const out = new Set()
    document.querySelectorAll('.sidebar-container a[href]').forEach((a) => {
      const href = a.getAttribute('href') || ''
      if (href.startsWith('/')) out.add(href)
    })
    return [...out]
  })
  links.forEach((h) => routes.add(h))
  // 展开含子菜单的项（el-sub-menu 标题点击展开再收集一层）
  const titles = page.locator('.sidebar-container .el-sub-menu__title')
  const n = await titles.count().catch(() => 0)
  for (let i = 0; i < Math.min(n, 40); i++) {
    await titles.nth(i).click({ timeout: 800 }).catch(() => {})
    await sleep(120)
  }
  const links2 = await page.evaluate(() => {
    const out = new Set()
    document.querySelectorAll('.sidebar-container a[href]').forEach((a) => {
      const href = a.getAttribute('href') || ''
      if (href.startsWith('/')) out.add(href)
    })
    return [...out]
  })
  links2.forEach((h) => routes.add(h))
  return [...routes].sort()
}

async function inspect(page, vp, name, path) {
  await sleep(1200)
  const m = await page.evaluate(() => {
    const de = document.documentElement
    const wrapper = document.querySelector('.app-wrapper')
    // 找出显著超宽元素（页面级破版信号）
    const widers = []
    document.querySelectorAll('body *').forEach((el, idx) => {
      if (idx > 6000) return
      const r = el.getBoundingClientRect()
      if (Math.ceil(r.width) > de.clientWidth + 4 && r.width > 150) {
        const cls = typeof el.className === 'string' ? el.className : ''
        if (cls.includes('el-table') || cls.includes('scrollbar') || cls.includes('el-scrollbar')) return
        widers.push(`${el.tagName.toLowerCase()}.${cls.slice(0, 50)}:${Math.round(r.width)}`)
      }
    })
    return {
      overflow: de.scrollWidth - de.clientWidth,
      device: wrapper ? wrapper.className.match(/mobile|tablet|desktop/)?.[0] || '(none)' : '?',
      widers: widers.slice(0, 5)
    }
  })
  const safeName = name.replace(/[^a-z0-9-]/gi, '_')
  await page.screenshot({ path: `${SHOT_DIR}/${vp}/${safeName}.png` })
  const ok = m.overflow <= 0
  if (!ok) {
    console.log(`[FAIL] ${vp}/${name} overflow=+${m.overflow}px device=${m.device} ${m.widers.join(' | ')}`)
  }
  return { name, path, overflowPx: m.overflow, device: m.device, widers: m.widers, ok }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const report = { routes: [], viewports: {} }
  try {
    // 先用桌面视口登录并收集全部路由
    const ctx0 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' })
    const p0 = await ctx0.newPage()
    await login(p0)
    report.routes = await collectRoutes(p0)
    await ctx0.close()
    console.log(`ROUTES(${report.routes.length}): ${report.routes.join(' ')}`)

    for (const vp of VIEWPORTS) {
      mkdirSync(`${SHOT_DIR}/${vp.tag}`, { recursive: true })
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'zh-CN' })
      const page = await ctx.newPage()
      await login(page)
      const rows = []
      for (const path of report.routes) {
        const name = path.replace(/^\//, '').replace(/\//g, '-') || 'root'
        try {
          await page.goto(`${UI_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          rows.push(await inspect(page, vp.tag, name, path))
        } catch (e) {
          rows.push({ name, path, error: String(e).slice(0, 100), ok: false })
          console.log(`[ERR ] ${vp.tag}/${name}: ${String(e).slice(0, 80)}`)
        }
      }
      report.viewports[vp.tag] = rows
      const fails = rows.filter((r) => !r.ok).length
      console.log(`===== ${vp.tag}: ${rows.length} pages, ${fails} not-ok =====`)
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
  writeFileSync(`${SHOT_DIR}/sweep-report.json`, JSON.stringify(report, null, 2))
  // 汇总
  for (const [vp, rows] of Object.entries(report.viewports)) {
    const fails = rows.filter((r) => !r.ok)
    console.log(`\n### ${vp}: ${rows.length} pages, ${fails.length} not-ok`)
    fails.forEach((r) => console.log(`  ${r.name} +${r.overflowPx || 'ERR'}px ${r.widers ? r.widers.join(' | ') : r.error || ''}`))
  }
}

main().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
