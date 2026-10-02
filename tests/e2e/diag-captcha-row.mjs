// 登录页验证码新布局截图验证（PC 1366 + 手机 375）
import { createRequire } from 'module'
import { mkdirSync } from 'fs'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SHOT_DIR = 'D:/Projects/stepby/.ux-responsive-screens/captcha'
mkdirSync(SHOT_DIR, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
for (const vp of [
  { tag: 'desktop-1366', width: 1366, height: 900 },
  { tag: 'mobile-375', width: 375, height: 812 }
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'zh-CN' })
  const page = await ctx.newPage()
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await sleep(2500)
  const agree = page.locator('button:has-text("同意")').first()
  if (await agree.isVisible({ timeout: 600 }).catch(() => false)) await agree.click().catch(() => {})
  await sleep(800)
  await page.screenshot({ path: `${SHOT_DIR}/login-${vp.tag}.png` })
  // 布局断言：输入框与图片同一行（y 重叠）且水平相邻
  const m = await page.evaluate(() => {
    const input = document.querySelector('.el-form-item input[name="captcha"]')
    const img = document.querySelector('.el-form-item img[src*="data:image"], .el-form-item .el-form-item__content img')
    if (!input) return { found: false }
    const ir = input.getBoundingClientRect()
    const el = input.closest('.el-form-item')
    const imgEl = el ? el.querySelector('img') : null
    if (!imgEl) return { found: true, inputRect: { w: Math.round(ir.width) }, imgFound: false }
    const imr = imgEl.getBoundingClientRect()
    return {
      found: true,
      imgFound: true,
      sameRow: Math.abs((ir.top + ir.height / 2) - (imr.top + imr.height / 2)) < 6,
      adjacent: imr.left >= ir.right - 4,
      inputW: Math.round(ir.width),
      imgW: Math.round(imr.width),
      imgH: Math.round(imr.height)
    }
  })
  console.log(`[${vp.tag}]`, JSON.stringify(m))
  await ctx.close()
}
await browser.close()
