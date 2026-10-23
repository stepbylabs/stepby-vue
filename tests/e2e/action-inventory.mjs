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
/**
 * 两个"数量只许降"的棘轮栏（b83）。
 *
 * 为什么这两栏值得判（此前它们只被**打印**，采了不判=没采，同 b79 ⑨ 那条）：
 * · `totalBacklog` 是**补测队列**——"扫到了、没有点击证据、并且结构上本可点"。它变多就是
 *   "新增控件没配用例"或"原用例被删"，方向明确，不需要容差之外的解释。
 * · `totalStateLocked` 是 `interactionCoverageClickable` 的**分母扣减项**。它会涨有两种成因：
 *   ① 页面数据态变了（表格只剩一页 ⇒「上一页」全禁用），② 有人把"点得到的"改判成"点不动"
 *   从而白赚一个更高的可点覆盖率。①是本判据的反面教材（与环境耦合），②是真退化。
 *   两者都表现为"这一栏变大"，所以取**只许降 + 容差**：正常抖动落在容差内，
 *   成规模的重分类一定出界。容差写在下面，改它必须同时改这里的注释。
 */
const COUNT_RATCHETS = [
  { key: 'totalBacklog', label: '补测队列 backlog', tol: 2 },
  { key: 'totalStateLocked', label: '扫描态点不动 stateLocked', tol: 2 }
]
/** 基线里缺这两栏 ⇒ 判据不可比（旧格式基线），不得默默跳过 */
function baseMissingCountKeys(base) {
  return COUNT_RATCHETS.filter((r) => typeof base?.[r.key] !== 'number').map((r) => r.key)
}

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
  for (const r of COUNT_RATCHETS) {
    if (typeof cur[r.key] !== 'number') {
      bad.push(`${r.label}（${r.key}）本轮取不到数（${String(cur[r.key])}）——判据断电，不得据此收紧`)
      continue
    }
    if (typeof base[r.key] !== 'number') {
      bad.push(`基线缺 ${r.key} 栏（旧格式）⇒ ${r.label}无法比对，须与新判据同批 --update-baseline 重生成基线`)
      continue
    }
    if (cur[r.key] > base[r.key] + r.tol) {
      bad.push(`${r.label} ${base[r.key]} → ${cur[r.key]}（只许降，容差 ${r.tol}）`)
    }
  }
  return bad
}

/**
 * 行内动作面覆盖率（批八十七项 5）——把"分母随数据消失"从提示变成判定。
 *
 * 立案事实（b86 §10 实测）：行内按钮（修改/删除/测试…）**只在有数据行时才存在于 DOM**。
 * `/system/msg/channel` 一轮里动作 12→7，是因为那一页本轮 0 行、空态「暂无数据」，
 * 5 个行内按钮结构性消失——而 `coverage` 照样是 100%，因为分子分母一起缩。
 * b86 只做到"打印时给归因"（这条轴原先只能看见数字变小、不能定性），本批把它做成棘轮：
 * **分母固定取基线记录过的行内动作数**，分子取本轮实测覆盖数并按基线分母封顶。
 * 于是"页面本轮 0 行"必然让这一栏下降，而"给这一页补上数据/用例"能让它升回去——
 * `coverage` 看不见的那一半信号在这里可见。
 *
 * 为什么不做成"0 行就 UNRUN"：那等于让绿红由数据态决定（本表 ④ 禁止的形态），
 * 而实测今天 56 页里有 17 页就是 0 行——闸会在装上第一轮变成"每轮必红直到有人造夹具"，
 * 结局是被人去改阈值。棘轮的方向（只许升）才是让"补数据"有收益的那条路。
 *
 * `baseRows` / `curRows` 同形：`{ path: { t, c, r, e } }`
 * = 行内动作总数 / 其中已覆盖 / 本轮该页行数 / 空态文案。
 * 返回 `null` = **不可比**（基线没有这一栏、或条目形状坏了），调用方必须走 UNRUN 而不是当成"没退步"。
 */
function rowSurface(baseRows, curRows) {
  if (!baseRows || typeof baseRows !== 'object' || Array.isArray(baseRows)) return null
  const paths = Object.keys(baseRows)
  if (!paths.length) return null
  for (const p of paths) {
    if (typeof baseRows[p]?.t !== 'number') return null
  }
  let total = 0
  let covered = 0
  const shrunk = []
  for (const p of paths) {
    const b = baseRows[p]
    const c = curRows?.[p]
    total += b.t
    // 本轮多出来的行内动作不得用来抬高历史分母的覆盖率（封顶 = 换尺的那条路）
    covered += c && typeof c.c === 'number' ? Math.min(c.c, b.t) : 0
    if (b.t > 0 && (!c || c.t < b.t)) {
      shrunk.push({ path: p, base: b.t, now: c ? c.t : 0, rowCount: c?.r, emptyText: c?.e || '' })
    }
  }
  if (!total) return null
  return { ratio: covered / total, total, covered, shrunk }
}

/**
 * 行内动作面退步的**绝对下限**（b87，前言 ⑱ 同一条纪律：近零量上的相对容差是噪声放大器）。
 *
 * 本轮实测分母只有 59 个行内动作 ⇒ 1pp 容差 ≈ 0.6 个动作，也就是"某页少掉一个按钮"
 * 就足以判红——那是整数访问次数决定的抖动，不是真回归。所以退步必须**同时**满足两条：
 * 相对超容差 **且** 绝对少掉的动作数够得着一回真退化。低于下限的缩水**留痕不静默**
 * （`notices` 与判定共用同一次扫描，两份实现必漂）。
 */
const ROW_SURFACE_MIN_LOST_ACTIONS = 3

