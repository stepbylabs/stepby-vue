// 诊断：登录后依次访问 dashboard / PAT / AI 面板，收集 console error 与关键元素
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:8080'
const shots = path.resolve('screenshots')
fs.mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 300)}`))

// 登录
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.fill('input[aria-label*="用户名"], input[placeholder*="账号"], input[type="text"]', 'admin')
await page.fill('input[type="password"]', 'admin123')
await Promise.all([
  page.waitForURL(/index|dashboard/, { timeout: 15000 }).catch(() => {}),
  page.keyboard.press('Enter')
])
await page.waitForTimeout(2000)
console.log('after login url =', page.url())

const targets = [
  ['/system/dashboard', '仪表盘', 'canvas'],
  ['/monitor/pat', 'PAT', 'el-table, .el-card, main'],
  ['/ai/panel', 'AI面板', 'textarea, .el-textarea']
]

for (const [route, name, selector] of targets) {
  errors.length = 0
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 })
  } catch (e) {
    errors.push(`[goto] ${String(e).slice(0, 150)}`)
  }
  await page.waitForTimeout(2500)
  const found = await page.locator(selector).first().isVisible().catch(() => false)
  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 80).replace(/\n/g, ' ')
  console.log(`\n== ${name} (${route}) == rendered=${found}`)
  console.log('   body:', bodyText)
  for (const e of errors.slice(0, 5)) console.log('   ', e)
  await page.screenshot({ path: path.join(shots, `diag-${name}.png`) })
}

await browser.close()
