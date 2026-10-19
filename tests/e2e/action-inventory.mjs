/**
 * 逐页「可测动作清单」扫描器（b78 新增）。
 *
 * 回答一个问题：**每个页面到底有哪些按钮和可测功能，测试套件覆盖到了哪些、漏了哪些？**
 *
 * 为什么需要它：`deep-e2e` / `main` 的覆盖数是"用例数"，不是"页面动作数"——
 * 一个页面写 12 条断言也可能一个按钮都没点到，而另一个页面 3 条断言就覆盖了全部动作。
 * 只看用例总数无法回答"广度够不够"。本扫描器以**页面上的真实控件**为分母，
 * 以两套件源码里出现过的文案/路径为分子，产出可复核的覆盖率清单。
 *
 * 判据边界（写清楚，避免把"没覆盖"当成"缺陷"）：
 *   - `covered` = 该按钮文案在 main.mjs 或 deep-e2e.mjs 源码里出现过。这是**下界**：
 *     源码里出现文案不代表一定点了这个按钮（可能只是断言了表头文字），
 *     但**没出现**基本可以确定没测过 ⇒ 用来找盲区是可靠的。
 *   - 行内操作（编辑/删除/详情）按 `aria-label` 或文本取，图标按钮无文案时记为 `<icon-only>`。
 *
 * 用法：
 *   node action-inventory.mjs                 # 全站 56 路由
 *   node action-inventory.mjs --route=/system/user
 *   node action-inventory.mjs --out=reports/action-inventory.md
 *
 * 产物：
 *   tests/e2e/reports/action-inventory.json   结构化（含每页控件与覆盖标记）
 *   tests/e2e/reports/action-inventory.md     人读（按覆盖率排序 + 盲区清单）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import { ROUTES } from './route-list.mjs'
import { capturePageCaptcha, fillCaptchaOnPage } from './e2e/run/auth.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.env.STEPBY_BASE_URL || 'http://localhost:8080'
const USER = process.env.STEPBY_TEST_USER || 'admin'
const PASS = process.env.STEPBY_TEST_PASS || 'admin123'
const OUT_DIR = path.join(__dirname, 'reports')

const args = process.argv.slice(2)
// `--route=/system/user` 在 Git Bash 下会被 MSYS 的路径转换改成 `C:/Program Files/Git/system/user`，
// 所以这里把值归一化：取最后一个 `/system`（或任意已知前缀）之后的部分，再补回前导 `/`。
function normalizeRoute(raw) {
  if (!raw) return null
  let v = String(raw).replace(/\\/g, '/')
  if (v.includes('/Program Files/Git/')) v = v.split('/Program Files/Git/').pop()
  if (!v.startsWith('/')) v = '/' + v
  return v
}
const onlyRoute = normalizeRoute(
  args
    .find((a) => a.startsWith('--route='))
    ?.split('=')
    .slice(1)
    .join('=')
)
const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1] || null
const HEADLESS = !args.includes('--headed')

// 覆盖率棘轮（与 deep-e2e 的 SKIP 棘轮同思路）：
//   --gate             与基线比较：覆盖率下降 / 路由数减少 ⇒ 退出码 1
//   --update-baseline  用本轮实测刷新基线（只应在"确实新增了页面/动作并同步补了用例"时执行）
const GATE = args.includes('--gate')
const UPDATE_BASELINE = args.includes('--update-baseline')
const BASELINE_PATH = path.join(__dirname, 'action-inventory-baseline.json')
// 允许 1 个百分点抖动：同一份代码两次扫描可能因懒加载/弹窗时序差 1-2 个动作
const COVERAGE_TOLERANCE = 0.01

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (m) => console.log(`[inventory] ${m}`)

/** 两套件的源码文本（覆盖判据的分子来源） */
function loadSuiteSources() {
  const files = ['main.mjs', 'deep-e2e.mjs']
  return files
    .map((f) => {
      const p = path.join(__dirname, f)
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
    })
    .join('\n')
}

