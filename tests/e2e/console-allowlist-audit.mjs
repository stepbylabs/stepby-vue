#!/usr/bin/env node
/**
 * console 状态码豁免表判据（批八十八 · 项 N-4）
 *
 * ## 这条判据解决的是什么
 *
 * `deep-e2e` 把"这条 console 错误是不是已知的无害 4xx"判成豁免就**丢弃**那条消息。
 * 外置之前那张表是源码里的一个内联字典：31 个 URL 前缀、**一条理由都没有**、
 * 也没有任何判据管它——而 AGENTS 门禁表前言 ㉘ 立的正是"登记表必须逐条自足"这一族纪律，
 * 本仓已有四张表按这条改造过（oper-log / backend-log / click-failure / endpoint-coverage）。
 *
 * 内联字典真正的代价不是"没写注释"，而是**两类看不见的事实**：
 * ① 一条**永远匹配不到**的豁免（被同状态下另一条 URL 遮蔽，或对应行为早已改掉）与
 *    一条天天在用的豁免，在源码里长得一模一样；
 * ② b87 在判据注释里写下"兜底不得变成主通道"——但**没有任何一条数据**能证明这件事，
 *    那是承诺，不是判据（前言 ⑮：承诺过的通道必须有生效路径）。
 *
 * ## 判据形状
 *
 * 装载侧（`console-allowlist.mjs`，与运行侧共用同一份实现）：形状 + 理由 + 结构性遮蔽，坏在装载就抛。
 * 运行侧（本脚本）读 `deep-e2e-console-exemptions.json`，判四件事：
 * ① 表里的条目本轮**一次都没命中** ⇒ 红，并给出 `--retire-stale` 这条动作通道
 *    （只打提示、没有动作通道的信号等于没判——前言 ⑨/⑩ 的纪律）；
 * ② 命中账里出现**表外 id** ⇒ 红（数据集与登记表不是同一批）；
 * ③ `ownUrl` 主通道一次没用上、却有兜底命中 ⇒ 红（逐条判据退化成了集合连坐）；
 * ④ 条目命中总数 < 消息数 ⇒ 红（账不平：有消息被放行却没记到任何条目上，采集面自失效）。
 *
 * ## fail-closed 的输入（任一情形一律 EXIT=2 = UNRUN，不是"通过"也不是"有缺陷"）
 *
 * 数据集缺失 / JSON 坏 / `full !== true`（分段轮的局部命中不得当全站账）/
 * 窗口字段缺失或反向 / `modulesPlanned !== modulesAttempted`（崩在半路的全量轮）/
 * 数据集没有 `entries` 快照（旧格式，无法证明"表与轮同批"）/
 * 数据集条目 id 集合与当前表不一致（口径漂移必须与重跑同批——前言 ⑩）/
 * 通道计数字段取不到数（`NaN` 参与比较恒 false，"取不到"不得读成"没有退步"）。
 *
 * ## 自检
 *
 * `--selftest` 双向：既判"该红的必须红并点名条目"，也判"该绿的必须绿"，含
 * ① 真实树正控（committed 的表必须装得起来、条目数有下限、最短理由有下限、重复组为 0、
 *    遮蔽对为 0）；② 反漂移锁——本文件与运行侧**不得各自再写一份**指代/短理由判据
 *    （两处实现必漂，`dataset-window.mjs` 那条纪律的同一条）。
 *
 * 用法：
 *   node tests/e2e/console-allowlist-audit.mjs --selftest
 *   node tests/e2e/console-allowlist-audit.mjs --gate
 *   node tests/e2e/console-allowlist-audit.mjs --retire-stale   # 只删本轮确实没出现的条目
 *   node tests/e2e/console-allowlist-audit.mjs --dataset=<路径>  # 显式指定数据集（默认取 screenshots/）
 *   node tests/e2e/console-allowlist-audit.mjs --allowlist=<路径> # 显式指定登记表（默认取 console-allowlist.json）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_ALLOWLIST_PATH,
  allowlistViolations,
  loadConsoleAllowlist,
  matchEntry,
  matchEveryUrl,
  shadowedEntries
} from './console-allowlist.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATASET_PATH = path.join(HERE, 'screenshots', 'deep-e2e-console-exemptions.json')

/**
 * 判据主体（纯函数：真实树与合成夹具共用同一份，两向皆可通过才算证过）。
 * @returns {{fatal:string[], red:string[], stale:{id:string,why:string}[], info:string[], stats:object}}
 */
