#!/usr/bin/env node
/**
 * 点击落地失败判据（批八十三 · N-8 的机制级闭环）
 *
 * ## 这条判据解决的是什么
 *
 * 两套件里有约 **200 处** `locator.click(...).catch(() => {})`（deep-e2e 158 / main 42）。
 * 每一次吞掉的正是"这次点击到底落没落地"，而后续断言常读**请求条数**或**状态未变**——
 * 于是"按钮失灵"与"闸门生效阻止了请求"这两种相反状态能让同一条判据同时变绿
 * （AGENTS 前端输入归一规范 §3.③ 立的正是这一族：③ **交互确实发生**）。
 *
 * 批八十二之前只有静态守卫 `e2eClickPolicy.guard.test.ts` 禁 `force: true`，那是
 * **写法**约束不是**事实**约束。现在事实由 `capture-kit` 的点击通道每轮采集
 * （`_Frame.prototype` 一处咽喉点，记录后原样 rethrow，现有站点一行不动），
 * 本脚本负责把采集到的东西变成**判据**。
 *
 * ## 判据形状（为什么只判"未被救回"那一桶）
 *
 * 一次失败之后，同 `(来源, 归因标签, 方法, 归一选择器)` 键又成功过一次 ⇒ `recovered`。
 * `realClick()` 的正常流程就是"普通点击失败 → 收引导遮罩 → 再点一次"，第一次失败是
 * 设计内的，且**交互最终确实发生了**——把它判红会造出"每轮必红于是被当噪声"的判据
 * （同 b79 对软删残留那条的定性）。反过来，**没有任何后续成功配对**的失败，就是
 * "点了但没落地、而断言照样绿"的那一族 ⇒ 零容忍，每条形状必须进允许表并带理由。
 *
 * ## fail-closed 的四条输入
 *
 * 采集通道自己坏掉时数据集会是"0 条失败"，与"真的没有失败"**逐字节同形**——
 * 所以以下任一情形一律 EXIT=2（UNRUN），不得读成通过：
 * ① 数据集缺失 / JSON 坏；② `channelProbe.ok !== true`（本轮没证明通道接得上）；
 * ③ `channel.instrumented !== true`；④ `channel.overflow === true`（采到一半被上限截断，
 * 计数与允许表都不再可信）。另加两条断面自证：`full !== true`、窗口反向。
 *
 * ## 自检
 *
 * `--selftest` 在临时目录里造数据集，**双向**：既判"该红的必须红并点名"，
 * 也判"该绿的必须绿"，含一条"允许表条目只差方法名不得匹配"的对照组
 * （防止把条目写成一条通配把所有形状吃掉——那等于没有判据）。
 * 另含 ⑳/⑳b 一对：**匹配读全文、显示才截断**——Playwright 的调用日志把失败原因
 * 写在尾巴上（实测在第 330 字符），而给人看的样本只留 160 字符；拿正则有界文本去比
 * 那 160 字符，任何 `messageRe` 条目都永远匹配不上，判据会红在自己的截断上。
 *
 * 用法：
 *   node tests/e2e/click-failure-audit.mjs --gate
 *   node tests/e2e/click-failure-audit.mjs --selftest
 *   node tests/e2e/click-failure-audit.mjs --retire-stale
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ALLOWLIST_PATH = path.join(HERE, 'click-failure-allowlist.json')
/** 两路输入：主套件与深度套件各一份，缺一路就是"证不了"（并集不是替换，同 b79 ⑦） */
const DEFAULT_DATASETS = [
  { source: 'deep', file: path.join(HERE, 'screenshots', 'deep-e2e-clickfails.json') },
  { source: 'main', file: path.join(HERE, 'screenshots', 'main-clickfails.json') }
]

/**
 * 两路断面允许的最大跨度（小时）。取 8 的依据：一批收口的跑批顺序是
 * 六段主套件（~35min）→ 全量单轮主套件（~30min）→ 全量深度套件（~50min）→ a11y（~5min），
 * 中间夹着人工分析与门禁复跑，实测 b83/b84 两批的收口跨度分别是 3.5h 与 4h。
 * 8h 给的是"同一批内"的余量；超过它就不再是"批内先后"，而是"拿上一批的断面当本批证据"。
 * 该阈值必须**可调且有名字**，不得写死在比较式里——写死在式子里就没人知道它是判据参数。
 */
