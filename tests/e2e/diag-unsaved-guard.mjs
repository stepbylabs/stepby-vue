// 实测 UX-5 守卫：岗位管理 编辑 → 修改 → 取消 → 应弹"未保存确认"→ 放弃后关闭
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

// 进入岗位管理
await page.goto(`${base}/system/post`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

// 打开编辑（第一行操作列内的"修改"链接按钮；工具栏修改按钮需先勾选行，禁用态）
const editBtn = page.locator('.el-table button:has-text("修改"), .el-table a:has-text("修改")').first()
// 原生 DOM 点击（绕过 playwright actionability 等待——表格 tooltip 层会干扰）
await editBtn.evaluate((el) => (el).click())
await page.waitForTimeout(2500)
console.log('el-dialog total =', await page.locator('.el-dialog').count())
console.log('el-dialog visible =', await page.locator('.el-dialog:visible').count())
await page.screenshot({ path: 'screenshots/diag-post-edit-open.png' })
const dialogVisible = await page.locator('.el-dialog:visible').count()
console.log('dialog visible =', dialogVisible > 0)

// 修改岗位名称（脏）
const nameInput = page.locator('.el-dialog:visible input').nth(1)
await nameInput.fill('岗位名称被修改')
await page.waitForTimeout(300)

// 点取消 → 应出现"尚未保存"确认框（footer 第二个按钮 = 取消）
const cancelBtn = page.locator('.el-dialog:visible .dialog-footer button').nth(1)
await cancelBtn.evaluate((el) => (el).click())
await page.waitForTimeout(800)
const confirmBox = await page.locator('.el-message-box:visible').count()
console.log('unsaved confirm shown =', confirmBox > 0)
await page.screenshot({ path: 'screenshots/diag-unsaved-guard.png' })

// 点"不保存并离开" → 弹窗应关闭
const leaveBtn = page.locator('.el-message-box:visible button:has-text("不保存"), .el-message-box:visible button:has-text("Leave")').first()
if (confirmBox > 0 && (await leaveBtn.count())) {
  await leaveBtn.evaluate((el) => (el).click())
  await page.waitForTimeout(800)
}
const dialogAfter = await page.locator('.el-dialog:visible').count()
console.log('dialog closed after leave =', dialogAfter === 0)
await page.screenshot({ path: 'screenshots/diag-unsaved-guard-after.png' })
await browser.close()