export function judge(dataset, table) {
  const fatal = []
  const red = []
  const info = []
  const stale = []
  const stats = { entries: table.entries.length, hitIds: 0, entryHits: 0, ownUrl: 0, setFallback: 0 }

  if (!dataset || typeof dataset !== 'object') {
    fatal.push('读不到 console 豁免数据集（`deep-e2e-console-exemptions.json`）——本轮跑批没落账 ≠ 本轮没有噪声')
    return { fatal, red, stale, info, stats }
  }
  if (dataset.full !== true) {
    fatal.push(
      `数据集 full=${JSON.stringify(dataset.full)} ⇒ 分段/单模块复跑的局部命中不得当全站账（b79 实测踩过：单跑 M25 会把全站文件覆盖成 27 行）`
    )
  }
  const win = [dataset.windowStart, dataset.windowEnd]
  if (win.some((w) => typeof w !== 'string' || !w.trim())) {
    fatal.push(`数据集窗口字段缺失或非字符串：${JSON.stringify(win)}`)
  } else if (!(Date.parse(win[0]) < Date.parse(win[1]))) {
    fatal.push(`数据集窗口反向或同刻：${win[0]} ~ ${win[1]} ⇒ 时间串抄反了方向`)
  }
  if (
    !Number.isInteger(dataset.modulesPlanned) ||
    !Number.isInteger(dataset.modulesAttempted) ||
    dataset.modulesPlanned !== dataset.modulesAttempted
  ) {
    fatal.push(
      `执行完整性对账不过：计划 ${dataset.modulesPlanned} 个模块、实际入场 ${dataset.modulesAttempted} 个 ⇒ 崩在半路的全量轮不能证明"条目未命中"`
    )
  }
  const snap = Array.isArray(dataset.entries) ? dataset.entries : null
  if (!snap) {
    fatal.push('数据集没有 entries 快照（旧格式）⇒ 无法证明"这张表与这一轮是同一批"，请重跑全量轮再比对')
  }
  const hits = dataset.hits && typeof dataset.hits === 'object' ? dataset.hits : null
  if (!hits) {
    fatal.push('数据集没有 hits 计数（旧格式或采集通道缺失）⇒ 未命中判据无法下结论')
  }
  const ch = dataset.channels && typeof dataset.channels === 'object' ? dataset.channels : null
  const own = ch ? Number(ch.ownUrl) : NaN
  const fb = ch ? Number(ch.setFallback) : NaN
  if (!Number.isFinite(own) || !Number.isFinite(fb) || own < 0 || fb < 0) {
    fatal.push(
      `通道计数取不到数或非整数（ownUrl=${JSON.stringify(ch?.ownUrl)} setFallback=${JSON.stringify(ch?.setFallback)}）——` +
        '`NaN >= x` 恒 false，把"读不到"读成"没问题"是这类判据最典型的死法'
    )
  }
  if (fatal.length) return { fatal, red, stale, info, stats }

  stats.hitIds = Object.keys(hits).length
  stats.entryHits = Object.values(hits).reduce((a, b) => a + (Number(b) || 0), 0)
  stats.ownUrl = own
  stats.setFallback = fb

  // 表与轮必须同一批：数据集里那份快照与当前表逐条比 id（差集非空即口径漂移）
  const tableIds = new Set(table.entries.map((e) => e.id))
  const snapIds = new Set(snap.map((e) => e && e.id))
  const onlySnap = [...snapIds].filter((id) => !tableIds.has(id))
  const onlyTable = [...tableIds].filter((id) => !snapIds.has(id))
  if (onlySnap.length || onlyTable.length) {
    fatal.push(
      `登记表与本轮数据集不是同一批：本轮快照独有 ${onlySnap.join(', ') || '无'} / 当前表独有 ${onlyTable.join(', ') || '无'} ⇒ ` +
        '改表必须与重跑权威轮同批（前言 ⑩："同口径"不等于"同断面"）'
    )
    return { fatal, red, stale, info, stats }
  }

  for (const [id, n] of Object.entries(hits)) {
    if (!tableIds.has(id)) {
      red.push(`命中账里出现表外条目 ${id} ×${n} ⇒ 数据集来自另一张表，或有人删条目没重跑`)
    }
    if (!Number.isInteger(n) || n <= 0) {
      red.push(`条目 ${id} 的命中数不是正整数（实为 ${JSON.stringify(n)}）⇒ 计数通道坏了，不得读成"命中过"`)
    }
  }
  for (const e of table.entries) {
    const n = Number(hits[e.id] || 0)
    if (n === 0) stale.push({ id: e.id, why: e.why })
  }
  if (own === 0 && fb > 0) {
    red.push(
      `逐条主通道（ownUrl）一次都没用上，却有 ${fb} 条走整页集合兜底 ⇒ b87 立的那条"兜底不得变成主通道"今天破了：` +
        '要么 location 读不到了，要么调用方不再传 ownUrl——修判据输入，不要往表里加条目'
    )
  }
  if (stats.entryHits < own + fb) {
    red.push(
      `账不平：条目命中合计 ${stats.entryHits} < 被放行的消息数 ${own + fb} ⇒ 有消息被豁免却没记到任何条目上（采集面自失效，与"没有噪声"同形）`
    )
  }
  if (fb > 0) {
    const share = ((fb / (own + fb)) * 100).toFixed(1)
    info.push(`兜底口径占比 ${fb}/${own + fb} = ${share}%（这条数本该只在 location 不可用时出现）`)
  }
  return { fatal, red, stale, info, stats }
}