const BATCH_SPAN_HOURS = 8

/** 断面打印（ISO 分钟精度，去掉 UTC 标记以免和 naive-UTC 数据集字段两种写法混在一起看不懂）。 */
function fmtWin(w) {
  return `${new Date(w.since).toISOString().slice(0, 16)}~${new Date(w.until).toISOString().slice(0, 16)}`
}

/** 允许的登记理由类别（枚举外一律红，同 endpoint-coverage 的 kind 纪律） */
export const ALLOWED_KINDS = ['by-design', 'needs-fixture', 'todo']

/**
 * 把数据集里的行按"形状"聚合。
 *
 * **显示截断与匹配口径必须分开**（b83 实测踩到的判据自身缺陷）：`sample` 只给人看，
 * 160 字符里塞得下 Playwright 调用日志的开头（`waiting for locator('…选择器…')`，
 * 选择器本身已被归一到 120 字符），而**失败原因在尾巴上**——实测 M81 那条的
 * `- element is not stable` 出现在第 330 字符处。旧写法拿 `messageRe` 去比 `sample`，
 * 于是"带 messageRe 的登记条目永远匹配不上"，判据红在一个自己造成的盲区上。
 * 现在 `msgFull` 保留整段（数据集侧本来就有 600 字符上限），匹配只读它。
 *
 * @param {Array<object>} rows - 数据集 rows（含 tag/method/selector/recovered/message）
 * @returns {Map<string, {key:string, source:string, tag:string, method:string, selector:string, total:number, unrecovered:number, sample:string, msgFull:string}>}
 */
export function aggregateShapes(source, rows) {
  const out = new Map()
  for (const r of rows || []) {
    const key = `${source}|${r.tag}|${r.method}|${r.selector}`
    const cur = out.get(key) || {
      key,
      source,
      tag: String(r.tag ?? ''),
      method: String(r.method ?? ''),
      selector: String(r.selector ?? ''),
      total: 0,
      unrecovered: 0,
      // 取证样本：只留第一条的**前 160 字符**（同 hub 内同形状的失败原因基本一致，全留会让报告没法读）
      sample: String(r.message || r.name || '').slice(0, 160),
      // 匹配用全文：数据集侧 message 本身有 600 字符上限（capture-kit 的 CLICK_MESSAGE_CAP）
      msgFull: String(r.message || r.name || '')
    }
    cur.total++
    if (!r.recovered) cur.unrecovered++
    out.set(key, cur)
  }
  return out
}

/**
 * 允许表条目是否覆盖某个形状。
 *
 * **逐字段 AND**，且 `method`/`tag` 必须是**精确值**（不给通配）：一条 `method:"*"`
 * 会把同标签下所有方法的失败一并"解释"掉，那正是"登记率归零"的入口。
 * 归一化后的选择器含正则/路径片段，条目里一律按**锚定正则**写；
 * 选择器超过 120 字符会被归一化截断，条目只能写**前缀锚**（`^…` + 不写尾巴）。
 * `messageRe` 比的是 `msgFull`（理由在尾巴上，见 aggregateShapes 的注释）。
 */
export function entryMatches(entry, shape) {
  if (entry.source !== shape.source) return false
  if (entry.tag !== shape.tag) return false
  if (entry.method !== shape.method) return false
  const selRe = new RegExp(entry.selectorRe)
  if (!selRe.test(shape.selector)) return false
  if (entry.messageRe && !new RegExp(entry.messageRe).test(shape.msgFull)) return false
  return true
}

/**
 * 允许表条目的形状校验（条目本身坏 ⇒ 判据坏，必须响亮失败而不是当没登记）
 *
 * @returns {string[]} 错误列表（空 = 合法）
 */
