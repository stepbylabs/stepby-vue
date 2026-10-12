// 复刻功能51-5d：多参深链 → 登录 → 回跳，打印每一步 URL（含 tour 预置对照）
import { chromium } from 'playwright'

const B = 'http://localhost:8080'
const deepLink = '/system/user?pageNum=2&deptId=3&tab=staff'
const browser = await chromium.launch({ headless: true })

async function run(label, withTourPreset) {
  const ctx = await browser.newContext()
  if (withTourPreset) {
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('stepby-layout-tour', 'completed')
        localStorage.setItem('workbench-tour', 'completed')
        localStorage.setItem('home-tour', 'completed')
      } catch {}
    })
  }
  const p = await ctx.newPage()
  await p.goto(B + deepLink, { waitUntil: 'networkidle' })
  const onLogin = p.url().includes('/login')
  const redirect = await p.evaluate(() => new URLSearchParams(location.search).get('redirect')).catch(() => null)
  await p.locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]').first().fill('admin')
  await p.locator('input[placeholder="密码"], input[placeholder="Password"], input[type="password"]').first().fill('admin123')
  await p.locator('button:has-text("登 录"), button:has-text("登录"), button[type="submit"], .el-button--primary').first().click()
  await p.waitForURL((u) => u.toString().includes('/system/user'), { timeout: 20000 }).catch(() => {})
  await p.waitForTimeout(1000)
  const finalUrl = p.url()
  const kept = finalUrl.includes('pageNum=2') && finalUrl.includes('deptId=3') && finalUrl.includes('tab=staff')
  console.log(`[${label}] onLogin=${onLogin} redirectIntact=${redirect === deepLink}`)
  console.log(`[${label}] finalUrl=${finalUrl}`)
  console.log(`[${label}] 三参保留=${kept}`)
  await ctx.close()
}

await run('无tour预置', false)
await run('有tour预置', true)
await browser.close()
