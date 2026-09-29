/**
 * U4 富文本编辑器（Quill，`components/Editor`）**键盘可达性 / 可访问名称**的浏览器级回归（真实后端 + 真实浏览器）
 *
 * ── 为什么单独成文 ──
 * `main.mjs`（15k 行）只覆盖功能行为，不覆盖无障碍；而 Quill 的可访问名称是**运行时**由
 * `Editor/index.vue` 命令式注入的（`applyEditorA11y`），只有真实渲染后才能验证。
 *
 * ── 实测基线（修复前，Chromium，2026-09-28）──
 *   ① `.ql-editor`：无 `role` / 无 `aria-label` / 无 `aria-multiline`，`tabIndex = -1`；
 *   ② `.ql-picker-label`（字号/标题/字体/颜色/背景/对齐 6 个下拉）：`role="button"` + `tabindex="0"`
 *      但**无可访问名称**；
 *   ③ `.ql-toolbar`：有 `role="toolbar"` 但无名称；按钮的 `aria-label` 是 Quill 硬编码英文。
 * 本脚本断言**修复后**的状态，其中"按钮名称不得仍是 Quill 英文原值"是可证伪的关键断言
 * （若本地化被移除即变红）。
 *
 * ── 运行（后端 embedded :8080 在跑；`sys.account.captchaEnabled=false` 时无需读验证码）──
 *   PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" \
 *   STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
 *   STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
 *   node editor-a11y.mjs      # 期望「总计 N 通过，0 失败」EXIT=0
 */

import { createRequire } from 'module'
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs'
import { capturePageCaptcha, fillCaptchaOnPage } from './e2e/run/auth.mjs'

const require = createRequire(import.meta.url)

let chromium
try {
  chromium = require('playwright').chromium
} catch (_) {
  const { execSync } = require('child_process')
  const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
  const globalRequire = createRequire(`file://${globalRoot}/_`)
  chromium = globalRequire('playwright').chromium
}

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.STEPBY_UI_URL || BASE_URL
const USER_INPUT_SEL =
  'input[placeholder="账号"], input[placeholder="Username"], input[name="username"]'
const LOGIN_BTN_SEL =
  'button:has-text("登 录"), button:has-text("登录"), button:has-text("Login"), button[type="submit"]'

/** Quill 未本地化时按钮上的英文原值 —— 修复后**不得**再出现（可证伪断言） */
const QUILL_RAW_LABELS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'blockquote',
  'code-block',
  'list: ordered',
  'list: bullet',
  'indent: -1',
  'indent: +1',
  'clean',
  'link',
  'image',
  'video'
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

let passCount = 0
let failCount = 0

