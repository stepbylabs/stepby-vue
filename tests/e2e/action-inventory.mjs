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
 * 而实测 56 页里有 **28 页本轮就是 0 行**（落定尺重测，`_act_b88_v3c.log` 断面；旧秒表尺读出来的是 17 页，
 * 那个数不能引——见 AGENTS 测试门禁全景 前言 ㉗ 与台账 b88 §11）——闸会在装上第一轮变成"每轮必红直到有人造夹具"，
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
      shrunk.push({
        path: p,
        base: b.t,
        now: c ? c.t : 0,
        rowCount: c?.r,
        // 旧基线/旧快照没有 rt ⇒ 取 0（"不知道"不得读成"有行"，也不得因此拒绝比对）
        tabRows: typeof c?.rt === 'number' ? c.rt : 0,
        emptyText: c?.e || ''
      })
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
const INVENTORY_SAMPLING = 'page-scope-v4'
// v1→v2（b88）：落定判据把"可见 el-table 的数量"也变成比较项，并为"整页没采到表"开出
// tableMissing ⇒ UNRUN 通道。
// v2→v3（b88 收口）：接受的依据从**秒表**换成**请求静默**（`acceptSettled` 的 net 通道）。
// v3→**v4（b89 收口）**：采集作用域从"整份文档"改成**路由页面容器 `.app-main`**。
// 起因是 b89 权威轮的 `ℹ 逐页明细与基线有 2 处差异`——`/tool/build` 6→7、`/tool/swagger` 1→2，
// 两条都是同一个 `关闭该公告提示`：旧代码 `querySelector('.app-container') || document.body`
// 的**前半句在那两页取不到**，于是 `||` 生效、量的是整份文档——
// 全站壳层（`layout/index.vue:25-29` 的 `.fixed-header`：环境横幅 + 公告横幅 + navbar + tags-view）
// 被算成"这一页的动作"。⚠ **不是"`.app-container` 本仓不存在"**：该类由
// `src/assets/styles/index.scss:139` 定义，`src/` 实测 64 个文件 / 68 处命中；本批第一版把成因
// 写成"不存在"，是拿 `grep -rn app-container stepby-vue/src/` 的**空 stdout** 当结论，而那次 cwd
// 是 `stepby-vue` ⇒ grep 的退出码是 **2**（No such file or directory），不是 1（没有命中）——
// 两种"没输出"在退出码上本来就分得开，丢掉了退出码就等于把"我没扫到"读成"它不存在"（前言 ②/⑥ 同一族）。
// 正确的量法是一次性浏览器探针（b89 收口实测）：56/56 页都取到 `.app-main`；
// `.app-main` 内没有 `.app-container` 的恰好是 `/tool/build` 与 `/tool/swagger` 两页，且这两页
// 连整份文档都没有该类（doc=0）⇒ 兜底只在这两页生效，与"净 −2 动作 / backlog −2、两条都是
// `关闭该公告提示`"逐页一一对上。分母于是随**公告发布状态**漂移，而 `/tool/swagger` 的整条 backlog
// 就是这一族噪声——把它签进基线，等于要求 56 个页面各自补一条"点横幅关闭"的用例。
// 换尺必须与重生成基线同批：本常量不一致时 `baselineShapeGaps` 直接判 sampling 缺栏 ⇒ UNRUN。
// 另一条同源证据（为什么"预算走完"不能当终态）：`/system/user` 用 v2 采满 8031ms 每拍都是
// `{tables:0, tablesAll:0}`，而紧随其后的 collectActions 在同一页读到 `列 12 / 行 2 / 表 1 张`
// ⇒ v2 的"预算走完即合法"会把"还没挂载"洗成"这页本来没表"，正是它自己要防的那一形。

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
    .map((s) => {
      const anyRows = Math.max(s.rowCount || 0, s.tabRows || 0)
      const head = `  · ${s.path}：行内动作 ${s.base} → ${s.now}`
      if (anyRows > 0 && (s.rowCount || 0) === 0) {
        // b88 实测的 /monitor/cache 就是这一形：默认视图 0 行，而行内动作所在的 tab 本轮有行。
        // 报"需要配数据夹具"会把人支使去造一批本来就存在的数据（前言 ⑨/⑯(c)）。
        return `${head}（默认视图 0 行，但行内动作所在的视图本轮读到 ${s.tabRows} 行 ⇒ 缺的是**覆盖或用例**，不是数据；不得据此配夹具）`
      }
      if (anyRows === 0) {
        return `${head}（本轮该页 0 行${s.emptyText ? `、空态「${s.emptyText}」` : ''}⇒ 行内按钮随数据消失，需要给这一页配数据夹具或用例）`
      }
      return `${head}（该页仍有数据行，是动作本身少了 ⇒ 控件被删或用例文案变了）`
    })
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
 * 非行内控件面守恒（b96，收 b88 N-H）。
 *
 * 立的案：`coverage` 是"扫到的动作里覆盖了几个"，分子分母一起缩；`rowPerRoute` 只守住
 * **行内**动作（随数据行存在）。**非行内的控件面**（工具栏按钮，跨 tab 合并去重）此前
 * 只有聚合数 `perRoute.a`，而聚合相等不代表同一份数据：一页少一个按钮、另一页多一个，
 * 总数完全不动（与 b79 N-10 同一族，只是那一层已由 perRoute 明细解决、按钮身份没有）。
 * b88 实测 `/tool/swagger` 3→1 就属于这一面，当时只能写进台账、判据看不见。
 *
 * 口径（"这一面按什么尺守恒"的答案）：**按钮身份 = (路由, 归一后的按钮名)**。
 * 基线里出现过的身份，本轮必须在场（基线记 `perRoute[path].k`，去重升序）。
 * 增长允许（新功能加按钮）；减少必须解释：页面消失、或该页本轮 0 行导致数据驱动按钮
 * 不渲染（文案点明"需要配数据夹具或用例"——棘轮只许升，补数据能让它回来）。
 * 与 `rowSurface` 不同，这里**不设绝对下限**：一个按钮消失就是一次权限/入口变更，
 * 没有"少 2 个以内不算"的道理（b88 N-H 原文："动之前先答这一面按什么尺守恒"）。
 *
 * 返回 `null` = 不可比（基线缺 `perRoute` 或任一条目缺 `k`），调用方必须走 UNRUN。
 */
function controlSurfaceRegressions(base, cur) {
  const baseMap = base?.perRoute
  const shapeGap = () =>
    '基线缺 perRoute 控件面明细栏（或条目缺 k）⇒ 非行内控件面无法比对（不是退步，是判据不可用），' +
    '须与新判据同批 --update-baseline 重生成基线'
  if (!baseMap || typeof baseMap !== 'object' || Array.isArray(baseMap) || !Object.keys(baseMap).length) {
    return { comparable: false, regressions: [shapeGap()] }
  }
  for (const p of Object.keys(baseMap)) {
    if (!Array.isArray(baseMap[p]?.k)) return { comparable: false, regressions: [shapeGap()] }
  }
  const bad = []
  for (const p of Object.keys(baseMap).sort()) {
    const b = baseMap[p]
    const c = cur?.[p]
    if (!c) {
      bad.push(
        `页面消失 ${p}：基线控件面 ${b.k.length} 个（${b.k.join('、') || '—'}）——` +
          '路由清单被替换或页面被删？增删页面必须同批重生成基线'
      )
      continue
    }
    const curKeys = new Set(Array.isArray(c.k) ? c.k : [])
    const missing = b.k.filter((n) => !curKeys.has(n))
    if (missing.length) {
      const dataHint =
        c.r === 0
          ? `（本轮该页 0 行${c.e ? `、空态「${c.e}」` : ''}⇒ 若是数据驱动按钮，需要给这一页配数据夹具或用例）`
          : ''
      bad.push(`控件消失 ${p}：${missing.join('、')}${dataHint}`)
    }
  }
  return { comparable: true, regressions: bad }
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
  // 控件面明细（b96）：缺 k 栏的基线无法判"按钮身份是否守恒"
  const per = base?.perRoute
  if (!per || typeof per !== 'object' || Array.isArray(per) || !Object.keys(per).length) {
    gaps.push('perRoute')
  } else if (Object.keys(per).some((p) => !Array.isArray(per[p]?.k))) {
    gaps.push('perRoute.k')
  }
  // 采样口径戳：换尺就必须与重生成基线同批（见 INVENTORY_SAMPLING 的成因）
  if (base?.sampling !== INVENTORY_SAMPLING) gaps.push('sampling')
  return gaps
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 把"生效路径反查"清单自己的行**以及注释行**从源码文本里剔掉，只留可执行码。
 *
 * 为什么必须剔：反查读的是**本文件全文**，而每条 needle 的字面量也写在本文件里 ⇒
 * 一条在跑批正文中根本不存在、只活在清单上的 needle 会匹配到自己那一行，恒绿。
 * b88 实测就是这么漏的：FATAL 文案已经改成"同一把尺走完 tab 后…"，旧 needle
 * `同一页随后采到表头/数据行` 在正文里一处都没有，反查却照常放行——文件里剩下的唯一一处
 * 正是清单自己那一行（前言 ⑬"刀口只能落在代码上，不得被注释文本决定"的第三断面：
 * 被当成证据的是判据自己的源码）。
 * 只按**行首**判定：`needle:` 行与 `//` / `*` 注释行剔掉，行中出现的 `{ t, needle }`
 * 不受影响（否则正文里同名对象键会被误剔，那是把判据关掉）。
 */
function maskNeedleLines(src) {
  return src
    .split('\n')
    .filter((line) => !/^\s*(needle:|\/\/|\*)/.test(line))
    .join('\n')
}

/**
 * 落定判据（纯函数，b87 项 5 的后续修复）。
 *
 * 为什么必须有这一层：原先每页 `goto` 后**固定 `sleep(1400)` 再采样**，读数由网络快慢决定——
 * 同一份产物、同一份库，实测两把把 `/system/msg/channel` 读成 **0 行**与 **3 行**
 * （`rowPerRoute.t` 于是取到 0 与 3 两个值 ⇒ 行内动作面的**分母**自己抖）。
 * 这正是门禁表前言 ④ 明令禁止的形态：判据的数由环境决定，而这个数喂给"只许升"的棘轮。
 *
 * 规则：**只有最后两拍读数相同才算稳定**（比的是"当前"，不是"历史上出现过一对"）。
 * b88 收口实测到的形状（`/system/user`，读数序列 `行 0 表 0 ×2 | 行 2 表 1 ×74`）：
 * 旧实现扫全部样本找**第一对**相等就返回，于是返回的是"开局那两拍都还什么都没有"的那个断面
 * （`tables=0`），后面 74 拍到 `表 1 行 2` 也救不回来——落定的语义是"此刻已经不动了"，
 * 不是"曾经有两拍长得一样"。改成只比最后两拍之后，同一段序列的落定断面自动变成 `表 1 行 2`。
 * 稳定之后还要过 `acceptSettled`（"什么都没看见"或"有表但 0 行"必须由**请求静默 + 稳定窗口**作证，不是由秒表）。
 *  - **真空表**（rows=0、tables=1、无遮罩、最后两拍一致）⇒ 判稳定：那是合法的 0 行，不得当成"没读完"；
 *  - 无表但有显式空态（`/user/profile/*`、`/monitor/cache` 这类页本来就没有 el-table）⇒ 判稳定；
 *  - 遮罩仍在 ⇒ 判未稳定：调用方必须 UNRUN，不得把"还没读到"写成"这页没有动作"；
 *  - `tables`/`empty` 也进比较（b88 补）：**轮询起点早于表格挂载**时，前两次都是"什么都没有"，
 *    旧规则把"两次都太早"当成一次合法落定，于是同一份产物两次 `--gate` 能把 `/system/user`
 *    读成 `行 2` 与 `行 0`（后者 `columns=[]`、`emptyText=""` ⇒ 表根本没被读到），
 *    行内动作面随即报出 `93.2% < 100.0%` 的**假退步**（b88 实测）。
 *    "这页没有表"与"我没看到表"必须可区分：后者由 `tableMissing` 交给闸去判 UNRUN（见下面的口径闸）。
 * 两条正控/反脆弱由自检钉住：中途一致、随后又变 ⇒ 最后两拍不同 ⇒ 未稳定（不得拿旧断面充当终态）；
 * 最后两拍一致 ⇒ 稳定并取这两拍的值。
 */
function settleVerdict(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return { settled: false, reason: '采样不足' }
  // 采样器自身抛错的那几条**不得参与"两次一致"**——否则"每次都抛"会读成"每次都一样"，
  // 于是坏掉的采集器产出一个看起来合法的 tables=0（b88 实测：/system/user 轮询满 8235ms
  // 却 `可见表=0`，而同刻 `collectActions` 数到 行 2 ⇒ 两者不可能同时为真，必有一侧在骗人）。
  // 判据取"相邻"而不是"过滤后相邻"：抛错说明这一刻读不到，两侧的成功读数之间隔着盲区，
  // 拿它们拼一次"一致"等于把没看见的当成看见了。
  const samplerBroken = samples.some((s) => s.sampleError)
  const a = samples[samples.length - 2]
  const b = samples[samples.length - 1]
  if (!a.sampleError && !b.sampleError) {
    const sameRows = a.rows === b.rows
    const sameLoading = a.loading === b.loading && b.loading === false
    const sameTables = (a.tables ?? 0) === (b.tables ?? 0)
    const sameEmpty = (a.empty ?? false) === (b.empty ?? false)
    if (sameRows && sameLoading && sameTables && sameEmpty) {
      return {
        settled: true,
        at: samples.length - 1,
        reason: '',
        tables: b.tables ?? 0,
        emptySeen: (b.empty ?? false) === true,
        tableMissing: (b.tables ?? 0) === 0,
        probe: b
      }
    }
  }
  let tablesMoved = false
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i - 1]
    const q = samples[i]
    if (p.sampleError || q.sampleError) continue
    if (p.rows === q.rows && p.loading === q.loading && p.loading === false && (p.tables ?? 0) !== (q.tables ?? 0))
      tablesMoved = true
  }
  const errSample = samples.find((s) => s.sampleError)
  const last = samples[samples.length - 1]
  const lastTables = last.tables ?? 0
  const lastEmpty = last.empty ?? false
  return {
    settled: false,
    reason: errSample
      ? `采样器自身抛错（${errSample.sampleError}）`
      : last.loading
        ? '加载遮罩未消失'
        : tablesMoved
          ? '可见 el-table 数量还在变化（表中途才挂出来）'
          : lastTables === 0 && !lastEmpty
            ? '整页没采到可见 el-table，也没有显式空态（页面还没渲染出来）'
            : '行数仍在变化',
    tables: lastTables,
    tableMissing: lastTables === 0,
    samplerBroken,
    probe: last
  }
}

