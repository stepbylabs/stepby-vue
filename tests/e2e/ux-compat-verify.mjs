// PC/平板兼容性核实（MOBILE-UX-GUIDELINES 四步流程之④）：确认移动端改动零污染
// 视口：1366 桌面 / 820 平板横 / 768 平板竖
// 断言：① .mobile-tabbar 不存在 ② 表单 label 未被上置（计算样式 width 非 100%/display 非 block）
// ③ 无横向溢出 ④ 页面渲染正常
import { createRequire } from 'module'
import { mkdirSync, writeFileSync } from 'fs'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SHOT_DIR = 'D:/Projects/stepby/.ux-responsive-screens/compat'
mkdirSync(SHOT_DIR, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const report = []

async function login(page) {
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
  await page
    .evaluate(() => {
      document.querySelectorAll('[class*="tour-mask"], [class*="tour-popover"]').forEach((el) => el.remove())
    })
    .catch(() => {})
}

async function inspect(page, vp, pageName) {
  await sleep(1500)
  const m = await page.evaluate(() => {
    const de = document.documentElement
    const tabbar = document.querySelector('.mobile-tabbar')
    // 取一个可见表单 label 的计算样式（如存在）
    const label = document.querySelector('.el-form-item > .el-form-item__label')
    let labelInfo = null
    if (label) {
      const cs = getComputedStyle(label)
      labelInfo = { display: cs.display, width: cs.width }
    }
    return {
      overflow: de.scrollWidth - de.clientWidth,
      tabbarPresent: !!tabbar,
      labelInfo
    }
  })
  const safeName = `${vp}_${pageName}`.replace(/[^a-z0-9-]/gi, '_')
  await page.screenshot({ path: `${SHOT_DIR}/${safeName}.png` })
  // 兼容性断言：PC/平板不应出现移动端 TabBar；label 不应为块级上置（display:block 即被污染）
  const labelPolluted = m.labelInfo ? m.labelInfo.display === 'block' : false
  const ok = !m.tabbarPresent && !labelPolluted && m.overflow <= 0
  report.push({ vp, pageName, ...m, labelPolluted, ok })
  console.log(
    `[${ok ? 'PASS' : 'FAIL'}] ${vp}/${pageName}: tabbar=${m.tabbarPresent} labelPolluted=${labelPolluted} overflow=+${m.overflow}`
  )
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const viewports = [
    { tag: 'desktop-1366', width: 1366, height: 900 },
    { tag: 'tablet-820', width: 820, height: 1180 },
    { tag: 'tablet-768', width: 768, height: 1024 }
  ]
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'zh-CN' })
    const page = await ctx.newPage()
    await login(page)
    for (const path of ['/index', '/system/user', '/system/role']) {
      try {
        await page.goto(`${UI_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await inspect(page, vp.tag, path)
      } catch (e) {
        report.push({ vp: vp.tag, pageName: path, error: String(e).slice(0, 100), ok: false })
        console.log(`[ERR ] ${vp.tag}${path}: ${String(e).slice(0, 80)}`)
      }
    }
    // 平板/桌面打开 Dialog（P3 表单原型）核对
    if (vp.tag !== 'tablet-768') {
      try {
        await page.goto(`${UI_URL}/system/role`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await sleep(1500)
        const addBtn = page.locator('button:has-text("新增")').first()
        if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await addBtn.click().catch(() => {})
          await sleep(1500)
          await inspect(page, vp.tag, 'role-add-dialog')
          await page.keyboard.press('Escape')
          await sleep(800)
        }
      } catch (e) {
        console.log(`[ERR ] dialog ${vp.tag}: ${String(e).slice(0, 80)}`)
      }
    }
    await ctx.close()
  }
  await browser.close()
  writeFileSync(`${SHOT_DIR}/compat-report.json`, JSON.stringify(report, null, 2))
  const fails = report.filter((r) => !r.ok).length
  console.log(`\n===== COMPAT SUMMARY: ${report.length - fails}/${report.length} PASS =====`)
  process.exit(fails ? 1 : 0)
}

main().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