/**
 * 采集口径名（b87 项 5 后续）。写进基线、比对时与代码常量逐条核
 * （同 `endpoint-coverage` 的 `metric`、`request-storm` 的参数栏：换判据必须与重生成基线**同批**）。
 *
 * 为什么这一批必须有它：采样从"固定 `sleep(1400)` 看一眼"改成"轮询到落定"之后，
 * 同一页能多扫出行内按钮——实测 `/system/msg/channel` 由 `0 行 / 7 动作` 变成 `3 行 / 12 动作`，
 * 于是 `totalBacklog` 从 46 涨到 50。那**不是退步，是旧尺量不出新面**：
 * 让这种"内容退步"拒绝落盘，等于把一份被瞬时读数污染的旧基线永久钉成天花板。
 */
const INVENTORY_SAMPLING = 'settled-poll-v1'

/** 行内动作面棘轮的比较式（`--gate` 与 `--update-baseline` 共用，同 `ratchetRegressions` 的纪律） */
function rowRatchetRegressions(base, curRows) {
  const surface = rowSurface(base?.rowPerRoute, curRows)
  if (!surface) {
    // 文案必须含"基线缺"三字：`--update-baseline` 的旧格式口径迁移通道（`onlyShape`）按它识别
    return {
      comparable: false,
      surface: null,
      notices: [],
      regressions: [
        '基线缺 rowPerRoute 明细栏（或条目形状不可解析）⇒ 行内动作面覆盖率无法比对（不是退步，是判据不可用），' +
          '须与新判据同批 --update-baseline 重生成基线'
      ]
    }
  }
  const bad = []
  if (typeof base.rowSurfaceCoverage !== 'number') {
    bad.push(
      `基线缺 rowSurfaceCoverage 栏（实测 ${String(base.rowSurfaceCoverage)}）⇒ 无法比对，` +
        '须与新判据同批 --update-baseline 重生成基线'
    )
    return { comparable: false, surface, regressions: bad, notices: [] }
  }
  // 参数对账（前言 ⑱：换判据必须与重生成基线同批，否则是拿更松的尺去量旧数字）
  if (base.rowSurfaceMinLostActions !== ROW_SURFACE_MIN_LOST_ACTIONS) {
    return {
      comparable: false,
      surface,
      regressions: [
        `基线口径不一致：rowSurfaceMinLostActions 记 ${String(base.rowSurfaceMinLostActions)}、` +
          `代码取 ${ROW_SURFACE_MIN_LOST_ACTIONS} ⇒ 这一栏无法比对（不是退步）。` +
          '改判据参数必须与重生成基线同批。'
      ],
      notices: []
    }
  }
  const drop = base.rowSurfaceCoverage - surface.ratio
  // 退步的**绝对量**：比率差 × 基线分母 = 少掉的行内动作个数（近零分母上的 1pp ≈ 0.6 个动作）
  const lost = drop * surface.total
  const why = surface.shrunk
    .map(
      (s) =>
        `  · ${s.path}：行内动作 ${s.base} → ${s.now}` +
        (s.rowCount === 0
          ? `（本轮该页 0 行${s.emptyText ? `、空态「${s.emptyText}」` : ''}⇒ 行内按钮随数据消失，需要给这一页配数据夹具或用例）`
          : '（该页仍有数据行，是动作本身少了 ⇒ 控件被删或用例文案变了）')
    )
    .join('\n')
  const notices = []
  // 两条腿必须同时超界才判红（相对容差 + 绝对下限），但**低于下限的缩水要留痕**，不得静默
  if (drop > COVERAGE_TOLERANCE && lost >= ROW_SURFACE_MIN_LOST_ACTIONS) {
    bad.push(
      `行内动作面覆盖 ${(surface.ratio * 100).toFixed(1)}% < 基线 ${(base.rowSurfaceCoverage * 100).toFixed(1)}%` +
        `（-${(drop * 100).toFixed(1)}pp，容差 ${(COVERAGE_TOLERANCE * 100).toFixed(0)}pp；` +
        `分母固定为基线的 ${surface.total} 个行内动作 ⇒ 净少 ${lost.toFixed(1)} 个，` +
        `绝对下限 ${ROW_SURFACE_MIN_LOST_ACTIONS} 个）\n缩水 ${surface.shrunk.length} 页：\n${why}`
    )
  } else if (lost > 0) {
    notices.push(
      `ℹ 另有 ${surface.shrunk.length} 页行内动作缩水、净少 ${lost.toFixed(1)} 个（低于绝对下限 ` +
        `${ROW_SURFACE_MIN_LOST_ACTIONS} 个 ⇒ 不判红，但这就是"那条动作本轮没被测"）：\n${why}`
    )
  }
  return { comparable: true, surface, regressions: bad, notices }
}

/**
 * 基线"这一栏没有 / 形状不可解析"的缺栏名单——**口径闸**，不是退步（本表 ⑨：口径闸排在内容闸之前）。
 * `--update-baseline` 的唯一"带病落盘"通道按这份名单放行（旧格式基线永远等不到可比断面）。
 */
function baselineShapeGaps(base, curRows) {
  const gaps = baseMissingCountKeys(base)
  if (!rowSurface(base?.rowPerRoute, curRows)) gaps.push('rowPerRoute')
  else if (typeof base?.rowSurfaceCoverage !== 'number') gaps.push('rowSurfaceCoverage')
  else if (base.rowSurfaceMinLostActions !== ROW_SURFACE_MIN_LOST_ACTIONS) gaps.push('rowSurfaceMinLostActions')
  // 采样口径戳：换尺就必须与重生成基线同批（见 INVENTORY_SAMPLING 的成因）
  if (base?.sampling !== INVENTORY_SAMPLING) gaps.push('sampling')
  return gaps
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 落定判据（纯函数，b87 项 5 的后续修复）。
 *
 * 为什么必须有这一层：原先每页 `goto` 后**固定 `sleep(1400)` 再采样**，读数由网络快慢决定——
 * 同一份产物、同一份库，实测两把把 `/system/msg/channel` 读成 **0 行**与 **3 行**
 * （`rowPerRoute.t` 于是取到 0 与 3 两个值 ⇒ 行内动作面的**分母**自己抖）。
 * 这正是门禁表前言 ④ 明令禁止的形态：判据的数由环境决定，而这个数喂给"只许升"的棘轮。
 *
 * 规则：连续两次采样的 `(rows, loading)` 相同 **且** `loading === false` ⇒ 落定。
 *  - **真空表**（rows=0、无遮罩、两次一致）⇒ 判落定：那是合法的 0 行，不得当成"没读完"；
 *  - 遮罩始终在 ⇒ 判未落定：调用方必须 UNRUN，不得把"还没读到"写成"这页没有动作"。
 */
function settleVerdict(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return { settled: false, reason: '采样不足' }
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    if (a.rows === b.rows && a.loading === b.loading && b.loading === false) return { settled: true, at: i, reason: '' }
  }
  const last = samples[samples.length - 1]
  return { settled: false, reason: last.loading ? '加载遮罩未消失' : '行数仍在变化' }
}