/**
 * 一次"稳定读数"能不能接受。
 *
 * b88 收口时实测到的形状（`/system/user`，同一份产物）：轮询满 8031ms 每次都是
 * `{tables:0, tablesAll:0, rows:0, empty:false}`，而**紧接着** `collectActions` 数到
 * `列 12 / 行 2 / 表 1 张` ⇒ 那 8 秒里这一页真的还没有 `.el-table`（冷加载 5.8 MB 入口包 +
 * getInfo + getRouters + list，机器负载高时就是能超过 8 秒），"预算走完"因此把"没读到"
 * 洗成了"这页本来没表"。所以**秒表不是尺**：它只能证明"我等了这么久"，不能证明"页面已到终态"。
 *
 * 真正的终态证据是网络：**这一页的 XHR/fetch 全部飞完，并且连续静默了若干拍**
 * （静默计数去抖，防"两个请求之间的空档"被当成静默——本项目登录后是串行认证链，
 *   getInfo 结束与 getRouters 发出之间必然出现短暂 inflight=0）。
 * 规则（按开放度从严到宽）：
 *  - 有可见表**且有数据行** ⇒ 数据已落进 DOM，立即接受；
 *  - "有表但 0 行" / "表和空态都没有" ⇒ 必须 `见过请求活动` **且** `距最后一次数据请求事件
 *    ≥ QUIET_MS` **且** `同一个读数持续 ≥ STABLE_MS` ⇒ 才配说"这页就是 0 行 / 本来没表"。
 *    稳定窗口不是秒表止损，它和"两拍相等"是两件事：b88 实测 518ms 那一轮，头两拍读数完全相同、
 *    24 个数据请求也都发过了，第三拍却变成 `行 2 表 1` ⇒ **"网络静默"不等于"DOM 已到终态"**
 *    （Vue 的渲染排在响应之后，两拍 250ms 的相等恰好落在渲染空档里）。要让"没读到"和
 *    "这页本来没数据"可区分，唯一可用的事实是**同一个读数维持了足够久**，而不是它出现过两次。
 *  - "距最后一次事件"而不是"在飞计数为 0"：b88 同一轮实测 `在飞 1` 卡满 20 秒（76 拍全被判"仍在飞"），
 *    而那 74 拍读数一直是 `行 2 表 1` —— 计数只增不减的那个请求（导航期被 abort、Playwright 不再补
 *    finished 事件）把整页永久钉在未落定态。**计数会漏，事件不会漏**：静默量必须取"最后一次事件的
 *    时刻"，`inflight` 只留作凭证，不参与判定。
 *  - 网络通道不可用（取不到事件时刻）⇒ 退回旧的时间预算口径（**只能是兜底**，
 *    `waitTableSettled` 会把用的是哪条通道写进凭证）。
 * 预算仍然保留，但它的角色从"判据"降为"止损"：走完仍未落定 ⇒ 交回 `settled:false` ⇒ 调用方 UNRUN，
 * 而不是拿一个未观测到的断面去比棘轮。
 */
const QUIET_MS = 1200
const STABLE_MS = 1500

function acceptSettled(v, ctx) {
  if (!v.settled) return false
  const { elapsedMs = 0, budgetMs = 0, sinceActivityMs = null, sawActivity = false, stableMs = 0 } = ctx || {}
  const observable = (v.tables ?? 0) > 0 || v.emptySeen === true
  const hasNet = typeof sinceActivityMs === 'number' && Number.isFinite(sinceActivityMs) && sinceActivityMs >= 0
  if (!hasNet) return observable || elapsedMs >= budgetMs
  if (observable && (v.rows ?? 0) > 0) return true
  return sawActivity && sinceActivityMs >= QUIET_MS && stableMs >= STABLE_MS
}

/**
 * tab 标签集合的"落定"判据（纯函数，与 `settleVerdict` 同形但**刻意不复用**：
 * 比的是字符串数组，不是 DOM 读数；硬套 would 让两件事共用一份形状假设，改一个崩另一个）。
 *
 * 规则：最后两拍**顺序敏感的逐位相等** ⇒ 稳定。空数组也是合法稳定（这页本来没有 tab）。
 * `growing` 单独报出来：它说明"上一拍是这一拍的前缀"——EP 的 tab nav 就是这样逐项长出来的，
 * 这一支存在，失败文案才能说"还在长"而不是"标签变了"（同一句话指向两种修法）。
 */
function labelsVerdict(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return { stable: false, reason: '采样不足', growing: false }
  const a = samples[samples.length - 2]
  const b = samples[samples.length - 1]
  const same = a.length === b.length && a.every((v, i) => v === b[i])
  if (same) return { stable: true, reason: '', growing: false, labels: b }
  const growing = b.length > a.length && a.every((v, i) => v === b[i])
  return { stable: false, reason: growing ? 'tab 标签还在长出来' : 'tab 标签集合仍在变化', growing }
}

/**
 * 轮询 tab 标签到稳定。稳定窗口沿用表格那把尺的同一组常量（QUIET_MS / STABLE_MS 的量级），
 * 但**不要求网络静默**：EP 的 nav 宽度是挂载后用 ResizeObserver 补的，与请求无关，
 * 要求静默只会让没有请求的页面白等。取不到 DOM（抛错）时按空数组计，不阻断扫描。
 */
async function waitTabLabels(page, maxMs = 6000, stepMs = 250) {
  const t0 = Date.now()
  const samples = []
  let runKey = ''
  let runStart = Date.now()
  while (Date.now() - t0 < maxMs) {
    const labels = await page
      .$$eval('.el-tabs__item', (els) =>
        els.map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
      )
      .catch(() => [])
    samples.push(labels)
    const key = labels.join('\u0000')
    if (key !== runKey) {
      runKey = key
      runStart = Date.now()
    }
    const v = labelsVerdict(samples)
    // 有标签且已稳定满一个窗口 ⇒ 收；一个标签都没有（本页无 tab）⇒ 稳定即收，不必等窗口
    if (v.stable && (labels.length === 0 || Date.now() - runStart >= STABLE_MS))
      return { labels, ms: Date.now() - t0, samples: samples.length, settled: true }
    await sleep(stepMs)
  }
  const last = samples[samples.length - 1] || []
  const v = labelsVerdict(samples)
  return {
    labels: last,
    ms: Date.now() - t0,
    samples: samples.length,
    settled: v.stable,
    reason: v.stable ? '' : v.reason
  }
}

/**
 * 页内只读采样：行数按 el-table 的可见 body 计，遮罩按 `.el-loading-mask` 的可见性计。
 *
 * `tablesAll` / `emptyAll` 是**不过滤可见性**的同族计数，不是装饰：当 `tables=0` 时，
 * "这个选择器一个元素都没匹配到"与"匹配到了但都不具备可见性"是两种完全不同的故障
 * （前者=选择器/页面不对，后者=布局或时序），只看前者的话凭证会写成"可见表=0"却答不出为什么。
 * `path` 记 `location.pathname`：轮询期间若发生过跳转，采到的就不是这一页了。
 */
function sampleTableState() {
  const visible = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
  }
  const allTables = [...document.querySelectorAll('.el-table')]
  const tables = allTables.filter(visible)
  let rows = 0
  for (const t of tables) rows += [...t.querySelectorAll('.el-table__body tbody tr')].filter(visible).length
  const loading = [...document.querySelectorAll('.el-loading-mask')].some(visible)
  // 显式空态：页面自己说"这里没有数据"（`.el-empty` 可见）——它与"有表"同样证明这一页已经渲染完，
  // 区别只在于有没有表；两者都没有才是"没读到"。
  const allEmpty = [...document.querySelectorAll('.el-empty')]
  const empty = allEmpty.some(visible)
  return {
    rows,
    loading,
    tables: tables.length,
    empty,
    tablesAll: allTables.length,
    emptyAll: allEmpty.length,
    path: location.pathname
  }
}

/**
 * 轮询到落定（上限 maxMs 只为止损）。凭证里带：用了多久、采了几拍、走的是哪条通道
 * （网络静默 / 时间兜底）、当时的原始读数——b88 那条"8 秒读 0 而随后读到 2"就是靠这四个量定性的。
 */
