import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()
await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded', timeout: 90000 })
await sleep(2000)
await page.locator('input[type="text"], .el-input input').first().fill('admin')
await page.locator('input[type="password"]').first().fill('admin123')
await page.locator('.el-button--primary').first().click()
await page.waitForURL(/index|dashboard|\/$/, { timeout: 30000 }).catch(() => {})
await sleep(2000)
await page.goto('http://localhost:4173/monitor/cache', { waitUntil: 'domcontentloaded', timeout: 30000 })
await sleep(4000)

const info = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('svg, canvas, div').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width > 400 && r.height > 300) {
      const cs = getComputedStyle(el)
      const isSvg = el.tagName === 'svg' || el.tagName === 'SVG'
      out.push({
        tag: el.tagName,
        cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 70),
        w: Math.round(r.width),
        h: Math.round(r.height),
        border: cs.borderWidth,
        borderColor: cs.borderColor,
        bg: cs.backgroundColor.slice(0, 40),
        parentCls: String(el.parentElement?.className || '').slice(0, 50)
      })
    }
  })
  return out.slice(0, 12)
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