/** 页内只读采样：行数按 el-table 的可见 body 计，遮罩按 `.el-loading-mask` 的可见性计 */
function sampleTableState() {
  const visible = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
  }
  const tables = [...document.querySelectorAll('.el-table')].filter(visible)
  let rows = 0
  for (const t of tables) rows += [...t.querySelectorAll('.el-table__body tbody tr')].filter(visible).length
  const loading = [...document.querySelectorAll('.el-loading-mask')].some(visible)
  return { rows, loading }
}

/**
 * 轮询到落定（上限 maxMs）。三个量都进凭证：落定用了多久是人判断"这页到底有多慢"的唯一线索
 * （同 b79 把 M87 的采样改成"轮询到落定 + 把落定耗时写进凭证"那一条）。
 */
async function waitTableSettled(page, maxMs = 8000, stepMs = 250) {
  const t0 = Date.now()
  const samples = []
  while (Date.now() - t0 < maxMs) {
    const st = await page.evaluate(sampleTableState).catch(() => ({ rows: 0, loading: false }))
    samples.push(st)
    const v = settleVerdict(samples)
    if (v.settled) return { settled: true, ms: Date.now() - t0, reason: '', samples: samples.length }
    await sleep(stepMs)
  }
  const v = settleVerdict(samples)
  return { settled: false, ms: Date.now() - t0, reason: v.reason || '超时仍未一致', samples: samples.length }
}
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
  // b83 起这两条数量栏（backlog / stateLocked）也进同一个纯函数——两条收紧入口必须共用判据。
  const R0 = { totalBacklog: 10, totalStateLocked: 6 }
  const withR = (o) => ({ ...R0, ...o })
  const rCases = [
    ['覆盖率下降 2pp 必须报退步', withR({ routes: 56, coverage: 1.0 }), withR({ routes: 56, coverage: 0.98 }), true],
    [
      '覆盖率下降在 1pp 容差内不得报',
      withR({ routes: 56, coverage: 1.0 }),
      withR({ routes: 56, coverage: 0.995 }),
      false
    ],
    [
      '路由数减少必须报（哪怕覆盖率没变）',
      withR({ routes: 56, coverage: 1.0 }),
      withR({ routes: 55, coverage: 1.0 }),
      true
    ],
    ['覆盖率上升不得报', withR({ routes: 56, coverage: 1.0 }), withR({ routes: 56, coverage: 1.0 }), false],
    [
      '取不到数不得放行（判据断电＝退步）',
      withR({ routes: 56, coverage: 1.0 }),
      withR({ routes: 56, coverage: undefined }),
      true
    ],
    [
      'backlog 增加 5 条必须报（新增控件没配用例）',
      withR({ routes: 56, coverage: 1.0 }),
      withR({ routes: 56, coverage: 1.0, totalBacklog: 15 }),
      true
    ],
    [
      'backlog 增加在容差内不得报',
      withR({ routes: 56, coverage: 1.0 }),
      withR({ routes: 56, coverage: 1.0, totalBacklog: 12 }),
      false
    ],
    [
      'backlog 减少（补测队列结清）不得报',
      withR({ routes: 56, coverage: 1.0 }),
      withR({ routes: 56, coverage: 1.0, totalBacklog: 3 }),
      false
    ],
    [
      'stateLocked 增加 9 条必须报（分母被重分类缩掉）',
      withR({ routes: 56, coverage: 1.0 }),
      withR({ routes: 56, coverage: 1.0, totalStateLocked: 15 }),
      true
    ],
    [
      '本轮两栏取不到数不得放行（采集坏了不得读成没退步）',
      withR({ routes: 56, coverage: 1.0 }),
      { routes: 56, coverage: 1.0 },
      true
    ],
    [
      '旧格式基线缺栏必须报（由调用方映射成 EXIT=2 不可比，而不是默默跳过）',
      { routes: 56, coverage: 1.0 },
      withR({ routes: 56, coverage: 1.0 }),
      true
    ],
    [
      '缺栏消息必须点名是哪一栏（否则人只会去改阈值）',
      { routes: 56, coverage: 1.0, totalStateLocked: 6 },
      withR({ routes: 56, coverage: 1.0 }),
      true
    ]
  ]
  let rBad = 0
  for (const [desc, base, cur, want] of rCases) {
    const got = ratchetRegressions(base, cur).length > 0
    const ok = got === want
    if (!ok) rBad++
    console.log(`  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：期望报退步=${want}，实际 ${got}`)
  }
  // 缺栏那两条必须**只**出缺栏文案（口径闸与内容闸不能混报，b82 ⑨）
  const shapeOnly = ratchetRegressions({ routes: 56, coverage: 1.0 }, withR({ routes: 56, coverage: 1.0 }))
  if (shapeOnly.length !== 2 || !shapeOnly.every((m) => m.includes('基线缺'))) {
    rBad++
    console.log(`  ✘ [MISMATCH] 旧格式基线只应报缺栏两条，实际 ${JSON.stringify(shapeOnly)}`)
  } else {
    console.log('  ✅ [OK] 旧格式基线只报缺栏两条（口径与内容不混报）')
  }
  if (baseMissingCountKeys(withR({})).length !== 0) {
    rBad++
    console.log('  ✘ [MISMATCH] 齐全基线被判成缺栏（辅助函数与判据不同源）')
  } else {
    console.log('  ✅ [OK] 齐全基线不缺栏（正控：闸不得一律拒）')
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
  // 第五族（b87 项 5）：行内动作面覆盖率。核心是**分母必须来自基线**，
  // 于是"页面本轮 0 行、按钮结构性消失"表现为退步而不是"覆盖率 100%"。
  const sCases = [
    {
      title: '正控：数据没变的同一断面 ⇒ 1.0 且无缩水页（这条必须绿，否则判据是恒红）',
      base: { '/a': { t: 3, c: 3 }, '/b': { t: 2, c: 2 } },
      cur: { '/a': { t: 3, c: 3, r: 10, e: '' }, '/b': { t: 2, c: 2, r: 4, e: '' } },
      want: { ratio: 1, shrunk: 0 }
    },
    {
      title: '一页本轮 0 行 ⇒ 行内动作从 5 掉到 0：必须判退步并点名该页（b86 的立案形状）',
      base: { '/system/msg/channel': { t: 5, c: 5 }, '/a': { t: 3, c: 3 } },
      cur: { '/system/msg/channel': { t: 0, c: 0, r: 0, e: '暂无数据' }, '/a': { t: 3, c: 3, r: 2, e: '' } },
      want: { ratio: (3 + 0) / 8, shrunk: 1, shrunkPath: '/system/msg/channel', rowCount: 0 }
    },
    {
      title: '行内动作消失但覆盖数不动（纯工具栏页）⇒ 不得算缩水（防判据扩大化）',
      base: { '/a': { t: 0, c: 0 }, '/b': { t: 2, c: 2 } },
      cur: { '/a': { t: 0, c: 0, r: 0, e: '暂无数据' }, '/b': { t: 2, c: 2, r: 1, e: '' } },
      want: { ratio: 1, shrunk: 0 }
    },
    {
      title: '本轮新增基线里没有的页 ⇒ 分母不变，不得靠新页抬高历史分母的覆盖率',
      base: { '/a': { t: 4, c: 2 } },
      cur: { '/a': { t: 4, c: 2, r: 3, e: '' }, '/new': { t: 9, c: 9, r: 8, e: '' } },
      want: { ratio: 0.5, shrunk: 0 }
    },
    {
      title: '本轮某页行内动作多于基线 ⇒ 分子按基线分母封顶（换尺的那条路必须堵）',
      base: { '/a': { t: 2, c: 2 } },
      cur: { '/a': { t: 6, c: 6, r: 5, e: '' } },
      want: { ratio: 1, shrunk: 0 }
    },
    {
      title: '基线有该页、本轮整页消失 ⇒ 计为缩水且分子按 0 算（页面消失不得从分母里悄悄摘掉）',
      base: { '/a': { t: 3, c: 3 }, '/gone': { t: 3, c: 3 } },
      cur: { '/a': { t: 3, c: 3, r: 2, e: '' } },
      want: { ratio: 0.5, shrunk: 1, shrunkPath: '/gone' }
    }
  ]
  let sBad = 0
  for (const c of sCases) {
    const got = rowSurface(c.base, c.cur)
    const ok =
      got &&
      Math.abs(got.ratio - c.want.ratio) < 1e-9 &&
      got.shrunk.length === c.want.shrunk &&
      (c.want.shrunkPath === undefined || got.shrunk[0]?.path === c.want.shrunkPath) &&
      (c.want.rowCount === undefined || got.shrunk[0]?.rowCount === c.want.rowCount)
    if (!ok) sBad++
    console.log(
      `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${c.title}：` +
        `期望 ratio=${c.want.ratio.toFixed(3)} 缩水 ${c.want.shrunk} 页，实际 ratio=${got?.ratio.toFixed(3)} 缩水 ${got?.shrunk.length ?? '—'} 页`
    )
  }
  if (sBad) {
    console.error(`❌ 行内动作面自检失败 ${sBad}/${sCases.length} 条——分母口径不可信，"覆盖率"一词本轮不作数`)
    process.exit(1)
  }
  // 不可比（旧格式基线）必须走 UNRUN 通道而不是"没退步"：文案含"基线缺"是口径迁移的识别键
  const uncomparable = [
    ['基线完全没有 rowPerRoute 栏', {}, '/a'],
    ['rowPerRoute 是空对象（扫描器没产出）', { rowPerRoute: {} }, '/a'],
    ['条目形状坏了（t 不是数值）', { rowPerRoute: { '/a': { t: '3' } } }, '/a']
  ]
  let uBad = 0
  for (const [desc, base, path] of uncomparable) {
    const r = rowRatchetRegressions(base, { [path]: { t: 1, c: 1, r: 1, e: '' } })
    const ok = !r.comparable && r.regressions.length === 1 && r.regressions[0].includes('基线缺')
    if (!ok) uBad++
    console.log(
      `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：期望不可比 + 文案含"基线缺"，实际 ${JSON.stringify(r.regressions)}`
    )
  }
  if (uBad) {
    console.error(`❌ 不可比通道自检失败 ${uBad}/${uncomparable.length} 条——缺栏会被读成"没有退步"（假绿）`)
    process.exit(1)
  }
  // 两条腿（前言 ⑱：近零分母上的相对容差是噪声放大器）：相对超界 **且** 绝对够得着一回真退化才判红，
  // 低于下限的缩水必须留痕（notices），不得静默——比较式与 ℹ 共用同一次扫描，两份实现必漂。
  const mkRows = (n, lost) => {
    const baseRows = {}
    const cur = {}
    for (let i = 0; i < n; i++) {
      baseRows[`/p${i}`] = { t: 3, c: 3 }
      cur[`/p${i}`] = { t: 3, c: 3, r: 5, e: '' }
    }
    for (const p of lost) cur[p] = { t: 0, c: 0, r: 0, e: '暂无数据' }
    return { baseRows, cur }
  }
  const wholePage = mkRows(20, ['/p3'])
  const twoActions = mkRows(20, [])
  twoActions.cur['/p0'] = { t: 1, c: 1, r: 2, e: '' } // 同页仍有行，动作少 2 个
  const zeroShrink = mkRows(20, [])
  const legCases = [
    { title: '整页 0 行（净少 3 个 = 恰达绝对下限）⇒ 必须判红', f: wholePage, wantRed: true },
    { title: '净少 2 个（低于下限 3）⇒ 不得判红，但必须留痕一条 ℹ', f: twoActions, wantRed: false },
    { title: '正控：同一断面零缩水 ⇒ 既不判红也不留痕（防 notices 恒非空）', f: zeroShrink, wantRed: false }
  ]
  let legBad = 0
  for (const c of legCases) {
    const base = {
      rowPerRoute: c.f.baseRows,
      rowSurfaceCoverage: 1,
      rowSurfaceMinLostActions: ROW_SURFACE_MIN_LOST_ACTIONS
    }
    const r = rowRatchetRegressions(base, c.f.cur)
    const red = r.regressions.length > 0
    const noted = r.notices.length > 0
    const ok = r.comparable && red === c.wantRed && (red || (c.wantRed ? false : noted || c.f === zeroShrink))
    if (!ok) legBad++
    console.log(
      `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${c.title}：期望判红=${c.wantRed}，实际判红=${red} 留痕=${noted}`
    )
  }
  if (legBad) {
    console.error(`❌ 两条腿自检失败 ${legBad}/${legCases.length} 条——"噪声放大器"或"静默缩水"至少有一种没堵住`)
    process.exit(1)
  }
  // 参数对账（前言 ⑱）：基线记的参数与代码常量不一致 ⇒ 不可比，文案含"基线口径不一致"
  const paramCase = rowRatchetRegressions(
    { rowPerRoute: { '/a': { t: 1, c: 1 } }, rowSurfaceCoverage: 1, rowSurfaceMinLostActions: 99 },
    { '/a': { t: 1, c: 1, r: 1, e: '' } }
  )
  if (paramCase.comparable || !paramCase.regressions[0]?.includes('基线口径不一致')) {
    console.error('❌ 参数对账通道坏了：换判据参数必须让比对拒绝，而不是照旧判')
    process.exit(1)
  }
  console.log('  ✅ [OK] 基线参数与本常量不一致 ⇒ 拒绝比对并点名两个数')
  // 真实树正控（不启浏览器，只读已提交基线）：专抓"基线是加参数之前那一轮写的"这类同批漏改
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`❌ 基线文件缺失：${BASELINE_PATH}——真实树正控没跑，不得读成"通过"`)
    process.exit(1)
  }
  let realCtl = 0 // 真实基线正控条数由计数器给（写死的数字加一条控制就变成假账）
  const real = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  const sumT = Object.values(real.rowPerRoute || {}).reduce((n, v) => n + (v.t || 0), 0)
  const sumC = Object.values(real.rowPerRoute || {}).reduce((n, v) => n + (v.c || 0), 0)
  console.log(
    `  ${sumT > 0 ? '✅' : '✘'} [${sumT > 0 ? 'OK' : 'MISMATCH'}] 真实基线自证：rowPerRoute ` +
      `${Object.keys(real.rowPerRoute || {}).length} 页 / Σt=${sumT} / Σc=${sumC} / ` +
      `参数=${String(real.rowSurfaceMinLostActions)}`
  )
  realCtl++
  if (sumT <= 0) {
    console.error('❌ 已提交基线里 rowPerRoute 是空的 ⇒ 这一栏从没真正落过盘')
    process.exit(1)
  }
  if (real.rowSurfaceMinLostActions !== ROW_SURFACE_MIN_LOST_ACTIONS) {
    console.error(
      `❌ 已提交基线缺/不匹配 rowSurfaceMinLostActions（实测 ${String(real.rowSurfaceMinLostActions)}）` +
        '⇒ 判据换形必须与重生成基线同批（跑 --update-baseline 走口径迁移）'
    )
    process.exit(1)
  }
  // 基线必须与自己算得平：记的覆盖率 === Σc/Σt（手改过数字的基线在这里出声）
  if (Math.abs((real.rowSurfaceCoverage ?? -1) - sumC / sumT) > 1e-9) {
    console.error(`❌ 已提交基线自相矛盾：记 rowSurfaceCoverage=${real.rowSurfaceCoverage}，按明细重算=${sumC / sumT}`)
    process.exit(1)
  }
  realCtl++
  console.log('  ✅ [OK] 已提交基线的覆盖率与自身明细逐字对账相等（非手改）')
  // baselineShapeGaps 的正控：完整基线必须报 0 个缺栏，否则口径闸会把每一轮都判成不可比
  const fullGap = baselineShapeGaps(
    {
      totalBacklog: 0,
      totalStateLocked: 0,
      rowPerRoute: { '/a': { t: 1, c: 1 } },
      rowSurfaceCoverage: 1,
      rowSurfaceMinLostActions: ROW_SURFACE_MIN_LOST_ACTIONS,
      sampling: INVENTORY_SAMPLING
    },
    { '/a': { t: 1, c: 1, r: 1, e: '' } }
  )
  if (fullGap.length) {
    console.error(`❌ 完整基线仍被判缺栏（${fullGap.join('/')}）⇒ 口径闸恒红，这条棘轮永远跑不起来`)
    process.exit(1)
  }
  realCtl++
  // 反例：没有口径戳的基线必须被点名 sampling（否则换尺会撞内容闸，人就去改阈值）
  const staleGap = baselineShapeGaps(
    {
      totalBacklog: 0,
      totalStateLocked: 0,
      rowPerRoute: { '/a': { t: 1, c: 1 } },
      rowSurfaceCoverage: 1,
      rowSurfaceMinLostActions: ROW_SURFACE_MIN_LOST_ACTIONS
    },
    { '/a': { t: 1, c: 1, r: 1, e: '' } }
  )
  if (!staleGap.includes('sampling')) {
    console.error(
      `❌ 没有口径戳的旧基线未被判成 sampling 缺栏（实际 ${staleGap.join('/') || '无缺栏'}）⇒ 换尺会被当成"本轮变差"`
    )
    process.exit(1)
  }
  // 真实基线：口径戳必须等于代码常量（本批刚换尺 ⇒ 重生成之前这一条就该红）
  if (real.sampling !== INVENTORY_SAMPLING) {
    console.error(
      `❌ 已提交基线的采样口径是 ${String(real.sampling)}、代码取 ${INVENTORY_SAMPLING}` +
        '⇒ 判据换形必须与重生成基线同批（跑 --update-baseline）'
    )
    process.exit(1)
  }
  realCtl++
  console.log(`  ✅ [OK] 已提交基线带当前采样口径戳（${real.sampling}）`)
  // 第六族（b87 项 5 后续）：表格读数落定判据。钉的是"分母不得由网络快慢决定"。
  const stCases = [
    {
      title: '正控：真空表（rows=0、无遮罩、两次一致）必须判落定（否则合法的 0 行页每轮必红）',
      samples: [
        { rows: 0, loading: false },
        { rows: 0, loading: false }
      ],
      want: true
    },
    {
      title: '正控：首屏遮罩 + 3 行到位后两次一致 ⇒ 落定（本批实测那次 0 行/3 行抖动就是这一形）',
      samples: [
        { rows: 0, loading: true },
        { rows: 3, loading: false },
        { rows: 3, loading: false }
      ],
      want: true
    },
    { title: '采样只有一条 ⇒ 未落定（不得把"只看了一眼"当落定）', samples: [{ rows: 3, loading: false }], want: false },
    {
      title: '行数还在变 ⇒ 未落定，且文案指"行数仍在变化"',
      samples: [
        { rows: 1, loading: false },
        { rows: 3, loading: false }
      ],
      want: false,
      reason: '行数仍在变化'
    },
    {
      title: '遮罩始终不消失 ⇒ 未落定，且文案指遮罩（不得把"没读完"写成"这页没动作"）',
      samples: [
        { rows: 0, loading: true },
        { rows: 0, loading: true }
      ],
      want: false,
      reason: '加载遮罩未消失'
    },
    { title: 'samples 不是数组 ⇒ 未落定（形状防御，不得抛）', samples: 'nonsense', want: false }
  ]
  let stBad = 0
  for (const t of stCases) {
    const v = settleVerdict(t.samples)
    const okWant = v.settled === t.want
    const okReason = !t.reason || v.reason === t.reason
    if (!(okWant && okReason)) {
      stBad++
      console.error(`  ❌ 落定判据：${t.title}（实际 settled=${v.settled} reason="${v.reason}"）`)
    } else console.log(`  ✅ [OK] ${t.title}`)
  }
  if (stBad) {
    console.error(`❌ 落定判据自检失败 ${stBad}/${stCases.length} 条 ⇒ 行内动作面分母仍由网络快慢决定`)
    process.exit(1)
  }
  // 生效路径反查（写了没接线=没写）：跑批正文必须真的调用这条通道并有 UNRUN 那一支
  const selfSrc = fs.readFileSync(path.join(__dirname, 'action-inventory.mjs'), 'utf8')
  if (!selfSrc.includes('const settle = await waitTableSettled(page)')) {
    console.error('❌ 跑批正文没有调用 waitTableSettled ⇒ 落定判据是死码')
    process.exit(1)
  }
  if (!selfSrc.includes('页表格读数未落定 ⇒ 本轮行内动作面不作数')) {
    console.error('❌ 跑批正文没有"未落定 ⇒ EXIT=2"这一支 ⇒ 未落定会被当成正常读数')
    process.exit(1)
  }

  console.log(
    `SYNTH_OK 动作名归一自检通过（${cases.length} 条双向判据：6 条必须覆盖 / 6 条必须不覆盖）` +
      ` + 点击证据 ${iCases.length} 条双向（含"只提及不算点过"反例）` +
      ` + 棘轮比较式 ${rCases.length} 条双向` +
      ` + 无点击证据拆分 ${cCases.length} 条双向（含拆分守恒正控）` +
      ` + 行内动作面分母 ${sCases.length} 条双向 + 不可比通道 ${uncomparable.length} 条` +
      ` + 两条腿（相对容差 × 绝对下限）${legCases.length} 条 + 参数对账 1 条 + 已提交基线真实树正控 ${realCtl} 条（含口径戳对账）` +
      ` + 表格读数落定 ${stCases.length} 条双向（含两个正控）+ 生效路径反查 2 条`
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
      // 600ms 是"SPA 首屏挂载"的下限，不是读数等待；读数一律交给下面的落定轮询。
      await sleep(600)
      await dismissTour(page)
      const settle = await waitTableSettled(page)
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
        // 读数落定凭证（见 settleVerdict）：未落定的页必须让本轮判据不作数
        settled: settle.settled,
        settleMs: settle.ms,
        settleReason: settle.reason,
        // "有表头/有 tab 却 0 动作"必须自曝，否则 0 会被当成"这页本来就没按钮"
        suspicious: toolbar.length + rowActions.length === 0 && (got.columns.length > 0 || tabs.length > 1)
      }
      pages.push(rec)
      log(
        `${String(i + 1).padStart(2)}/${routes.length} ${routePath.padEnd(34)} ` +
          `动作 ${rec.actionCount}（覆盖 ${rec.coveredCount} / 点击 ${rec.clickedCount}）行 ${rec.rowCount}` +
          (rec.tabs && Object.keys(rec.tabs).length > 1 ? ` tab=${Object.keys(rec.tabs).length}` : '') +
          (rec.suspicious ? '  ⚠ 采集可疑（有表头/多 tab 却 0 动作）' : '') +
          (rec.settled ? '' : `  ❌ 未落定（${rec.settleReason} / ${rec.settleMs}ms）`)
      )
    }

    await browser.close()

    // 口径闸（必须排在任何内容比对之前，前言 ⑨）：有一页没落定 ⇒ 本轮不作数。
    // 这不是退步而是"判据不可用"，所以退出码取 2（UNRUN）而不是 1：
    // 报 1 会把人支使去"补登记 / 调阈值"，而正确的动作是查那页为什么读不完。
    const unsettled = pages.filter((x) => !x.settled)
    if (unsettled.length) {
      console.error(
        `[FATAL] ${unsettled.length}/${pages.length} 页表格读数未落定 ⇒ 本轮行内动作面不作数：` +
          unsettled.map((x) => `${x.path}(${x.settleReason}, ${x.settleMs}ms)`).join(' ')
      )
      process.exit(2)
    }
    const slowest = pages.reduce((a, x) => (x.settleMs > a.settleMs ? x : a), pages[0])
    log(`落定核对：${pages.length}/${pages.length} 页落定（最慢 ${slowest.path} ${slowest.settleMs}ms）`)

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
    const cur = {
      routes: report.routes,
      coverage: report.coverage,
      totalBacklog: report.totalBacklog,
      totalStateLocked: report.totalStateLocked
    }
    const base = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : null
    // 本轮的行内动作面：t=行内动作数 / c=其中已覆盖 / r=该页本轮行数 / e=空态文案。
    // r、e 进快照只为了**失败文案能说出原因**（0 行 ⇒ 按钮在 DOM 里根本不存在），
    // 不参与判定——判定的分母永远是基线那一栏（见 rowSurface 的立案注释）。
    const curRows = Object.fromEntries(
      pages.map((p) => [
        p.path,
        { t: p.rowActions.length, c: p.rowActions.filter((b) => b.covered).length, r: p.rowCount, e: p.emptyText || '' }
      ])
    )
    const rowSelfSurface = rowSurface(curRows, curRows)
    if (UPDATE_BASELINE) {
      // 先比后写：放松方向一律拒绝，基线文件保持原样
      if (base) {
        // **采样口径变更必须排在内容比对之前**（本表 ⑨：口径闸先于内容闸）：换了尺之后
        // 旧基线的任何数字都不是本轮的基准，把"多扫出了面"当退步拒绝落盘，
        // 等于让一份被瞬时读数污染的旧基线永久钉住错误的天花板。
        const caliberGaps = baselineShapeGaps(base, curRows)
        const caliberChanged = caliberGaps.includes('sampling')
        const bad = caliberChanged
          ? []
          : [...ratchetRegressions(base, cur), ...rowRatchetRegressions(base, curRows).regressions]
        // 唯一允许"带病落盘"的一种：现存基线是**旧格式**（没有这几栏），此时任何一条
        // 比都判不了。这种情形下必须让新判据把栏位写进去，否则这个闸永远等不到可比断面
        // （b82 ⑩：基线必须与产生它的那一轮同批重生成）。判据是"坏消息全部属于缺栏"，
        // 真退步混杂其中时照样拒绝。
        const gaps = caliberGaps
        // "口径不可比"的两类文案都以 `基线缺` / `基线口径不一致` 开头（内容退步不会是这两种前缀）
        const isShapeGap = (m) => m.includes('基线缺') || m.includes('基线口径不一致')
        const onlyShape = bad.length > 0 && gaps.length > 0 && bad.every(isShapeGap)
        if (bad.length && !onlyShape) {
          console.error(`❌ 拒绝放松棘轮：--update-baseline 只收紧不放宽，基线**未改动**\n  · ${bad.join('\n  · ')}`)
          process.exit(1)
        }
        if (caliberChanged) {
          console.warn(
            `⚠️ 采样口径变更（基线记 ${String(base.sampling)} → 代码 ${INVENTORY_SAMPLING}）` +
              '⇒ 旧基线的数字不作本轮比对基准，本次按**口径迁移**重生成基线'
          )
        } else if (onlyShape) {
          console.warn(
            `⚠️ 旧格式基线（缺 ${gaps.join('/')}）⇒ 本次按**口径迁移**落盘，` +
              `其余比对结果：${bad.filter((m) => !isShapeGap(m)).join('；') || '无其他差异'}`
          )
        }
      }
      fs.writeFileSync(
        BASELINE_PATH,
        JSON.stringify(
          {
            generatedAt: report.generatedAt,
            // 采集口径戳（换尺 ⇒ 旧数字不作比对基准）
            sampling: INVENTORY_SAMPLING,
            routes: report.routes,
            totalActions,
            totalCovered,
            totalClicked,
            // b83：两栏数量棘轮进基线（此前只打印不比对）。二者都必须"只许降"，
            // 容差写死在 `COUNT_RATCHETS` 里，改容差必须同时改那条注释的成因说明。
            totalBacklog,
            totalStateLocked,
            clickableActions,
            interactionCoverageClickable: report.interactionCoverageClickable,
            coverage: report.coverage,
            interactionCoverage: report.interactionCoverage,
            // **逐页明细**（b79，N-10 的前置）：基线此前只存聚合数，于是"分母从 405 变成 404"
            // 这类事件无法归因到某个页面——聚合相等/不等的两种情况都看不出是谁变的。
            // 明细进基线之后，`--gate` 每轮直接打逐页增减，定位只需一次跑批。
            // i = clicked（b81），随明细一起记，便于看"提及但没点"的存量趋势。
            perRoute: Object.fromEntries(
              pages.map((p) => [p.path, { a: p.actionCount, c: p.coveredCount, i: p.clickedCount }])
            ),
            // 行内动作面（b87 项 5）：分母固定取这里记的 `t`，本轮实测只贡献分子。
            // 与上面的 `perRoute` 分栏是因为两者问的不是同一件事：`perRoute.a` 问"这页现在有几个按钮"
            // （随数据态漂移），`rowPerRoute.t` 问"这页**曾经被证明存在**的行内动作有几个"（是承诺）。
            rowPerRoute: curRows,
            rowSurfaceCoverage: rowSelfSurface ? rowSelfSurface.ratio : 0,
            // 参数进基线并由代码常量逐条核（前言 ⑱）：换判据必须与重生成基线同批，
            // 旧基线缺这一项一律拒绝比对（UNRUN），不能拿更松的尺去量旧数字
            rowSurfaceMinLostActions: ROW_SURFACE_MIN_LOST_ACTIONS,
            note: '逐页动作清单基线：--gate 时覆盖率不得低于本值（容差 1pp），路由数不得减少，totalBacklog / totalStateLocked 只许降（各自容差 2）；clicked 仅记录趋势；行内动作面覆盖率（rowSurfaceCoverage）以 rowPerRoute 的 t 之和为固定分母，本轮 0 行 ⇒ 该栏下降；退步必须同时超相对容差与绝对下限 rowSurfaceMinLostActions（低于下限只留痕不判红，前言 ⑱）；旧格式基线缺这些栏或参数与本常量不一致 ⇒ --gate 判 UNRUN（不可比），须同批 --update-baseline 重生成'
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
    // **口径闸排在内容闸之前**（b82 ⑨）：旧格式基线没有这几栏，"比对不了"与"比对后退步"
    // 是两件事——写反了会把"缺栏"报成一条退步，人就会去改阈值而不是重生成基线。
    // 缺栏 ⇒ EXIT=2（UNRUN，不作结论），而不是 EXIT=1（那会说成"本轮变差了"）。
    const missingCols = baselineShapeGaps(base, curRows)
    if (missingCols.length) {
      console.error(
        `EXIT=2 基线缺 ${missingCols.join('/')} 栏 ⇒ 对应棘轮无法比对（不是退步，是判据不可用）。` +
          `收口时与新判据同批跑 --update-baseline。`
      )
      process.exit(2)
    }
    const rowNow = rowRatchetRegressions(base, curRows)
    const bad = [...ratchetRegressions(base, cur), ...rowNow.regressions]
    // 留痕必须照打——判红与判绿两条路都要（低于绝对下限的缩水若不打印，就是"静默消化"，
    // 与 request-storm 的 below-floor 同一族纪律）
    for (const n of rowNow.notices) console.warn(`[inventory] ${n}`)
    if (bad.length) {
      console.error(`❌ 覆盖率棘轮回退：\n  · ${bad.join('\n  · ')}`)
      process.exit(1)
    }
    log(
      `✅ 覆盖率棘轮通过：${(report.coverage * 100).toFixed(1)}% ≥ 基线 ` +
        `${(base.coverage * 100).toFixed(1)}%（容差 ${(COVERAGE_TOLERANCE * 100).toFixed(0)}pp）` +
        `；backlog ${base.totalBacklog} → ${totalBacklog}、stateLocked ${base.totalStateLocked} → ${totalStateLocked}` +
        `（各自只许降，容差 ${COUNT_RATCHETS[0].tol}）`
    )
    // 行内动作面单独打印：本轮看到的行内动作数与基线分母可能不同，只打一个数会被读成"和 coverage 一样"
    log(
      `✅ 行内动作面通过：${(rowNow.surface.ratio * 100).toFixed(1)}% ≥ 基线 ` +
        `${(base.rowSurfaceCoverage * 100).toFixed(1)}%（分母固定 ${rowNow.surface.total} 个行内动作，` +
        `本轮该面上只剩 ${Object.values(curRows).reduce((n, r) => n + r.t, 0)} 个）`
    )
    // 逐页对账（信息项，不判红）：聚合数相等不代表同一份数据——一页少一个动作、另一页多一个
    // 动作，聚合完全不动。b79 的 N-10（405→404 无法归因）就是因为缺这一段。
    if (base.perRoute) {
      const curMap = Object.fromEntries(
        pages.map((p) => [
          p.path,
          {
            a: p.actionCount,
            c: p.coveredCount,
            i: p.clickedCount,
            // 行内动作（修改/删除/测试…）只在**有数据行**时才存在于 DOM ⇒ 一页的分母会随数据态漂移。
            // 把该页当时的行数与空态一起带上，差异才有归因（b86 实测 `/system/msg/channel`
            // 动作 12→7：那轮该页 0 行、空态「暂无数据」，5 个行内按钮结构性消失——
            // 聚合覆盖率仍 100%，因为分母一起缩了。这句提示若不写原因，读的人只会去查"页面坏了"）。
            r: (p.columns || []).length ? p.rowCount : null,
            e: p.emptyText || ''
          }
        ])
      )
      const paths = [...new Set([...Object.keys(base.perRoute), ...Object.keys(curMap)])].sort()
      const deltas = []
      for (const p of paths) {
        const b = base.perRoute[p]
        const c = curMap[p]
        if (!b) deltas.push(`新增页面 ${p}：动作 ${c.a} / 覆盖 ${c.c} / 点击 ${c.i ?? '—'}`)
        else if (!c) deltas.push(`页面消失 ${p}：基线动作 ${b.a} / 覆盖 ${b.c} / 点击 ${b.i ?? '—'}`)
        else if (b.a !== c.a || b.c !== c.c || (b.i !== undefined && b.i !== c.i)) {
          const cause =
            c.r === 0
              ? `（本轮该页 ${c.r} 行${c.e ? `、空态「${c.e}」` : ''}⇒ 行内动作随数据消失，分母在缩，不等于覆盖率变好）`
              : ''
          deltas.push(`${p}：动作 ${b.a}→${c.a}，覆盖 ${b.c}→${c.c}，点击 ${b.i ?? '—'}→${c.i}${cause}`)
        }
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