async function waitTableSettled(page, maxMs = 20000, stepMs = 250, net = null) {
  const t0 = Date.now()
  const samples = []
  let sawActivity = false
  let lastInflight = null
  let lastSinceActivityMs = null
  // 当前这份读数从什么时候开始没变过（稳定窗口的原点，见 acceptSettled 的 STABLE_MS）
  let runKey = ''
  let runStart = Date.now()
  const readNet = () => {
    if (!net || typeof net.inflight !== 'function') return null
    const n = net.inflight()
    return typeof n === 'number' && Number.isFinite(n) ? n : null
  }
  // 「这一页发过数据请求」「最后一次请求事件距今多久」都必须**由事件得出，不能由采样得出**：
  // 一次 100ms 的 XHR 落在两拍 250ms 之间就永远采不到（b88 实测把 sawActivity 钉成恒 false，
  // 合法页一路拖到预算外）；而在飞计数会被一个永不 finished 的请求永久钉住（b88 实测 在飞 1 × 20 秒）。
  const readActivity = () => {
    if (!net || typeof net.activity !== 'function') return null
    const a = net.activity()
    return typeof a === 'number' && Number.isFinite(a) ? a : null
  }
  const readQuietMs = () => {
    if (!net || typeof net.sinceActivityMs !== 'function') return null
    const q = net.sinceActivityMs()
    return typeof q === 'number' && Number.isFinite(q) && q >= 0 ? q : null
  }
  while (Date.now() - t0 < maxMs) {
    const st = await page.evaluate(sampleTableState).catch((e) => ({
      rows: -1,
      loading: false,
      tables: -1,
      empty: false,
      // 抛错原文进凭证：这一页到底是"没有表"还是"我的采样器坏了"，只能靠这句话区分。
      sampleError: String((e && e.message) || e)
        .split('\n')[0]
        .slice(0, 180)
    }))
    samples.push(st)
    const key = readingKey(st)
    if (key !== runKey) {
      runKey = key
      runStart = Date.now()
    }
    lastInflight = readNet()
    const act = readActivity()
    if (typeof act === 'number' && act > 0) sawActivity = true
    lastSinceActivityMs = readQuietMs()
    const v = settleVerdict(samples)
    const stableMs = Date.now() - runStart
    const ctx = {
      elapsedMs: Date.now() - t0,
      budgetMs: maxMs,
      sinceActivityMs: lastSinceActivityMs,
      sawActivity,
      stableMs
    }
    if (acceptSettled(v, ctx))
      return {
        settled: true,
        ms: Date.now() - t0,
        reason: '',
        samples: samples.length,
        tables: v.tables,
        tableMissing: v.tableMissing,
        probe: v.probe,
        channel: typeof lastSinceActivityMs === 'number' ? 'net-quiet' : 'time-fallback',
        sawActivity,
        sinceActivityMs: lastSinceActivityMs,
        inflight: lastInflight,
        stableMs,
        distinct: distinctReadings(samples)
      }
    await sleep(stepMs)
  }
  const v = settleVerdict(samples)
  // 预算走完仍未接受 ⇒ 交回 settled:false（调用方必须 UNRUN）。
  // 这一支刻意**不再**用"预算到了"来冒充落定：b88 实测那 8 秒采到的 tables=0 随后就被
  // collectActions 证伪，用它写基线就是拿"没读到"当事实。
  // 文案必须分成两种故障，它们的修法相反：读数从未一致=这一页一直在动；
  // 读数一致但缺终态证据=网络通道/活动计数/稳定窗口没成立（大概率是判据自己的输入坏了）。
  const reason = v.settled
    ? `读数已一致但缺终态证据（活动 ${sawActivity ? '已见' : '未见'} / 距最后一次数据请求 ${
        lastSinceActivityMs ?? '?'
      }ms / 在飞 ${lastInflight ?? '?'}（只作凭证，不参与判定）/ 同一读数维持 ${Date.now() - runStart}ms）`
    : v.reason || '超时仍未一致'
  return {
    settled: false,
    ms: Date.now() - t0,
    reason,
    samples: samples.length,
    tables: v.tables,
    tableMissing: v.tableMissing,
    samplerBroken: v.samplerBroken === true,
    probe: v.probe,
    channel: typeof lastSinceActivityMs === 'number' ? 'net-quiet' : 'time-fallback',
    sawActivity,
    sinceActivityMs: lastSinceActivityMs,
    stableMs: Date.now() - runStart,
    inflight: lastInflight,
    distinct: distinctReadings(samples)
  }
}

/** 一份读数的"身份"：稳定窗口与读数折叠都用它，两份实现必漂（同 dataset-window.mjs 那条纪律） */
function readingKey(s) {
  return s.sampleError ? `抛错(${s.sampleError})` : `行 ${s.rows} 表 ${s.tables} 空态 ${s.empty} 遮罩 ${s.loading}`
}