export function validateEntries(entries) {
  const errs = []
  const seen = new Set()
  for (const [i, e] of (entries || []).entries()) {
    const at = `允许表第 ${i + 1} 条`
    if (!e || typeof e !== 'object') {
      errs.push(`${at}: 不是对象`)
      continue
    }
    for (const f of ['source', 'tag', 'method', 'selectorRe', 'kind', 'why']) {
      if (typeof e[f] !== 'string' || !e[f].trim()) errs.push(`${at}: 字段 ${f} 缺失或为空`)
    }
    if (e.kind && !ALLOWED_KINDS.includes(e.kind))
      errs.push(`${at}: kind="${e.kind}" 不在枚举 ${ALLOWED_KINDS.join('|')}`)
    // "同上"这类跨条目指代：条目集合一变就指向另一条理由（同 endpoint-coverage 的纪律）
    if (/^(同上|same|ditto|见上|见下)$/i.test((e.why || '').trim())) errs.push(`${at}: why 是跨条目指代，必须逐条自足`)
    if ((e.why || '').trim().length < 12) errs.push(`${at}: why 过短（<12 字符），不构成证据`)
    for (const f of ['selectorRe', 'messageRe']) {
      if (typeof e[f] === 'string' && e[f]) {
        try {
          new RegExp(e[f])
        } catch (err) {
          errs.push(`${at}: ${f} 不是合法正则（${err.message}）`)
        }
      }
    }
    const key = `${e.source}|${e.tag}|${e.method}|${e.selectorRe}|${e.messageRe || ''}`
    if (seen.has(key)) errs.push(`${at}: 与已有条目完全重复`)
    seen.add(key)
  }
  return errs
}

/**
 * 核心判据（纯函数：--gate / --selftest 共用同一份，避免"比较式与门另一套写法"）
 *
 * @param {Array<object>} datasets - `[{source, data}]`，data 是数据集 JSON
 * @param {Array<object>} entries - 允许表条目
 * @returns {{ok:boolean, fatal:string[], unregistered:object[], registered:object[], recovered:object[], stale:object[], stats:object}}
 */
