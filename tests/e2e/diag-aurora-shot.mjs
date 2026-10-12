import { createRequire } from 'module'
import { mkdirSync } from 'fs'
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
  await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await sleep(2500)
  const agree = page.locator('button:has-text("同意")').first()
  if (await agree.isVisible({ timeout: 600 }).catch(() => false)) await agree.click().catch(() => {})
  await sleep(800)
  await page.screenshot({ path: `${SHOT_DIR}/aurora-${vp.tag}.png` })
  console.log('shot:', vp.tag)
  await ctx.close()
}
await browser.close()
