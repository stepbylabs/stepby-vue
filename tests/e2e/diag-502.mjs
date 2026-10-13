// 定位 4xx/5xx 资源（UX 巡查捕获的 502 来源）
import { chromium } from 'playwright'

const b = await chromium.launch({ headless: true })
const p = await (await b.newContext({ locale: 'zh-CN' })).newPage()
const bad = []
p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 120)) })
await p.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
await p.locator('input[placeholder="账号"], input[name="username"]').first().fill('admin')
await p.locator('input[type="password"]').first().fill('admin123')
await p.keyboard.press('Enter')
await p.waitForTimeout(4000)
for (const r of ['/index', '/tool/swagger', '/monitor/online', '/system/user', '/dashboard', '/tool/gen']) {
  await p.goto('http://localhost:4173' + r, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1800)
}
console.log(bad.length ? [...new Set(bad)].join('\n') : 'no 4xx/5xx')
await b.close()