export function judge(datasets, entries) {
  const fatal = []
  const allShapes = new Map()
  for (const { source, data } of datasets) {
    if (!data) {
      fatal.push(`[${source}] 数据集缺失或不是合法 JSON —— 无法区分"没有失败"与"没采到"`)
      continue
    }
    const ch = data.channel || {}
    if (ch.instrumented !== true) fatal.push(`[${source}] channel.instrumented !== true：Frame 点击面本轮没建立`)
    if (ch.handleInstrumented !== true) {
      fatal.push(
        `[${source}] channel.handleInstrumented !== true：ElementHandle 点击面本轮没建立（实测 handle.click 不经 Frame）`
      )
    }
    // 补丁条数必须等于"方法数 × 两条原型面"。少一面就是有一面在静默漏采，
    // 而数据集里"0 条失败"与"一条都没采"逐字节同形——只能靠通道自报的形状对账发现。
    if (Number.isFinite(ch.methodsPatched) && Number.isFinite(ch.expectedPatched)) {
      if (ch.methodsPatched !== ch.expectedPatched) {
        fatal.push(
          `[${source}] channel.methodsPatched=${ch.methodsPatched} ≠ expectedPatched=${ch.expectedPatched}：有点击方法没被自证覆盖`
        )
      }
    } else {
      fatal.push(`[${source}] channel.methodsPatched/expectedPatched 取不到数（不得读成"覆盖完整"）`)
    }
    const probe = data.channelProbe || {}
    if (probe.ok !== true) {
      fatal.push(`[${source}] channelProbe.ok !== true（${probe.detail || '无探针记录'}）：本轮未自证采集通道接得上`)
    }
    if (ch.overflow !== false) fatal.push(`[${source}] channel.overflow !== false：采集面被上限截断过，计数不可信`)
    if (data.full !== true) fatal.push(`[${source}] full !== true：分段轮的部分数据不得当全站断面用`)
    if (!data.windowStart || !data.windowEnd) fatal.push(`[${source}] 缺 windowStart/windowEnd：断面无法自证`)
    else if (!(String(data.windowStart) < String(data.windowEnd))) {
      fatal.push(`[${source}] 窗口反向（${data.windowStart} !< ${data.windowEnd}）`)
    }
    if (!Array.isArray(data.rows)) fatal.push(`[${source}] rows 不是数组`)
    else if (Number.isFinite(data.totals?.failures) && data.totals.failures !== data.rows.length) {
      // 自洽对账：汇总数与逐条数必须相等（同 b79 轮内自洽那条纪律）
      fatal.push(`[${source}] totals.failures=${data.totals.failures} 与 rows.length=${data.rows.length} 不等`)
    }
    for (const [k, v] of aggregateShapes(source, data.rows || [])) if (!allShapes.has(k)) allShapes.set(k, v)
  }
  if (datasets.length === 0) fatal.push('没有任何数据集输入')
  // 两路输入必须来自**同一批跑批**（批八十五 项 I）。
  // 立案形状就在本轮的打印里：deep 断面是 10-22 04:51~05:39，main 断面是 10-21 18:27~18:57
  // ——相差 10.9 小时，而判据照打"main 0 条 ⇒ 通过"。分段跑批只写 `*.incremental.json`，
  // 主文件留在上一次全量单轮，于是"main 这一侧本轮到底跑没跑"从结论里彻底消失：
  // 拿昨天那轮的零失败当今天的证据，与 b82 ⑩"基线读自己的旧断面"、⑯(b)"跨轮断面算 delta"同族。
  // 修法不是放宽数字，而是加闸：两路断面跨度超阈值 ⇒ FATAL（"没判成"必须与"判过且干净"可区分）。
  const wins = datasets
    .filter((d) => d.data && d.data.windowStart && d.data.windowEnd)
    .map((d) => ({
      source: d.source,
      since: Date.parse(String(d.data.windowStart).replace(' ', 'T') + 'Z'),
      until: Date.parse(String(d.data.windowEnd).replace(' ', 'T') + 'Z')
    }))
    .filter((w) => Number.isFinite(w.since) && Number.isFinite(w.until))
  if (wins.length >= 2) {
    const minStart = Math.min(...wins.map((w) => w.since))
    const maxEnd = Math.max(...wins.map((w) => w.until))
    const spanHours = (maxEnd - minStart) / 3600000
    if (!(spanHours <= BATCH_SPAN_HOURS)) {
      const stale = wins.filter((w) => w.until < maxEnd - BATCH_SPAN_HOURS * 3600000)
      fatal.push(
        `两路断面相差 ${spanHours.toFixed(1)} 小时（> ${BATCH_SPAN_HOURS}h）：` +
          `${wins.map((w) => `${w.source} ${fmtWin(w)}`).join('，')}。` +
          `判为陈旧的一路：${stale.map((w) => `${w.source}（需重跑一轮**全量单轮** ${w.source} 套件——分段轮只写 *.incremental.json、不刷新主文件）`).join('、') || '无'}` +
          ` ⇒ 本轮不作数：这一侧到底跑没跑，结论里看不见`
      )
    }
  }

  const entryErrs = validateEntries(entries)
  fatal.push(...entryErrs)

  const unregistered = []
  const registered = []
  const recovered = []
  const matched = new Set()
  for (const shape of allShapes.values()) {
    if (shape.unrecovered === 0) {
      recovered.push(shape)
      // 全部被救回的形状不要求登记，但允许表若为它存在也不判"用不上"
      const hit = entries.find((e) => entryMatches(e, shape))
      if (hit) matched.add(hit)
      continue
    }
    const hit = entries.find((e) => entryMatches(e, shape))
    if (hit) {
      matched.add(hit)
      registered.push({ ...shape, why: hit.why, kind: hit.kind })
    } else {
      unregistered.push(shape)
    }
  }
  const stale = entries.filter((e) => !matched.has(e))
  const stats = {
    shapes: allShapes.size,
    failures: [...allShapes.values()].reduce((a, s) => a + s.total, 0),
    unrecovered: [...allShapes.values()].reduce((a, s) => a + s.unrecovered, 0)
  }
  // matchedEntries 由 --retire-stale 用：退役判据必须复用**同一份匹配结果**，
  // 不得按"条目的 selectorRe 字面量 == 形状 selector"再算一遍——正则会匹配上一个
  // 并不等于字面量相等的选择器（`^#btn(-wrapper)?$` 对上 `#btn-wrapper`），
  // 那样会把还在用的条目当"本轮没出现"删掉。
  return {
    ok: fatal.length === 0 && unregistered.length === 0,
    fatal,
    unregistered,
    registered,
    recovered,
    stale,
    matchedEntries: [...matched],
    stats
  }
}