// ==================== 自检 ====================

const T = (entries, hits, channels, extra = {}) => ({
  full: true,
  windowStart: '2026-10-23 01:00:00.000',
  windowEnd: '2026-10-23 02:00:00.000',
  modulesPlanned: 92,
  modulesAttempted: 92,
  entries: entries.map((e) => ({ id: e.id, status: e.status, url: e.url })),
  hits,
  channels,
  ...extra
})

const OK_A = {
  id: 'a-401-user',
  status: 401,
  url: '/system/user',
  why: '权限隔离用例在清 token 后仍会请求用户列表，401 是会话此刻无效的设计内结局。'
}
const OK_B = {
  id: 'b-404-gen',
  status: 404,
  url: '/tool/gen/',
  why: '代码生成器边界用例加载不存在的表，404 与前端主动打印的失败日志同属该用例的判定材料。'
}

/** 装载判据的合成夹具：每条都必须抛，且抛的话里要点名是哪一条 */
const LOAD_CASES = [
  {
    name: 'status 不在四档内',
    doc: { entries: [{ ...OK_A, status: 599 }] },
    expect: /status/
  },
  {
    name: 'url 为空串（子串匹配下恒真 = 整档放行）',
    doc: { entries: [{ ...OK_A, url: '' }] },
    expect: /url/
  },
  {
    name: 'url 写成通配形态',
    doc: { entries: [{ ...OK_A, url: '/system/user/*' }] },
    expect: /通配/
  },
  {
    name: '缺 id',
    doc: { entries: [{ status: 401, url: '/x', why: OK_A.why }] },
    expect: /id/
  },
  {
    name: '理由短于下限',
    doc: { entries: [{ ...OK_A, why: '负路径而已' }] },
    expect: /why/
  },
  {
    name: '理由是跨条目指代',
    doc: { entries: [OK_A, { ...OK_B, why: '同上一条 401 那条用例，只是端点不同，仍然属设计内负路径' }] },
    expect: /指代/
  },
  {
    name: '两条逐字相同的理由',
    doc: { entries: [OK_A, { ...OK_B, why: OK_A.why }] },
    expect: /重复理由组/
  },
  {
    name: '同状态下互为子串 ⇒ 结构性遮蔽',
    doc: {
      entries: [
        OK_A,
        {
          id: 'c-shadow',
          status: 401,
          url: '/system/user/profile',
          why: '头像面板在清 token 后仍会请求本人资料，401 属会话无效的自愈副作用。'
        }
      ]
    },
    expect: /遮蔽/
  },
  {
    name: 'entries 为空数组',
    doc: { entries: [] },
    expect: /entries/
  }
]

