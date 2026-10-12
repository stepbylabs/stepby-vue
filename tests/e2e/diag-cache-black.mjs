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
await sleep(3500)

const info = await page.evaluate(() => {
  // 找视口内最大的黑色元素
  const cands = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 300 || r.height < 300) return
    const cs = getComputedStyle(el)
    if (cs.backgroundColor === 'rgba(0, 0, 0, 0)') return
    // 估算深色背景
    const m = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (m && Number(m[1]) + Number(m[2]) + Number(m[3]) < 200) {
      cands.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 80),
        w: Math.round(r.width),
        h: Math.round(r.height),
        bg: cs.backgroundColor
      })
    }
  })
  return cands.slice(0, 8)
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
