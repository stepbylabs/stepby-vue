/**
 * F123 动作序列复现探针：进 profile → 切 MFA tab → 生成密钥，抓 IMG 失败。
 * 一次性诊断脚本（批六十四循环），取证后删除。
 */
import { chromium } from 'playwright'
const B = 'http://localhost:8080'
const cap = await fetch(`${B}/captchaImage`).then((r) => r.json())
const login = await fetch(`${B}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123', code: 'x', uuid: cap.uuid }) }).then((r) => r.json())
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name: 'Admin-Token', value: login.token, url: B }])
const page = await ctx.newPage()
await page.addInitScript(() => {
  localStorage.setItem('stepby-layout-tour', 'completed')
  localStorage.setItem('workbench-tour', 'completed')
  localStorage.setItem('home-tour', 'completed')
})
const imgFails = []
page.on('requestfailed', (r) => {
  if (r.resourceType() === 'image') imgFails.push({ url: r.url(), failure: r.failure()?.errorText, t: new Date().toISOString().slice(11, 19) })
})
page.on('response', (r) => {
  if (r.request().resourceType() === 'image' && r.status() >= 400) imgFails.push({ url: r.url(), status: r.status() })
})

await page.goto(`${B}/user/profile`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(2500)
console.log('step0 after load, fails=', imgFails.length)

// 切 MFA tab（steps / tab 切换——F123 同款）
const mfaTab = page.getByRole('tab', { name: /MFA|安全|MFA|两步/i }).first()
const tabOk = await mfaTab.isVisible({ timeout: 5000 }).catch(() => false)
if (tabOk) {
  await mfaTab.click().catch(() => {})
  await page.waitForTimeout(1500)
  console.log('step1 after MFA tab, fails=', imgFails.length)
  // 点生成密钥
  const genBtn = page.getByRole('button', { name: /生成密钥|生成/ }).first()
  if (await genBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await genBtn.click().catch(() => {})
    await page.waitForTimeout(2500)
    console.log('step2 after generate, fails=', imgFails.length)
  } else {
    console.log('gen button not visible')
  }
} else {
  console.log('mfa tab not found; tabs=', await page.getByRole('tab').allInnerTexts().catch(() => []))
}
console.log('IMG FAILS:', JSON.stringify(imgFails, null, 1))
await browser.close()