/** 判定夹具：`expect` 是这条数据集应有的结局 */
const GATE_CASES = [
  {
    name: '全部命中 ⇒ 通过',
    table: [OK_A, OK_B],
    dataset: T([OK_A, OK_B], { 'a-401-user': 3, 'b-404-gen': 1 }, { ownUrl: 4, setFallback: 0 }),
    expect: 'pass'
  },
  {
    name: '有条目本轮零命中 ⇒ 红并点名',
    table: [OK_A, OK_B],
    dataset: T([OK_A, OK_B], { 'a-401-user': 3 }, { ownUrl: 3, setFallback: 0 }),
    expect: 'stale'
  },
  {
    name: '命中账里有表外 id ⇒ 红',
    table: [OK_A, OK_B],
    dataset: T([OK_A, OK_B], { 'a-401-user': 1, 'b-404-gen': 1, ghost: 2 }, { ownUrl: 4, setFallback: 0 }),
    expect: 'red'
  },
  {
    name: '主通道零使用而兜底在用 ⇒ 红（兜底不得变成主通道）',
    table: [OK_A, OK_B],
    dataset: T([OK_A, OK_B], { 'a-401-user': 2 }, { ownUrl: 0, setFallback: 2 }),
    expect: 'red'
  },
  {
    name: '条目命中数小于消息数 ⇒ 红（账不平）',
    table: [OK_A, OK_B],
    dataset: T([OK_A, OK_B], { 'a-401-user': 1, 'b-404-gen': 1 }, { ownUrl: 5, setFallback: 0 }),
    expect: 'red'
  },
  {
    name: '分段轮（full=false）⇒ UNRUN 而不是判红',
    table: [OK_A],
    dataset: { ...T([OK_A], { 'a-401-user': 1 }, { ownUrl: 1, setFallback: 0 }), full: false },
    expect: 'unrun'
  },
  {
    name: '模块没跑全（planned≠attempted）⇒ UNRUN',
    table: [OK_A],
    dataset: { ...T([OK_A], {}, { ownUrl: 0, setFallback: 0 }), modulesAttempted: 91 },
    expect: 'unrun'
  },
  {
    name: '窗口反向 ⇒ UNRUN（时间串抄反方向不得当成"本轮无噪声"）',
    table: [OK_A],
    dataset: {
      ...T([OK_A], { 'a-401-user': 1 }, { ownUrl: 1, setFallback: 0 }),
      windowStart: '2026-10-23 03:00:00.000'
    },
    expect: 'unrun'
  },
  {
    name: '旧格式缺 entries 快照 ⇒ UNRUN',
    table: [OK_A],
    dataset: (() => {
      const d = T([OK_A], { 'a-401-user': 1 }, { ownUrl: 1, setFallback: 0 })
      delete d.entries
      return d
    })(),
    expect: 'unrun'
  },
  {
    name: '表与轮不同批（快照多一条）⇒ UNRUN 并点名差集',
    table: [OK_A],
    dataset: T([OK_A, OK_B], { 'a-401-user': 1 }, { ownUrl: 1, setFallback: 0 }),
    expect: 'unrun'
  },
  {
    name: '通道计数取不到数 ⇒ UNRUN（NaN 不得读成"没问题"）',
    table: [OK_A],
    dataset: T([OK_A], { 'a-401-user': 1 }, {}),
    expect: 'unrun'
  },
  {
    name: '数据集整个缺失 ⇒ UNRUN',
    table: [OK_A],
    dataset: null,
    expect: 'unrun'
  }
]

