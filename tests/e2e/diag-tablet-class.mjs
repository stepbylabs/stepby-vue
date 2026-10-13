// 诊断：wrapper class 随时间的变化时序（定位谁把 sidebar 重新打开）
import { createRequire } from 'module'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, locale: 'zh-CN' })
  const page = await ctx.newPage()
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await sleep(1500)
  const agree = page.locator('button:has-text("同意")').first()
  if (await agree.isVisible({ timeout: 600 }).catch(() => false)) await agree.click().catch(() => {})
  await page.locator('input[type="text"], .el-input input').first().fill(TEST_USER)
  await page.locator('input[type="password"]').first().fill(TEST_PASS)
  await page.locator('.el-button--primary').first().click()
  await page.waitForURL(/index|dashboard|\/$/, { timeout: 30000 }).catch(() => {})
  for (let i = 0; i < 20; i++) {
    const cls = await page.evaluate(() => {
      const w = document.querySelector('.app-wrapper')
      const s = document.querySelector('.sidebar-container')
      return {
        cls: w ? w.className.replace('app-wrapper relative h-full w-full', '').trim() : '(none)',
        sw: s ? Math.round(s.getBoundingClientRect().width) : 0,
        iw: window.innerWidth
      }
    })
    console.log(`t=${i * 300}ms  [${cls.cls}]  sidebarW=${cls.sw}  innerWidth=${cls.iw}`)
    await sleep(300)
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