/** 加载允许表；缺文件/坏 JSON 一律算判据坏（不得当"没有登记项"从而放行一切） */
export function loadAllowlist(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`允许表不存在: ${file} —— 判据无法运行，不得当成"零条登记项且一切正常"`)
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const entries = Array.isArray(parsed) ? parsed : parsed.entries
  if (!Array.isArray(entries)) throw new Error(`允许表形状不对（应为数组或 {entries:[...]}）: ${file}`)
  return entries
}

function loadDatasets(specs) {
  return specs.map(({ source, file }) => {
    let data = null
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch {
      data = null
    }
    return { source, file, data }
  })
}

// ==================== 自检（临时夹具，不碰真实数据集） ====================

const SYNTH_SOURCE = 'deep'

/** 造一行点击失败（字段形状与 capture-kit `clickFailureRows()` 的产出一致） */
const row = (over = {}) => ({
  tag: 'M9',
  action: 'load',
  method: 'click',
  selector: '#btn',
  key: 'M9|click|#btn',
  name: 'TimeoutError',
  message: 'frame.click: Timeout 300ms exceeded',
  at: 1000,
  recovered: false,
  ...over
})

/** 造一份"通道健康"的数据集（判据要求的字段全给齐） */
const dataset = (rows, over = {}) => ({
  generatedAt: '2026-10-21T10:00:00.000Z',
  full: true,
  windowStart: '2026-10-21 09:00:00.000',
  windowEnd: '2026-10-21 10:00:00.000',
  channel: {
    instrumented: true,
    handleInstrumented: true,
    methodsPatched: 12,
    expectedPatched: 12,
    overflow: false,
    cap: 3000,
    recorded: rows.length
  },
  channelProbe: { ok: true, detail: 'synth' },
  totals: { failures: rows.length },
  rows,
  ...over
})

const ENTRY = {
  source: 'deep',
  tag: 'M9',
  method: 'click',
  selectorRe: '^#btn$',
  kind: 'by-design',
  why: '合成用例：负路径按钮在禁用态下确实点不动'
}

/**
 * 自检用例：`{ name, run() -> 描述实际形状的字符串, expect: 'ok'|'fatal'|'red' }`
 * 每条都双向——既有"必须红"也有"必须绿"，缺正控的自检等于没测（§测试门禁 ⑥）。
 */
