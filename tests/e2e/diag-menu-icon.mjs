// 诊断脚本：登录后截取侧边栏与「租户服务」目录展开态（复用 main.mjs 登录选择器）
import { chromium } from 'playwright'
import process from 'node:process'

const base = process.env.TEST_BASE || 'http://localhost:4173'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()
await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)
const userInput = page
  .locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]')
  .first()
await userInput.waitFor({ timeout: 15000 })
await userInput.fill('admin')
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForTimeout(4500)
await page.screenshot({ path: 'screenshots/diag-sidebar-all.png' })
const tenantSpace = page.getByText('租户服务', { exact: true }).first()
if (await tenantSpace.count()) {
  await tenantSpace.click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'screenshots/diag-sidebar-tenantspace.png' })
}
const svgCount = await page.locator('.sidebar-container svg, aside svg').count()
console.log('sidebar svg count =', svgCount)
// 检查「租户服务」子项是否带 svg
const myDomainRow = page.locator('li:has-text("域名管理"), li:has-text("我的域名")').first()
if (await myDomainRow.count()) {
  const hasSvg = await myDomainRow.locator('svg').count()
  console.log('my-domain row svg count =', hasSvg)
}
await browser.close()