function runSelftest() {
  const failures = []
  const wrap = (name, fn) => {
    try {
      fn()
    } catch (e) {
      failures.push(`${name}: 抛了未预期的异常 ${e.message}`)
    }
  }
  // 临时夹具目录必须先造：新克隆的仓里 `_tmp/` 不存在（它 gitignore），
  // 而 `mkdtempSync` 不会替你建父目录 ⇒ 整条自检会以 ENOENT 崩死（fail-closed 有了，
  // 但"红在哪条"这条信息会丢——同 b85 摘掉数据集 fail-closed 那次观测到的形状）。
  fs.mkdirSync(path.join(HERE, '_tmp'), { recursive: true })

  // ---- 装载侧：坏表必须抛，且抛的话要点名是哪一处 ----
  let loadCaught = 0
  let checks = 0
  for (const c of LOAD_CASES) {
    checks += 1
    // 临时目录一律锚**脚本位置**（不是 process.cwd()）：`e2eCwdPath.guard.test.ts` 常驻扫这条，
    // 而启动目录在本仓是两种都合法的（RUN-RECIPE 教 tests/e2e、门禁从仓根跑）
    const dir = fs.mkdtempSync(path.join(HERE, '_tmp'))
    const file = path.join(dir, 'console-allowlist.json')
    try {
      fs.writeFileSync(file, JSON.stringify(c.doc, null, 2), 'utf8')
      let msg = ''
      try {
        loadConsoleAllowlist(file)
      } catch (e) {
        msg = e.message
      }
      if (!msg) {
        failures.push(`装载夹具「${c.name}」没抛 ⇒ 表坏了却长得像干净`)
        continue
      }
      if (!c.expect.test(msg)) {
        failures.push(`装载夹具「${c.name}」抛了但没点名到位（期望 /${c.expect.source}/）：${msg.slice(0, 120)}`)
        continue
      }
      loadCaught += 1
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  // 正控：一份完全合规的小表必须装得起来，且条目数真的是 2
  checks += 1
  wrap('合规小表正控', () => {
    const dir = fs.mkdtempSync(path.join(HERE, '_tmp'))
    const file = path.join(dir, 'console-allowlist.json')
    try {
      fs.writeFileSync(file, JSON.stringify({ entries: [OK_A, OK_B] }, null, 2), 'utf8')
      const t = loadConsoleAllowlist(file)
      if (t.entries.length !== 2) failures.push(`合规小表条目数应为 2，实为 ${t.entries.length}`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // 反证：遮蔽判据不得把"不同状态码"或"无包含关系"的两条误判成遮蔽
  checks += 1
  wrap('遮蔽反证', () => {
    const wrong = [
      { ...OK_A },
      {
        id: 'x403',
        status: 403,
        url: '/system/user',
        why: '受限账号有意请求用户管理写操作，权限中间件先于业务响应体拒绝 ⇒ 403 且留痕为空。'
      },
      {
        id: 'x999',
        status: 401,
        url: '/other/deep/path',
        why: '另一个不相关的端点在会话失效后被自愈逻辑重取，401 与它的功能判定无关。'
      }
    ]
    const got = shadowedEntries(wrong)
    if (got.length !== 0) failures.push(`遮蔽判据误报：${got.join(' / ')}`)
    const both = shadowedEntries([
      OK_A,
      {
        id: 'deeper',
        status: 401,
        url: '/system/user/profile',
        why: '同一族请求里更具体的一支，登记它只会被上面那条先命中，属该合并的表。'
      }
    ])
    if (both.length !== 1) failures.push(`遮蔽判据必须抓到 1 对，实为 ${both.length}`)
  })

  // 命中匹配的边界（子串语义 + 空串不得恒真）
  checks += 1
  wrap('匹配语义双向', () => {
    const dir = fs.mkdtempSync(path.join(HERE, '_tmp'))
    const file = path.join(dir, 'console-allowlist.json')
    try {
      fs.writeFileSync(file, JSON.stringify({ entries: [OK_A] }, null, 2), 'utf8')
      const t = loadConsoleAllowlist(file)
      if (matchEntry(t.byStatus, 401, 'http://x/system/user/profile')?.id !== 'a-401-user')
        failures.push('子串匹配必须命中（/system/user ⊂ /system/user/profile）')
      if (matchEntry(t.byStatus, 401, '') !== null) failures.push('空 URL 必须不命中（否则整档噪声被恒放行）')
      if (matchEntry(t.byStatus, 404, 'http://x/system/user') !== null) failures.push('状态码必须参与判定')
      if (matchEveryUrl(t.byStatus, 401, []) !== null) failures.push('空集合必须不成立（"没有 URL"不等于"全部无害"）')
      if (matchEveryUrl(t.byStatus, 401, ['http://x/system/user', 'http://y/system/user/profile'])?.length !== 2)
        failures.push('集合口径必须每个 URL 都给出一条登记')
      if (matchEveryUrl(t.byStatus, 401, ['http://x/system/user', 'http://x/unrelated']) !== null)
        failures.push('集合里出现一个未登记的 URL 必须整体不成立（这就是 b86 的连坐形状，方向不能反）')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // ---- 判定侧：每条夹具都验"结局 + 点名的条目" ----
  let gateOk = 0
  for (const c of GATE_CASES) {
    checks += 1
    const table = { entries: c.table, byStatus: new Map() }
    for (const e of c.table) {
      if (!table.byStatus.has(e.status)) table.byStatus.set(e.status, [])
      table.byStatus.get(e.status).push(e)
    }
    const r = judge(c.dataset, table)
    const verdict = r.fatal.length ? 'unrun' : r.red.length ? 'red' : r.stale.length ? 'stale' : 'pass'
    if (verdict !== c.expect) {
      failures.push(
        `判定夹具「${c.name}」期望 ${c.expect}，实际 ${verdict}｜${[...r.fatal, ...r.red, ...r.stale.map((s) => s.id)].join(' / ').slice(0, 160)}`
      )
      continue
    }
    if (c.expect === 'stale' && !(r.stale.length === 1 && r.stale[0].id === 'b-404-gen')) {
      failures.push(`未命中通道必须恰好点名 b-404-gen，实为 ${JSON.stringify(r.stale.map((s) => s.id))}`)
      continue
    }
    gateOk += 1
  }

  // 反脆弱：把"零命中"那条数据集补上命中，必须不再点名（登记/计数通道是活的，不是写死的红）
  checks += 1
  {
    const table = { entries: [OK_A, OK_B], byStatus: new Map() }
    for (const e of table.entries) {
      if (!table.byStatus.has(e.status)) table.byStatus.set(e.status, [])
      table.byStatus.get(e.status).push(e)
    }
    const live = judge(T([OK_A, OK_B], { 'a-401-user': 3 }, { ownUrl: 3, setFallback: 0 }), table)
    if (live.stale.length !== 1)
      failures.push(`反脆弱：补上另一条命中后必须仍点名 1 条未命中，实为 ${live.stale.length}`)
    const cleared = judge(T([OK_A, OK_B], { 'a-401-user': 3, 'b-404-gen': 2 }, { ownUrl: 5, setFallback: 0 }), table)
    if (cleared.stale.length !== 0) failures.push('反脆弱：全部命中之后必须不再点名（计数通道是活的）')
  }

  // ---- 真实树正控：committed 的表必须装得起来，且体检数字进断言（不只显示）----
  checks += 1
  let real = null
  try {
    real = loadConsoleAllowlist(DEFAULT_ALLOWLIST_PATH)
  } catch (e) {
    failures.push(`真实树登记表装载失败：${e.message}`)
  }
  if (real) {
    const whys = real.entries.map((e) => String(e.why).trim().length)
    const shortest = Math.min(...whys)
    console.log(
      `  真实树登记表：条目 ${real.entries.length} / 状态分布 ${[...real.byStatus]
        .map(([k, v]) => `${k}:${v.length}`)
        .join(
          ' '
        )} / 最短理由 ${shortest} 字符 / 形状违规 ${allowlistViolations(real.entries).length} / 遮蔽对 ${shadowedEntries(real.entries).length}`
    )
    /**
     * 表的下限**不得是一个记住的条数**（原先写死 25）：`--retire-stale` 是本工具自己的合法通道，
     * 一次退役就让"记住的条数"变成谎话——b88 实测退役 20 条（权威轮里一次都没命中的那些）之后，
     * 自检立刻红在"只有 11 条"，而那 11 条恰是整轮唯一被真实命中的 id。
     * 换成一条**与事实的关系**：最新数据集里被真实命中过的每个 id 都必须在表里。
     * 表被截断必然丢掉某个真被命中的 id ⇒ 红；合法退役不会 ⇒ 不红。
     * 没有数据集时不冒充这条判据（读不到 ≠ 通过），退到"四个状态档齐 + 逐条自足"那两条硬检查。
     */
    if (fs.existsSync(DATASET_PATH)) {
      const ds = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'))
      const hitIds = Object.keys(ds.hits || {})
      const missing = hitIds.filter((id) => !real.entries.some((e) => e.id === id))
      if (hitIds.length === 0)
        failures.push('数据集存在却没有任何命中记录 ⇒ "命中过的必须在册"这条下限证不了任何事，先查采集侧')
      else if (missing.length) failures.push(`上一轮真实命中过的豁免不在表里（表被截断？）：${missing.join(', ')}`)
      else console.log(`  命中过必须在册：数据集 ${hitIds.length} 个命中 id 全部在表（表 ${real.entries.length} 条）`)
    } else {
      console.log('  ℹ 无数据集文件 ⇒ 条数下限由"四个状态档齐 + 逐条自足"承担，本支不参与判定')
    }
    if (shortest < 12) failures.push(`真实树最短理由只有 ${shortest} 字符，低于下限 12`)
    if (allowlistViolations(real.entries).length !== 0) failures.push('真实树登记表存在形状/理由违规')
    if (shadowedEntries(real.entries).length !== 0) failures.push('真实树登记表存在结构性遮蔽条目')
    for (const st of [400, 401, 403, 404]) {
      if (!real.byStatus.has(st)) failures.push(`真实树登记表缺 ${st} 这一档——运行侧四个分支都会问到它`)
    }
  }

  // ---- 反漂移：指代/短理由判据只能有一份实现（producer-kit），装载判据只能有一份（本模块）----
  checks += 1
  const auditSrc = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const runnerSrc = fs.readFileSync(path.join(HERE, 'deep-e2e.mjs'), 'utf8')
  for (const [name, src] of [
    ['console-allowlist-audit.mjs', auditSrc],
    ['deep-e2e.mjs', runnerSrc]
  ]) {
    const dup = src.split('\n').filter((l) => /^(const|let) (XREF_ANYWHERE|XREF_EXACT|LEADING_XREF)\b/.test(l.trim()))
    if (dup.length) failures.push(`${name} 里出现了第二份指代判据：${dup.join(' ; ')}（必须只用 producer-kit 那一份）`)
  }
  // 这条锁自己也得可证伪：判据字符串必须真在 producer-kit 里（否则它在比空气）
  const pkSrc = fs.readFileSync(path.join(HERE, 'producer-kit.mjs'), 'utf8')
  for (const key of [
    'XREF_ANYWHERE',
    'XREF_EXACT',
    'LEADING_XREF',
    'selfContainedWhyViolation',
    'duplicateWhyGroups'
  ]) {
    if (!pkSrc.includes(key)) failures.push(`producer-kit.mjs 里找不到 ${key}——反漂移锁的刀口落空了`)
  }

  if (failures.length) {
    console.log(`SYNTH_FAIL console-allowlist-audit ${checks} 条双向：${failures.length} 条不符`)
    for (const f of failures) console.log(`  ✗ ${f}`)
    console.log(`  （装载侧抓到 ${loadCaught}/${LOAD_CASES.length}、判定侧 ${gateOk}/${GATE_CASES.length}）`)
    process.exit(1)
  }
  console.log(
    `SYNTH_OK console-allowlist-audit ${checks} 条双向（装载 ${loadCaught} + 判定 ${gateOk} + 正控/反证/自证 ${checks - loadCaught - gateOk}）`
  )
  process.exit(0)
}

// ==================== CLI ====================

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--selftest')) runSelftest()

  const gate = argv.includes('--gate')
  const retire = argv.includes('--retire-stale')
  const dsArg = argv.find((a) => a.startsWith('--dataset='))
  const dsFile = dsArg ? path.resolve(dsArg.slice('--dataset='.length)) : DATASET_PATH
  const listArg = argv.find((a) => a.startsWith('--allowlist='))
  const listFile = listArg ? path.resolve(listArg.slice('--allowlist='.length)) : DEFAULT_ALLOWLIST_PATH

  let table
  try {
    table = loadConsoleAllowlist(listFile)
  } catch (e) {
    console.error(`[FATAL] ${e.message}`)
    process.exit(2)
  }
  let dataset = null
  let readErr = ''
  try {
    dataset = JSON.parse(fs.readFileSync(dsFile, 'utf8'))
  } catch (e) {
    readErr = e.message
  }
  if (readErr) dataset = null

  const r = judge(dataset, table)

  console.log('========= console 豁免表判据（console-allowlist-audit） =========')
  console.log(`  登记表 ${listFile} → ${table.entries.length} 条逐条带理由`)
  console.log(
    `  数据集 ${dsFile}${readErr ? ` → 读不到（${readErr.slice(0, 60)}）` : ` → 断面 ${dataset.windowStart} ~ ${dataset.windowEnd} / full=${dataset.full}`}`
  )
  console.log(
    `  命中条目 ${r.stats.hitIds} 个 / 条目命中合计 ${r.stats.entryHits} 次 / 主通道 ${r.stats.ownUrl} 条 / 兜底 ${r.stats.setFallback} 条`
  )
  for (const s of r.info) console.log(`  ℹ ${s}`)
  if (r.fatal.length) {
    for (const f of r.fatal) console.log(`  [FATAL] ${f}`)
    console.log('  ⇒ 判据无法下结论（UNRUN）：这不是"通过"，也不是"有缺陷"，而是"这一轮证不了"')
    process.exit(2)
  }
  for (const s of r.stale) console.log(`  ❌ 本轮零命中: ${s.id} — ${s.why}`)
  for (const s of r.red) console.log(`  ❌ ${s}`)

  if (r.stale.length && retire) {
    const kept = table.entries.filter((e) => Number((dataset.hits || {})[e.id] || 0) > 0)
    // 表头（version/note）必须一起写回：只写 entries 的写法会在"删三条"的同时把整张表的自述洗掉
    fs.writeFileSync(
      listFile,
      JSON.stringify({ version: table.version, note: table.note, entries: kept }, null, 2) + '\n',
      'utf8'
    )
    console.log(
      `  ⇒ 已退役 ${table.entries.length - kept.length} 条（只删本轮确实一次没命中的；理由不合格的条目走装载闸，不走退役）`
    )
  } else if (r.stale.length) {
    console.log('  ⇒ 一条都没命中的豁免要么删掉、要么说明它对应的负路径为什么理应每轮都出现——加条目不是出路')
  }

  if (!gate) {
    console.log('  （未加 --gate：只打印，不判退出码）')
    process.exit(0)
  }
  if (r.red.length) {
    console.log(`  ⇒ 失败：${r.red.length} 条判定问题（账不平 / 表外条目 / 兜底取代主通道）`)
    process.exit(1)
  }
  if (r.stale.length) {
    console.log(`  ⇒ 失败：${r.stale.length} 条豁免本轮零命中，没有任何一条消息用到它`)
    process.exit(1)
  }
  console.log('  ⇒ 通过：每条豁免本轮都被真实命中，且逐条主通道在用')
  process.exit(0)
}

// 只在"自己就是入口"时执行：被 import 纯函数（judge / load）时不得顺手跑主流程
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