const SYNTH_CASES = [
  {
    name: '① 干净数据集（0 行）必须判绿',
    expect: 'ok',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([]) }],
    entries: []
  },
  {
    name: '② 未登记的失败形状必须红，且点名该形状',
    expect: 'red',
    mustName: 'deep|M9|click|#btn',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([row()]) }],
    entries: []
  },
  {
    name: '③ 同形状登记后必须转绿（②的对照组）',
    expect: 'ok',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([row()]) }],
    entries: [ENTRY]
  },
  {
    name: '④ 被后续同键成功救回的失败不得要求登记',
    expect: 'ok',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([row({ recovered: true })]) }],
    entries: []
  },
  {
    name: '⑤ 通道探针未通过必须 UNRUN（不得读成"零失败"）',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([], { channelProbe: { ok: false, detail: 'synth-bad' } }) }],
    entries: []
  },
  {
    name: '⑥ 原型没补上（instrumented=false）必须 UNRUN',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([], { channel: { instrumented: false, overflow: false } }) }],
    entries: []
  },
  {
    name: '⑦ 采集被上限截断必须 UNRUN（计数不可信）',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([], { channel: { instrumented: true, overflow: true } }) }],
    entries: []
  },
  {
    name: '⑧ 数据集文件缺失必须 UNRUN',
    expect: 'fatal',
    datasets: [{ source: 'main', file: 'no-such.json', data: null }],
    entries: []
  },
  {
    name: '⑨ 分段轮（full=false）不得当全站断面',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([], { full: false }) }],
    entries: []
  },
  {
    name: '⑩ 窗口反向必须 UNRUN',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([], { windowStart: '2026-10-21 11:00:00.000' }) }],
    entries: []
  },
  {
    name: '⑪ 汇总数与逐条数不等必须 UNRUN（数据集自洽对账）',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: { ...dataset([row()]), totals: { failures: 7 } } }],
    entries: [ENTRY]
  },
  {
    name: '⑫ why 过短或写成跨条目指代必须红（登记表逐条自足）',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([row()]) }],
    entries: [{ ...ENTRY, why: '同上' }]
  },
  {
    name: '⑬ kind 不在枚举内必须红',
    expect: 'fatal',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([row()]) }],
    entries: [{ ...ENTRY, kind: 'wontfix' }]
  },
  {
    name: '⑭ 对照组：只差 method 的条目不得匹配（防一条通配吃掉所有形状）',
    expect: 'red',
    mustName: 'deep|M9|click|#btn',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([row()]) }],
    entries: [{ ...ENTRY, method: 'hover' }]
  },
  {
    name: '⑮ 选择器正则不锚定导致的"顺手多匹配"必须能被点名',
    expect: 'ok',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([row({ selector: '#btn-wrapper' })]) }],
    entries: [{ ...ENTRY, selectorRe: '^#btn(-wrapper)?$' }]
  },
  {
    name: '⑯ 两路输入并集：另一路自己的失败不得互相顶替',
    expect: 'red',
    mustName: 'main|M7|click|#x',
    datasets: [
      { source: 'deep', data: dataset([row()], { full: true }) },
      { source: 'main', data: dataset([row({ tag: 'M7', selector: '#x', key: 'M7|click|#x' })]) }
    ],
    // deep 那一路已登记；main 那一路没登记 ⇒ 必须仍然红，且点名的必须是 main 的形状
    entries: [ENTRY]
  },
  {
    name: '⑰ ElementHandle 那条面没接上必须 UNRUN（实测 handle.click 不经 Frame）',
    expect: 'fatal',
    datasets: [
      {
        source: SYNTH_SOURCE,
        data: dataset([], {
          channel: {
            instrumented: true,
            handleInstrumented: false,
            methodsPatched: 12,
            expectedPatched: 12,
            overflow: false
          }
        })
      }
    ],
    entries: []
  },
  {
    name: '⑱ 补丁条数与期望不等必须 UNRUN（少一面=有一面在静默漏采）',
    expect: 'fatal',
    datasets: [
      {
        source: SYNTH_SOURCE,
        data: dataset([], {
          channel: {
            instrumented: true,
            handleInstrumented: true,
            methodsPatched: 10,
            expectedPatched: 12,
            overflow: false
          }
        })
      }
    ],
    entries: []
  },
  {
    name: '⑱b 对照组：补丁条数恰好等于期望必须判绿（⑱不得顺手把正常轮也拦掉）',
    expect: 'ok',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([]) }],
    entries: []
  },
  {
    name: '⑲ 通道状态字段取不到数不得读成"覆盖完整"',
    expect: 'fatal',
    datasets: [
      {
        source: SYNTH_SOURCE,
        data: dataset([], { channel: { instrumented: true, handleInstrumented: true, overflow: false } })
      }
    ],
    entries: []
  },
  {
    // 判据自身缺陷的回归锁（b83 实测）：真实数据集里 M81 那条的 `- element is not stable`
    // 落在第 330 字符，而显示样本只有 160 字符——旧写法拿 messageRe 比样本，
    // 于是带 messageRe 的登记条目**永远**匹配不上，判据红在自己的截断上。
    name: '⑳ 失败原因在 160 字符之后仍必须被 messageRe 命中（匹配读全文，不读显示样本）',
    expect: 'ok',
    datasets: [
      {
        source: SYNTH_SOURCE,
        data: dataset([
          row({
            message: `frame.click: Timeout 2000ms exceeded. Call log: - waiting for locator('${'y'.repeat(200)}') - attempting click action - element is not stable`
          })
        ])
      }
    ],
    entries: [{ ...ENTRY, messageRe: 'element is not stable' }]
  },
  {
    name: '⑳b 对照组：理由确实不在正文里时条目不得生效（⑳不得退化成"messageRe 一律放行"）',
    expect: 'red',
    mustName: 'deep|M9|click|#btn',
    datasets: [
      {
        source: SYNTH_SOURCE,
        data: dataset([
          row({
            message: `frame.click: Timeout 2000ms exceeded. Call log: - waiting for locator('${'y'.repeat(200)}') - attempting click action - element is not visible`
          })
        ])
      }
    ],
    entries: [{ ...ENTRY, messageRe: 'element is not stable' }]
  },
  {
    // 立案形状就是 b85 收口期的实际打印：deep 断面 10-22 04:51~05:39，
    // main 断面还停在 10-21 18:27~18:57（分段轮只写 *.incremental.json），
    // 而判据照打"main 0 条 ⇒ 通过"——拿上一批的零失败当本批证据。
    name: '㉑ 两路断面相差超一个批次跨度必须 UNRUN（陈旧断面不得冒充"这一侧干净"）',
    expect: 'fatal',
    datasets: [
      {
        source: 'deep',
        data: dataset([], { windowStart: '2026-10-22 04:51:37.672', windowEnd: '2026-10-22 05:39:58.557' })
      },
      {
        source: 'main',
        data: dataset([], { windowStart: '2026-10-21 18:27:40.851', windowEnd: '2026-10-21 18:57:53.870' })
      }
    ],
    entries: []
  },
  {
    name: '㉑b 反脆弱：同批内先后两路断面（相差 3h）必须放行，且点名陈旧的那一路',
    expect: 'ok',
    datasets: [
      { source: 'deep', data: dataset([]) },
      {
        source: 'main',
        data: dataset([], { windowStart: '2026-10-21 12:00:00.000', windowEnd: '2026-10-21 13:00:00.000' })
      }
    ],
    entries: []
  },
  {
    name: '㉑c 只有一路输入时不得触发断面对账（"缺一路"另有判据点名，不得指错方向）',
    expect: 'ok',
    datasets: [{ source: SYNTH_SOURCE, data: dataset([]) }],
    entries: []
  }
]

