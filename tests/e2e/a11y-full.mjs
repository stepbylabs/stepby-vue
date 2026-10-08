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
const TAB_LIMIT = 20

// 权威来源：tests/e2e/collect-warnings.mjs 的 ROUTES。
// 该表来自后端 getRouters 的真实组合；这里复制而不改原文件，避免影响既有测试域。
const ROUTES = [
  '/index',
  '/dashboard',
  '/workbench/index',
  '/system/user',
  '/system/role',
  '/system/dept',
  '/system/menu',
  '/system/post',
  '/system/dict',
  '/system/dict-data/index/1',
  '/system/config',
  '/system/notice',
  '/system/notice-center',
  '/system/file',
  // '/system/dashboard' 已移除：菜单表（sys_menu）中不存在该路由，直接 goto 必命中 404
  '/system/log/operlog',
  '/system/msg/channel',
  '/system/msg/template',
  '/system/msg/log',
  '/system/oauth/provider',
  '/system/oauth/client',
  '/system/report/index',
  '/system/report/sub',
  '/system/webHook/index',
  '/system/webHook/log',
  '/monitor/online',
  '/monitor/job',
  '/monitor/cache',
  '/monitor/audit-dashboard',
  '/monitor/ip-location',
  '/monitor/health',
  '/monitor/logininfor',
  '/monitor/logtail',
  '/monitor/observability',
  '/monitor/rateLimit',
  '/monitor/backup',
  '/monitor/task',
  '/monitor/frontendError',
  // API 令牌挂载在「系统工具」目录下（sys_menu menu_id=3560, parent=3 tool），真实路由为 /tool/pat
  '/tool/pat',
  '/monitor/server',
  '/system/flow/todo',
  '/tool/build',
  '/tool/gen',
  '/tool/swagger',
  '/tool/http-debugger',
  '/tool/shortcuts',
  '/tool/help',
  '/tool/changelog',
  '/tool/about',
  '/user/profile/index',
  '/user/profile/msgPref',
  '/user/profile/oauth',
  '/user/profile/pat',
  '/user/profile/resetPwd',
  '/user/profile/totp',
  '/user/profile/userAvatar',
  '/user/profile/userInfo'
]

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
  await page.locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]').first().waitFor({
    state: 'visible',
    timeout: 20000
  })

  const cookieButton = page.locator('button:has-text("同意")').first()
  if (await cookieButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await cookieButton.click({ timeout: 2000 }).catch(() => {})
  }

  const captcha = await captchaPromise
  await page.locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]').first().fill(TEST_USER)
  await page.locator('input[placeholder="密码"], input[placeholder="Password"], input[type="password"]').first().fill(TEST_PASS)
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
  if (await skipButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await skipButton.click({ timeout: 1500 }).catch(() => {})
  }
  await page.keyboard.press('Escape').catch(() => {})
}

async function readActiveElement(page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement) return null

    const clean = (value, max = 100) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
    const selectorOf = (target) => {
      if (target.id) return `${target.tagName.toLowerCase()}#${CSS.escape(target.id)}`
      const parts = []
      let current = target
      for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
        let part = current.tagName.toLowerCase()
        const classes = [...current.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join('')
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
    if (type) attributes.push(`type=${JSON.stringify(type)}`)
    if (role) attributes.push(`role=${JSON.stringify(role)}`)
    if (placeholder) attributes.push(`placeholder=${JSON.stringify(placeholder)}`)

    return {
      id,
      selector: selectorOf(element),
      summary: attributes.join(' '),
      unnamed: !text && !ariaLabel && !title
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
    const clean = (value, max = 100) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
    const selectorOf = (target) => {
      if (target.id) return `${target.tagName.toLowerCase()}#${CSS.escape(target.id)}`
      const parts = []
      let current = target
      for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
        let part = current.tagName.toLowerCase()
        const classes = [...current.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join('')
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
      const list = elements.slice(0, 3).map((element) => evidenceOf(element))
      return list.length > 0 ? list : [{ selector: fallbackSelector, summary: fallbackSummary }]
    }

    const interactiveElements = [...document.querySelectorAll('button, a[href], [role="button"]')]
    const unnamedInteractive = bucket()
    for (const element of interactiveElements) {
      const text = clean(element.innerText)
      const ariaLabel = clean(element.getAttribute('aria-label'))
      if (!text && !ariaLabel) addIssue(unnamedInteractive, element)
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
      const hasFormItemLabel =
        !!formItem && clean(formItem.querySelector('.el-form-item__label')?.textContent) !== ''
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
      if (parent && text && !seenTextParents.has(parent) && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) {
        const style = getComputedStyle(parent)
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && parent.getClientRects().length > 0
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
    is404: !!document.querySelector('.wscn-http404-container') || /\/(404|not-found)(?:[/?#]|$)/.test(location.pathname),
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
    recordUnavailableChecks(route, navigationError?.message || (pageState.is404 ? '命中 404 页面' : '页面无效或登录态丢失'))
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
    log(`全站 a11y E2E 启动：base=${FRONTEND_URL} routes=${args.routes.length} route=${args.route || '全部'} limit=${args.limit || '无限制'}`)
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
          record(route, '页面扫描异常', false, `异常=1；证据：body => ${JSON.stringify(error?.stack || error?.message || String(error))}`)
        }
      }
    }

    await context.close().catch(() => {})
  } catch (error) {
    setIssueCount('__setup__', '运行异常', 1)
    record('__setup__', '运行异常', false, `异常=1；证据：process => ${JSON.stringify(error?.stack || error?.message || String(error))}`)
  } finally {
    await browser?.close().catch(() => {})
  }

  const summary = printSummary()
  writeFailureReport(summary, args)
  log(`日志文件：${LOG_PATH}`)
  process.exitCode = summary.failCount > 0 ? 1 : 0
}

main()
