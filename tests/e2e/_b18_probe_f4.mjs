// 探针：audit-dashboard goto networkidle 30s 内的网络活动全录
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const t0 = Date.now()
const events = []
page.on('request', (r) => {
  events.push({ t: ((Date.now() - t0) / 1000).toFixed(1), type: 'REQ', url: r.url().slice(0, 110) })
})
page.on('requestfailed', (r) => {
  events.push({ t: ((Date.now() - t0) / 1000).toFixed(1), type: 'FAIL', url: `${r.url().slice(0, 80)} :: ${r.failure()?.errorText}` })
})
page.on('response', (r) => {
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  if (r.status() >= 400 || (Date.now() - t0 > 5000 && !r.url().includes('favicon'))) {
    events.push({ t: dt, type: `RES${r.status()}`, url: r.url().slice(0, 110) })
  }
})

// 登录态注入：先走一遍 UI 登录拿 cookie
await page.goto('http://localhost:8080/login', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
await page.waitForTimeout(800)
await page.locator('input').nth(0).fill('admin')
await page.locator('input').nth(1).fill('admin123')
await page.getByRole('button', { name: /登\s*录/ }).first().click()
await page.waitForTimeout(2500)

events.length = 0 // 清掉登录期事件，聚焦 dashboard
const t1 = Date.now()
try {
  await page.goto('http://localhost:8080/monitor/audit-dashboard', { waitUntil: 'networkidle', timeout: 30000 })
  console.log('[GOTO networkidle OK in]', ((Date.now() - t1) / 1000).toFixed(1), 's')
} catch (e) {
  console.log('[GOTO TIMEOUT after]', ((Date.now() - t1) / 1000).toFixed(1), 's')
}
// 打印 6s 之后的请求事件（load 完成后仍在动的）
const late = events.filter((e) => parseFloat(e.t) > 6)
console.log('[late events >6s]', JSON.stringify(late.slice(0, 25), null, 1))
console.log('[total events]', events.length)

await browser.close()