async function dismissTour(page) {
  const skip = page.locator('button:has-text("跳过"), button:has-text("开始使用"), button:has-text("完成")').first()
  if (await skip.isVisible({ timeout: 500 }).catch(() => false)) {
    await skip.click({ timeout: 1000 }).catch(() => {})
    await sleep(200)
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page
    .evaluate(() => {
      document
        .querySelectorAll('.stepby-tour-mask, .tour-wrapper, [class*="driver-overlay"], [class*="tour-step"]')
        .forEach((e) => e.remove())
    })
    .catch(() => {})
}

async function login(page) {
  const captchaPromise = capturePageCaptcha(page)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }).catch(() => {})
  await sleep(1200)
  const agree = page.locator('button:has-text("同意")').first()
  if (await agree.isVisible({ timeout: 500 }).catch(() => false)) {
    await agree.click({ timeout: 2000 }).catch(() => {})
    await sleep(200)
  }
  const u = page.locator('input[placeholder="账号"], input[name="username"]').first()
  await u.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  await u.fill(USER)
  const p = page.locator('input[placeholder="密码"], input[type="password"]').first()
  await p.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  await p.fill(PASS)
  await fillCaptchaOnPage(page, await captchaPromise)
  await page
    .locator('button:has-text("登 录"), button:has-text("登录"), button[type="submit"]')
    .first()
    .click()
    .catch(() => {})
  await page.waitForURL((x) => !x.toString().includes('/login'), { timeout: 15000 }).catch(() => {})
  await sleep(2000)
  return !page.url().includes('login')
}

/**
 * 取一页上的全部可测动作。
 * 用 aria-label 兜底图标按钮（行内操作多为图标-only，纯文本取不到）。
 */
async function collectActions(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const label = (el) => {
      const aria = el.getAttribute('aria-label')
      if (aria && norm(aria)) return norm(aria)
      const title = el.getAttribute('title')
      if (title && norm(title)) return norm(title)
      const text = norm(el.innerText)
      if (text) return text.slice(0, 24)
      const icon = el.querySelector('i[class*="icon"], svg, [class*="el-icon"]')
      return icon ? '<icon-only>' : ''
    }
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const st = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
    }

    const root = document.querySelector('.app-container') || document.body

    // 工具栏：表格上方、不在表格行内的按钮
    // 注意排除 **表头里的排序按钮**：element-plus 的可排序列会把 `按 X 排序` 渲染成 <button>，
    // 若不排除，/system/user 会凭空多出 6 个"动作"（实测 26 → 20），把覆盖率算低。
    const toolbar = []
    const rowActions = []
    let sortableColumns = 0
    for (const btn of root.querySelectorAll('button')) {
      if (!visible(btn)) continue
      if (btn.closest('th')) {
        sortableColumns += 1
        continue
      }
      const inRow = !!btn.closest('.el-table__row')
      const name = label(btn)
      if (!name) continue
      const rec = { name, disabled: btn.disabled || btn.classList.contains('is-disabled') }
      if (inRow) rowActions.push(rec)
      else toolbar.push(rec)
    }

    // 表头（判断"是不是列表页"）
    const columns = [...root.querySelectorAll('.el-table__header th')].map((th) => norm(th.innerText)).filter(Boolean)

    // 表单控件（弹窗内的不算：清单只统计页面常驻控件）
    const controls = []
    for (const el of root.querySelectorAll('input, select, textarea')) {
      if (!visible(el)) continue
      if (el.closest('.el-dialog, .el-drawer, .el-overlay')) continue
      const ph = el.getAttribute('placeholder') || ''
      const nm = el.getAttribute('name') || ''
      const aria = el.getAttribute('aria-label') || ''
      const t = norm(ph || aria || nm)
      if (t) controls.push({ name: t, tag: el.tagName.toLowerCase() })
    }

    const emptyText = [...root.querySelectorAll('.el-table__empty-text')].map((e) => norm(e.innerText))[0] || ''
    const rowCount = root.querySelectorAll('.el-table__body .el-table__row').length
    return { toolbar, rowActions, columns, controls, emptyText, rowCount, sortableColumns }
  })
}

