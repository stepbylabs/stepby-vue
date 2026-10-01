// UX-RESPONSIVE-PLAN 阶段三核查：D8 卡片模式 + D10 横竖屏
// D8：375px 下开启 userPrefs.mobileTableCards，截图用户列表（卡片模式）vs 关闭（横滚）
// D10：tablet 768 竖→1024 横、mobile 375 竖→812 横，断言 device 档位切换与无溢出
import { createRequire } from 'module'
import { mkdirSync, writeFileSync } from 'fs'
import { TEST_USER, TEST_PASS, UI_URL } from './test-config.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SHOT_DIR = process.env.UX_SHOT_DIR || 'D:/Projects/stepby/.ux-responsive-screens'
mkdirSync(`${SHOT_DIR}/phase3`, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []

async function login(page) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await sleep(2000)
  const agree = page.locator('button:has-text("同意")').first()
  if (await agree.isVisible({ timeout: 600 }).catch(() => false)) await agree.click().catch(() => {})
  await page.locator('input[type="text"], .el-input input').first().fill(TEST_USER)
  await page.locator('input[type="password"]').first().fill(TEST_PASS)
  await page.locator('.el-button--primary').first().click()
  await page.waitForURL(/index|dashboard|\/$/, { timeout: 30000 }).catch(() => {})
  await sleep(2500)
  const skip = page.getByRole('button', { name: /跳过|结束|完成|Skip|Done/ }).first()
  if (await skip.count().catch(() => 0)) await skip.click({ timeout: 1200 }).catch(() => {})
  await page
    .evaluate(() => {
      document.querySelectorAll('[class*="tour-mask"], [class*="tour-popover"]').forEach((el) => el.remove())
    })
    .catch(() => {})
}

async function probe(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const wrapper = document.querySelector('.app-wrapper')
    return {
      overflow: de.scrollWidth - de.clientWidth,
      device: wrapper ? wrapper.className.match(/mobile|tablet|desktop/)?.[0] || 'desktop' : '?',
      cardsOn: document.documentElement.classList.contains('mobile-table-cards-on'),
      labelledTds: document.querySelectorAll('td[data-label]').length
    }
  })
}

async function main() {
  const browser = await chromium.launch({ headless: true })

  // ===== D8：卡片模式 on/off 对比（375px 用户列表）=====
  for (const cards of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'zh-CN' })
    await ctx.addInitScript((on) => {
      window.addEventListener('DOMContentLoaded', () => {
        try {
          const raw = JSON.parse(localStorage.getItem('user-prefs') || '{}')
          raw.mobileTableCards = on
          localStorage.setItem('user-prefs', JSON.stringify(raw))
        } catch {}
      })
    }, cards)
    const page = await ctx.newPage()
    await login(page)
    await page.goto(`${UI_URL}/system/user`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await sleep(3000)
    const info = await probe(page)
    const tag = cards ? 'cards-on' : 'cards-off'
    await page.screenshot({ path: `${SHOT_DIR}/phase3/d8-userlist-${tag}.png` })
    const ok = info.overflow <= 0 && info.cardsOn === cards
    results.push({ case: `D8 ${tag}`, ...info, ok })
    console.log(`[${ok ? 'PASS' : 'FAIL'}] D8 ${tag}: cardsOn=${info.cardsOn} labelledTds=${info.labelledTds} overflow=+${info.overflow}`)
    // 卡片模式下再开一个 Dialog 表单截图（卡片模式不影响弹层）
    if (cards) {
      const addBtn = page.locator('button:has-text("新增")').first()
      if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addBtn.click().catch(() => {})
        await sleep(1500)
        await page.screenshot({ path: `${SHOT_DIR}/phase3/d8-userlist-cards-on-dialog.png` })
        console.log(`[INFO] D8 dialog screenshot taken`)
      }
    }
    await ctx.close()
  }

  // ===== D10：横竖屏切换 =====
  const rotations = [
    { tag: 'tablet', portrait: { width: 768, height: 1024 }, landscape: { width: 1024, height: 768 }, expectPortrait: 'tablet', expectLandscape: 'desktop' },
    { tag: 'mobile', portrait: { width: 375, height: 812 }, landscape: { width: 812, height: 375 }, expectPortrait: 'mobile', expectLandscape: 'tablet' }
  ]
  for (const r of rotations) {
    const ctx = await browser.newContext({ viewport: r.portrait, locale: 'zh-CN' })
    const page = await ctx.newPage()
    await login(page)
    await page.goto(`${UI_URL}/index`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await sleep(2000)
    const p = await probe(page)
    await page.screenshot({ path: `${SHOT_DIR}/phase3/d10-${r.tag}-portrait.png` })
    await page.setViewportSize(r.landscape)
    await sleep(1200)
    const l = await probe(page)
    await page.screenshot({ path: `${SHOT_DIR}/phase3/d10-${r.tag}-landscape.png` })
    const ok =
      p.device === r.expectPortrait && l.device === r.expectLandscape && p.overflow <= 0 && l.overflow <= 0
    results.push({ case: `D10 ${r.tag}`, portrait: p, landscape: l, ok })
    console.log(
      `[${ok ? 'PASS' : 'FAIL'}] D10 ${r.tag}: portrait=${p.device}(${p.overflow}) -> landscape=${l.device}(${l.overflow}) ` +
        `expect ${r.expectPortrait}->${r.expectLandscape}`
    )
    await ctx.close()
  }

  await browser.close()
  writeFileSync(`${SHOT_DIR}/phase3/report.json`, JSON.stringify(results, null, 2))
  const fails = results.filter((r) => !r.ok).length
  console.log(`\n===== PHASE3 SUMMARY: ${results.length - fails}/${results.length} PASS =====`)
  process.exit(fails ? 1 : 0)
}

main().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
