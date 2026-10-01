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

// 黑块中心点（截图坐标）处的元素链
const info = await page.evaluate(() => {
  const points = [
    [620, 280],
    [620, 450],
    [320, 450],
    [950, 450],
    [620, 700]
  ]
  return points.map(([x, y]) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return { x, y, el: null }
    const chain = []
    let cur = el
    let depth = 0
    while (cur && depth < 6) {
      const cs = getComputedStyle(cur)
      chain.push({
        tag: cur.tagName,
        cls: String(cur.className && cur.className.baseVal !== undefined ? cur.className.baseVal : cur.className).slice(0, 60),
        color: cs.color,
        bg: cs.backgroundColor.slice(0, 30),
        border: `${cs.borderWidth} ${cs.borderColor}`
      })
      cur = cur.parentElement
      depth++
    }
    return { x, y, chain }
  })
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