/** 去重（同名按钮只留一条，disabled 取"有任一可用即可用"） */
function dedupe(list) {
  const m = new Map()
  for (const it of list) {
    const prev = m.get(it.name)
    if (!prev) m.set(it.name, { ...it })
    else prev.disabled = prev.disabled && it.disabled
  }
  return [...m.values()]
}

function main() {
  const sources = loadSuiteSources()
  const routes = onlyRoute ? ROUTES.filter((r) => r === onlyRoute) : ROUTES
  if (routes.length === 0) {
    console.error(`❌ --route=${onlyRoute} 不在 route-list.mjs 的 ${ROUTES.length} 条清单里`)
    process.exit(2)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  ;(async () => {
    const browser = await chromium.launch({ headless: HEADLESS })
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    if (!(await login(page))) {
      console.error('❌ 登录失败：检查 STEPBY_TEST_USER / STEPBY_TEST_PASS / 服务是否在 8080')
      await browser.close()
      process.exit(1)
    }
    log(`登录成功，开始扫描 ${routes.length} 条路由`)

    const pages = []
    for (const [i, routePath] of routes.entries()) {
      const url = `${BASE}${routePath}`
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
      await sleep(1400)
      await dismissTour(page)
      await sleep(200)

      // 逐 tab 扫描：el-tabs 的非激活 pane 是 display:none，`visible()` 会把里面的按钮全部滤掉——
      // 实测 /monitor/cache（概览/键管理/热Key）因此报"动作 0"，而键管理页其实有刷新/清理共 6 个按钮。
      // 不点 tab 就等于把多 tab 页面整页判成"没有可测动作"，覆盖率会虚高。
      const tabLabels = await page
        .$$eval('.el-tabs__item', (els) => els.map((e) => (e.innerText || '').trim()).filter(Boolean))
        .catch(() => [])
      const tabs = tabLabels.length > 1 ? tabLabels.slice(0, 6) : []

      let got = await collectActions(page).catch(() => null)
      const merged = {
        toolbar: got ? got.toolbar : [],
        rowActions: got ? got.rowActions : [],
        columns: got ? got.columns : [],
        controls: got ? got.controls : [],
        emptyText: got ? got.emptyText : '',
        rowCount: got ? got.rowCount : 0,
        sortableColumns: got ? got.sortableColumns : 0
      }
      const tabCounts = {}
      if (tabs.length) {
        tabCounts[tabs[0]] = merged.toolbar.length + merged.rowActions.length
        for (let ti = 1; ti < tabs.length; ti++) {
          const clicked = await page
            .locator('.el-tabs__item')
            .nth(ti)
            .click({ timeout: 3000 })
            .then(() => true)
            .catch(() => false)
          if (!clicked) continue
          await sleep(900)
          const t = await collectActions(page).catch(() => null)
          if (!t) continue
          // 同名按钮只保留一份（不同 tab 可能有同名的"刷新"）
          merged.toolbar.push(...t.toolbar.map((b) => ({ ...b, tab: tabs[ti] })))
          merged.rowActions.push(...t.rowActions.map((b) => ({ ...b, tab: tabs[ti] })))
          // 表头/控件/行数**不跨 tab 合并**：各 tab 的表结构完全不同，取"最长"会让
          // /user/profile/userAvatar 显示 PAT 页的 8 列表头（b78 实测踩过），
          // 页面身份就串了。这些字段只代表"默认视图"，tab 内动作靠 `tab` 字段区分。
          tabCounts[tabs[ti]] = t.toolbar.length + t.rowActions.length
        }
      }
      // iframe 页（Swagger UI）：动作不在本页 DOM 内，标出来避免被读成"页面没按钮"
      const iframeCount = await page.$$eval('iframe', (els) => els.length).catch(() => 0)
      got = merged

      const mark = (name) => (name && name !== '<icon-only>' ? sources.includes(name) : false)
      const toolbar = dedupe(got.toolbar).map((b) => ({ ...b, covered: mark(b.name) }))
      const rowActions = dedupe(got.rowActions).map((b) => ({ ...b, covered: mark(b.name) }))

      const rec = {
        path: routePath,
        columns: got.columns,
        rowCount: got.rowCount,
        emptyText: got.emptyText,
        controls: got.controls,
        toolbar,
        rowActions,
        actionCount: toolbar.length + rowActions.length,
        coveredCount: [...toolbar, ...rowActions].filter((b) => b.covered).length,
        tabs: tabCounts,
        iframeCount,
        // "有表头/有 tab 却 0 动作"必须自曝，否则 0 会被当成"这页本来就没按钮"
        suspicious: toolbar.length + rowActions.length === 0 && (got.columns.length > 0 || tabs.length > 1)
      }
      pages.push(rec)
      log(
        `${String(i + 1).padStart(2)}/${routes.length} ${routePath.padEnd(34)} ` +
          `动作 ${rec.actionCount}（覆盖 ${rec.coveredCount}）行 ${rec.rowCount}` +
          (rec.tabs && Object.keys(rec.tabs).length > 1 ? ` tab=${Object.keys(rec.tabs).length}` : '') +
          (rec.suspicious ? '  ⚠ 采集可疑（有表头/多 tab 却 0 动作）' : '')
      )
    }

    await browser.close()

    const totalActions = pages.reduce((s, p) => s + p.actionCount, 0)
    const totalCovered = pages.reduce((s, p) => s + p.coveredCount, 0)
    const report = {
      generatedAt: new Date().toISOString(),
      base: BASE,
      routes: pages.length,
      totalActions,
      totalCovered,
      coverage: totalActions ? +(totalCovered / totalActions).toFixed(3) : 0,
      pages
    }
    const jsonPath = path.join(OUT_DIR, 'action-inventory.json')
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

    // 人读报告：按"未覆盖动作数"降序，盲区优先
    const gaps = pages
      .map((p) => ({
        ...p,
        uncovered: [...p.toolbar, ...p.rowActions].filter((b) => !b.covered)
      }))
      .sort((a, b) => b.uncovered.length - a.uncovered.length)

    const lines = []
    lines.push('# 逐页可测动作清单（自动生成）')
    lines.push('')
    lines.push(`- 生成时间：${report.generatedAt}`)
    lines.push(`- 目标：${BASE}（嵌入档，真后端）`)
    lines.push(
      `- 路由：${report.routes} 条 / 动作合计：**${totalActions}** / 源码中出现过：**${totalCovered}**（${(report.coverage * 100).toFixed(1)}%）`
    )
    lines.push('')
    lines.push('> 覆盖判据是**下界**：按钮文案在 `main.mjs`/`deep-e2e.mjs` 源码里出现过即算"提及"。')
    lines.push('> 出现不代表一定点过它；但**没出现基本等于没测过** ⇒ 用来找盲区可靠。')
    lines.push('')
    lines.push('## 盲区清单（未在测试源码中出现过的动作）')
    lines.push('')
    lines.push('| 路由 | 未覆盖动作 | 行数 |')
    lines.push('|---|---|---|')
    for (const p of gaps.filter((g) => g.uncovered.length > 0)) {
      lines.push(`| \`${p.path}\` | ${p.uncovered.map((b) => b.name).join('、')} | ${p.rowCount} |`)
    }
    const suspicious = pages.filter((p) => p.suspicious)
    if (suspicious.length) {
      lines.push('')
      lines.push('## ⚠ 采集可疑（有表头/多 tab 却 0 动作，需人工确认）')
      lines.push('')
      lines.push('| 路由 | 表头数 | tab 数 | iframe | 空态 |')
      lines.push('|---|---|---|---|---|')
      for (const p of suspicious) {
        lines.push(
          `| \`${p.path}\` | ${p.columns.length} | ${Object.keys(p.tabs || {}).length} | ${p.iframeCount || 0} | ${p.emptyText || '—'} |`
        )
      }
    }
    const iframed = pages.filter((p) => (p.iframeCount || 0) > 0)
    if (iframed.length) {
      lines.push('')
      lines.push(
        `> iframe 页：${iframed.map((p) => `\`${p.path}\``).join('、')}——动作不在宿主 DOM 内，` +
          '本清单不统计其内部控件（Swagger UI 等），0 动作属预期而非缺陷。'
      )
    }
    lines.push('')
    lines.push('## 每页明细')
    lines.push('')
    for (const p of pages) {
      lines.push(`### \`${p.path}\`（动作 ${p.actionCount} / 覆盖 ${p.coveredCount} / 行 ${p.rowCount}）`)
      if (p.columns.length) lines.push(`- 表头：${p.columns.join(' / ')}`)
      if (p.toolbar.length)
        lines.push(
          `- 工具栏：${p.toolbar.map((b) => `${b.covered ? '✅' : '⬜'}${b.name}${b.disabled ? '（禁用）' : ''}`).join('、')}`
        )
      if (p.rowActions.length)
        lines.push(`- 行内：${p.rowActions.map((b) => `${b.covered ? '✅' : '⬜'}${b.name}`).join('、')}`)
      if (p.controls.length) lines.push(`- 常驻控件：${p.controls.map((c) => c.name).join('、')}`)
      if (p.emptyText) lines.push(`- 空态：${p.emptyText}`)
      lines.push('')
    }

    const mdPath = outArg ? path.resolve(outArg) : path.join(OUT_DIR, 'action-inventory.md')
    fs.mkdirSync(path.dirname(mdPath), { recursive: true })
    fs.writeFileSync(mdPath, lines.join('\n'))
    log(`完成：${totalActions} 个动作 / 覆盖 ${totalCovered}（${(report.coverage * 100).toFixed(1)}%）`)
    log(`产物：${jsonPath}`)
    log(`产物：${mdPath}`)

    // ===== 覆盖率棘轮 =====
    // 单路由扫描不参与棘轮（分母不是全站，比较没有意义）
    if (onlyRoute) return
    if (UPDATE_BASELINE) {
      fs.writeFileSync(
        BASELINE_PATH,
        JSON.stringify(
          {
            generatedAt: report.generatedAt,
            routes: report.routes,
            totalActions,
            totalCovered,
            coverage: report.coverage,
            note: '逐页动作清单基线：--gate 时覆盖率不得低于本值（容差 1pp），路由数不得减少'
          },
          null,
          2
        )
      )
      log(`✅ 基线已更新：${BASELINE_PATH}（覆盖 ${(report.coverage * 100).toFixed(1)}%）`)
      return
    }
    if (!GATE) return
    if (!fs.existsSync(BASELINE_PATH)) {
      console.error(`❌ 覆盖率棘轮基线缺失：${BASELINE_PATH}（用 --update-baseline 生成）`)
      process.exit(1)
    }
    const base = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    const drop = base.coverage - report.coverage
    const routeDrop = base.routes - report.routes
    if (routeDrop > 0) {
      console.error(`❌ 路由数减少：${report.routes} < 基线 ${base.routes}（清单被删减？）`)
      process.exit(1)
    }
    if (drop > COVERAGE_TOLERANCE) {
      console.error(
        `❌ 覆盖率下降：${(report.coverage * 100).toFixed(1)}% < 基线 ${(base.coverage * 100).toFixed(1)}%` +
          `（-${(drop * 100).toFixed(1)}pp）——新增了页面动作却没补用例，或旧用例被删`
      )
      process.exit(1)
    }
    log(
      `✅ 覆盖率棘轮通过：${(report.coverage * 100).toFixed(1)}% ≥ 基线 ` +
        `${(base.coverage * 100).toFixed(1)}%（容差 ${(COVERAGE_TOLERANCE * 100).toFixed(0)}pp）`
    )
  })().catch((e) => {
    console.error(`❌ 扫描失败: ${e.message}`)
    process.exit(1)
  })
}

main()