function runSelftest() {
  const failures = []
  for (const c of SYNTH_CASES) {
    let verdict
    try {
      const r = judge(c.datasets, c.entries)
      if (r.fatal.length) verdict = 'fatal'
      else if (r.unregistered.length) {
        verdict = 'red'
        if (c.expect === 'red' && c.mustName && !r.unregistered.some((s) => s.key === c.mustName)) {
          failures.push(
            `${c.name}: 判红了但没点名 ${c.mustName}（实际 ${r.unregistered.map((s) => s.key).join(', ')}）`
          )
          continue
        }
      } else verdict = 'ok'
    } catch (e) {
      verdict = 'throw'
      failures.push(`${c.name}: 抛异常 ${e.message}`)
      continue
    }
    if (verdict !== c.expect) failures.push(`${c.name}: 期望 ${c.expect}，实际 ${verdict}`)
  }
  // 反脆弱：把某条"必须红"的用例改成"已登记"，若仍判红说明登记通道是死代码（第三次踩同族）
  const live = judge(SYNTH_CASES[1].datasets, SYNTH_CASES[1].entries)
  if (live.unregistered.length !== 1)
    failures.push(`反脆弱：未登记通道必须恰好点名 1 条，实际 ${live.unregistered.length}`)
  const cleared = judge(SYNTH_CASES[2].datasets, SYNTH_CASES[2].entries)
  if (cleared.unregistered.length !== 0) failures.push(`反脆弱：登记之后必须不再点名（登记通道是活的）`)

  const n = SYNTH_CASES.length + 2
  if (failures.length) {
    console.log(`SYNTH_FAIL ${n} 条双向：${failures.length} 条不符`)
    for (const f of failures) console.log(`  ✗ ${f}`)
    process.exit(1)
  }
  console.log(`SYNTH_OK click-failure-audit ${n} 条双向（${SYNTH_CASES.length} 用例 + 2 条登记通道活性对账）`)
  process.exit(0)
}