function check(name, cond, detail = '') {
  if (cond) {
    passCount += 1
    log(`  ✅ PASS ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failCount += 1
    log(`  ❌ FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
  return cond
}

/** 登录（真实表单；验证码开启时经 redis 读真码） */
async function passwordLogin(page) {
  const captchaP = capturePageCaptcha(page)
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.locator(USER_INPUT_SEL).first().waitFor({ state: 'visible', timeout: 20000 })
  const captcha = await captchaP
  await page.locator(USER_INPUT_SEL).first().fill(TEST_USER)
  await page.locator('input[type="password"]').first().fill(TEST_PASS)
  await fillCaptchaOnPage(page, captcha)
  await page.locator(LOGIN_BTN_SEL).first().click()
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {})
  await sleep(1200)
}

/**
 * 反复按 Tab（或 `backward` 时按 Shift+Tab）直到 `document.activeElement` 命中给定选择器。
 * 用**真实键盘事件**移动焦点（而非 `element.focus()`），这样 `:focus-visible` 才会生效 ——
 * 这正是"焦点可见指示"断言成立的前提。
 */
async function tabUntil(page, selector, maxTabs = 80, backward = false) {
  for (let i = 0; i < maxTabs; i++) {
    const hit = await page.evaluate((sel) => {
      const el = document.activeElement
      if (!el) return false
      return el.matches(sel) || !!el.closest(sel)
    }, selector)
    if (hit) return true
    await page.keyboard.press(backward ? 'Shift+Tab' : 'Tab')
    await sleep(40)
  }
  return false
}

async function main() {
  log(`=== U4 富文本编辑器键盘可达性 e2e（前端 ${FRONTEND_URL}）===`)
  const browser = await chromium.launch({ headless: true })
  let exitCode = 1
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    // 预置新手引导已完成标记，避免遮罩拦截点击（与 main.mjs 的 skipTour 同效但更确定）
    await page.addInitScript(() => localStorage.setItem('stepby-layout-tour', 'skipped'))

    await passwordLogin(page)
    check('登录成功（离开 /login）', !page.url().includes('/login'), `url=${page.url()}`)

    // 打开「公告管理 → 新增」，该弹窗内含富文本编辑器
    await page.goto(`${FRONTEND_URL}/system/notice`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await sleep(1500)
    await page.locator('button:has-text("新增")').first().click()
    await page.locator('.el-dialog:visible').first().waitFor({ state: 'visible', timeout: 15000 })
    await sleep(1500)

    // ==================== S1：编辑区语义与可访问名称 ====================
    log('--- S1：编辑区（role / 名称 / 多行 / Tab 可达） ---')
    const editor = await page.evaluate(() => {
      const el = document.querySelector('.ql-editor')
      if (!el) return null
      return {
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaMultiline: el.getAttribute('aria-multiline'),
        ariaPlaceholder: el.getAttribute('aria-placeholder'),
        tabindex: el.getAttribute('tabindex'),
        contenteditable: el.getAttribute('contenteditable')
      }
    })
    check('S1 编辑区存在', !!editor)
    check('S1 编辑区 role=textbox', editor?.role === 'textbox', `role=${editor?.role}`)
    check('S1 编辑区 aria-multiline=true', editor?.ariaMultiline === 'true')
    check(
      'S1 编辑区有非空可访问名称',
      !!editor?.ariaLabel && editor.ariaLabel.trim().length > 0,
      `aria-label=${editor?.ariaLabel}`
    )
    check(
      'S1 编辑区 aria-placeholder 非空（与 placeholder 同源）',
      !!editor?.ariaPlaceholder && editor.ariaPlaceholder.trim().length > 0,
      `aria-placeholder=${editor?.ariaPlaceholder}`
    )
    check('S1 编辑区 tabindex=0（Tab 可达）', editor?.tabindex === '0', `tabindex=${editor?.tabindex}`)

    // ==================== S2：工具栏区域 + 按钮名称（本地化） ====================
    log('--- S2：工具栏区域与按钮可访问名称（须已本地化） ---')
    const toolbar = await page.evaluate(() => {
      const tb = document.querySelector('.ql-toolbar')
      if (!tb) return null
      return {
        role: tb.getAttribute('role'),
        ariaLabel: tb.getAttribute('aria-label'),
        buttons: [...tb.querySelectorAll('button')].map((b) => ({
          cls: b.className,
          aria: (b.getAttribute('aria-label') || '').trim(),
          title: (b.getAttribute('title') || '').trim()
        }))
      }
    })
    check('S2 工具栏区域存在且 role=toolbar', toolbar?.role === 'toolbar')
    check(
      'S2 工具栏区域有非空可访问名称',
      !!toolbar?.ariaLabel && toolbar.ariaLabel.trim().length > 0,
      `aria-label=${toolbar?.ariaLabel}`
    )
    const buttons = toolbar?.buttons ?? []
    check('S2 工具栏按钮已渲染', buttons.length > 0, `count=${buttons.length}`)
    const unnamed = buttons.filter((b) => !b.aria)
    check('S2 所有工具栏按钮均有非空可访问名称', unnamed.length === 0, `无名=${unnamed.length}`)
    const notTitled = buttons.filter((b) => !b.title)
    check('S2 所有工具栏按钮均有 title（鼠标提示与读屏同一套措辞）', notTitled.length === 0, `无 title=${notTitled.length}`)
    const stillRaw = buttons.filter((b) => QUILL_RAW_LABELS.includes(b.aria))
    check(
      'S2 按钮名称已本地化（不得再是 Quill 英文原值）',
      stillRaw.length === 0,
      stillRaw.length ? `仍为英文: ${stillRaw.map((b) => b.aria).join(', ')}` : '全部本地化'
    )

    // ==================== S3：下拉控件（picker）名称 ====================
    log('--- S3：字号/标题/字体/颜色/背景/对齐 下拉的可访问名称 ---')
    const pickers = await page.evaluate(() => {
      const list = [...document.querySelectorAll('.ql-toolbar .ql-picker')]
      return list.map((p) => ({
        type: [...p.classList].find(
          (c) => c.startsWith('ql-') && !['ql-picker', 'ql-expanded', 'ql-picking'].includes(c)
        ),
        label: (p.querySelector('.ql-picker-label')?.getAttribute('aria-label') || '').trim(),
        items: [...p.querySelectorAll('.ql-picker-item')].map((i) => ({
          value: i.dataset.value ?? '',
          aria: (i.getAttribute('aria-label') || '').trim()
        }))
      }))
    })
    check(
      'S3 渲染出 5 个下拉（字号/标题/颜色/背景/对齐 —— 工具栏未配置 font）',
      pickers.length === 5,
      `count=${pickers.length}, types=${pickers.map((p) => p.type).join(',')}`
    )
    const wantTypes = ['ql-size', 'ql-header', 'ql-color', 'ql-background', 'ql-align']
    const missingTypes = wantTypes.filter((tp) => !pickers.some((p) => p.type === tp))
    check('S3 下拉类型齐备', missingTypes.length === 0, missingTypes.join(',') || '齐备')
    const labelMissing = pickers.filter((p) => !p.label)
    check(
      'S3 每个下拉控件的 label 都有非空可访问名称',
      labelMissing.length === 0,
      labelMissing.length ? `无名下拉: ${labelMissing.map((p) => p.type).join(', ')}` : '全部具名'
    )
    const itemMissing = pickers.flatMap((p) => p.items.filter((i) => !i.aria).map((i) => `${p.type}:${i.value}`))
    check(
      'S3 下拉项（含纯色块的颜色/背景项）均有非空可访问名称',
      itemMissing.length === 0,
      itemMissing.length ? `无名项: ${itemMissing.slice(0, 8).join(', ')}` : '全部具名'
    )

    // ==================== S4：键盘可达 + 可见焦点 ====================
    log('--- S4：键盘 Tab 可达 + focus-visible 可见焦点 ---')
    const ed = page.locator('.ql-editor').first()
    await ed.click()
    await page.keyboard.type('快捷键可达性验证')
    const typed = await page.evaluate(() => document.querySelector('.ql-editor')?.textContent ?? '')
    check('S4 编辑区可用键盘输入', typed.includes('快捷键可达性验证'), `text=${JSON.stringify(typed.slice(0, 40))}`)

    // 先让焦点落在编辑区内，再用**反向 Tab（Shift+Tab）**移动到紧邻其前的工具栏控件
    await ed.click()
    await page.keyboard.press('End').catch(() => {})
    const reachedToolbar = await tabUntil(page, '.ql-toolbar button', 30, true)
    check('S4 纯键盘（Shift+Tab）可达工具栏按钮', reachedToolbar)
    if (reachedToolbar) {
      const focused = await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return null
        const cs = getComputedStyle(el)
        return {
          cls: el.className,
          aria: (el.getAttribute('aria-label') || '').trim(),
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth
        }
      })
      check(
        'S4 键盘聚焦的工具栏按钮有可见焦点指示（focus-visible 生效）',
        focused?.outlineStyle !== 'none' && parseFloat(focused?.outlineWidth || '0') > 0,
        `outline=${focused?.outlineStyle} ${focused?.outlineWidth}, cls=${focused?.cls}`
      )
      check('S4 键盘聚焦的按钮带可访问名称', !!focused?.aria, `aria-label=${focused?.aria}`)
    }

    // 键盘**激活**（不只是可达）：全选后用 Enter 触发"加粗" ⇒ 内容应被 <strong> 包裹
    await page.locator('.ql-editor').first().click()
    await page.keyboard.press('Control+A')
    await page.locator('.ql-toolbar button.ql-bold').first().focus()
    await page.keyboard.press('Enter')
    await sleep(400)
    const boldHtml = await page.evaluate(() => document.querySelector('.ql-editor')?.innerHTML ?? '')
    check(
      'S4 键盘 Enter 可激活工具栏按钮（加粗真的生效）',
      /(<strong>|<b>)/i.test(boldHtml),
      `html=${boldHtml.slice(0, 90)}`
    )

    await context.close().catch(() => {})
    exitCode = failCount > 0 ? 1 : 0
  } catch (err) {
    failCount += 1
    log(`  ❌ FAIL 未捕获异常：${err && err.stack ? err.stack : err}`)
    exitCode = 1
  } finally {
    await browser.close().catch(() => {})
  }

  log('============================================')
  log(`总计 ${passCount} 通过，${failCount} 失败`)
  log('============================================')
  process.exit(exitCode)
}

main()
