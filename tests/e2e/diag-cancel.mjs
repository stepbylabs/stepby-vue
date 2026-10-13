// 复现功能57取消流程：新增任务 → 生成表达式 → 确定 → 点取消 → 检查对话框状态
import { chromium } from 'playwright'

const BASE = 'http://localhost:8080'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="text"]', 'admin')
await page.fill('input[type="password"]', 'admin123')
await Promise.all([
  page.waitForURL(/index/, { timeout: 15000 }).catch(() => {}),
  page.keyboard.press('Enter')
])
await page.waitForTimeout(2000)
// 禁用新手引导（e2e 无人值守）
await page.evaluate(() => {
  localStorage.setItem('stepby-layout-tour', 'completed')
  localStorage.setItem('workbench-tour', 'completed')
  localStorage.setItem('home-tour', 'completed')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

await page.goto(BASE + '/monitor/job', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

// 打开新增
await page.locator('.el-button:visible').filter({ hasText: /^\s*新\s*增\s*$/ }).first().click()
const dlg = page.locator('.el-dialog:visible').filter({ has: page.locator('button:has-text("生成表达式")') }).first()
console.log('任务对话框打开 =', await dlg.isVisible({ timeout: 5000 }).catch(() => false))

// 生成表达式
await dlg.locator('button:has-text("生成表达式")').first().click()
await page.waitForTimeout(1000)
const genCount = await page.locator('.el-dialog:visible').count()
console.log('可见对话框数（打开生成器后）=', genCount)

// 生成器确定
const genDlg = page.locator('.el-dialog:visible').filter({ hasText: 'Cron表达式生成器' }).last()
await genDlg.locator('button:has-text("确 定"), button:has-text("确定")').last().click()
await page.waitForTimeout(800)
console.log('确定后可见对话框数 =', await page.locator('.el-dialog:visible').count())

// 数一下 dlg 容器内的取消按钮
const cancelInDlg = await dlg.locator('button:has-text("取 消"), button:has-text("取消")').count()
console.log('dlg 容器内取消按钮数 =', cancelInDlg)
// 全页取消按钮
const cancelAll = await page.locator('.el-dialog:visible button:has-text("取 消"), .el-dialog:visible button:has-text("取消")').count()
console.log('全页可见取消按钮数 =', cancelAll)

// 点取消（模拟测试的 .last()）
await dlg.locator('button:has-text("取 消"), button:has-text("取消")').last().click()
await page.waitForTimeout(600)
const stillVisible = await dlg.isVisible().catch(() => false)
const allVisible = await page.locator('.el-dialog:visible').count()
console.log(`点取消后: dlg.isVisible=${stillVisible}, 全页对话框数=${allVisible}`)
await page.screenshot({ path: 'screenshots/diag-cancel.png' })

await browser.close()