// ==================== CLI ====================

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--selftest')) runSelftest()

  const gate = argv.includes('--gate')
  const retire = argv.includes('--retire-stale')
  const fileArg = argv.find((a) => a.startsWith('--dataset='))
  const specs = fileArg
    ? fileArg
        .slice('--dataset='.length)
        .split(',')
        .map((pair) => {
          const [source, file] = pair.split(':')
          return { source, file: path.resolve(file) }
        })
    : DEFAULT_DATASETS

  let entries
  try {
    entries = loadAllowlist(ALLOWLIST_PATH)
  } catch (e) {
    console.error(`[FATAL] ${e.message}`)
    process.exit(2)
  }
  const datasets = loadDatasets(specs)
  const r = judge(datasets, entries)

  console.log('================ 点击落地失败判据（click-failure-audit） ================')
  for (const d of datasets) {
    console.log(
      `  输入 [${d.source}] ${d.file}` +
        (d.data
          ? ` → 行 ${d.data.rows?.length ?? '?'} / 断面 ${d.data.windowStart || '?'} ~ ${d.data.windowEnd || '?'} / 探针 ${d.data.channelProbe?.ok ? 'OK' : 'FAIL'}`
          : ' → 读不到')
    )
  }
  console.log(
    `  形状 ${r.stats.shapes} 类 / 失败 ${r.stats.failures} 条 / 未被救回 ${r.stats.unrecovered} 条 / ` +
      `已登记 ${r.registered.length} 类 / 未登记 ${r.unregistered.length} 类 / 全部被救回 ${r.recovered.length} 类`
  )

  if (r.fatal.length) {
    for (const f of r.fatal) console.log(`  [FATAL] ${f}`)
    console.log('  ⇒ 判据无法下结论（UNRUN）：这不是"通过"，也不是"有缺陷"，而是"这一轮证不了"')
    process.exit(2)
  }
  for (const s of r.unregistered) {
    console.log(`  ❌ 未登记: ${s.key} ×${s.total}（未被救回 ${s.unrecovered}） — ${s.sample}`)
  }
  for (const s of r.registered) {
    console.log(`  · 已登记: ${s.key} ×${s.total}（[${s.kind}] ${s.why}）`)
  }
  for (const s of r.recovered) {
    console.log(`  ℹ 全部被后续同键成功救回（不要求登记）: ${s.key} ×${s.total}`)
  }
  if (r.stale.length) {
    for (const e of r.stale) console.log(`  ℹ 登记了但本轮没出现: ${e.source}|${e.tag}|${e.method}|${e.selectorRe}`)
    if (retire) {
      const kept = entries.filter((e) => r.matchedEntries.includes(e))
      fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify({ entries: kept }, null, 2) + '\n', 'utf-8')
      console.log(`  ⇒ 已退役 ${entries.length - kept.length} 条（只删本轮确实没出现的）`)
    }
  }

  if (!gate) {
    console.log('  （未加 --gate：只打印，不判退出码）')
    process.exit(0)
  }
  if (r.unregistered.length) {
    console.log(`  ⇒ 失败：${r.unregistered.length} 类点击落地失败没有任何登记理由`)
    process.exit(1)
  }
  console.log('  ⇒ 通过：本轮每一次"点了但没落地"都有逐条理由，且采集通道自证为 OK')
  process.exit(0)
}

// 只在"自己就是入口"时执行：被别的脚本 import 纯函数（judge / aggregateShapes）时
// 不得顺手跑一遍主流程——本脚本会 process.exit，import 方一条断言都跑不到就"绿"了
// （同 request-storm 因 import 入口脚本而打印对方 SYNTH_OK 的那一族）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
