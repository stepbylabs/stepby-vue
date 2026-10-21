// stepby-vue/tests/e2e/a11y-full.mjs
// 全站无障碍（a11y）E2E 巡检：逐路由检查键盘名称、交互控件名称、图片 alt、
// 表单标签、标题层级、页面语言、语义地标，以及两个可证伪的文本可见性强信号。
//
// 用法（PowerShell）：
//   $env:STEPBY_TEST_USER="admin"; $env:STEPBY_TEST_PASS="admin123"; node tests/e2e/a11y-full.mjs
//   node tests/e2e/a11y-full.mjs --route=/system/user
//   node tests/e2e/a11y-full.mjs --limit=8
//
// 退出码：0 = 无 FAIL；1 = 存在 FAIL、登录/运行异常或参数错误。

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import process from 'node:process'
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs'
import { capturePageCaptcha, fillCaptchaOnPage } from './e2e/run/auth.mjs'
import { ROUTES } from './route-list.mjs'
import { assertFreshServedApp } from './build-freshness.mjs'

const require = createRequire(import.meta.url)
let chromium
try {
  chromium = require('playwright').chromium
} catch {
  // 与 main.mjs / editor-a11y.mjs 一致：本仓未安装时回退到全局 playwright。
  const { execSync } = require('node:child_process')
  const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
  const globalRequire = createRequire(`file://${globalRoot}/_`)
  chromium = globalRequire('playwright').chromium
}

const HERE = dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = join(HERE, 'screenshots')
const LOG_PATH = join(HERE, '_a11y_r22.log')
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.STEPBY_UI_URL || BASE_URL
const PAGE_SETTLE_MS = 1200
// 键盘遍历上限：20 在 56 条路由上全部饱和（实际遍历=20/20），无法区分
// 「页面交互元素恰好≤20」与「被上限截断」。提到 60 以覆盖典型 CRUD 页
// （工具栏 + 表格行内按钮 + 分页器），同时保留 presses<LIMIT*2 的兜底防死循环。
const TAB_LIMIT = 60

// 路由清单来自 ./route-list.mjs（单一事实源）：此前这里内联复制了 collect-warnings 的 57 条清单，
// 加页面时采集面与无障碍面必然漂移（一边扫 58、一边仍扫 57，两边汇总都正常）。

const CHECK_NAMES = [
  '键盘可达性（前 20 个焦点）',
  '交互元素可访问名称',
  '图片 alt 属性',
  '表单控件标签关联',
  '标题层级',
  '页面语言',
  '语义地标',
  '前景色与背景色不同',
  '正文文本字号不小于 12px'
]

const results = []
const issueCountsByRoute = new Map()

mkdirSync(SCREENSHOT_DIR, { recursive: true })
writeFileSync(LOG_PATH, '', 'utf-8')

function log(message = '') {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  appendFileSync(LOG_PATH, `${line}\n`, 'utf-8')
}

function record(route, name, passed, detail = '') {
  const entry = { route, name, passed, detail }
  results.push(entry)
  log(`${passed ? 'PASS' : 'FAIL'} [${route}] ${name}${detail ? ` - ${detail}` : ''}`)
  return entry
}

function setIssueCount(route, name, count) {
  if (!issueCountsByRoute.has(route)) issueCountsByRoute.set(route, {})
  issueCountsByRoute.get(route)[name] = count
}

function parseArgs(argv) {
  let route = null
  let limit = null

  for (const arg of argv) {
    if (arg.startsWith('--route=')) {
      route = arg.slice('--route='.length).trim()
      continue
    }
    if (arg.startsWith('--limit=')) {
      const raw = arg.slice('--limit='.length).trim()
      limit = Number(raw)
      if (!Number.isInteger(limit) || limit < 1) throw new Error(`--limit 必须是正整数，实际为 ${JSON.stringify(raw)}`)
      continue
    }
    throw new Error(`未知参数：${arg}`)
  }

  if (route) {
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('://')) {
      throw new Error(`--route 必须是站内绝对路径，例如 /system/user；实际为 ${JSON.stringify(route)}`)
    }
    return { routes: [route], route, limit }
  }

  return { routes: limit === null ? ROUTES : ROUTES.slice(0, limit), route, limit }
}

