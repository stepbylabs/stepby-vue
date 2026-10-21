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
 *   - `clicked`（b81）= 文案出现处 ±3 行内还有真实交互调用（`.click(` / `.fill(` /
 *     `getByRole(...).click()` 等）。它回答"这个按钮**被操作过**吗"，比 `covered` 更窄：
 *     `covered=true, clicked=false` 正是"源码里提了但没点"的那一族（注释、只用于断言的
 *     `getByText`、表格列名），是下一步补测的优先队列。**仅报告与趋势，不升级成硬棘轮**：
 *     locator 与 click 隔了多行的写法会漏报，用它判红等于把写法差异当退步。
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
import { assertFreshServedApp } from './build-freshness.mjs'
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

/**
 * 棘轮比较式的**唯一**实现（b79）：`--gate` 与 `--update-baseline` 必须走同一段判断。
 *
 * 起因：`--update-baseline` 原来**无条件**回写基线文件。在一轮"覆盖率已经掉下来/路由被删减"
 * 的跑批上执行收紧，就会把基线本身放松——而 `--gate` 下次读的正是这个被放松的值，
 * "只许升不许降"就静默失效了。任何"失败路径上仍然落盘"的棘轮都是同一个洞
 * （deep-e2e 的 `--update-skip-baseline` 同批修掉，见 runner.mjs）。
 *
 * 返回**放松方向**的问题列表；空数组 = 本轮不比基线差（可以写、gate 该过）。
 */
function ratchetRegressions(base, cur) {
  const bad = []
  // **取不到数一律算退步**：`base.coverage - undefined` 得 NaN，而 `NaN > tol` 恒 false ⇒
  // 不加这条守卫，"扫描器自己没产出"会被读成"没有退步"，收紧入口就变成静默放行通道
  // （与 collect-warnings 的"判据断电"同口径；b79 由本文件自检当场抓出）。
  if ([cur.routes, cur.coverage, base.routes, base.coverage].some((v) => typeof v !== 'number')) {
    bad.push(
      `基线或本轮取到非数值（本轮 routes=${cur.routes} coverage=${cur.coverage} / ` +
        `基线 routes=${base.routes} coverage=${base.coverage}）——判据断电，不得据此收紧`
    )
    return bad
  }
  if (cur.routes < base.routes) {
    bad.push(`路由数 ${cur.routes} < 基线 ${base.routes}（清单被删减？）`)
  }
  const drop = base.coverage - cur.coverage
  if (drop > COVERAGE_TOLERANCE) {
    bad.push(
      `覆盖率 ${(cur.coverage * 100).toFixed(1)}% < 基线 ${(base.coverage * 100).toFixed(1)}%` +
        `（-${(drop * 100).toFixed(1)}pp，容差 ${(COVERAGE_TOLERANCE * 100).toFixed(0)}pp）` +
        `——新增了页面动作却没补用例，或旧用例被删`
    )
  }
  return bad
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (m) => console.log(`[inventory] ${m}`)

/** 两套件的源码文本（覆盖判据的分子来源） */
function loadSuiteSources() {
  // 第三阶段起用例可迁到 modules/ 下：只读两个入口文件会让"已补测的动作"仍被报成盲区
  // （文案在模块文件里，入口只剩 import）。目录不存在时不报错，存在则递归收全部 .mjs；
  // 子目录名与文件名排序保证两次扫描结果稳定，避免覆盖率因文件系统顺序抖动。
  const files = ['main.mjs', 'deep-e2e.mjs']
  const modulesDir = path.join(__dirname, 'modules')
  const walk = (dir) => {
    let out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) out = out.concat(walk(p))
      else if (e.name.endsWith('.mjs')) out.push(p)
    }
    return out
  }
  if (fs.existsSync(modulesDir)) files.push(...walk(modulesDir))
  return files
    .map((f) => {
      const p = path.isAbsolute(f) ? f : path.join(__dirname, f)
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
  const got = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const label = (el) => {
      const aria = el.getAttribute('aria-label')
      if (aria && norm(aria)) return norm(aria)
      const title = el.getAttribute('title')
      if (title && norm(title)) return norm(title)
      // **原样返回** innerText（保留换行）：按钮里的计数徽章是独立元素，innerText 会把它
      // 挤成独占一行的纯数字（b78 实测 /workbench/index 的「我的通知」按钮 = "我的通知\n6"）。
      // 换行是"这是另一个元素"的结构证据，在这里折叠掉就没法区分徽章与文案里的数字了
      // ⇒ 交回 Node 侧按行剔除（normalizeActionName）。
      const text = (el.innerText || '').trim()
      if (text) return text.slice(0, 40)
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
      // `pag`：按钮是否在分页容器内。这不是"分类好看一点"，而是点击证据判据的一条真实边界——
      // 首页态下「上一页」是**结构性不可点**的（b82 实测 68 条无点击证据里有 20 条是它），
      // 把它记成盲区等于要求用例去点一个点不动的按钮，那种判据的结局一定是被人放宽。
      // 只看 DOM 祖先，不看按钮文案（文案黑名单换个组件就漏，同 b74 轮 25 的"少报"一族）。
      const rec = {
        name,
        disabled: btn.disabled || btn.classList.contains('is-disabled'),
        pag: !!btn.closest('.el-pagination')
      }
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
      // element-plus 给未显式命名的控件自动生成 `el-id-3177-122` 当 aria-label，
      // 它既不是文案也不可定位，进清单只会污染报告可读性（b78 报告里 /dashboard 的
      // 「常驻控件」三项全是 el-id-7817-49，就是这个形态）
      if (t && !/^el-id-\d+-\d+$/.test(t)) controls.push({ name: t, tag: el.tagName.toLowerCase() })
    }

    const emptyText = [...root.querySelectorAll('.el-table__empty-text')].map((e) => norm(e.innerText))[0] || ''
    const rowCount = root.querySelectorAll('.el-table__body .el-table__row').length
    return { toolbar, rowActions, columns, controls, emptyText, rowCount, sortableColumns }
  })
  // 归一在 Node 侧统一做（见 normalizeActionName）：DOM 文案带着计数徽章与装饰符，原样进清单
  // 会把同一个控件拆成好几条"动作"，并把已经测过的记成盲区。
  const clean = (list) => (list || []).map((b) => ({ ...b, name: normalizeActionName(b.name) || b.name }))
  return { ...got, toolbar: clean(got.toolbar), rowActions: clean(got.rowActions) }
}

