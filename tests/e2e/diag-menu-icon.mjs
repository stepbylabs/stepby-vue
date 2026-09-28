// 诊断：侧边栏全展开截图 + 菜单管理页面截图（icon 匹配问题取证）
import { chromium } from 'playwright'
import process from 'node:process'

const base = process.env.TEST_BASE || 'http://localhost:4173'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })
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

// 展开侧边栏全部目录（点击每个 el-sub-menu__title）
const titles = page.locator('.sidebar-container .el-sub-menu__title')
const n = await titles.count()
for (let i = 0; i < n; i++) {
  await titles.nth(i).click({ force: true }).catch(() => {})
  await page.waitForTimeout(200)
}
await page.waitForTimeout(600)
await page.screenshot({ path: 'screenshots/diag-sidebar-full.png' })

// 菜单管理页面
await page.goto(`${base}/system/menu`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'screenshots/diag-menu-page.png' })

// 租户服务目录展开 + 我的导航页
await page.goto(`${base}/tenant-space/my-nav`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'screenshots/diag-my-nav.png' })
await browser.close()