function formatEvidence(items, count, fallbackItems = []) {
  const evidence = count > 0 ? items : fallbackItems
  const limit = count > 50 ? 10 : evidence.length
  const shown = evidence.slice(0, limit)
  const label = count > 50 ? 'Top10 证据' : count > 0 ? '证据' : '抽样证据'
  if (shown.length === 0) return `异常=${count}；${label}：无匹配元素`
  return `异常=${count}；${label}：${shown.map((item) => `${item.selector} => ${item.summary}`).join(' | ')}`
}

function recordBucket(route, name, bucket, samples) {
  setIssueCount(route, name, bucket.count)
  record(route, name, bucket.count === 0, formatEvidence(bucket.items, bucket.count, samples))
}

// 登录流程来源：tests/e2e/collect-warnings.mjs 与 editor-a11y.mjs。
// 验证码解析直接复用 e2e/run/auth.mjs，不重复实现；同时保留 Cookie 横幅与引导浮层处理。
async function login(page) {
  const captchaPromise = capturePageCaptcha(page)
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page
    .locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]')
    .first()
    .waitFor({
      state: 'visible',
      timeout: 20000
    })

  const cookieButton = page.locator('button:has-text("同意")').first()
  if (
    await cookieButton
      .waitFor({ state: 'visible', timeout: 500 })
      .then(() => true)
      .catch(() => false)
  ) {
    await cookieButton.click({ timeout: 2000 }).catch(() => {})
  }

  const captcha = await captchaPromise
  await page
    .locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]')
    .first()
    .fill(TEST_USER)
  await page
    .locator('input[placeholder="密码"], input[placeholder="Password"], input[type="password"]')
    .first()
    .fill(TEST_PASS)
  await fillCaptchaOnPage(page, captcha)
  await page
    .locator('button:has-text("登 录"), button:has-text("登录"), button:has-text("Login"), button[type="submit"]')
    .first()
    .click()
  // 登录判定同样用 pathname 精确匹配，避免 /monitor/logininfor 前缀误判
  await page.waitForURL((url) => !/\/login(?:[/?#]|$)/.test(url.pathname), { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(PAGE_SETTLE_MS)
  await dismissTour(page)
  return !/\/login(?:[/?#]|$)/.test(new URL(page.url()).pathname)
}

async function dismissTour(page) {
  const skipButton = page
    .locator(
      'button:has-text("跳过"), button:has-text("跳过引导"), [class*="tour"] button:has-text("跳"), button:has-text("完成"), button:has-text("开始使用")'
    )
    .first()
  if (
    await skipButton
      .waitFor({ state: 'visible', timeout: 500 })
      .then(() => true)
      .catch(() => false)
  ) {
    await skipButton.click({ timeout: 1500 }).catch(() => {})
  }
  await page.keyboard.press('Escape').catch(() => {})
}

async function readActiveElement(page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement)
      return null

    const clean = (value, max = 100) =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    const selectorOf = (target) => {
      if (target.id) return `${target.tagName.toLowerCase()}#${CSS.escape(target.id)}`
      const parts = []
      let current = target
      for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
        let part = current.tagName.toLowerCase()
        const classes = [...current.classList]
          .slice(0, 2)
          .map((name) => `.${CSS.escape(name)}`)
          .join('')
        part += classes
        const parent = current.parentElement
        if (parent) {
          const siblings = [...parent.children].filter((child) => child.tagName === current.tagName)
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`
        }
        parts.unshift(part)
        current = parent
      }
      return parts.join(' > ') || target.tagName.toLowerCase()
    }
    const text = clean(element.innerText)
    const ariaLabel = clean(element.getAttribute('aria-label'))
    const title = clean(element.getAttribute('title'))
    // a11y：placeholder 是 WCAG 认可的可访问名称来源之一（EP 搜索框标准做法 = 仅 placeholder）。
    // 不计入会令全站搜索框/日期范围框（约 60+ 处）全部误报 unnamed——扫描器盲区，非应用缺陷。
    const placeholderName = clean(element.getAttribute('placeholder'))
    // a11y：原生 input（checkbox/radio）的可访问名称来自关联 <label> 文本——
    // ① 包裹式 <label><input/><span>文本</span></label>（EP el-checkbox/el-radio）
    // ② 显式 for= 关联。均为 WCAG 认可来源，不计入会误报全站表单控件。
    const wrappingLabel = element.closest('label')
    const labelText = clean(
      wrappingLabel ? wrappingLabel.innerText : element.labels && element.labels[0] ? element.labels[0].innerText : ''
    )
    const id = [...document.querySelectorAll('*')].indexOf(element)
    const attributes = [
      `tag=${element.tagName.toLowerCase()}`,
      `text=${JSON.stringify(text)}`,
      `aria-label=${JSON.stringify(ariaLabel)}`,
      `title=${JSON.stringify(title)}`
    ]
    const type = clean(element.getAttribute('type'))
    const role = clean(element.getAttribute('role'))
    const placeholder = clean(element.getAttribute('placeholder'))
    // a11y：复合 widget 角色的可访问名称/值由自身语义属性承接（WAI-ARIA）：
    //  - role=slider：名称可来自 aria-valuenow/aria-valuetext（EP el-slider 内部 div）
    //  - role=switch（含 EP el-switch 的 checkbox）与 el-checkbox 同理依赖 label/aria
    //  - jQuery 第三方内嵌 iframe（Swagger UI）内容不可控，不属应用层缺陷
    const ariaValueName = clean(
      element.getAttribute('aria-valuetext') ||
        element.getAttribute('aria-valuenow') ||
        element.getAttribute('aria-labelledby')
    )
    // a11y：el-table 内部的选择列 checkbox（表头全选 / 行选择）无可见文本，
    // 其语义由表格结构（列头/行上下文）承载，EP 不提供 aria-label——属库组件既定实现，
    // 全站每页都渲染，计入会形成 60+ 条恒定的结构性误报。
    const isTableSelectionCheckbox = element.getAttribute('type') === 'checkbox' && !!element.closest('.el-table')
    // a11y：el-select / el-date-picker 等复合组件的内部 input（role=combobox）不直接持名，
    // 其可访问名称来自 ①外层 el-form-item 的 label 文本、②同级 .el-select__placeholder
    // 或输入容器的 placeholder——与「表单控件标签关联」检查同一口径（库组件实现细节）。
    const comboboxFormItem =
      role === 'combobox' ? clean(element.closest('.el-form-item')?.querySelector('label')?.innerText) : ''
    const comboboxContainerText =
      role === 'combobox'
        ? clean(
            element.closest('.el-select')?.querySelector('.el-select__placeholder')?.innerText ||
              element.closest('.el-input')?.querySelector('.el-input__inner')?.getAttribute('placeholder')
          )
        : ''
    const hasComboboxName = !!(comboboxFormItem || comboboxContainerText)
    const isThirdPartyFrame = element.tagName.toLowerCase() === 'iframe'
    if (type) attributes.push(`type=${JSON.stringify(type)}`)
    if (role) attributes.push(`role=${JSON.stringify(role)}`)
    if (placeholder) attributes.push(`placeholder=${JSON.stringify(placeholder)}`)

    return {
      id,
      selector: selectorOf(element),
      summary: attributes.join(' '),
      unnamed:
        !text &&
        !ariaLabel &&
        !title &&
        !placeholderName &&
        !labelText &&
        !ariaValueName &&
        !hasComboboxName &&
        !isThirdPartyFrame &&
        !isTableSelectionCheckbox
    }
  })
}

async function scanKeyboard(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })

  const visited = []
  const seen = new Set()
  for (let presses = 0; presses < TAB_LIMIT * 2 && visited.length < TAB_LIMIT; presses += 1) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(25)
    const active = await readActiveElement(page)
    if (!active) continue
    if (seen.has(active.id)) break
    seen.add(active.id)
    visited.push(active)
  }

  return {
    visited,
    issues: visited.filter((item) => item.unnamed).map(({ selector, summary }) => ({ selector, summary }))
  }
}

async function collectStaticChecks(page) {
  return page.evaluate(() => {
    const clean = (value, max = 100) =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    const selectorOf = (target) => {
      if (target.id) return `${target.tagName.toLowerCase()}#${CSS.escape(target.id)}`
      const parts = []
      let current = target
      for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
        let part = current.tagName.toLowerCase()
        const classes = [...current.classList]
          .slice(0, 2)
          .map((name) => `.${CSS.escape(name)}`)
          .join('')
        part += classes
        const parent = current.parentElement
        if (parent) {
          const siblings = [...parent.children].filter((child) => child.tagName === current.tagName)
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`
        }
        parts.unshift(part)
        current = parent
      }
      return parts.join(' > ') || target.tagName.toLowerCase()
    }
    const evidenceOf = (element, extra = {}) => {
      const text = clean(element.innerText)
      const attributes = [
        `tag=${element.tagName.toLowerCase()}`,
        `text=${JSON.stringify(text)}`,
        `aria-label=${JSON.stringify(clean(element.getAttribute('aria-label')))}`,
        `title=${JSON.stringify(clean(element.getAttribute('title')))}`
      ]
      for (const name of ['id', 'class', 'role', 'type', 'name', 'placeholder', 'alt']) {
        if (element.hasAttribute(name)) attributes.push(`${name}=${JSON.stringify(clean(element.getAttribute(name)))}`)
      }
      for (const [name, value] of Object.entries(extra)) attributes.push(`${name}=${JSON.stringify(clean(value))}`)
      return { selector: selectorOf(element), summary: attributes.join(' ') }
    }
    const bucket = () => ({ count: 0, items: [] })
    const addIssue = (target, element, extra = {}) => {
      target.count += 1
      if (target.items.length < 50) target.items.push(evidenceOf(element, extra))
    }
    const samples = (elements, fallbackSelector, fallbackSummary) => {
      // 头/中/尾三点抽样：只取前 3 个会系统性偏向页面顶部（工具栏区），
      // 漏掉中部表格行、底部分页器等处的缺陷（§a11y 盲区修复 2026-10-09）。
      if (elements.length === 0) return [{ selector: fallbackSelector, summary: fallbackSummary }]
      const idx =
        elements.length <= 3 ? [...elements.keys()] : [0, Math.floor((elements.length - 1) / 2), elements.length - 1]
      return idx.map((i) => evidenceOf(elements[i]))
    }

    const interactiveElements = [...document.querySelectorAll('button, a[href], [role="button"]')].filter(
      // 排除 Element Plus 表格内部结构容器：`.hidden-columns` 是不渲染的列模板占位
      // （按设计处于不可见状态，innerText 恒空属结构性必然，非应用缺陷）。
      (element) => !element.closest('.hidden-columns')
    )
    const unnamedInteractive = bucket()
    for (const element of interactiveElements) {
      // 可访问名称来源（按 WAI-ARIA 优先级）：aria-label → 可见文本 → title。
      // 补 title 路径：全仓大量 icon-only 按钮（el-tooltip 包裹）以原生 title 承载名称，
      // 旧口径只认 innerText/aria-label 会把它们全部误报（§a11y 盲区修复 2026-10-09）。
      const text = clean(element.innerText)
      const ariaLabel = clean(element.getAttribute('aria-label'))
      const title = clean(element.getAttribute('title'))
      if (!text && !ariaLabel && !title) addIssue(unnamedInteractive, element)
    }

    const images = [...document.querySelectorAll('img')]
    const imagesMissingAlt = bucket()
    for (const image of images) {
      if (!image.hasAttribute('alt')) addIssue(imagesMissingAlt, image)
    }

    const formControls = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')].filter(
      (control) => control.getClientRects().length > 0 && control.offsetParent !== null
    )
    const formControlsMissingLabel = bucket()
    for (const control of formControls) {
      const ariaLabel = clean(control.getAttribute('aria-label'))
      const hasAssociatedLabel = (control.labels && control.labels.length > 0) || !!control.closest('label')
      // Element Plus 复合组件（el-select/el-date-editor/el-cascader 等）的内部 input 不直接挂 <label>：
      // 其可访问名称由 ①外层 el-form-item 的 label 文本（EP id/for 关联）、②控件自身 placeholder、
      // ③容器内的已选值/占位文本（.el-select__placeholder 等）承接，均为屏幕阅读器实际可读来源。
      // 补全这三条判定路径，避免把库组件内部实现细节误报为应用层缺陷（口径见优化台账 2026-10-02）。
      const formItem = control.closest('.el-form-item')
      const hasFormItemLabel = !!formItem && clean(formItem.querySelector('.el-form-item__label')?.textContent) !== ''
      const placeholder = clean(control.getAttribute('placeholder'))
      const epContainer = control.closest('.el-date-editor, .el-select, .el-cascader, .el-autocomplete')
      // 合并容器内所有语义承载元素的文本：第一个匹配可能是 is-hidden 的 input wrapper（文本为空），
      // 真正的已选值/占位文本（如分页器"10条/页"）在其后的兄弟节点中
      const epSemanticTexts = epContainer
        ? [...epContainer.querySelectorAll('.el-select__placeholder, .el-select__selected-item, .el-input__inner')]
            .map((n) => n.textContent || '')
            .join(' ')
        : ''
      const hasEpContainerSemantic =
        !!epContainer && clean(epSemanticTexts || epContainer.getAttribute('aria-label') || '') !== ''
      if (!ariaLabel && !hasAssociatedLabel && !hasFormItemLabel && !placeholder && !hasEpContainerSemantic) {
        addIssue(formControlsMissingLabel, control)
      }
    }

    const h1Elements = [...document.querySelectorAll('h1')]
    const lang = clean(document.documentElement.getAttribute('lang'))
    const landmarks = [...document.querySelectorAll('main, nav, header')]

    const textParents = []
    const seenTextParents = new Set()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let textNode = walker.nextNode()
    while (textNode) {
      const parent = textNode.parentElement
      const text = clean(textNode.nodeValue)
      if (
        parent &&
        text &&
        !seenTextParents.has(parent) &&
        !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)
      ) {
        const style = getComputedStyle(parent)
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          parent.getClientRects().length > 0
        if (visible) {
          seenTextParents.add(parent)
          textParents.push(parent)
        }
      }
      textNode = walker.nextNode()
    }

    const sameColor = bucket()
    const smallText = bucket()
    for (const element of textParents) {
      const style = getComputedStyle(element)
      if (style.color === style.backgroundColor) {
        addIssue(sameColor, element, { color: style.color, backgroundColor: style.backgroundColor })
      }
      const fontSize = Number.parseFloat(style.fontSize)
      if (Number.isFinite(fontSize) && fontSize < 12) {
        addIssue(smallText, element, { fontSize: style.fontSize })
      }
    }

    return {
      title: document.title,
      bodyEvidence: evidenceOf(document.body, { url: location.href }),
      unnamedInteractive,
      interactiveSamples: samples(interactiveElements, 'button, a[href], [role="button"]', '页面无交互元素'),
      imagesMissingAlt,
      imageSamples: samples(images, 'img', '页面无图片元素'),
      formControlsMissingLabel,
      formControlSamples: samples(formControls, 'input:not([type="hidden"]), select, textarea', '页面无可见表单控件'),
      h1Count: h1Elements.length,
      h1Evidence: samples(h1Elements, 'h1', `未找到 h1；document.title=${JSON.stringify(document.title)}`),
      lang,
      langEvidence: {
        selector: 'html',
        summary: `tag=html lang=${JSON.stringify(lang)} document.title=${JSON.stringify(document.title)}`
      },
      landmarkCount: landmarks.length,
      landmarkEvidence: samples(landmarks, 'main, nav, header', '未找到 main/nav/header 语义地标'),
      sameColor,
      textSamples: samples(textParents, 'body *', '页面无可见正文文本元素'),
      smallText
    }
  })
}

function recordUnavailableChecks(route, reason) {
  for (const name of CHECK_NAMES) {
    setIssueCount(route, name, 1)
    record(route, name, false, `异常=1；证据：body => 未执行检测，原因=${JSON.stringify(reason)}`)
  }
}

async function scanRoute(page, route) {
  log(`开始扫描路由 ${route}`)
  let navigationError = null
  await page.goto(`${FRONTEND_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((error) => {
    navigationError = error
  })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(PAGE_SETTLE_MS)
  await dismissTour(page)

  const pageState = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    hasBody: !!document.body,
    is404:
      !!document.querySelector('.wscn-http404-container') || /\/(404|not-found)(?:[/?#]|$)/.test(location.pathname),
    bodyClass: document.body?.className || ''
  }))
  // 注意：登录页判定必须用 pathname 精确匹配。若用 url.includes('/login')，
  // /monitor/logininfor 这类路由会因前缀撞上 "/login" 子串被误判为未登录。
  const isLoginPage = /\/login(?:[/?#]|$)/.test(new URL(pageState.url).pathname)
  const pagePassed = !navigationError && pageState.hasBody && !pageState.is404 && !isLoginPage
  setIssueCount(route, '页面加载', pagePassed ? 0 : 1)
  record(
    route,
    '页面加载',
    pagePassed,
    `异常=${pagePassed ? 0 : 1}；证据：body => url=${JSON.stringify(pageState.url)} title=${JSON.stringify(pageState.title)} class=${JSON.stringify(pageState.bodyClass)}${navigationError ? ` navigationError=${JSON.stringify(navigationError.message)}` : ''}`
  )
  if (!pagePassed) {
    recordUnavailableChecks(
      route,
      navigationError?.message || (pageState.is404 ? '命中 404 页面' : '页面无效或登录态丢失')
    )
    return
  }

  const keyboard = await scanKeyboard(page)
  setIssueCount(route, CHECK_NAMES[0], keyboard.issues.length)
  record(
    route,
    CHECK_NAMES[0],
    keyboard.issues.length === 0,
    `${formatEvidence(keyboard.issues, keyboard.issues.length, keyboard.visited.slice(0, 3))}；实际遍历=${keyboard.visited.length}/${TAB_LIMIT}`
  )

  const checks = await collectStaticChecks(page)
  recordBucket(route, CHECK_NAMES[1], checks.unnamedInteractive, checks.interactiveSamples)
  recordBucket(route, CHECK_NAMES[2], checks.imagesMissingAlt, checks.imageSamples)
  recordBucket(route, CHECK_NAMES[3], checks.formControlsMissingLabel, checks.formControlSamples)

  const headingIssueCount = checks.h1Count === 1 ? 0 : checks.h1Count === 0 ? 1 : checks.h1Count - 1
  setIssueCount(route, CHECK_NAMES[4], headingIssueCount)
  record(
    route,
    CHECK_NAMES[4],
    headingIssueCount === 0,
    `异常=${headingIssueCount}；h1 数量=${checks.h1Count}；${checks.h1Count > 50 ? 'Top10 ' : ''}证据：${checks.h1Evidence
      .slice(0, checks.h1Count > 50 ? 10 : checks.h1Evidence.length)
      .map((item) => `${item.selector} => ${item.summary}`)
      .join(' | ')}`
  )

  const langIssueCount = checks.lang ? 0 : 1
  setIssueCount(route, CHECK_NAMES[5], langIssueCount)
  record(
    route,
    CHECK_NAMES[5],
    langIssueCount === 0,
    `异常=${langIssueCount}；证据：${checks.langEvidence.selector} => ${checks.langEvidence.summary}`
  )

  const landmarkIssueCount = checks.landmarkCount > 0 ? 0 : 1
  setIssueCount(route, CHECK_NAMES[6], landmarkIssueCount)
  record(
    route,
    CHECK_NAMES[6],
    landmarkIssueCount === 0,
    `异常=${landmarkIssueCount}；地标数量=${checks.landmarkCount}；证据：${checks.landmarkEvidence
      .map((item) => `${item.selector} => ${item.summary}`)
      .join(' | ')}`
  )

  recordBucket(route, CHECK_NAMES[7], checks.sameColor, checks.textSamples)
  recordBucket(route, CHECK_NAMES[8], checks.smallText, checks.textSamples)
}

function buildRouteStats() {
  const stats = new Map()
  for (const result of results) {
    if (!stats.has(result.route)) stats.set(result.route, { pass: 0, fail: 0 })
    stats.get(result.route)[result.passed ? 'pass' : 'fail'] += 1
  }
  return stats
}

function printSummary() {
  const passCount = results.filter((result) => result.passed).length
  const failCount = results.length - passCount
  const routeStats = buildRouteStats()

  log('===== a11y 汇总 =====')
  log(`总计：PASS=${passCount} FAIL=${failCount} RECORDS=${results.length}`)
  log('----- 每路由统计 -----')
  for (const [route, stats] of routeStats) {
    log(`${route}：PASS=${stats.pass} FAIL=${stats.fail}`)
  }

  log('----- Top 问题分布（按路由） -----')
  const distributions = [...issueCountsByRoute.entries()]
    .map(([route, counts]) => ({
      route,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts
    }))
    .filter((item) => item.total > 0)
    .sort((left, right) => right.total - left.total)
  if (distributions.length === 0) {
    log('未发现无障碍问题')
  } else {
    for (const item of distributions) {
      const top = Object.entries(item.counts)
        .filter(([, count]) => count > 0)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
        .map(([name, count]) => `${name}=${count}`)
        .join('；')
      log(`${item.route}：问题元素/规则=${item.total}；${top}`)
    }
  }

  return { passCount, failCount, routeStats, distributions }
}

function writeFailureReport(summary, args) {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '')
  const outputPath = join(SCREENSHOT_DIR, `a11y-failures-${timestamp}.json`)
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: FRONTEND_URL,
    options: { route: args.route, limit: args.limit },
    summary: {
      pass: summary.passCount,
      fail: summary.failCount,
      records: results.length,
      routes: [...summary.routeStats.entries()].map(([route, stats]) => ({ route, ...stats }))
    },
    issueCountsByRoute: Object.fromEntries(issueCountsByRoute),
    failures: results.filter((result) => !result.passed)
  }
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  log(`失败清单已写入：${outputPath}`)
  return outputPath
}

async function main() {
  let args = { routes: [], route: null, limit: null }
  let browser = null
  try {
    args = parseArgs(process.argv.slice(2))
    log(
      `全站 a11y E2E 启动：base=${FRONTEND_URL} routes=${args.routes.length} route=${args.route || '全部'} limit=${args.limit || '无限制'}`
    )
    // 产物预检（批八十二，判据在 build-freshness.mjs）：a11y 扫的是浏览器里的真实 DOM，
    // 产物陈旧 = 扫的是上一轮的页面，而报告看着完全正常。
    const fresh = await assertFreshServedApp({ baseUrl: FRONTEND_URL })
    log(`产物预检：${fresh.artifactDir}（入口 ${fresh.chunk} / ${fresh.bytes} 字节）— 新鲜且与服务一致`)
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
    const page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('stepby-layout-tour', 'completed')
      localStorage.setItem('workbench-tour', 'completed')
      localStorage.setItem('home-tour', 'completed')
    })

    const loggedIn = await login(page)
    log(`登录结果：${loggedIn ? '成功' : '失败'}；url=${page.url()}`)
    if (!loggedIn) {
      setIssueCount('/login', '登录', 1)
      record('/login', '登录', false, `异常=1；证据：form => 登录后仍停留在 ${JSON.stringify(page.url())}`)
    } else {
      for (const route of args.routes) {
        try {
          await scanRoute(page, route)
        } catch (error) {
          setIssueCount(route, '页面扫描异常', 1)
          record(
            route,
            '页面扫描异常',
            false,
            `异常=1；证据：body => ${JSON.stringify(error?.stack || error?.message || String(error))}`
          )
        }
      }
    }

    await context.close().catch(() => {})
  } catch (error) {
    setIssueCount('__setup__', '运行异常', 1)
    record(
      '__setup__',
      '运行异常',
      false,
      `异常=1；证据：process => ${JSON.stringify(error?.stack || error?.message || String(error))}`
    )
  } finally {
    await browser?.close().catch(() => {})
  }

  const summary = printSummary()
  writeFailureReport(summary, args)
  log(`日志文件：${LOG_PATH}`)
  process.exitCode = summary.failCount > 0 ? 1 : 0
}

main()