/** 去重（同名按钮只留一条，disabled 取"有任一可用即可用"） */
function dedupe(list) {
  const m = new Map()
  for (const it of list) {
    const prev = m.get(it.name)
    if (!prev) m.set(it.name, { ...it })
    else {
      prev.disabled = prev.disabled && it.disabled
      // 与 disabled 同向：只要有一个实例**不在**分页容器里，这个动作名就不算"结构性不可点"
      prev.pag = !!prev.pag && !!it.pag
    }
  }
  return [...m.values()]
}

/**
 * 把"无点击证据"拆成两类（b82）。
 *
 * 为什么要拆：`clicked` 是"文案 ±3 行内有真实交互"的下界，未命中有两种**完全不同**的原因——
 * ① 扫描态结构性点不动（首页态的「上一页」）：用例无论怎么写都点不到它，记进补测队列
 *    只会让队列里堆满无法结清的条目，最后连真缺口也一起被当成噪声；
 * ② 点了但没被 ±3 行启发式看见、或确实没点（可点的按钮、助手函数把 click 拆远的写法）。
 * ②才是补测队列，①必须**单独报数并逐条列名**——"从分母里剔除"和"从报告里消失"是两回事，
 * 后者会让下一次真的少点一个按钮时没人发现（同 b74 轮 25"少报比报错更危险"）。
 *
 * 判据用 DOM 事实（`pag && disabled`），不用文案白名单：改名、换组件、加图标都会让文案表失效，
 * 而"在分页容器内且当前不可点"这个事实跟着控件本身走。
 * 只点得到一次也算点过：`clicked` 优先于 `stateLocked`，否则"点过的分页按钮"会被再次记成盲区。
 */
export function classifyActions(actions) {
  const clicked = []
  const backlog = []
  const stateLocked = []
  for (const a of actions || []) {
    if (a.clicked) clicked.push(a)
    else if (a.disabled && a.pag) stateLocked.push(a)
    else backlog.push(a)
  }
  return { clicked, backlog, stateLocked, total: (actions || []).length }
}

/**
 * 动作名归一（R-30a）：DOM 上的按钮文案带着**运行时状态与装饰**，拿原样去源码里找字面串，
 * 会把"其实已经测过"记成盲区——b78 首轮 15 组盲区里 7 组属于这一类：
 *   · `我的通知\n6` —— 计数徽章是按钮里的独立元素，innerText 把它挤成独占一行的纯数字；
 *   · `批量已读 (0)`、`导出Excel【2026】` —— 写在文案里的动态计数/标记（notice-center 的模板
 *     就是 `批量已读 ({{n}})`，b78 已补该用例却仍被判盲区）；
 *   · `展开/收起`、`收起/展开侧边栏` —— 产品文案由两个 t() 拼成一个按钮的**并列字面**
 *     （dept 页 `{{ t('common.expand') }}/{{ t('common.collapse') }}`），保持整串不拆词；
 *   · `收起全部` / `展开全部` —— 同一个切换按钮的两个状态文案（aria-label 随状态变），
 *     点过任一状态就等于点过这个控件。
 * 归一**刻意保守**：只做上述四类，不做"拆词后任一命中"——那会把 `展开/收起` 洗成源码里
 * 任何一处「展开」都算覆盖，属于放松判据（比缺检查更糟）。
 */