/** 把连续相同的读数折叠成"读数 ×次数"，最多留 4 段——未落定时这是唯一能归因的东西 */
function distinctReadings(samples, keep = 4) {
  const runs = []
  for (const s of samples) {
    const key = readingKey(s)
    if (runs.length && runs[runs.length - 1].key === key) runs[runs.length - 1].n++
    else runs.push({ key, n: 1 })
  }
  return runs
    .slice(-keep)
    .map((r) => `${r.key} ×${r.n}`)
    .join(' | ')
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
 * 「作用域没取到」的判定（纯函数，`--selftest` 直接驱动——浏览器回调里不能引用 Node 绑定，
 * 所以判据只能住在 Node 侧，浏览器侧只负责把事实交回来）。
 *
 * 三种输入都必须算成"坏"，因为它们共同指向同一件事：**这一页的动作面没有被度量**：
 * ① `{scopeMissing:true}`（页面容器不在）；② `null`（`evaluate` 抛错后被 `.catch(() => null)` 收成 null）；
 * ③ 形状完全对不上（将来改返回值忘了一个字段）。
 * 反过来"这一页 0 个按钮"**必须不算坏**（`{toolbar:[],rowActions:[]}`），否则判据会把
 * 合法的空页面读成采集器故障，那种"每轮必红"的结局就是被人放宽阈值（前言 ⑯(c)）。
 */
function pageScopeFailure(got) {
  if (!got) return true
  if (got.scopeMissing === true) return true
  return !Array.isArray(got.toolbar) || !Array.isArray(got.rowActions)
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

    // 采集作用域 = **路由页面容器本身**（b89 收口修的一条判据自身缺陷）。
    // 旧写法是 `document.querySelector('.app-container') || document.body`，而 `.app-container`
    // **只有部分视图在用**（`src/assets/styles/index.scss:139` 定义，src/ 实测 64 文件 / 68 处）
    // ⇒ 56 个被测路由里 `.app-main` 内取不到它的那两页（b89 一次性探针实测：`/tool/build`、
    // `/tool/swagger`，且这两页整份文档都没有该类）就静默落到 `||` 那支，作用域被放大成整份文档。后果不是"多算两条"而是**度量对象错了**：
    // 公告横幅与环境横幅都渲染在 `layout/index.vue:25-29` 的 `.fixed-header` 里（navbar 之上），
    // 于是 `关闭该公告提示` / `查看详情` 这类**全站壳层**按钮被逐页算进"这一页的动作"，
    // 本轮实测 `/tool/swagger` 的两条 backlog 全是横幅按钮、`/tool/build` 多出的那条也是它；
    // 更糟的是分母从此随**公告数据态**漂移（横幅出现与否由发布状态决定，前言 ㉗ 的"分母随数据消失"
    // 的镜像形态）。缺 `.app-main` 时**不得回落整份文档**：取不到作用域只能交回 Node 判 UNRUN
    // （前言 ⑥"没跑"与"跑了且干净"必须可区分）。
    const root = document.querySelector('.app-main')
    if (!root) return { scopeMissing: true }

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
  /**
   * 退步**分因**文案（b88 收口新增一族）：分因决定下一批人去动什么，动错方向比不动更贵
   * （前言 ⑨/⑯(c)）。三形 + 一支反证：
   *  ① 默认视图 0 行、但行内动作所在的 tab 本轮读到过行（实测的 `/monitor/cache`）⇒ 只能说"缺覆盖"；
   *  ② 两个视图都 0 行 ⇒ 才是"需要配数据夹具"；
   *  ③ 本轮仍有行、动作数少了 ⇒ "控件被删或用例文案变了"；
   *  ④ 旧断面**没有** `rt` 字段：缺证据不得读成"有行"（否则真没数据的页会被这一支洗掉）。
   */
  const mkWhy = (cur) => {
    const baseRows = {}
    const curRows = {}
    for (let i = 0; i < 20; i++) {
      baseRows[`/p${i}`] = { t: 3, c: 3 }
      curRows[`/p${i}`] = { t: 3, c: 3, r: 5, rt: 5, e: '' }
    }
    curRows['/p0'] = cur
    return (
      rowRatchetRegressions(
        { rowPerRoute: baseRows, rowSurfaceCoverage: 1, rowSurfaceMinLostActions: ROW_SURFACE_MIN_LOST_ACTIONS },
        curRows
      ).notices.join('\n') +
      rowRatchetRegressions(
        { rowPerRoute: baseRows, rowSurfaceCoverage: 1, rowSurfaceMinLostActions: ROW_SURFACE_MIN_LOST_ACTIONS },
        curRows
      ).regressions.join('\n')
    )
  }
  const whyCases = [
    {
      title: '① 默认视图 0 行而所在 tab 有 3 行 ⇒ 文案必须说"缺覆盖"并禁止配夹具',
      cur: { t: 0, c: 0, r: 0, rt: 3, e: '暂无数据' },
      must: '不得据此配夹具',
      mustNot: '需要给这一页配数据夹具'
    },
    {
      title: '② 默认视图与所在视图都 0 行 ⇒ 才可以说"需要给这一页配数据夹具"',
      cur: { t: 0, c: 0, r: 0, rt: 0, e: '暂无数据' },
      must: '需要给这一页配数据夹具',
      mustNot: '不得据此配夹具'
    },
    {
      title: '③ 本轮仍有 4 行而动作少了 ⇒ 文案必须指"控件被删或用例文案变了"',
      cur: { t: 1, c: 1, r: 4, rt: 4, e: '' },
      must: '控件被删或用例文案变了',
      mustNot: '数据夹具'
    },
    {
      title: '④ 反证：断面缺 rt（旧快照）且 r=0 ⇒ 不得读成"tab 里有行"，必须照常要夹具',
      cur: { t: 0, c: 0, r: 0, e: '暂无数据' },
      must: '需要给这一页配数据夹具',
      mustNot: '不得据此配夹具'
    }
  ]
  let whyBad = 0
  for (const c of whyCases) {
    const text = mkWhy(c.cur)
    const ok = text.includes(c.must) && !text.includes(c.mustNot)
    if (!ok) whyBad++
    console.log(`  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${c.title}`)
  }
  if (whyBad) {
    console.error(`❌ 退步分因自检失败 ${whyBad}/${whyCases.length} 条——分因说错方向就等于把人支使去改错的东西`)
    process.exit(1)
  }
  // 真实树正控（不启浏览器，只读已提交基线）：专抓"基线是加参数之前那一轮写的"这类同批漏改
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`❌ 基线文件缺失：${BASELINE_PATH}——真实树正控没跑，不得读成"通过"`)
    process.exit(1)
  }
  let realCtl = 0 // 真实基线正控条数由计数器给（写死的数字加一条控制就变成假账）
  /**
   * 记下来、跑完全部族再退出的失败（不得就地 exit —— 那会让后面的族整批没执行却
   * 看起来像"自检已经报过红了"，前言 ⑩ 的"红在哪条丢了"在自检上的第三个断面）。
   */
  const deferredFails = []
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
      perRoute: { '/a': { a: 1, c: 1, i: 0, k: ['新增'] } },
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
      perRoute: { '/a': { a: 1, c: 1, i: 0, k: ['新增'] } },
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
  // 真实基线：口径戳必须等于代码常量（本批刚换尺 ⇒ 重生成之前这一条就该红）。
  // **不得在这里 process.exit**：这条只是七族自检里的一族，就地退出会把后面的
  // 落定判据族与生效路径反查整批跳过——报出来的"红"只剩一条，而"其余各族到底跑没跑"
  // 看不见（前言 ⑩ 的第三个断面在自检自己身上）。改成记一条待失败、跑完全部族再退。
  if (real.sampling !== INVENTORY_SAMPLING) {
    deferredFails.push(
      `已提交基线的采样口径是 ${String(real.sampling)}、代码取 ${INVENTORY_SAMPLING}` +
        '⇒ 判据换形必须与重生成基线同批（跑 --update-baseline）'
    )
  } else {
    realCtl++
    console.log(`  ✅ [OK] 已提交基线带当前采样口径戳（${real.sampling}）`)
  }
  // 第六族（b87 项 5 后续）：表格读数落定判据。钉的是"分母不得由网络快慢决定"。
  const stCases = [
    {
      title: '正控：真空表（rows=0、有一张可见表、无遮罩、两次一致）必须判落定（否则合法的 0 行页每轮必红）',
      samples: [
        { rows: 0, loading: false, tables: 1 },
        { rows: 0, loading: false, tables: 1 }
      ],
      want: true,
      wantMissing: false
    },
    {
      title: '正控：首屏遮罩 + 3 行到位后两次一致 ⇒ 落定（b87 实测那次 0 行/3 行抖动就是这一形）',
      samples: [
        { rows: 0, loading: true, tables: 1 },
        { rows: 3, loading: false, tables: 1 },
        { rows: 3, loading: false, tables: 1 }
      ],
      want: true,
      wantMissing: false
    },
    {
      // b88 立案：同一份产物两次 --gate 把 /system/user 读成 行 2 与 行 0（后者 columns=[]、
      // 空态文案也是空 ⇒ 表根本没被采到），旧尺把这两次都判"落定"，内容棘轮于是报出假退步。
      title: 'b88 反脆弱：无表但有**显式空态** ⇒ 落定且标 tableMissing（profile/cache 这类页本来就没表）',
      samples: [
        { rows: 0, loading: false, tables: 0, empty: true },
        { rows: 0, loading: false, tables: 0, empty: true }
      ],
      want: true,
      wantMissing: true
    },
    {
      title: 'b88 反脆弱：无表也无显式空态 ⇒ settleVerdict 仍判"稳定"，接受与否交给 acceptSettled 用**请求静默**区分',
      samples: [
        { rows: 0, loading: false, tables: 0, empty: false },
        { rows: 0, loading: false, tables: 0, empty: false }
      ],
      want: true,
      wantMissing: true,
      wantEmptySeen: false
    },
    {
      title: 'b88 反脆弱：表在轮询中途才挂出来（rows 恒 0、tables 0→1）⇒ 未落定且文案点名表数在变',
      samples: [
        { rows: 0, loading: false, tables: 0, empty: false },
        { rows: 0, loading: false, tables: 1, empty: false }
      ],
      want: false,
      reason: '可见 el-table 数量还在变化（表中途才挂出来）'
    },
    { title: '采样只有一条 ⇒ 未落定（不得把"只看了一眼"当落定）', samples: [{ rows: 3, loading: false }], want: false },
    {
      title: '行数还在变 ⇒ 未落定，且文案指"行数仍在变化"',
      samples: [
        { rows: 1, loading: false, tables: 1 },
        { rows: 3, loading: false, tables: 1 }
      ],
      want: false,
      reason: '行数仍在变化'
    },
    {
      title: '遮罩始终不消失 ⇒ 未落定，且文案指遮罩（不得把"没读完"写成"这页没动作"）',
      samples: [
        { rows: 0, loading: true, tables: 1 },
        { rows: 0, loading: true, tables: 1 }
      ],
      want: false,
      reason: '加载遮罩未消失'
    },
    {
      title: '正控：采样器中途抛过一次，但之后两次一致 ⇒ 仍判落定（一次抛错不得把整页判坏）',
      samples: [
        { rows: -1, loading: false, tables: -1, empty: false, sampleError: 'Execution context was destroyed' },
        { rows: 2, loading: false, tables: 1, empty: false },
        { rows: 2, loading: false, tables: 1, empty: false }
      ],
      want: true,
      wantMissing: false
    },
    {
      title: 'b88 反脆弱：采样器每次都抛 ⇒ 不得读成"两次一致的 tables=0"，文案必须点名抛错原文',
      samples: [
        { rows: -1, loading: false, tables: -1, empty: false, sampleError: 'ReferenceError: visible is not defined' },
        { rows: -1, loading: false, tables: -1, empty: false, sampleError: 'ReferenceError: visible is not defined' }
      ],
      want: false,
      reasonPrefix: '采样器自身抛错'
    },
    {
      title: 'b88 反脆弱：两次完全相同的读数之间隔着一次抛错 ⇒ 不得判一致（隔着盲区拼"落定"= 把没看见当成看见）',
      samples: [
        { rows: 0, loading: false, tables: 0, empty: false },
        { rows: -1, loading: false, tables: -1, empty: false, sampleError: 'page.evaluate: Timeout' },
        { rows: 0, loading: false, tables: 0, empty: false }
      ],
      want: false
    },
    {
      title: 'b88 收口立案形状：开局两拍都"什么都没有"、随后 74 拍都是 行 2 表 1 ⇒ 落定必须取**最后两拍**的断面',
      samples: [
        { rows: 0, loading: false, tables: 0, empty: false },
        { rows: 0, loading: false, tables: 0, empty: false },
        { rows: 2, loading: false, tables: 1, empty: false },
        { rows: 2, loading: false, tables: 1, empty: false },
        { rows: 2, loading: false, tables: 1, empty: false }
      ],
      want: true,
      wantMissing: false,
      wantTables: 1,
      wantRows: 2
    },
    { title: 'samples 不是数组 ⇒ 未落定（形状防御，不得抛）', samples: 'nonsense', want: false }
  ]
  let stBad = 0
  for (const t of stCases) {
    const v = settleVerdict(t.samples)
    const okWant = v.settled === t.want
    const okReason = !t.reason || v.reason === t.reason
    const okPrefix = !t.reasonPrefix || String(v.reason || '').startsWith(t.reasonPrefix)
    const okMissing = t.wantMissing === undefined || v.tableMissing === t.wantMissing
    const okEmptySeen = t.wantEmptySeen === undefined || v.emptySeen === t.wantEmptySeen
    const okTables = t.wantTables === undefined || v.tables === t.wantTables
    const okRows = t.wantRows === undefined || v.probe?.rows === t.wantRows
    if (!(okWant && okReason && okPrefix && okMissing && okEmptySeen && okTables && okRows)) {
      stBad++
      console.error(
        `  ❌ 落定判据：${t.title}（实际 settled=${v.settled} reason="${v.reason}" ` +
          `tables=${v.tables} rows=${v.probe?.rows} tableMissing=${v.tableMissing} emptySeen=${v.emptySeen}）`
      )
    } else console.log(`  ✅ [OK] ${t.title}`)
  }
  if (stBad) {
    console.error(`❌ 落定判据自检失败 ${stBad}/${stCases.length} 条 ⇒ 行内动作面分母仍由网络快慢决定`)
    process.exit(1)
  }
  // 第七族（b88）：稳定 ≠ 可接受。"两次都太早"与"这页已到终态"在 DOM 样本上可能逐字节同形，
  // 能把它们分开的是**请求事件静默 + 同一读数维持的时长**，不是秒表——所以这条必须是独立可单测的纯函数。
  const aCases = [
    {
      title: '正控：稳定 + 有可见表 + 有数据行 ⇒ 立刻接受（数据已落进 DOM，不必再等）',
      v: { settled: true, tables: 1, rows: 2, emptySeen: false },
      ctx: { sinceActivityMs: 0, sawActivity: true, elapsedMs: 300, budgetMs: 20000 },
      want: true
    },
    {
      title: 'b88 立案形状：有表但 0 行、请求仍在动 ⇒ **不得**接受（"0 行"与"还没回"必须可区分）',
      v: { settled: true, tables: 1, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: 0, sawActivity: true, elapsedMs: 300, budgetMs: 20000 },
      want: false
    },
    {
      title: '正控：有表但 0 行、请求静默够久 + 同一读数维持够久 ⇒ 接受（合法的 0 行不得当成没读完）',
      v: { settled: true, tables: 1, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: QUIET_MS, sawActivity: true, stableMs: STABLE_MS, elapsedMs: 2200, budgetMs: 20000 },
      want: true
    },
    {
      title:
        'b88 收口实测形状（/system/user 那一轮 518ms）：读数两次相同 + 请求也都发过 + 静默够久，' +
        '但同一读数只维持了 518ms ⇒ **不得**接受（第三拍就变成 行 2 表 1 ⇒ "网络静默"≠"DOM 到终态"）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: QUIET_MS, sawActivity: true, stableMs: 518, elapsedMs: 518, budgetMs: 20000 },
      want: false
    },
    {
      title: 'b88 实测形状：整页 tables=0 采满 8 秒、但从未见过请求活动 ⇒ 不得接受（无从证明列表请求已经发过）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: 99999, sawActivity: false, stableMs: 99999, elapsedMs: 8031, budgetMs: 20000 },
      want: false
    },
    {
      title: 'b88 收口形状：静默窗口未到（距最后一次请求 100ms）⇒ 读数维持再久也不得接受（Vue 渲染排在响应之后）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: QUIET_MS - 1, sawActivity: true, stableMs: 60000, elapsedMs: 8000, budgetMs: 20000 },
      want: false
    },
    {
      title: '正控：无表但有显式空态 + 静默够久 + 读数维持够久 ⇒ 接受（profile/cache 这类页本来就没表）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: true },
      ctx: {
        sinceActivityMs: QUIET_MS + 400,
        sawActivity: true,
        stableMs: STABLE_MS + 400,
        elapsedMs: 1600,
        budgetMs: 20000
      },
      want: true
    },
    {
      title:
        '反脆弱：读数维持不够久（stableMs < STABLE_MS）⇒ 静默与活动都成立也不得接受（稳定窗口是唯一能区分渲染空档的量）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: true },
      ctx: {
        sinceActivityMs: QUIET_MS + 400,
        sawActivity: true,
        stableMs: STABLE_MS - 1,
        elapsedMs: 900,
        budgetMs: 20000
      },
      want: false
    },
    {
      title: '还没稳定 ⇒ 任何时刻都不接受（不得把"再等一轮"写成"落定了"）',
      v: { settled: false, tables: 1, rows: 2, emptySeen: false },
      ctx: { sinceActivityMs: 60000, sawActivity: true, stableMs: 60000, elapsedMs: 19000, budgetMs: 20000 },
      want: false
    },
    {
      title: '正控：b88 那一轮的真实断面——在飞计数卡在 1、但距最后一次事件已 20 秒 ⇒ 接受（判定不得用会漏的计数）',
      v: { settled: true, tables: 1, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: 20000, sawActivity: true, stableMs: 18000, elapsedMs: 20011, budgetMs: 20000 },
      want: true
    },
    {
      title: '网络通道坏了（取不到事件时刻）⇒ 退回时间兜底，且只有预算走完才接受（旧口径，只能是兜底）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: null, sawActivity: false, elapsedMs: 20000, budgetMs: 20000 },
      want: true
    },
    {
      title: '网络通道坏了 + 预算未到 ⇒ 不接受（兜底支也不得提前收工）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: null, sawActivity: false, elapsedMs: 4000, budgetMs: 20000 },
      want: false
    },
    {
      title: '事件时刻为负 / NaN（采集器坏了）⇒ 视为通道不可用，不得读成"已静默"（取不到≠静默够久）',
      v: { settled: true, tables: 0, rows: 0, emptySeen: false },
      ctx: { sinceActivityMs: -5, sawActivity: true, stableMs: 9000, elapsedMs: 1000, budgetMs: 20000 },
      want: false
    }
  ]
  let aBad = 0
  for (const t of aCases) {
    const got = acceptSettled(t.v, t.ctx)
    if (got !== t.want) {
      aBad++
      console.error(`  ❌ 接受判据：${t.title}（实际 ${got}，期望 ${t.want}）`)
    } else console.log(`  ✅ [OK] ${t.title}`)
  }
  if (aBad) {
    console.error(
      `❌ 接受判据自检失败 ${aCases.length} 条里有 ${aBad} 条不符 ⇒ "太早的读数"仍会被当成合法断面` +
        `（QUIET_MS=${QUIET_MS}、STABLE_MS=${STABLE_MS}）`
    )
    process.exit(1)
  }
  // 第八族（b88 收口）：tab 标签集合的落定。`/monitor/cache` 实测 +2.6s 只有 1 项、+4s 才 3 项，
  // 读一次就决定"要不要点 tab"等于把这一页真正的动作面整块判成不存在。
  const lCases = [
    {
      title: '正控：两拍都是 3 项且逐位相等 ⇒ 稳定，取最后两拍',
      samples: [
        ['A', 'B', 'C'],
        ['A', 'B', 'C']
      ],
      want: true,
      wantLabels: 3
    },
    {
      title: '正控：本页没有 tab（两拍都是空数组）⇒ 稳定且返回空（不得当成"还没读到"）',
      samples: [[], []],
      want: true,
      wantLabels: 0
    },
    {
      title: 'b88 实测形状：1 项 → 3 项（nav 逐项长出来）⇒ 未稳定且文案点名"还在长"',
      samples: [['缓存监控'], ['缓存监控', '缓存列表', '热 Key 提示']],
      want: false,
      reason: 'tab 标签还在长出来'
    },
    {
      title: '反脆弱：长度相同但顺序/文案变了 ⇒ 未稳定，且不得报成"还在长"（growing 必须是前缀关系）',
      samples: [
        ['A', 'B'],
        ['A', 'C']
      ],
      want: false,
      reason: 'tab 标签集合仍在变化'
    },
    {
      title: '反脆弱：b 比 a 长但不是前缀 ⇒ growing 必须为假',
      samples: [
        ['B', 'C'],
        ['A', 'B', 'C']
      ],
      want: false,
      wantGrowing: false
    },
    { title: '只有一拍 ⇒ 未稳定（不得把"只看了一眼"当落定）', samples: [['A']], want: false }
  ]
  let lBad = 0
  for (const t of lCases) {
    const v = labelsVerdict(t.samples)
    const okWant = v.stable === t.want
    const okReason = !t.reason || v.reason === t.reason
    const okLabels = t.wantLabels === undefined || (v.labels || []).length === t.wantLabels
    const okGrowing = t.wantGrowing === undefined || v.growing === t.wantGrowing
    if (!(okWant && okReason && okLabels && okGrowing)) {
      lBad++
      console.error(
        `  ❌ tab 标签落定：${t.title}（实际 stable=${v.stable} reason="${v.reason}" labels=${(v.labels || []).length} growing=${v.growing}）`
      )
    } else console.log(`  ✅ [OK] ${t.title}`)
  }
  if (lBad) {
    console.error(
      `❌ tab 标签落定自检失败 ${lBad}/${lCases.length} 条 ⇒ 多 tab 页仍会把"nav 还没渲染完"读成"这页只有一个 tab"`
    )
    process.exit(1)
  }
  // 生效路径反查（写了没接线=没写）：跑批正文必须真的调用这条通道并有 UNRUN 那一支
  const selfSrc = fs.readFileSync(path.join(__dirname, 'action-inventory.mjs'), 'utf8')
  const revChecks = [
    {
      needle: 'const tabsRead = await waitTabLabels(page)',
      fail: '跑批正文没调用 waitTabLabels ⇒ 这条纯函数与轮询都是死码，/monitor/cache 仍会报"动作 0"'
    },
    {
      needle: '有 tab 点了两次仍未落地 ⇒',
      fail: '跑批正文没有"tab 没落地 ⇒ EXIT=2"这一支 ⇒ 遮挡挡住点击仍会被写成"这个 pane 没有动作"并落进基线'
    },
    {
      needle: 'if (block) block = await tryClick()',
      fail: '跑批正文的 tab 点击没走"每次按下前重收遮罩 + 失败重试" ⇒ 引导浮层 1.6s 才挂载这条时序仍会吞掉点击'
    },
    {
      needle: 'sinceActivityMs: () => (net.lastActivityAt ? Date.now() - net.lastActivityAt : null)',
      fail: '跑批正文没把"距最后一次请求事件"传给 waitTableSettled ⇒ 判定会退回那个会被卡死的在飞计数（b88 实测 在飞 1 × 20 秒）'
    },
    {
      needle: 'activity: () => net.events - netBase',
      fail: '跑批正文没把**事件驱动**的活动计数传给 waitTableSettled ⇒ "这页发过数据请求"只能靠采样撞上，短请求会永远看不见'
    },
    {
      needle: 'const settle = await waitTableSettled(page, 20000, 250, {',
      fail: '跑批正文没把网络计数通道传给 waitTableSettled ⇒ 落定仍由秒表决定（b88 实测那条 8 秒读 0）'
    },
    {
      needle: 'const stableMs = Date.now() - runStart',
      fail: '轮询正文没算稳定窗口（runStart）⇒ STABLE_MS 只是判据里的一个装饰，acceptSettled 收到 undefined 恒判不落定'
    },
    {
      needle: 'if (acceptSettled(v, ctx))',
      fail: '轮询正文没用 acceptSettled ⇒ 这条纯函数是死码（写了没接线=没写）'
    },
    {
      needle: '页表格读数未落定 ⇒ 本轮行内动作面不作数',
      fail: '跑批正文没有"未落定 ⇒ EXIT=2"这一支 ⇒ 未落定会被当成正常读数'
    },
    {
      needle: '本轮却没采到可见 el-table',
      fail:
        '跑批正文没有"基线记有行内动作、本轮没采到表 ⇒ EXIT=2"这一支' +
        ' ⇒ tableMissing 只是采到了却没人消费，"没读到表"仍会被内容棘轮报成假退步（b88 实测形状）'
    },
    {
      needle: '页"落定时 DOM 里一个 el-table 元素都没有、同一次扫描随后采到可见表与可见行"自相矛盾',
      fail:
        '跑批正文没有"同一轮内部自相矛盾 ⇒ EXIT=2"这一支' +
        ' ⇒ 换尺后第一轮坏在读哪个通道没人能发现（必须不依赖基线就能证伪，b88 实测靠这条定性）'
    },
    {
      needle: '页落定走的是**时间兜底**',
      fail: '跑批正文没判"兜底通道占多数 ⇒ EXIT=2" ⇒ 网络计数坏了时整轮会静默退回被证伪过的旧尺'
    },
    {
      needle: 'if (!maskedSrc.includes(c.needle)) {',
      fail: '反查循环读的不是掩码后的文本 ⇒ "清单自己就是证据"那个空洞重新打开（掩码函数写了没接线=没写）'
    },
    {
      needle: "page.on('requestfinished', done)",
      fail: '跑批正文没挂 requestfinished/requestfailed ⇒ net.inflight 恒 0，"静默"是假的'
    },
    {
      needle: '页取不到路由页面容器（.app-main）⇒ 动作面未被度量，本轮不作数',
      fail:
        '跑批正文没有"作用域取不到 ⇒ EXIT=2"这一支 ⇒ `.catch(() => null)` 会把"采集器坏了"洗成"这页 0 个动作"，' +
        '而 0 会照常落进基线（b89 实测旧作用域把全站壳层算进分母，三批没人看出来）'
    }
  ]
  /**
   * **反查必须在剔掉"清单自己"的文本之后做**（b88 收口抓到自己的空洞）：
   * `selfSrc` 读的是本文件全文，而每条 needle 的字面量也写在这个文件里 ⇒
   * 一条"跑批正文里根本没有、只活在清单里"的 needle 会**匹配到自己那一行**，恒绿。
   * 实测形状：把 FATAL 文案改成"同一把尺走完 tab 后…"之后，旧 needle
   * `同一页随后采到表头/数据行` 在正文里已经一处都没有，反查却照常放行——
   * 文件里剩下的那唯一一处，就是清单自己那一行（前言 ⑬"刀口只能落在代码上，不得被注释文本决定"
   * 的第三个断面：这一次被读成证据的是**判据自己的源码**）。
   */
  const maskedSrc = maskNeedleLines(selfSrc)
  let revBad = 0
  for (const c of revChecks) {
    if (!maskedSrc.includes(c.needle)) {
      revBad++
      console.error(`❌ ${c.fail}（needle «${c.needle.slice(0, 40)}…» 在跑批正文里一处都没有）`)
    }
  }
  /**
   * 掩码函数自己的双向用例（**合成文本**，不是本文件——本文件里"只在清单里"的文本
   * 没法既当被测数据又当断言字面量，那样写出来的用例必然自指）。
   */
  const maskCases = [
    {
      title: '正控：needle 只出现在清单行 ⇒ 掩码后必须找不到（这就是旧实现恒绿的那一支）',
      src: ['const revChecks = [{', "  needle: 'ZXT_只在清单里_ABC',", '  fail: "x"', '}]'].join('\n'),
      needle: 'ZXT_只在清单里_ABC',
      want: false
    },
    {
      title: '正控：同一文本在正文里也有 ⇒ 掩码后必须仍找得到（不得把正文一起剔掉）',
      src: ["console.error('[FATAL] ZXT_正文里有_ABC')", "const c = { needle: 'ZXT_正文里有_ABC' }"].join('\n'),
      needle: 'ZXT_正文里有_ABC',
      want: true
    },
    {
      title: '反脆弱：注释里写着 needle: 的行不参与掩码？——必须**参与**（掩码按行首，注释行同样被剔）',
      src: ['//   needle: 这是注释里的举例', "const k = 'ZXT_注释里的_ABC'"].join('\n'),
      needle: 'needle: 这是注释里的举例',
      want: false
    },
    {
      title: '反脆弱：`x = { needle: ... }` 写在行中不得被误剔（只有行首才算清单行）',
      src: ["const row = { t: 1, needle: 'ZXT_在行中_ABC' }"].join('\n'),
      needle: 'ZXT_在行中_ABC',
      want: true
    }
  ]
  for (const c of maskCases) {
    const got = maskNeedleLines(c.src).includes(c.needle)
    if (got !== c.want) {
      revBad++
      console.error(`❌ 掩码判据：${c.title}（实际 ${got}，期望 ${c.want}）`)
    } else console.log(`  ✅ [OK] ${c.title}`)
  }
  if (revBad) process.exit(1)

  /**
   * 采集作用域判据（b89 收口新增，前言 ⑥/⑬ 的同一条：判据的输入坏了必须比"结论是 0"响亮）。
   *
   * 立的案：旧实现的根选择器是 `.app-container`，而**只有部分视图**用它（src/ 实测 64 文件 / 68 处，
   * 定义在 `src/assets/styles/index.scss:139`）⇒ b89 一次性探针实测 56/56 页都取到 `.app-main`，
   * 但 `/tool/build`、`/tool/swagger` 这两页的 `.app-main` 内没有 `.app-container`（且整份文档也没有），
   * 于是 `|| document.body` 恰好在这两页恒生效——
   * 于是"这一页的动作"其实是"整份文档的动作"，全站横幅/navbar/tags-view 被逐页计入。
   * 症状是本轮 `/tool/build` 与 `/tool/swagger` 各多出一个 `关闭该公告提示`（同一控件、两处出现），
   * 而覆盖率从 100% 掉到 99.5%：差被容差放过了，但**度量对象一直是错的**。
   * 这一族用例证明三件事：作用域取不到 ⇒ 判坏；合法的空页面 ⇒ **不得**判坏；
   * 旧的"`|| document.body`"形状不得回到正文里。
   */
  const scopeCases = [
    { title: '作用域缺失（{scopeMissing:true}）必须判坏', got: { scopeMissing: true }, want: true },
    { title: 'evaluate 抛错被收成 null 必须判坏（不得读成"这页 0 个动作"）', got: null, want: true },
    { title: 'undefined 必须判坏（同 NaN > 容差恒 false 一族）', got: undefined, want: true },
    { title: '形状对不上（缺数组字段）必须判坏', got: { toolbar: [] }, want: true },
    {
      title: 'toolbar 为 null 必须判坏（Array.isArray 不认 null）',
      got: { toolbar: null, rowActions: [] },
      want: true
    },
    {
      title: '正控：合法的空动作页**不得**判坏（否则每轮必红，结局是被放宽）',
      got: { toolbar: [], rowActions: [] },
      want: false
    },
    { title: '正控：正常读数不得判坏', got: { toolbar: [{ name: '新增' }], rowActions: [] }, want: false }
  ]
  let scopeBad = 0
  for (const c of scopeCases) {
    const got = pageScopeFailure(c.got)
    if (got !== c.want) {
      scopeBad++
      console.error(`❌ 作用域判据：${c.title}（实际 ${got}，期望 ${c.want}）`)
    } else console.log(`  ✅ [OK] ${c.title}`)
  }
  /**
   * **旧的整文档兜底不得回到正文里**。
   * ⚠ 这里必须**拼接**出被禁文本：直接把完整字面量写成一行的常量，那一行本身就含该文本 ⇒
   * 负向断言恒真（前言 ㉘"清单自己不能当证据"、⑬"刀口只能落在代码上"在**反证型**判据上的断面：
   * 正向 needle 会被掩码规则剔掉，而反向 needle 恰恰是"谁出现谁红"，判据自己出现就先红）。
   * 因此配套加一条**合成正控**：把旧形状放进一段合成文本，它必须被抓到——否则"没抓到"
   * 可能只是"匹配不上任何东西"。
   */
  const forbiddenScope = ['.app-container', "') || document", '.body'].join('')
  if (maskedSrc.includes(forbiddenScope)) {
    scopeBad++
    console.error('❌ 作用域反证失败：正文里又出现了整份文档兜底那支 ⇒ 壳层动作会重新混进分母')
  } else {
    console.log('  ✅ [OK] 作用域反证：正文（掩码后）不含整份文档兜底那支')
  }
  // 正控：同一把尺必须真的抓得住旧形状（否则上面的"没抓到"毫无信息量）。
  // 夹具文本同样**只能用拼接得到**——把它写成一行字面量，这一行就成了它自己要找的东西，
  // 负向断言会在判据自己的源码上恒真（本轮第一次就是这样红的）。
  const forbiddenProbe = 'const root = document.querySelector(' + "'" + forbiddenScope
  if (!forbiddenProbe.includes(forbiddenScope)) {
    scopeBad++
    console.error(`❌ 作用域反证自证失败：合成旧形状都没被抓到（needle «${forbiddenScope.slice(0, 24)}…» 拼错了）`)
  } else {
    console.log('  ✅ [OK] 作用域反证的活性正控：合成旧形状确实落在匹配范围内')
  }
  /**
   * 反查必须落在**采集器函数体**上，而不是"整份文件里提过这个选择器"。
   *
   * 本批盘上变异抓到的正是这一支：把根改回 `.app-container` 后 `--selftest` 照常绿（EXIT=0），
   * 因为锚点常量 `pageScopeAnchor = "document.querySelector('.app-main')"` **自己就是一处命中**——
   * "清单里写的字符串"被读成了"代码里的证据"（前言 ㉘/⑫ 的同一条，第三次长在判据自己身上）。
   * 两条修法同时用：① 锚点用**拼接**得到，字面量不再出现在源码里；
   * ② 检查范围从整份文件收窄到 `collectActions` 的函数体——作用域只对"采集动作的那段码"有意义，
   *   别处出现 `.app-main`（FATAL 文案、注释）都不算证据。
   */
  const pageScopeAnchor = ['document.querySelector(', "'.app-main')"].join('')
  const scopeSentinelAnchor = ['return { scopeM', 'issing: true }'].join('')
  const bodyFallback = ['document.', 'body'].join('')
  const fnStart = maskedSrc.indexOf('async function collectActions')
  // 函数体边界取"下一个顶格的 `}`"：采集器内部的闭合都带缩进，因此顶格闭合就是函数尾。
  // 刻意**不用哨兵位置定位尾部**——哨兵正是被测对象之一，它一旦缺失（变异体）就得让边界失效而不是把范围算歪。
  const fnEnd = fnStart < 0 ? -1 : maskedSrc.indexOf('\n}', fnStart)
  const fnBody = fnStart < 0 || fnEnd < 0 ? '' : maskedSrc.slice(fnStart, fnEnd)
  if (fnStart < 0 || !fnBody.includes(pageScopeAnchor) || !fnBody.includes(scopeSentinelAnchor)) {
    scopeBad++
    console.error(
      `❌ 作用域反查失败：collectActions 函数体里找不到 .app-main 这个根 / scopeMissing 哨兵` +
        `（函数体取到 ${fnBody.length} 字符 ⇒ ${fnStart < 0 ? '采集器本体没定位到' : '锚点不在采集器里'}）`
    )
  } else {
    console.log(`  ✅ [OK] 作用域反查：采集器函数体（${fnBody.length} 字符）确实以 .app-main 为根并交回哨兵`)
  }
  if (fnBody.includes(bodyFallback)) {
    scopeBad++
    console.error('❌ 作用域反证失败：采集器函数体里出现了整份文档兜底 ⇒ 壳层动作会重新混进分母')
  } else {
    console.log('  ✅ [OK] 作用域反证：采集器函数体不含整份文档兜底那支')
  }
  if (scopeBad) process.exit(1)

  // 第六族（b96，收 b88 N-H）：非行内控件面守恒。判的是"按钮身份"而不是总数——
  // 一页少一个、另一页多一个在聚合上完全同形（b88 /tool/swagger 3→1 就是这么漏的）。
  const ctlCases = [
    ['基线有的控件本轮消失 ⇒ 必须报', { '/a': { k: ['新增', '导出'] } }, { '/a': { k: ['新增'], r: 3, e: '' } }, true],
    [
      '控件名顺序不同不得误报（集合比较，不是序列比较）',
      { '/a': { k: ['新增', '导出'] } },
      { '/a': { k: ['导出', '新增'], r: 3, e: '' } },
      false
    ],
    [
      '本轮新增控件不得报（棘轮拦减少，不拦增长）',
      { '/a': { k: ['新增'] } },
      { '/a': { k: ['新增', '批量删除'], r: 1, e: '' } },
      false
    ],
    ['合法无按钮页面（两侧 k 都空）不得报', { '/a': { k: [] } }, { '/a': { k: [], r: 0, e: '' } }, false],
    [
      '页面消失必须点名（路由数不变的一换一也要抓）',
      { '/a': { k: ['新增'] }, '/b': { k: [] } },
      { '/b': { k: [], r: 0, e: '' } },
      true
    ],
    [
      '0 行页面上数据驱动按钮消失仍须报（不得静默当"没有这按钮"）',
      { '/a': { k: ['查看全部'] } },
      { '/a': { k: [], r: 0, e: '暂无数据' } },
      true
    ]
  ]
  let ctlBad = 0
  for (const [desc, baseRoutes, curRoutes, want] of ctlCases) {
    const r = controlSurfaceRegressions({ perRoute: baseRoutes }, curRoutes)
    // want=true 时还要求（a）不是"缺栏不可比"糊弄过去的，（b）真有内容级退步
    const got = r.comparable && r.regressions.length > 0
    const ok = got === want
    if (!ok) ctlBad++
    console.log(`  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] 控件面：${desc}：期望报退步=${want}，实际 ${got}`)
  }
  // 缺 k 栏必须走"不可比 + 基线缺"文案（`--update-baseline` 的迁移通道按这三个字识别）
  const ctlShape = controlSurfaceRegressions(
    { perRoute: { '/a': { a: 1, c: 1, i: 0 } } },
    { '/a': { k: [], r: 0, e: '' } }
  )
  if (ctlShape.comparable || !ctlShape.regressions[0]?.includes('基线缺')) {
    ctlBad++
    console.error(`❌ 控件面缺 k 栏未被判成"不可比 + 基线缺"（实际 ${JSON.stringify(ctlShape)}）`)
  } else {
    console.log('  ✅ [OK] 控件面缺 k 栏走不可比通道（前缀"基线缺"供 --update-baseline 识别）')
  }
  // 分因必须可执行：0 行 + 按钮消失的文案要指向夹具/用例，否则人只会去改基线
  const ctlWhy = controlSurfaceRegressions(
    { perRoute: { '/a': { k: ['查看全部'] } } },
    { '/a': { k: [], r: 0, e: '暂无数据' } }
  ).regressions[0]
  if (!ctlWhy.includes('夹具') && !ctlWhy.includes('用例')) {
    ctlBad++
    console.error(`❌ 控件面退步文案没有可执行动作（应提示配数据夹具或用例）：${ctlWhy}`)
  } else {
    console.log('  ✅ [OK] 控件面退步分因指向夹具/用例（数据态原因可执行）')
  }
  if (ctlBad) {
    console.error(`❌ 控件面守恒自检失败 ${ctlBad} 条`)
    process.exit(1)
  }

  if (deferredFails.length) {
    for (const m of deferredFails) console.error(`❌ ${m}`)
    console.error(
      `（其余各族——落定判据 ${stCases.length} 条、接受判据 ${aCases.length} 条、tab 标签落定 ${lCases.length} 条、生效路径反查 ${revChecks.length} 条——**已照常执行完毕**才退出 ⇒ 红在这一条，不是"后面没跑"）`
    )
    process.exit(1)
  }

  console.log(
    `SYNTH_OK 动作名归一自检通过（${cases.length} 条双向判据：6 条必须覆盖 / 6 条必须不覆盖）` +
      ` + 点击证据 ${iCases.length} 条双向（含"只提及不算点过"反例）` +
      ` + 棘轮比较式 ${rCases.length} 条双向` +
      ` + 无点击证据拆分 ${cCases.length} 条双向（含拆分守恒正控）` +
      ` + 行内动作面分母 ${sCases.length} 条双向 + 不可比通道 ${uncomparable.length} 条` +
      ` + 两条腿（相对容差 × 绝对下限）${legCases.length} 条 + 参数对账 1 条 + 退步分因 ${whyCases.length} 条双向（含"缺 rt 不得读成有行"反证）` +
      ` + 已提交基线真实树正控 ${realCtl} 条（含口径戳对账）` +
      ` + 表格读数落定 ${stCases.length} 条双向（含两个正控 + b88 三条 tableMissing 反脆弱）` +
      ` + 稳定≠可接受 ${aCases.length} 条双向（b88 收口把尺从秒表换成请求静默，含"0 行 vs 还没回""静默 1 拍不算终态""计数器下溢"三支反脆弱）` +
      ` + tab 标签落定 ${lCases.length} 条双向（b88 实测 /monitor/cache 的 nav 在 2.6s 只有 1 项）` +
      ` + 非行内控件面守恒 ${ctlCases.length} 条双向 + 缺栏通道 1 条 + 分因可执行 1 条（b96 / b88 N-H）` +
      ` + 生效路径反查 ${revChecks.length} 条（读的是掩码后的正文，清单自己不算证据）` +
      ` + 采集作用域 ${scopeCases.length} 条双向（b89：作用域取不到≠这页没动作）+ 作用域反查/反证 2 条（正文必须以 .app-main 为根、不得回到 || document.body）`
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
    /**
     * 每页在飞的 XHR/fetch 计数（落定判据的终态通道，见 acceptSettled）。
     *
     * 只数 `xhr|fetch`：本仓布局常驻 WebSocket（通知流），`page.on('request')` 对 WS 只在**关闭时**
     * 才发 finished ⇒ 计入就永远"不静默"；`document`/`script`/`stylesheet` 同理——入口包 5.8 MB，
     * 静态资源与业务请求混在一起会让"静默"意味着"整页资源下载完"，那不是列表页的终态。
     * 计数夹到 0 并留 `underflow`：Playwright 的事件对某些重定向/缓存命中不严格成对，
     * 负数会把"还有请求在飞"读成"静默"——那正是这条通道要防的形状，宁可多等一拍。
     */
    const net = { inflight: 0, underflow: 0, events: 0, lastActivityAt: 0 }
    const isData = (r) => {
      try {
        const t = r.resourceType()
        return t === 'xhr' || t === 'fetch'
      } catch {
        return false
      }
    }
    page.on('request', (r) => {
      if (!isData(r)) return
      net.events++
      net.inflight++
      net.lastActivityAt = Date.now()
    })
    const done = (r) => {
      if (!isData(r)) return
      net.events++
      net.lastActivityAt = Date.now()
      if (net.inflight === 0) {
        net.underflow++
        return
      }
      net.inflight--
    }
    page.on('requestfinished', done)
    page.on('requestfailed', done)
    if (!(await login(page))) {
      console.error('❌ 登录失败：检查 STEPBY_TEST_USER / STEPBY_TEST_PASS / 服务是否在 8080')
      await browser.close()
      process.exit(1)
    }
    log(`登录成功，开始扫描 ${routes.length} 条路由`)

    const pages = []
    for (const [i, routePath] of routes.entries()) {
      const url = `${BASE}${routePath}`
      // 上一跳的在飞请求与本跳的终态无关：整页 reload 后旧请求会 abort（requestfailed 会来），
      // 但"来不来"不是判据可以依赖的东西 ⇒ 每页开始把计数归零，配下文的 underflow 一起进凭证。
      net.inflight = 0
      // 上一跳的最后事件时刻对本跳毫无意义（会让"本跳还没发请求"被读成"已静默 5 分钟"）：
      // 置 0 ⇒ sinceActivityMs() 返回 null ⇒ 本页在发出第一个数据请求之前不得凭"静默"落定。
      net.lastActivityAt = 0
      const netBase = net.events
      let gotoError = ''
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => {
        gotoError = String((e && e.message) || e)
          .split('\n')[0]
          .slice(0, 120)
      })
      // 600ms 是"SPA 首屏挂载"的下限，不是读数等待；读数一律交给下面的落定轮询。
      await sleep(600)
      await dismissTour(page)
      const settle = await waitTableSettled(page, 20000, 250, {
        inflight: () => net.inflight,
        activity: () => net.events - netBase,
        sinceActivityMs: () => (net.lastActivityAt ? Date.now() - net.lastActivityAt : null)
      })
      await sleep(200)

      // 逐 tab 扫描：el-tabs 的非激活 pane 是 display:none，`visible()` 会把里面的按钮全部滤掉——
      // 实测 /monitor/cache（概览/键管理/热Key）因此报"动作 0"，而键管理页其实有刷新/清理共 6 个按钮。
      // 不点 tab 就等于把多 tab 页面整页判成"没有可测动作"，覆盖率会虚高。
      //
      // **tab 标签本身也要轮询到落定**（b88 收口补）：EP 的 tab nav 是挂载后逐项算宽度的，
      // 实测 `/monitor/cache` 在 +2.6s（表格已落定）时 `.el-tabs__item` 只有 1 项、+4s 才是 3 项
      // ⇒ 旧写法在这里读一次就把 `tabs.length>1` 当判据，1 项 ⇒ 不点 tab ⇒ 整页报"动作 0"，
      // 而这一页真正的动作面（缓存列表 / 热 Key 两个 pane 的按钮）从没被采到过。
      // 表格落定 ≠ 页面上其他控件落定：尺必须套在"接下来要被读的那个东西"上（前言 ⑬ 的同一条）。
      const tabsRead = await waitTabLabels(page)
      const tabLabels = tabsRead.labels
      const tabs = tabLabels.length > 1 ? tabLabels.slice(0, 6) : []

      let got = await collectActions(page).catch(() => null)
      // 作用域取不到（缺 `.app-main`）与"这一页没有按钮"是两件相反的事：前者只能交回 UNRUN，
      // 后者是内容结论。`collectActions` 的两条失败出口都必须进同一个累加器，
      // 否则 `.catch(() => null)` 会把"采集器坏了"洗成"这页动作数为 0"（前言 ⑥/⑯(c)）。
      const scopeMissing = pageScopeFailure(got)
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
      const tabClickFailed = []
      /**
       * 每个 tab 自己的行数（b88 收口补）。`rowCount` 刻意**不跨 tab 合并**（页面身份不能被串），
       * 于是"默认视图 0 行"与"这一页真的没数据"是两件事：`/monitor/cache` 默认视图 0 行，
       * 而它的行内动作「删除」在 tab「缓存列表」里、那一 tab 本轮读到过数据行。
       * 退步分因文案要用后者，否则会把"缺覆盖"报成"需要配数据夹具"（前言 ⑨：错误提示把人支使去改错的东西）。
       */
      const tabRows = { [tabs[0] || '']: merged.rowCount }
      if (tabs.length) {
        tabCounts[tabs[0]] = merged.toolbar.length + merged.rowActions.length
        for (let ti = 1; ti < tabs.length; ti++) {
          /**
           * **每次按下前重收引导遮罩**（前言 ③ 的同一条纪律，本批在扫描器上复现）：
           * 跑批在 +0.6s 调过一次 `dismissTour`，而实测引导浮层在 **+1.6s 才挂载**
           * （`_probe_cache_tabs2`：tour=false→true 就发生在 1.22s→1.64s 之间），
           * 于是表格落定与 tab 点击都发生在遮罩**已挡住**的时段；
           * `.click().catch(() => false)` 把这件事洗成"这个 tab 没有动作"，
           * `/monitor/cache` 因此报 `动作 0`——它另外两个 pane 的按钮从没被采到过。
           * 失败就重收一次再试一次；仍失败**必须留下名字**，不得静默 continue。
           */
          const tryClick = async () => {
            await dismissTour(page)
            return page
              .locator('.el-tabs__item')
              .nth(ti)
              .click({ timeout: 3000 })
              .then(() => '')
              .catch((e) =>
                String((e && e.message) || e)
                  .split('\n')
                  .filter(Boolean)
                  .slice(-1)[0]
                  .slice(0, 120)
              )
          }
          let block = await tryClick()
          if (block) block = await tryClick()
          if (block) {
            tabClickFailed.push({ tab: tabs[ti], block })
            continue
          }
          await sleep(900)
          const t = await collectActions(page).catch(() => null)
          if (!t) continue
          // tab 内也走同一条作用域判据：某条 tab 的页面容器读不出来 ⇒ 整轮作用域不可信
          if (t.scopeMissing === true) continue
          // 同名按钮只保留一份（不同 tab 可能有同名的"刷新"）
          merged.toolbar.push(...t.toolbar.map((b) => ({ ...b, tab: tabs[ti] })))
          merged.rowActions.push(...t.rowActions.map((b) => ({ ...b, tab: tabs[ti] })))
          // 表头/控件/行数**不跨 tab 合并**：各 tab 的表结构完全不同，取"最长"会让
          // /user/profile/userAvatar 显示 PAT 页的 8 列表头（b78 实测踩过），
          // 页面身份就串了。这些字段只代表"默认视图"，tab 内动作靠 `tab` 字段区分。
          tabCounts[tabs[ti]] = t.toolbar.length + t.rowActions.length
          tabRows[tabs[ti]] = t.rowCount
        }
      }
      // iframe 页（Swagger UI）：动作不在本页 DOM 内，标出来避免被读成"页面没按钮"
      const iframeCount = await page.$$eval('iframe', (els) => els.length).catch(() => 0)
      got = merged
      /**
       * **同一把尺的第二次读数**（走完 tab 之后）：`collectActions` 的 `columns`/`rowCount`
       * 不能用来说明"这页有可见的表"——`querySelectorAll` 不看可见性，而未渲染子树的
       * `innerText` 按规范回退成 `textContent`，所以**隐藏 tab 里的表头照样进 `columns`**
       * （b88 实测：`/user/profile/*` 报 `列 8 / 行 0` 而同一页可见表 0/1 张，
       * 因为那张表挂在未激活的 tab pane 里）。
       * 因此"落定尺采到 0 张可见表"到底是不是矛盾，只能拿 `sampleTableState`（两侧都过可见性）
       * 与它自己比，不能拿另一个通道比。
       */
      const finalSample = await page.evaluate(sampleTableState).catch((e) => ({
        sampleError: String((e && e.message) || e)
          .split('\n')[0]
          .slice(0, 180)
      }))

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
        // 行内动作所在视图里的最大行数（见上面的 tabRows）：`rowCount=0` 只说"默认视图没行"，
        // 这一个说"那些行内动作被扫到时，所在视图有没有行"。两者的差就是分因文案的分界。
        rowActionMaxRows: (merged.rowActions || []).reduce(
          (m, b) => Math.max(m, tabRows[b.tab] === undefined ? merged.rowCount : tabRows[b.tab]),
          0
        ),
        // tab 条自己的落定凭证（见 waitTabLabels）：只读到 1 项时，"这页只有一个 tab"和
        // "nav 还没长完"必须可区分——后者会让多 tab 页整块动作面消失，而且静默。
        tabReadMs: tabsRead.ms,
        tabReadSamples: tabsRead.samples,
        tabReadSettled: tabsRead.settled,
        tabReadReason: tabsRead.reason || '',
        // 点了没落地的 tab 必须点名（前言 ⑭："请求数=0"必须 AND"这次点击真的落地"）：
        // 静默 continue 会把"遮罩挡住了"洗成"这个 pane 没有动作"。
        tabClickFailed,
        iframeCount,
        // 读数落定凭证（见 settleVerdict）：未落定的页必须让本轮判据不作数
        settled: settle.settled,
        settleMs: settle.ms,
        settleReason: settle.reason,
        // 落定走的是哪条通道 + 采了几拍 + 当时在飞几个请求（见 acceptSettled 的 b88 取证）：
        // "等了 8 秒"与"请求飞完了"是两种完全不同的证据，凭证必须把这一层写出来。
        settleChannel: settle.channel,
        settleSamples: settle.samples,
        settleInflight: settle.inflight ?? null,
        // 距最后一次数据请求事件的毫秒数——判定用的是它，不是上面那个计数（计数会被
        // 一个永不 finished 的请求永久钉住，b88 实测 在飞 1 × 20 秒而读数 74 拍不动）。
        settleSinceActivityMs: settle.sinceActivityMs ?? null,
        settleStableMs: settle.stableMs ?? null,
        // 未落定时唯一能归因的东西：最后几段读数各采了几拍（`行 2 表 1 空态 false 遮罩 false ×8`）
        settleDistinct: settle.distinct || '',
        gotoError,
        // "整页采到几张可见 el-table"——0 张不等于"这页没有行内动作"，见 settleVerdict 的 b88 取证。
        // 取**两次同尺读数的较大值**：落定那一刻（默认 tab）与走完 tab 之后（激活过其它 pane）。
        // 只用前者会把"表挂在未激活 tab 里"的多 tab 页每轮判成矛盾（b88 实测 8 页误报）。
        settleTables: settle.tables ?? -1,
        finalTables: finalSample.tables ?? -1,
        finalRows: finalSample.rows ?? -1,
        tableCount: Math.max(settle.tables ?? -1, finalSample.tables ?? -1),
        // 落定那一刻的原始读数（可见/总数分开 + 当时所在的路径）。
        // 这一条是 b88 追"`可见表=0` 而同一页 `行 2`"时立的：轮询读到 0 与随后读到 2
        // 不可能同时为真，而原凭证答不出是哪一侧在骗人——只能靠"选择器匹配到几个元素""当时在哪个 URL"
        // 这两组不过滤可见性的事实来定性。
        settleProbe: settle.probe || null,
        finalProbe: finalSample || null,
        // "有表头/有 tab 却 0 动作"必须自曝，否则 0 会被当成"这页本来就没按钮"
        suspicious: toolbar.length + rowActions.length === 0 && (got.columns.length > 0 || tabs.length > 1),
        // 作用域判据（b89）：这一页的动作面**到底有没有被度量过**。
        scopeMissing
      }
      pages.push(rec)
      log(
        `${String(i + 1).padStart(2)}/${routes.length} ${routePath.padEnd(34)} ` +
          `动作 ${rec.actionCount}（覆盖 ${rec.coveredCount} / 点击 ${rec.clickedCount}）行 ${rec.rowCount}` +
          (rec.tableCount === 0
            ? ` 可见表=0（落定 ${rec.settleTables} 张 / 走完 tab ${rec.finalTables} 张·DOM 里共 ${
                rec.finalProbe?.tablesAll ?? '?'
              } 张·空态 ${rec.finalProbe?.emptyAll ?? '?'} 个·在 ${rec.finalProbe?.path ?? '?'}）`
            : '') +
          (rec.tabs && Object.keys(rec.tabs).length > 1 ? ` tab=${Object.keys(rec.tabs).length}` : '') +
          (rec.tabClickFailed && rec.tabClickFailed.length
            ? `  ❌ tab 未落地 ${rec.tabClickFailed.map((f) => f.tab).join('/')}`
            : '') +
          (rec.suspicious ? '  ⚠ 采集可疑（有表头/多 tab 却 0 动作）' : '') +
          (rec.settled ? '' : `  ❌ 未落定（${rec.settleReason} / ${rec.settleMs}ms）`)
      )
    }

    await browser.close()

    // 口径闸 0（排在落定闸之前——它比"没落定"更底层：落定尺坏至少还读了 DOM，作用域坏是**整页没度量**）：
    // 任一页取不到路由页面容器 `.app-main`（或 evaluate 抛错被收成 null）⇒ 本轮不作数，EXIT=2。
    // 为什么不能只打 ⚠：旧实现的作用域正是"`document.querySelector('.app-container') || document.body`"，
    // 那个类不存在 ⇒ 每一轮都在整份文档上采集，把全站横幅/navar 按钮算进"这一页的动作"，
    // 而判据照常绿——**"坏掉的采集面"与"干净的结论"在旧形状下逐字节同形**（前言 ⑥/⑬ 的同一条）。
    const unscoped = pages.filter((x) => x.scopeMissing)
    if (unscoped.length) {
      console.error(
        `[FATAL] ${unscoped.length}/${pages.length} 页取不到路由页面容器（.app-main）⇒ 动作面未被度量，本轮不作数：` +
          unscoped.map((x) => x.path).join(' ') +
          `｜需要的动作：查该页是否渲染在布局壳层之外（新壳层/独立窗口页），不得放宽作用域选择器`
      )
      process.exit(2)
    }

    // 口径闸（必须排在任何内容比对之前，前言 ⑨）：有一页没落定 ⇒ 本轮不作数。
    // 这不是退步而是"判据不可用"，所以退出码取 2（UNRUN）而不是 1：
    // 报 1 会把人支使去"补登记 / 调阈值"，而正确的动作是查那页为什么读不完。
    const unsettled = pages.filter((x) => !x.settled)
    if (unsettled.length) {
      console.error(
        `[FATAL] ${unsettled.length}/${pages.length} 页表格读数未落定 ⇒ 本轮行内动作面不作数：` +
          unsettled
            .map(
              (x) =>
                `${x.path}(${x.settleReason}, ${x.settleMs}ms·${x.settleChannel}·${x.settleSamples} 拍；读数序列 ${x.settleDistinct || '无'})`
            )
            .join(' ')
      )
      process.exit(2)
    }
    const slowest = pages.reduce((a, x) => (x.settleMs > a.settleMs ? x : a), pages[0])
    // 通道对账（同 console 豁免那条"兜底不得变成主通道"）：走时间兜底的页必须数得出来。
    // 兜底支用的是被 b88 证伪过的旧尺，一旦它成为多数就说明网络计数通道坏了（事件没配对、
    // 或整批页都在 20 秒预算外），那时"落定"这个词已经没有含义。
    const fallbackPages = pages.filter((x) => x.settleChannel !== 'net-quiet')
    const netUnderflow = net.underflow
    log(
      `落定核对：${pages.length}/${pages.length} 页落定（最慢 ${slowest.path} ${slowest.settleMs}ms）` +
        ` 通道=请求静默 ${pages.length - fallbackPages.length} / 时间兜底 ${fallbackPages.length}` +
        `（数据事件 ${net.events} 次、下溢 ${netUnderflow} 次）`
    )
    if (fallbackPages.length > pages.length / 2) {
      console.error(
        `[FATAL] ${fallbackPages.length}/${pages.length} 页落定走的是**时间兜底**（旧尺，b88 已证伪）` +
          ` ⇒ 网络计数通道大概率坏了（下溢 ${netUnderflow} 次），本轮行内动作面不作数`
      )
      process.exit(2)
    }

    /**
     * **同一轮内部的自相矛盾**（b88 收口补，不需要基线，排在写产物之前）：
     * 落定那一刻**DOM 里连一个 `.el-table` 元素都没有**（`tablesAll===0`），
     * 而同一次扫描稍后却采到了"可见表 + 可见数据行" ⇒ 两次读数不可能同时为真，
     * 坏的必然是先那一次（它把"还没挂出来"读成了"没有"）——这正是 b88 的 `/system/user`
     * （落定时 `tables:0 tablesAll:0`，随后 `列 12 / 行 2 / 表 1 张`）。
     *
     * 两个刻意收窄，各自都有实测反例：
     * ① 必须看 `tablesAll`（不过滤可见性）而不是只看"可见表 0 张"：`/monitor/cache` 落定时
     *    `表 0/4 张`（四张表都在未激活 pane 里），走完 tab 之后 `表 2 张 / 行 28`——
     *    那是**本判据自己点开 tab 造成的变化**，是逐 tab 扫描的目的，不是尺读早了。
     *    第一版没带这一条，把 cache 判成了尺坏（前言 ⑯(c)：前置条件不成立的判据是负资产）。
     * ② 必须要求随后**有可见数据行**：只有表头不构成"读数被推翻"，
     *    隐藏 pane 的表头本来就会进 `columns`（那个通道不看可见性）。
     * 退出码取 2（UNRUN）：报 1 会把人支使去"改基线 / 调阈值"，而正确的动作是修落定判据本身。
     */
    const selfContradiction = pages.filter(
      (p) => p.settleTables === 0 && (p.settleProbe?.tablesAll ?? -1) === 0 && p.finalTables > 0 && p.finalRows > 0
    )
    if (selfContradiction.length) {
      console.error(
        `[FATAL] ${selfContradiction.length}/${pages.length} 页"落定时 DOM 里一个 el-table 元素都没有、同一次扫描随后采到可见表与可见行"自相矛盾` +
          ' ⇒ 落定判据本身坏了，本轮行内动作面不作数：' +
          selfContradiction
            .map(
              (p) =>
                `${p.path}(落定 ${p.settleTables} 张 / 随后 ${p.finalTables} 张·行 ${p.finalRows} / ` +
                `落定 ${p.settleMs}ms·${p.settleChannel}·采 ${p.settleSamples} 拍·距最后一次数据请求 ${
                  p.settleSinceActivityMs ?? '?'
                }ms·在飞 ${p.settleInflight ?? '?'}·落定时 DOM 里共 ${p.settleProbe?.tablesAll ?? '?'} 张·${
                  p.settleProbe?.path ?? '?'
                }${p.gotoError ? `·goto 异常 «${p.gotoError}»` : ''})`
            )
            .join(' ') +
          '（正确动作是修 waitTableSettled 的终态判据，不是把 tableCount 当可信数写进基线）'
      )
      process.exit(2)
    }
    /**
     * tab 点不动 ⇒ 本轮不作数（b88 收口补）：`/monitor/cache` 在修遮罩时序之前就是这一形——
     * 两个 pane 的点击被引导遮罩挡住，`.catch(() => false)` 把它洗成"这两个 tab 没有动作"，
     * 于是整页报 `动作 0` 并**照常落进基线**（分母就此缩掉）。
     * 判据与 b83 的"点击落地通道"同源：**"动作数为 0"必须 AND"这次点击确实落地"**，
     * 否则同一判据同时被"这页没按钮"与"按钮没点到"两种相反状态满足。
     */
    const tabStuck = pages.filter((p) => (p.tabClickFailed || []).length > 0)
    if (tabStuck.length) {
      console.error(
        `[FATAL] ${tabStuck.length}/${pages.length} 页有 tab 点了两次仍未落地 ⇒ 那些 pane 的动作面没有被采集，本轮不作数：` +
          tabStuck.map((p) => `${p.path}[${p.tabClickFailed.map((f) => `${f.tab}«${f.block}»`).join(' ')}]`).join(' ') +
          '（先修遮挡/时序，不得把"没点到"写成"没有动作"，更不得据此 --update-baseline）'
      )
      process.exit(2)
    }
    // 基线在闸之前读出来：这一句原先排在写产物之后，于是"坏尺"也会先落两份报告（b88 实测）。
    const base = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : null
    /**
     * 口径闸（b88 补）：基线承诺这页有行内动作（`t>0`）而本轮**两个可见性口径的读数都是 0 张表**
     * ⇒ 这是"没读到"而不是"动作变少"，交内容棘轮就会报出假退步（b88 的 `/system/user` 93.2% < 100.0%）。
     * **只在基线与本轮同口径时才判**：换尺之后旧基线的 `t` 是被证伪过的那把尺采的，
     * 拿它来判本轮"有没有表"就是让坏尺继续管事（前言 ⑩：换判据必须与重生成基线同批）。
     * 不同口径时打一条 ℹ，把动作写清楚——先 `--update-baseline`，之后这条闸才生效。
     */
    const sameCaliber = !!base && base.sampling === INVENTORY_SAMPLING
    if (!sameCaliber && base) {
      log(
        `ℹ 基线口径 ${base.sampling} ≠ 本轮 ${INVENTORY_SAMPLING} ⇒ "基线有行内动作而本轮无可见表"这一闸本轮不判（换尺须先 --update-baseline）`
      )
    }
    const missingTable = sameCaliber
      ? pages.filter(
          (p) =>
            (base.rowPerRoute && base.rowPerRoute[p.path] ? base.rowPerRoute[p.path].t : 0) > 0 && p.tableCount === 0
        )
      : []
    if (missingTable.length) {
      console.error(
        `[FATAL] ${missingTable.length}/${pages.length} 页基线记有行内动作、本轮却没采到可见 el-table` +
          ' ⇒ 本轮行内动作面不作数：' +
          missingTable
            .map(
              (p) =>
                `${p.path}(基线 t=${base.rowPerRoute[p.path].t} / 本轮 行=${p.rowCount} 可见表=${p.tableCount} 空态=«${p.emptyText || ''}»)`
            )
            .join(' ') +
          '（先查这页为什么没渲染出表；不得据此判"动作变少"，也不得 --update-baseline 把这次读数写进基线）'
      )
      process.exit(2)
    }
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
    // `base` 已在写产物之前读出（sameCaliber 那两条闸要用），此处不再重复声明
    // 本轮的行内动作面：t=行内动作数 / c=其中已覆盖 / r=该页本轮行数 / e=空态文案。
    // r、e 进快照只为了**失败文案能说出原因**（0 行 ⇒ 按钮在 DOM 里根本不存在），
    // 不参与判定——判定的分母永远是基线那一栏（见 rowSurface 的立案注释）。
    const curRows = Object.fromEntries(
      pages.map((p) => [
        p.path,
        {
          t: p.rowActions.length,
          c: p.rowActions.filter((b) => b.covered).length,
          r: p.rowCount,
          rt: p.rowActionMaxRows || 0,
          e: p.emptyText || ''
        }
      ])
    )
    // 非行内控件面的本轮身份集合（b96）：与行内动作面分开存——`toolbar` 已跨 tab
    // 去重合并，所以同一按钮在多个 tab 出现只算一次（b88 /tool/build 8→6 的成因）。
    const curControls = Object.fromEntries(
      pages.map((p) => [
        p.path,
        {
          k: [...new Set(p.toolbar.map((b) => b.name))].sort(),
          r: p.rowCount,
          e: p.emptyText || ''
        }
      ])
    )
    const rowSelfSurface = rowSurface(curRows, curRows)
    // 两条口径闸（自相矛盾 / 基线记有行内动作而本轮无可见表）**排在写产物之前**，见上面 1900 行附近：
    // 写完了再判，坏尺的报告会先落盘（b88 实测第一轮就是这样）。
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
          : [
              ...ratchetRegressions(base, cur),
              ...rowRatchetRegressions(base, curRows).regressions,
              ...controlSurfaceRegressions(base, curControls).regressions
            ]
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
              pages.map((p) => [
                p.path,
                {
                  a: p.actionCount,
                  c: p.coveredCount,
                  i: p.clickedCount,
                  // b96：非行内控件面的**身份**（去重升序的按钮名）。只记数会让
                  // "一页少一个、另一页多一个"在聚合上完全同形（b88 N-H）。
                  k: [...new Set(p.toolbar.map((b) => b.name))].sort()
                }
              ])
            ),
            // 行内动作面（b87 项 5）：分母固定取这里记的 `t`，本轮实测只贡献分子。
            // 与上面的 `perRoute` 分栏是因为两者问的不是同一件事：`perRoute.a` 问"这页现在有几个按钮"
            // （随数据态漂移），`rowPerRoute.t` 问"这页**曾经被证明存在**的行内动作有几个"（是承诺）。
            rowPerRoute: curRows,
            rowSurfaceCoverage: rowSelfSurface ? rowSelfSurface.ratio : 0,
            // 参数进基线并由代码常量逐条核（前言 ⑱）：换判据必须与重生成基线同批，
            // 旧基线缺这一项一律拒绝比对（UNRUN），不能拿更松的尺去量旧数字
            rowSurfaceMinLostActions: ROW_SURFACE_MIN_LOST_ACTIONS,
            note: '逐页动作清单基线：--gate 时覆盖率不得低于本值（容差 1pp），路由数不得减少，totalBacklog / totalStateLocked 只许降（各自容差 2）；clicked 仅记录趋势；行内动作面覆盖率（rowSurfaceCoverage）以 rowPerRoute 的 t 之和为固定分母，本轮 0 行 ⇒ 该栏下降；退步必须同时超相对容差与绝对下限 rowSurfaceMinLostActions（低于下限只留痕不判红，前言 ⑱）；perRoute.k 是非行内控件面的按钮名集合（b96）：基线里出现过的按钮本轮必须在场，少了即判红（数据驱动的按行数分因）；旧格式基线缺这些栏或参数与本常量不一致 ⇒ --gate 判 UNRUN（不可比），须同批 --update-baseline 重生成'
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
    const ctlNow = controlSurfaceRegressions(base, curControls)
    const bad = [...ratchetRegressions(base, cur), ...rowNow.regressions, ...ctlNow.regressions]
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
            e: p.emptyText || '',
            // b96：控件身份也参与"逐页完全一致"的对账（否则一个按钮被换掉时
            // 聚合数与 a/c/i 都可能不变，而这一行还会打印"完全一致"）。
            k: [...new Set(p.toolbar.map((b) => b.name))].sort()
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
        else if (
          b.a !== c.a ||
          b.c !== c.c ||
          (b.i !== undefined && b.i !== c.i) ||
          (Array.isArray(b.k) && b.k.join('\u0001') !== c.k.join('\u0001'))
        ) {
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