const STATE_PAIRS = [
  ['展开', '收起'],
  ['折叠', '展开'],
  ['显示', '隐藏'],
  ['启用', '禁用'],
  ['开始', '停止'],
  ['打开', '关闭']
]

/** 剥掉动态计数与装饰符，得到按钮的"身份文案" */
function normalizeActionName(raw) {
  // ① 按行剔除计数徽章：独占一行且全是数字 ⇒ 它是另一个元素（计数），不是文案。
  //    只认整行纯数字，因此「清空 30 天」这类同一行内的数字不会被吞掉。
  const kept = (raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\d+$/.test(l))
  let n = kept.join(' ').replace(/\s+/g, ' ').trim()
  // ② 文案里内插的计数：`批量已读 (0)`（b78 实测 notice-center 模板就写成 `批量已读 ({{n}})`）
  n = n.replace(/\s*[（(]\s*\d+\s*[)）]\s*$/, '')
  // ③ 装饰箭头
  n = n.replace(/\s*[→›»↑↓⇅]+\s*$/, '')
  return n.trim()
}

/** 一个动作名的所有等价写法（同一控件的不同状态/拼接形态） */
function coverageKeys(raw) {
  const base = normalizeActionName(raw)
  if (!base || base === '<icon-only>') return []
  const keys = new Set()
  const add = (s) => {
    const v = (s || '').replace(/\s+/g, ' ').trim()
    if (v && v !== '<icon-only>') keys.add(v)
  }
  add(base)
  // 文案中间的内插计数与【】标记：`批量已读 (0)` 的兄弟形态 `选中 (2) 项`
  const noParen = base
    .replace(/\s*[（(]\s*\d+\s*[)）]/g, ' ')
    .replace(/[【[][^】\]]*[】\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  add(noParen)
  // 状态成对互换（`收起全部` ⇄ `展开全部`、`收起当前行` ⇄ `展开当前行`）
  for (const src of [...keys]) {
    for (const [a, b] of STATE_PAIRS) {
      if (src.startsWith(a)) add(b + src.slice(a.length))
      if (src.startsWith(b)) add(a + src.slice(b.length))
    }
  }
  return [...keys]
}

/**
 * 覆盖判据工厂：便于 --selftest 用合成源码文本驱动（不启浏览器）。
 * 斜杠并列（dept 页按钮字面就是「展开/收起」，源码 `{{t('expand')}}/{{t('collapse')}}`）
 * **保持整串**：拆成裸「展开」会让源码里任何一处该词都算覆盖，那是放松判据。
 * 要让它变绿，正确做法是用例里写整串（`getByText('展开/收起')`），不是把判据改宽。
 */
function makeCoveredChecker(sources) {
  const has = (k) => sources.includes(k)
  return (name) => coverageKeys(name).some(has)
}

/**
 * **点击证据**判据（b81）：`covered` 只要求动作文案在测试源码里出现过，
 * 一句注释、一个只用于断言的 `getByText('删除')` 都能满足它 ⇒ 100% 覆盖不代表点过。
 * 这里把"文案附近有真实交互调用"作为**更窄的下界**，只用于报告与基线趋势，
 * 不直接升级成硬棘轮（辅助函数把 locator 与 click 拆到很远的写法会漏报）。
 *
 * 窗口取 ±3 行：常见形态是
 *   const b = page.locator('button:has-text("新增")')
 *   await b.click()
 * 同行 `getByRole(...).click()` 也算。
 */
const INTERACTION_RE =
  /\.(click|check|uncheck|fill|selectOption|press|hover|setChecked|type)\s*\(|getBy(?:Role|Text|Label|Placeholder)\([^\n]*\)\s*\.\s*(click|check|fill|press|hover)|\b(?:clickRowButton|clickDialogBtn|clickMessageBoxBtn|clickButton|clickRow|realClick|safeClick|fillDialogField|fillSearchField|selectDialogOption|checkRow|click|tap)\s*\(/
/** 函数定义行不是"点过"的证据（`async function clickRowButton(page) {…}` 也会命中上面的助手名）。 */
const DEFINITION_RE = /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/
const METHOD_INTERACTION_RE = /\.(click|check|uncheck|fill|selectOption|press|hover|setChecked|type)\s*\(/
function isInteractionLine(line) {
  if (!INTERACTION_RE.test(line)) return false
  if (DEFINITION_RE.test(line) && !METHOD_INTERACTION_RE.test(line)) return false
  return true
}
function makeInteractionChecker(sources) {
  const lines = String(sources || '').split('\n')
  return (name) =>
    coverageKeys(name).some((k) =>
      lines.some(
        (line, i) => line.includes(k) && lines.slice(Math.max(0, i - 3), i + 4).some((x) => isInteractionLine(x))
      )
    )
}

/**
 * 判据自检（双向）：既证明归一真的消除了假盲区，也证明它没把没测过的洗成测过。
 * 只跑正向的自检，等于允许"恒真判据"混进门禁——所以反例与正例同等重要。
 */
function runSelftest() {
  const cases = [
    // [说明, 合成源码文本, 动作名, 期望是否覆盖]
    ['文案内插的计数不得产生假盲区', '点击批量已读按钮', '批量已读 (0)', true],
    ['独占一行的徽章数字不得产生假盲区', '断言「我的通知」入口', '我的通知\n6', true],
    ['装饰箭头不得产生假盲区', '点「查看全部快捷键」', '查看全部快捷键 →', true],
    ['状态成对：测过展开即覆盖收起', 'await click("展开全部")', '收起全部', true],
    ['状态成对：测过收起即覆盖展开', '点「收起当前行」', '展开当前行', true],
    ['同一行内的数字属于文案，必须原样保留', '点击「清空 30 天」按钮', '清空 30 天', true],
    // 反例：归一不得放松判据
    ['斜杠并列必须整串命中，不得拆成裸词', '展开树节点', '展开/收起', false],
    ['状态互换必须同后缀，不得只换动词', '展开当前行', '收起全部', false],
    ['无关动作不得被状态互换误配', '展开全部', '删除全部', false],
    ['不同数字文案不得互相顶替', '清空 30 天', '清空 3 天', false],
    ['图标-only 占位名永远不算覆盖', '点击批量已读', '<icon-only>', false],
    ['空名不得算覆盖', '批量已读', '', false]
  ]
  let bad = 0
  for (const [desc, src, name, want] of cases) {
    const got = makeCoveredChecker(src)(name)
    const ok = got === want
    if (!ok) bad++
    console.log(
      `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：动作「${name}」期望 covered=${want}，实际 ${got}`
    )
  }
  if (bad) {
    console.error(`❌ 自检失败 ${bad}/${cases.length} 条——覆盖判据不可信，本次跑批不作数`)
    process.exit(1)
  }
  // 第二族：点击证据判据。核心是**它必须比 covered 更窄**：
  // 只提及/只断言 ⇒ covered=true 而 clicked=false，否则新增这一列毫无信息量。
  const iCases = [
    [
      'locator 后紧接 click 必须算点过',
      'const b = page.locator("button:has-text(\\"新增\\")")\nawait b.click()',
      '新增',
      true
    ],
    ['同行 getByRole().click() 必须算点过', 'await page.getByRole("button", { name: "导出" }).click()', '导出', true],
    ['fill 也是真实交互', 'await page.getByLabel("用户名").fill("admin")', '用户名', true],
    ['只用于断言的 getByText 不算点过', 'await expect(page.getByText("删除")).toBeVisible()', '删除', false],
    ['注释里提到不算点过', '// 这里本来应该点「批量删除」\nawait sleep(100)', '批量删除', false],
    ['表格列名不算点过', "columns: ['操作', '删除'],", '删除', false],
    [
      '交互离得太远不得误算（窗口 ±3 行）',
      'const t = "重置"\n' + '\n'.repeat(8) + 'await page.locator("#x").click()',
      '重置',
      false
    ],
    [
      '辅助函数包一层仍算点过（locator 传给 click 助手）',
      'const b = page.locator("button:has-text(\\"展开/收起\\")")\nconst ok = await click(b)',
      '展开/收起',
      true
    ],
    ['具名助手 clickRowButton 调用算点过', 'await clickRowButton(page, "删除", "page")', '删除', true],
    ['助手函数定义本身不算点过', 'async function clickRowButton(page) { /* 删除 */ }', '删除', false],
    ['同名变量未调用不算点过', 'const label = "展开/收起"\nconst click = pendingAction', '展开/收起', false],
    ['状态成对同样适用于点击证据', 'await page.getByText("展开全部").click()', '收起全部', true]
  ]
  let iBad = 0
  for (const [desc, src, name, want] of iCases) {
    const got = makeInteractionChecker(src)(name)
    const ok = got === want
    if (!ok) iBad++
    console.log(
      `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：动作「${name}」期望 clicked=${want}，实际 ${got}`
    )
  }
  if (iBad) {
    console.error(`❌ 点击证据自检失败 ${iBad}/${iCases.length} 条——clicked 列不可信，本次跑批不作数`)
    process.exit(1)
  }
  // 第三族：覆盖率棘轮的比较式。`--gate` 与 `--update-baseline` 共用 ratchetRegressions，
  // 所以这条自检同时钉住两件事：**放松方向必须报**（否则基线会被越写越松），
  // **容差内/进步方向不得报**（否则会把正常抖动判成红、逼人放宽）。
  const rCases = [
    ['覆盖率下降 2pp 必须报退步', { routes: 56, coverage: 1.0 }, { routes: 56, coverage: 0.98 }, true],
    ['覆盖率下降在 1pp 容差内不得报', { routes: 56, coverage: 1.0 }, { routes: 56, coverage: 0.995 }, false],
    ['路由数减少必须报（哪怕覆盖率没变）', { routes: 56, coverage: 1.0 }, { routes: 55, coverage: 1.0 }, true],
    ['覆盖率上升不得报', { routes: 56, coverage: 1.0 }, { routes: 56, coverage: 1.0 }, false],
    ['取不到数不得放行（判据断电＝退步）', { routes: 56, coverage: 1.0 }, { routes: 56, coverage: undefined }, true]
  ]
  let rBad = 0
  for (const [desc, base, cur, want] of rCases) {
    const got = ratchetRegressions(base, cur).length > 0
    const ok = got === want
    if (!ok) rBad++
    console.log(`  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：期望报退步=${want}，实际 ${got}`)
  }
  if (rBad) {
    console.error(`❌ 棘轮比较式自检失败 ${rBad}/${rCases.length} 条——收紧入口不可信，禁用 --update-baseline`)
    process.exit(1)
  }
  // 第四族（b82）：无点击证据的两类拆分。这里必须钉住**两个方向**：
  // 既不能让"首页态点不动的上一页"混进补测队列（那种条目永远结不清，最后连真缺口一起被当噪声），
  // 也不能让拆分变成"把不好测的都划出去"——所以禁用但可造出启用态的、以及拆分后总数守恒都要判。
  const cCases = [
    [
      'disabled + 分页容器 + 无点击证据 ⇒ 结构性点不动（不进队列）',
      [{ name: '上一页', disabled: true, pag: true, clicked: false, covered: true }],
      ['stateLocked', 1, 'backlog', 0]
    ],
    [
      'disabled + 非分页容器 + 无点击证据 ⇒ 仍是补测队列（可造出启用态）',
      [{ name: '编辑提供商', disabled: true, pag: false, clicked: false, covered: true }],
      ['backlog', 1, 'stateLocked', 0]
    ],
    [
      'enabled + 无点击证据 ⇒ 补测队列',
      [{ name: '下载为图片', disabled: false, pag: false, clicked: false, covered: true }],
      ['backlog', 1, 'stateLocked', 0]
    ],
    [
      'enabled + 分页容器 + 无点击证据 ⇒ 不得划进点不动（分母只能由"点不动"缩，不能由"在分页里"缩）',
      [{ name: '下一页', disabled: false, pag: true, clicked: false, covered: true }],
      ['backlog', 1, 'stateLocked', 0]
    ],
    [
      '点过一次即算点过，即使它在分页里且当前被禁用（clicked 优先）',
      [{ name: '上一页', disabled: true, pag: true, clicked: true, covered: true }],
      ['clicked', 1, 'stateLocked', 0]
    ],
    [
      '拆分必须守恒：三类之和 === 输入条数（防"划出去=从报告里消失"）',
      [
        { name: '上一页', disabled: true, pag: true, clicked: false, covered: true },
        { name: '新增', disabled: false, pag: false, clicked: true, covered: true },
        { name: '编辑提供商', disabled: true, pag: false, clicked: false, covered: true },
        { name: '导出', disabled: false, pag: false, clicked: false, covered: false }
      ],
      ['sum', 4, 'total', 4]
    ]
  ]
  let cBad = 0
  // `read` 把"数组类字段取长度、计数类字段取数值"这一区分写在一处——
  // 上一版用 `got[k].length` 读 `total` 得到 undefined，比较恒假，自检当场就红（fail-closed 生效）。
  const read = (got, k) =>
    k === 'sum'
      ? got.clicked.length + got.backlog.length + got.stateLocked.length
      : k === 'total'
        ? got.total
        : got[k].length
  for (const [desc, list, [k1, v1, k2, v2]] of cCases) {
    const got = classifyActions(list)
    const actual = read(got, k1)
    const actual2 = read(got, k2)
    const ok = actual === v1 && actual2 === v2 && got.total === list.length
    if (!ok) cBad++
    console.log(
      `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：期望 ${k1}=${v1} ${k2}=${v2}，实际 ${k1}=${actual} ${k2}=${actual2} total=${got.total}`
    )
  }
  if (cBad) {
    console.error(`❌ 拆分自检失败 ${cBad}/${cCases.length} 条——补测队列口径不可信，本次跑批的 clicked 分母不作数`)
    process.exit(1)
  }
  console.log(
    `SYNTH_OK 动作名归一自检通过（${cases.length} 条双向判据：6 条必须覆盖 / 6 条必须不覆盖）` +
      ` + 点击证据 ${iCases.length} 条双向（含"只提及不算点过"反例）` +
      ` + 棘轮比较式 ${rCases.length} 条双向` +
      ` + 无点击证据拆分 ${cCases.length} 条双向（含拆分守恒正控）`
  )
  process.exit(0)
}

function main() {
  const sources = loadSuiteSources()
  const mark = makeCoveredChecker(sources)
  const interacted = makeInteractionChecker(sources)
  const routes = onlyRoute ? ROUTES.filter((r) => r === onlyRoute) : ROUTES
  if (routes.length === 0) {
    console.error(`❌ --route=${onlyRoute} 不在 route-list.mjs 的 ${ROUTES.length} 条清单里`)
    process.exit(2)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  ;(async () => {
    // 产物预检（批八十二）：扫的是浏览器里的真实控件，产物旧就等于扫的是上一轮的页面
    try {
      const fresh = await assertFreshServedApp({ baseUrl: BASE })
      console.log(`产物预检：${fresh.artifactDir}（入口 ${fresh.chunk} / ${fresh.bytes} 字节）`)
    } catch (e) {
      console.error(`❌ 产物预检失败：${String(e.message).slice(0, 400)}`)
      process.exit(2)
    }
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

      const toolbar = dedupe(got.toolbar).map((b) => ({ ...b, covered: mark(b.name), clicked: interacted(b.name) }))
      const rowActions = dedupe(got.rowActions).map((b) => ({
        ...b,
        covered: mark(b.name),
        clicked: interacted(b.name)
      }))

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
        clickedCount: [...toolbar, ...rowActions].filter((b) => b.clicked).length,
        // 无点击证据的两类拆分（见 classifyActions）：backlog 才是补测队列，
        // stateLocked 是扫描态点不动的控件（首页态「上一页」），必须单列报数、不参与分母
        ...(() => {
          const c = classifyActions([...toolbar, ...rowActions])
          return {
            backlogNames: c.backlog.map((b) => b.name),
            stateLockedNames: c.stateLocked.map((b) => b.name),
            backlogCount: c.backlog.length,
            stateLockedCount: c.stateLocked.length
          }
        })(),
        tabs: tabCounts,
        iframeCount,
        // "有表头/有 tab 却 0 动作"必须自曝，否则 0 会被当成"这页本来就没按钮"
        suspicious: toolbar.length + rowActions.length === 0 && (got.columns.length > 0 || tabs.length > 1)
      }
      pages.push(rec)
      log(
        `${String(i + 1).padStart(2)}/${routes.length} ${routePath.padEnd(34)} ` +
          `动作 ${rec.actionCount}（覆盖 ${rec.coveredCount} / 点击 ${rec.clickedCount}）行 ${rec.rowCount}` +
          (rec.tabs && Object.keys(rec.tabs).length > 1 ? ` tab=${Object.keys(rec.tabs).length}` : '') +
          (rec.suspicious ? '  ⚠ 采集可疑（有表头/多 tab 却 0 动作）' : '')
      )
    }

    await browser.close()

    const totalActions = pages.reduce((s, p) => s + p.actionCount, 0)
    const totalCovered = pages.reduce((s, p) => s + p.coveredCount, 0)
    const totalClicked = pages.reduce((s, p) => s + p.clickedCount, 0)
    const totalStateLocked = pages.reduce((s, p) => s + p.stateLockedCount, 0)
    const totalBacklog = pages.reduce((s, p) => s + p.backlogCount, 0)
    // 分母只减掉"扫描态点不动"的那部分；其余（含 disabled 但可造出启用态的）仍算补测队列。
    // 两个口径同时打印：只报调整后数字，等于让分母可以被随手缩小（换判据必须看得见）。
    const clickableActions = totalActions - totalStateLocked
    const report = {
      generatedAt: new Date().toISOString(),
      base: BASE,
      routes: pages.length,
      totalActions,
      totalCovered,
      totalClicked,
      totalStateLocked,
      totalBacklog,
      clickableActions,
      coverage: totalActions ? +(totalCovered / totalActions).toFixed(3) : 0,
      // 原始口径（分母含点不动的控件）与可点口径并存，旧基线的数字仍然可比
      interactionCoverage: totalActions ? +(totalClicked / totalActions).toFixed(3) : 0,
      interactionCoverageClickable: clickableActions > 0 ? +(totalClicked / clickableActions).toFixed(3) : 0,
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
      `- 路由：${report.routes} 条 / 动作合计：**${totalActions}** / 源码中出现过：**${totalCovered}**（${(report.coverage * 100).toFixed(1)}%）/ 有真实交互证据：**${totalClicked}**（原始 ${(report.interactionCoverage * 100).toFixed(1)}%，剔除扫描态点不动的控件后 ${report.interactionCoverageClickable ? (report.interactionCoverageClickable * 100).toFixed(1) : '0.0'}%）`
    )
    lines.push(
      `- 无点击证据 ${totalActions - totalClicked} 条 = **补测队列 ${totalBacklog}** + 结构性点不动 ${totalStateLocked}（分页控件在首页/单页态被禁用，见末节逐条列名）`
    )
    lines.push('')
    lines.push('> 覆盖判据是**下界**：按钮文案在 `main.mjs`/`deep-e2e.mjs` 源码里出现过即算"提及"。')
    lines.push('> 出现不代表一定点过它；但**没出现基本等于没测过** ⇒ 用来找盲区可靠。')
    lines.push('> `clicked` 是更窄的下界：文案 ±3 行内必须有 `.click(`/`.fill(` 等真实调用；')
    lines.push('> "提及但未点击"是补测优先队列，**不作为硬棘轮**（跨行 locator 会漏报，用它判红会把写法差异当退步）。')
    lines.push('')
    lines.push('## 盲区清单（未在测试源码中出现过的动作）')
    lines.push('')
    lines.push('| 路由 | 未覆盖动作 | 行数 |')
    lines.push('|---|---|---|')
    for (const p of gaps.filter((g) => g.uncovered.length > 0)) {
      lines.push(`| \`${p.path}\` | ${p.uncovered.map((b) => b.name).join('、')} | ${p.rowCount} |`)
    }
    // 第二优先级：源码里提到了、但附近没有任何交互调用。这一组通常三种来源：
    // 只在注释/断言里出现、只作为表格列名、或用例把 locator 与 click 拆得太远。
    // b82：分母改用 `backlogNames`（= 无点击证据 **且** 扫描态可点），
    // 点不动的分页控件另起一节列名——剔除是为了不拿无法结清的条目淹没队列，
    // 单列是为了让"下一次真少点了一个按钮"仍然看得见。
    const hintOnly = pages
      .map((p) => ({ ...p, notClicked: p.backlogNames }))
      .filter((p) => p.notClicked.length > 0)
      .sort((a, b) => b.notClicked.length - a.notClicked.length)
    lines.push('')
    lines.push('## 提及但无点击证据的动作（补测优先队列）')
    lines.push('')
    if (!hintOnly.length) {
      lines.push('（无：所有提及过的动作附近都有真实交互调用）')
    } else {
      lines.push('| 路由 | 动作 | 行数 |')
      lines.push('|---|---|---|')
      for (const p of hintOnly) {
        lines.push(`| \`${p.path}\` | ${p.notClicked.map((b) => b.name).join('、')} | ${p.rowCount} |`)
      }
    }
    const lockedPages = pages
      .map((p) => ({ ...p, locked: p.stateLockedNames }))
      .filter((p) => p.locked.length > 0)
      .sort((a, b) => b.locked.length - a.locked.length)
    lines.push('')
    lines.push('## 扫描态点不动的控件（不计入补测队列，但仍逐条列名）')
    lines.push('')
    if (!lockedPages.length) {
      lines.push('（无：没有任何 disabled 且位于 `.el-pagination` 容器内的动作）')
    } else {
      lines.push(
        '> 判据是 DOM 事实（`disabled && closest(".el-pagination")`），不是文案黑名单；' +
          '`clicked` 优先于本节——点到过一次的控件不会落在这里。'
      )
      lines.push('')
      lines.push('| 路由 | 控件 | 行数 |')
      lines.push('|---|---|---|')
      for (const p of lockedPages) {
        lines.push(`| \`${p.path}\` | ${p.locked.join('、')} | ${p.rowCount} |`)
      }
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
    log(
      `完成：${totalActions} 个动作 / 覆盖 ${totalCovered}（${(report.coverage * 100).toFixed(1)}%）` +
        ` / 点击证据 ${totalClicked}（${(report.interactionCoverage * 100).toFixed(1)}%）`
    )
    log(`产物：${jsonPath}`)
    log(`产物：${mdPath}`)

    // ===== 覆盖率棘轮 =====
    // 单路由扫描不参与棘轮（分母不是全站，比较没有意义）
    if (onlyRoute) return
    const cur = { routes: report.routes, coverage: report.coverage }
    const base = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : null
    if (UPDATE_BASELINE) {
      // 先比后写：放松方向一律拒绝，基线文件保持原样
      if (base) {
        const bad = ratchetRegressions(base, cur)
        if (bad.length) {
          console.error(`❌ 拒绝放松棘轮：--update-baseline 只收紧不放宽，基线**未改动**\n  · ${bad.join('\n  · ')}`)
          process.exit(1)
        }
      }
      fs.writeFileSync(
        BASELINE_PATH,
        JSON.stringify(
          {
            generatedAt: report.generatedAt,
            routes: report.routes,
            totalActions,
            totalCovered,
            totalClicked,
            coverage: report.coverage,
            interactionCoverage: report.interactionCoverage,
            // **逐页明细**（b79，N-10 的前置）：基线此前只存聚合数，于是"分母从 405 变成 404"
            // 这类事件无法归因到某个页面——聚合相等/不等的两种情况都看不出是谁变的。
            // 明细进基线之后，`--gate` 每轮直接打逐页增减，定位只需一次跑批。
            // i = clicked（b81），随明细一起记，便于看"提及但没点"的存量趋势。
            perRoute: Object.fromEntries(
              pages.map((p) => [p.path, { a: p.actionCount, c: p.coveredCount, i: p.clickedCount }])
            ),
            note: '逐页动作清单基线：--gate 时覆盖率不得低于本值（容差 1pp），路由数不得减少；clicked 仅记录趋势'
          },
          null,
          2
        )
      )
      log(`✅ 基线已更新：${BASELINE_PATH}（覆盖 ${(report.coverage * 100).toFixed(1)}%）`)
      return
    }
    if (!GATE) return
    if (!base) {
      console.error(`❌ 覆盖率棘轮基线缺失：${BASELINE_PATH}（用 --update-baseline 生成）`)
      process.exit(1)
    }
    const bad = ratchetRegressions(base, cur)
    if (bad.length) {
      console.error(`❌ 覆盖率棘轮回退：\n  · ${bad.join('\n  · ')}`)
      process.exit(1)
    }
    log(
      `✅ 覆盖率棘轮通过：${(report.coverage * 100).toFixed(1)}% ≥ 基线 ` +
        `${(base.coverage * 100).toFixed(1)}%（容差 ${(COVERAGE_TOLERANCE * 100).toFixed(0)}pp）`
    )
    // 逐页对账（信息项，不判红）：聚合数相等不代表同一份数据——一页少一个动作、另一页多一个
    // 动作，聚合完全不动。b79 的 N-10（405→404 无法归因）就是因为缺这一段。
    if (base.perRoute) {
      const curMap = Object.fromEntries(
        pages.map((p) => [p.path, { a: p.actionCount, c: p.coveredCount, i: p.clickedCount }])
      )
      const paths = [...new Set([...Object.keys(base.perRoute), ...Object.keys(curMap)])].sort()
      const deltas = []
      for (const p of paths) {
        const b = base.perRoute[p]
        const c = curMap[p]
        if (!b) deltas.push(`新增页面 ${p}：动作 ${c.a} / 覆盖 ${c.c} / 点击 ${c.i ?? '—'}`)
        else if (!c) deltas.push(`页面消失 ${p}：基线动作 ${b.a} / 覆盖 ${b.c} / 点击 ${b.i ?? '—'}`)
        else if (b.a !== c.a || b.c !== c.c || (b.i !== undefined && b.i !== c.i))
          deltas.push(`${p}：动作 ${b.a}→${c.a}，覆盖 ${b.c}→${c.c}，点击 ${b.i ?? '—'}→${c.i}`)
      }
      if (deltas.length) {
        log(`ℹ 逐页明细与基线有 ${deltas.length} 处差异（聚合可能相等，差异在页面之间）：`)
        for (const d of deltas.slice(0, 30)) log(`    · ${d}`)
        if (deltas.length > 30) log(`    · （其余 ${deltas.length - 30} 处省略）`)
      } else {
        log('✅ 逐页明细与基线完全一致')
      }
    } else {
      log('ℹ 现存基线没有逐页明细（旧格式）——本轮起由 --update-baseline 写入 perRoute')
    }
  })().catch((e) => {
    console.error(`❌ 扫描失败: ${e.message}`)
    process.exit(1)
  })
}

// 判据自检不启浏览器：证明"归一消除了假盲区"，也证明"没把没测过的洗成测过"。
// 与项目里其余扫描器同纪律——判据自身的缺陷比缺检查更危险，所以双向用例必须常驻可跑。
if (process.argv.includes('--selftest')) {
  runSelftest()
} else {
  main()
}
