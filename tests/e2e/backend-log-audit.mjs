/**
 * 后端日志判据（b81 新增）。
 *
 * 为什么需要它：后端有按日轮转日志，但此前没有任何判据消费 WARN/ERROR——
 * 全量跑完后只能人工 grep，"看一眼觉得正常"就过去了。这与 request-storm 的
 * "采了不判=没采"同形：日志写了不等于有人看；而 WARN 里既有设计内负路径
 * （权限拒绝、能力位关闭），也可能藏着真实缺陷（连接失败、后台任务异常）。
 *
 * 判据形状：
 *   · ERROR：默认**零容忍**；确属设计内的错误必须逐条进 `backend-log-allowlist.json`
 *     并写清 why（与 endpoint-coverage-reasons 同一条纪律：理由必须是可核对的条目）。
 *   · WARN：同样逐条登记；未登记的 WARN ⇒ `--gate` 红。
 *   · 非 tracing 行（panic / stderr 裸输出）：一律视为异常输入，`--gate` 红——
 *     这些行在旧流程里最容易从 grep 的 `WARN|ERROR` 缝隙漏掉。
 *   · 空日志/文件不存在 ⇒ EXIT=2（"没跑"与"跑了且干净"必须可区分）。
 *   · 允许表**未命中**条目（b85 项 F）：本轮没再出现的登记 ⇒ 同样判红并必须撤销；
 *     `--retire-stale` 提供动作通道（真删文件并留痕，未命中为空时不碰文件）。
 *     只判"未登记的必须红"而不判"登记了却没再出现的必须撤销"，允许表就会随修复越积越多，
 *     最后没人敢删——endpoint-coverage / click-failure-audit / config-parity 都立过同一条。
 *   · **整机停顿**（b85 项 G）：窗口内出现 ≥20s 完全静默、且恢复瞬间 2s 内成簇（≥2 条）
 *     超时/fail-closed，或某条自带 `latency=` 横跨整段停顿 ⇒ `[FATAL] 本轮不作数` + **EXIT=2**，
 *     并**跳过**未登记/未命中两张清单（口径闸先于内容闸）。立案证据见 detectStalls 上方注释：
 *     那一轮 38 秒里连每 1.6s 一条、不碰数据库的 WebSocket 心跳都没写，闸门自己的 3s
 *     `tokio::time::timeout` 也没触发 ⇒ 定时器都不推进，是主机把进程冻住了。
 *     这一支为什么必须存在：把这种 503 登记进允许表=永久豁免"用户真实收到 503"；
 *     判成 EXIT=1 又会把人支使去"补登记"。唯一诚实的结论是"这一轮证明不了任何一侧"。
 *
 * 用法：
 *   node tests/e2e/backend-log-audit.mjs --selftest
 *   STEPBY_BACKEND_LOG=D:/.../logs/b81_r2.log node tests/e2e/backend-log-audit.mjs --gate
 *   node tests/e2e/backend-log-audit.mjs --log=... --since=2026-10-20T18:44:00Z --until=...
 *   node tests/e2e/backend-log-audit.mjs --log=... --gate --retire-stale
 *
 * 退出码：0 干净 / 1 有未登记信号、不可解析行或未命中登记 / 2 输入不可用**或本轮不作数**（停顿轮）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ALLOW = path.join(HERE, 'backend-log-allowlist.json')

const LINE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(.*)$/
// 日志里可能带 ANSI 颜色码；用 fromCharCode 构造 ESC，避免字面控制字符触发 eslint 的
// no-control-regex（字符本身是运行期数据，不是源码里的不可见字符）。
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/**
 * 解析 tracing 文本。续行（缩进/`at ...`）并入上一条；其余非 tracing 行进 unparsed。
 * 解析器是纯函数，供自检用合成文本驱动——判据自身的缺陷比缺检查更危险。
 *
 * `unparsed` 的条目带 `ts`：**它自己没有时间戳**（裸 panic/stderr 行正是靠这个特征抓出来的），
 * 所以时间取"它前面最近一条 tracing 记录"的时刻。日志是按时间顺序写的，这个近似足够把
 * 裸行归到正确的窗口里；文件最前面、任何记录之前的裸行 `ts=null`，按窗口内计（fail-closed：
 * 宁可多判一条红，也不能让一条真 panic 因为"定不了位"而被窗口筛掉）。
 */
export function parseLog(text) {
  const records = []
  const unparsed = []
  let cur = null
  let lastTs = null
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(ANSI_RE, '')
    if (!line.trim()) continue
    const m = LINE_RE.exec(line)
    if (m) {
      cur = { ts: m[1], level: m[2], msg: m[3], lines: 1 }
      records.push(cur)
      lastTs = m[1]
      continue
    }
    // 只认缩进/`at`/行号形态的续行。不能因为"上一条是 ERROR"就把任何裸行都吞进去——
    // panic / stderr 裸输出正是要从 tracing 缝隙里抓出来的东西，吞掉等于判据自盲。
    const continuation = /^\s+at\s|^\s+\d+:\s|^\s{2,}/.test(line)
    if (cur && continuation) {
      cur.msg += `\n${line}`
      cur.lines += 1
    } else {
      unparsed.push({ line, ts: lastTs })
    }
  }
  return { records, unparsed }
}

/**
 * 时间是否落在窗口内。`ts` 缺失或不可解析 ⇒ **算窗口内**（见 parseLog 那条 fail-closed 理由）。
 *
 * 这一条是 b85 收口时补的第三面：`classify`/`detectStalls` 各自内联了一份同样的比较，
 * 而**统计量（记录数、级别直方图、非 tracing 行数）从来没被窗口筛过**。收口复跑实测：
 * 同一窗口 `[06:17, 08:35]` 两次跑出"2852 条"与"3137 条"——差的 285 条全在 08:35 之后
 * （后端还在跑、日志还在写），结论不变但**文档抄住的数字一直在动**；更坏的一面是
 * `unparsed` 直接进判定，于是一轮收口之后发生的 panic 会把**上一轮**判红。
 */
export function withinWindowTs(ts, { sinceMs = null, untilMs = null } = {}) {
  if (ts === null || ts === undefined) return true
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return true
  if (sinceMs !== null && Number.isFinite(sinceMs) && t < sinceMs) return false
  if (untilMs !== null && Number.isFinite(untilMs) && t > untilMs) return false
  return true
}

/** 按 `.ts` 筛窗口——records 与 unparsed 共用（两份过滤器必漂，同 dataset-window 那条纪律）。 */
export function filterWindow(list, win) {
  return list.filter((x) => withinWindowTs(x.ts, win))
}

export function loadAllowlist(file = DEFAULT_ALLOW) {
  let body
  try {
    body = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`后端日志允许表不可用：${e.message}`)
  }
  if (!body || body.version !== 1) throw new Error('backend-log-allowlist.json version 必须为 1')
  if (!Array.isArray(body.entries)) throw new Error('backend-log-allowlist.json entries 必须是数组')
  return body.entries.map((e, i) => {
    const at = `entries[${i}]`
    if (!e || typeof e !== 'object') throw new Error(`${at} 不是对象`)
    if (e.level !== 'WARN' && e.level !== 'ERROR') throw new Error(`${at}.level 只能是 WARN/ERROR`)
    const why = typeof e.why === 'string' ? e.why.trim() : ''
    if (why.length < 10) throw new Error(`${at}.why 至少 10 个字符（写清为什么它是设计内信号）`)
    let re
    try {
      re = new RegExp(e.match)
    } catch (err) {
      throw new Error(`${at}.match 不是合法正则：${err.message}`)
    }
    return { level: e.level, match: String(e.match), re, why }
  })
}

/** 允许表条目的身份键（"未命中"判据与退役通道必须认同一个键，否则两处口径会漂）。 */
export function allowKey(e) {
  return `${e.level}|${e.match}`
}

/**
 * 把本轮未命中的条目从允许表里删掉（动作通道；`unused` 为空时**不写文件**，
 * 免得每轮跑批都把 mtime 抖一遍）。返回被删的原始条目以便留痕。
 *
 * 按原始文本的 `level|match` 比对（`loadAllowlist` 会给条目挂上编译后的 `re`，
 * 但写回去的必须是原始 JSON 形状——把 `re` 序列化进文件就是往仓库里写 RegExp 的残渣）。
 */
export function retireStale(file, unused) {
  if (!unused.length) return []
  const body = JSON.parse(fs.readFileSync(file, 'utf8'))
  const drop = new Set(unused.map((e) => allowKey({ level: e.level, match: String(e.match) })))
  const kept = []
  const removed = []
  for (const e of body.entries) {
    if (drop.has(allowKey({ level: e.level, match: String(e.match) }))) removed.push(e)
    else kept.push(e)
  }
  fs.writeFileSync(file, JSON.stringify({ ...body, entries: kept }, null, 2) + '\n', 'utf8')
  return removed
}

/**
 * 按级别 + 消息正则匹配允许表；返回未登记项、已登记项与**本轮未命中的条目**。
 *
 * `unused` 这一支是批八十五 项 F 补的：允许表是"本轮对账"，不是永久白名单。
 * 只判"未登记的必须红"而不判"登记了却没再出现的必须撤销"，条目就会随着代码修复越积越多，
 * 最后没人敢删——同一形态在 endpoint-coverage / click-failure-audit / config-parity 三处
 * 都立过案（且都配了 `--retire-stale` 动作通道：只打提示、没有动作通道的信号等于没判）。
 */
export function classify(records, allow, { since = null, until = null } = {}) {
  const win = {
    sinceMs: since ? Date.parse(since) : null,
    untilMs: until ? Date.parse(until) : null
  }
  const unknown = []
  const allowed = []
  const matched = new Set()
  let scanned = 0
  for (const r of records) {
    if (r.level !== 'WARN' && r.level !== 'ERROR') continue
    if (!withinWindowTs(r.ts, win)) continue
    scanned += 1
    const hit = allow.find((e) => e.level === r.level && e.re.test(r.msg))
    if (hit) {
      matched.add(allowKey(hit))
      allowed.push({ ...r, why: hit.why })
    } else unknown.push(r)
  }
  const unused = allow.filter((e) => !matched.has(allowKey(e)))
  return { unknown, allowed, unused, scanned }
}

function summarize(records) {
  const byLevel = {}
  for (const r of records) byLevel[r.level] = (byLevel[r.level] || 0) + 1
  return byLevel
}

/**
 * ==================== 整机停顿判据（批八十五 项 G） ====================
 *
 * 立案证据（`logs/b85_r1.log`，b85 全量 deep 轮）：05:11:30.103 之后日志**整整 37.7 秒
 * 一个字都没有**——连每 1.6 秒一条、完全不碰数据库的 WebSocket 建立/关闭都停了，调度器的
 * 下一个 tick 也没打；05:12:07.861 起 7 条 ERROR/WARN 挤在**4 毫秒内**同时冒出来
 * （auth 闸门查询超时 ×1、fail-closed 拒绝 ×1、`response failed … 503` ×3、
 * pool timed out ×2、slow statement ×1），三条 503 的 latency 分别是 36245/35176/33488 ms。
 *
 * 这三条数字合起来是决定性的：**闸门自己的 3 秒 `tokio::time::timeout` 在那 37 秒里从未触发**
 * （若触发了，三条会在各自起点 +3s 的**不同时刻**被拒，而不是挤在同一毫秒）。定时器不推进
 * ⇒ 异步运行时整体没被调度 ⇒ 不是连接池、不是慢 SQL、不是我们的代码路径。同一窗口从测试侧
 * 看也是同一形状：`[05:11:36] ❌ M30 i18n` → `[05:12:06] safeGoto 第 1 次导航超时 30000ms`，
 * 而 M31 报 `net::ERR_NETWORK_CHANGED` ×5——客户端和服务端**同时**冻住。两条用例单独复跑
 * 在同一产物上全绿（M30 8✅ / M31 13✅）。
 *
 * 为什么不能登记进允许表：那张表的语义是"这条**设计内**失败会发生"。把一次主机层面的
 * 冻结签成设计内，等于给"用户真实收到 503"编了一个永远豁免的理由——下一次真出 503
 * 也被这条洗掉。所以正确动作不是"登记加一条"，而是**判成本轮不作数**（EXIT=2 UNRUN）：
 * 既不是通过，也不是缺陷，而是"这一轮证明不了任何一侧"（AGENTS ⑥ 三态：没跑 ≠ 干净）。
 *
 * 停顿的判据形状取"日志自己作证"的两条硬事实，不取"看起来像"：
 *   (a) 恢复瞬间的记录自带 `latency=N ms` 且 N ≥ 0.8 × 停顿长度 ⇒ 这条请求**横跨**整段停顿；
 *   (b) 恢复瞬间 2 秒内**成簇**（≥2 条）出现超时/fail-closed 族 ⇒ 被压住的批次一起冒头。
 * 只有一条超时行、前面又正好安静（套件之间的自然空闲），不按停顿处理，照常判未登记——
 * 放宽到"有 gap 就算"会把真回归也一起豁免掉，那是把判据关掉。
 */
const STALL_GAP_SECS = 20
const STALL_RECOVER_SECS = 2
// 超时/fail-closed 族。判据只用于"这一条是不是被冻结压住的积压"，不用于定罪，
// 所以宁可写得宽一点——宽了的代价是本轮 UNRUN（要重跑），不是"通过"。
const STALL_FAMILY_RE = /(查询超时|fail-closed|Connection pool timed out|slow statement|timed out|Timeout)/i

/** 这一条是否横跨停顿；返回理由文本，不是则 null。 */
export function stallArtifactReason(msg, gapMs) {
  const lat = /latency=(\d+)\s*ms/.exec(msg)
  if (lat && Number(lat[1]) >= gapMs * 0.8) return `latency=${lat[1]}ms 横跨整段停顿`
  if (STALL_FAMILY_RE.test(msg)) return '超时/fail-closed 族在恢复瞬间成簇'
  return null
}

/**
 * 在**窗口内**的记录上找整机停顿。gap 用全部级别量（冻结时什么都不写），
 * 证据只看 WARN/ERROR。返回 `[{from,to,gapSecs,artifacts:[…]}]`，空数组 = 本轮没有停顿。
 */
export function detectStalls(
  records,
  { gapSecs = STALL_GAP_SECS, recoverSecs = STALL_RECOVER_SECS, since = null, until = null } = {}
) {
  const win = {
    sinceMs: since ? Date.parse(since) : null,
    untilMs: until ? Date.parse(until) : null
  }
  // 与 classify 共用 `withinWindowTs`，但这里**额外**要求时间戳可解析：gap 是减法算出来的，
  // 一条定不了位的记录会把 NaN 喂进比较（`NaN >= 20000` 恒 false ⇒ 静默漏判停顿）。
  const inWin = records.filter((r) => Number.isFinite(Date.parse(r.ts)) && withinWindowTs(r.ts, win))
  const stalls = []
  for (let i = 1; i < inWin.length; i++) {
    const prev = Date.parse(inWin[i - 1].ts)
    const cur = Date.parse(inWin[i].ts)
    const gapMs = cur - prev
    if (!(gapMs >= gapSecs * 1000)) continue
    const hits = []
    for (let j = i; j < inWin.length; j++) {
      if ((Date.parse(inWin[j].ts) - cur) / 1000 > recoverSecs) break
      const r = inWin[j]
      if (r.level !== 'WARN' && r.level !== 'ERROR') continue
      const reason = stallArtifactReason(r.msg, gapMs)
      if (reason) hits.push({ ...r, reason })
    }
    const crossing = hits.some((h) => h.reason.startsWith('latency='))
    if (hits.length >= 2 || crossing) {
      stalls.push({
        from: inWin[i - 1].ts,
        to: inWin[i].ts,
        gapSecs: Math.round(gapMs / 1000),
        artifacts: hits
      })
      i += hits.length
    }
  }
  return stalls
}

export function stallSummary(stalls) {
  return stalls
    .map((s) => `${s.from}→${s.to} 静默 ${s.gapSecs}s（恢复瞬间 ${s.artifacts.length} 条超时/fail-closed 挤在一起）`)
    .join('；')
}

/**
 * 窗口字符串 → epoch ms（**按 UTC 解释**）。
 *
 * 为什么必须自己写：日志行首是 `...Z`（UTC），而本轮数据集里的 `windowStart/windowEnd`
 * 是 naive-UTC 文本（与 `sys_oper_log.oper_time` 同口径）。JS 的 `Date.parse('2026-10-20 19:48')`
 * 把无时区串按**本地时区**解释 ⇒ 在 UTC+8 上窗口前移 8 小时，把上一轮的 WARN/ERROR 也扫进来
 * （b79 记过同形错误："抄错方向就是把窗口前挪 8 小时"）。带 `Z` 或 `±HH:MM` 的原样交给
 * `Date.parse`；裸串补 `T…Z` 按 UTC 解析。解析不出来 ⇒ `NaN`，调用方必须拒绝而非当"无窗口"。
 */
export function windowToEpoch(value) {
  const s = String(value ?? '').trim()
  if (!s) return NaN
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return Date.parse(s)
  const iso = s.replace(' ', 'T')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return NaN
  return Date.parse(`${iso}Z`)
}

/** 从本轮数据集自证字段取窗口（人不抄时间串；同 endpoint-coverage 的做法）。 */
function windowFromDataset() {
  const ds = path.join(HERE, 'screenshots', 'deep-e2e-reqstats.json')
  let data = null
  try {
    data = JSON.parse(fs.readFileSync(ds, 'utf8'))
  } catch {
    return null
  }
  if (!data || data.full !== true || !data.windowStart || !data.windowEnd) return null
  return { since: data.windowStart, until: data.windowEnd, source: `${path.basename(ds)} 自证字段` }
}

function gateState({ file, records, unparsed, unknown, unused = [], stalls = [], fileTotal = null }) {
  if (!fs.existsSync(file)) return { code: 2, detail: `日志不存在：${file}` }
  if (fileTotal === 0) return { code: 2, detail: `日志为空（没有任何 tracing 记录）：${file}` }
  if (records.length === 0) {
    // 「日志为空」与「日志非空但这一轮的窗口里什么都没有」是两个不同的动作：前者查产物，
    // 后者查窗口串（多半是把上一轮的时间抄错了方向）。合成一个文案会把人支使错地方。
    return {
      code: 2,
      detail: `窗口内没有任何 tracing 记录（该文件共 ${fileTotal ?? '未知'} 条，全在窗口外）：${file} ⇒ 本轮不作数`
    }
  }
  // 口径闸排在内容闸之前（AGENTS ⑨）：本轮连定时器都没推进时，"未登记 N 条"报出来
  // 只会把人往"去登记"的方向支使，而正确答案是"重跑这一轮"。
  if (stalls.length) {
    return {
      code: 2,
      detail: `检测到 ${stalls.length} 次整机停顿：${stallSummary(stalls)} ⇒ 本轮不作数`
    }
  }
  const bad = unknown.length + unparsed.length + unused.length
  return {
    code: bad ? 1 : 0,
    detail: `${records.length} 条记录 / 未登记 ${unknown.length} 条 / 非 tracing 行 ${unparsed.length} 条 / 未命中允许表 ${unused.length} 条`
  }
}

function selftest() {
  const fails = []
  // 条数由脚本自己数着打（`ran`）：原先打的是硬编码 13，加一条用例文档就永远对不上，
  // 少一条也不会报——同"文件数由脚本自己打印，文档不抄数"那条纪律。
  let ran = 0
  const check = (name, cond, detail) => {
    ran++
    if (!cond) fails.push(`${name}${detail ? `：${detail}` : ''}`)
  }
  const allow = [
    { level: 'WARN', re: /Redis 配置被忽略/, why: 'local 档部署选择' },
    { level: 'ERROR', re: /已知后台任务失败/, why: '合成控制组' }
  ].map((e) => ({ ...e, match: e.re.source }))

  const text = [
    '2026-10-20T00:00:01.000000Z  INFO stepby_axum::x: src\\x.rs:1: 启动',
    '2026-10-20T00:00:02.000000Z  WARN stepby_axum::x: src\\x.rs:2: Redis 配置被忽略（cache.mode=local）',
    '2026-10-20T00:00:03.000000Z  WARN stepby_axum::x: src\\x.rs:3: 没登记过的告警',
    '2026-10-20T00:00:04.000000Z  ERROR stepby_axum::x: src\\x.rs:4: 某个失败',
    '    at handler.rs:10',
    "thread 'main' panicked at src/x.rs:9"
  ].join('\n')
  const parsed = parseLog(text)
  check('INFO/WARN/ERROR 四条记录被解析', parsed.records.length === 4, `实际 ${parsed.records.length}`)
  check('panic 裸行必须进 unparsed', parsed.unparsed.length === 1, JSON.stringify(parsed.unparsed))
  check(
    '裸行必须带上"它前面最近一条记录"的时刻（窗口筛裸行靠这个，缺了就永远只能算全文件）',
    parsed.unparsed[0]?.ts === '2026-10-20T00:00:04.000000Z',
    JSON.stringify(parsed.unparsed[0])
  )
  const errorRec = parsed.records.find((r) => r.level === 'ERROR')
  check('ERROR 续行并入消息', errorRec?.msg.includes('at handler.rs:10'), errorRec?.msg)
  const c = classify(parsed.records, allow)
  check('允许表命中 WARN 不报', c.allowed.length === 1, JSON.stringify(c.allowed.map((x) => x.msg)))
  check(
    '未登记 WARN 必须报',
    c.unknown.some((x) => x.level === 'WARN')
  )
  check(
    '未登记 ERROR 必须报',
    c.unknown.some((x) => x.level === 'ERROR')
  )
  check('INFO 不参与判定', !c.unknown.some((x) => x.level === 'INFO'))

  // 窗口过滤：只取 00:00:02 之后的 WARN
  const w = classify(parsed.records, allow, { since: '2026-10-20T00:00:02Z' })
  check('窗口过滤生效', w.scanned === 3, `实际 ${w.scanned}`)

  // 允许表**未命中**对账（b85 项 F）：条目是本轮对账，不是永久白名单。
  // 夹具里 ERROR 那条从未被打中 ⇒ 必须点名撤销；而打中的 WARN 条不得进未命中集合
  // （这一对互为对照组：只判"有未命中"判不出"把全部条目都算成未命中"这种实现）。
  check(
    '未命中的允许表条目必须点名（登记了但本轮没再出现=必须撤销）',
    c.unused.length === 1 && c.unused[0].level === 'ERROR',
    JSON.stringify(c.unused.map((e) => e.match))
  )
  check('命中的条目不得算未命中（否则退役通道会把活条目一起删掉）', !c.unused.some((e) => e.match.includes('Redis')))
  const hitErr = [
    ...parsed.records,
    { ts: '2026-10-20T00:00:05.000000Z', level: 'ERROR', msg: '已知后台任务失败：xyz' }
  ]
  check('补一条打中的 ERROR 后未命中集合必须清空', classify(hitErr, allow).unused.length === 0)
  check(
    '未命中必须把判定拉成 EXIT=1（只打提示没有动作=没判）',
    gateState({ file: DEFAULT_ALLOW, records: parsed.records, unparsed: [], unknown: [], unused: c.unused }).code === 1
  )

  // 退役通道：写在判定之后，且 unused 为空时不得碰文件
  {
    const tmp = path.join(HERE, '_tmp_backend_retire.json')
    fs.writeFileSync(
      tmp,
      JSON.stringify(
        { version: 1, entries: allow.map((e) => ({ level: e.level, match: e.match, why: e.why })) },
        null,
        2
      )
    )
    const before = fs.readFileSync(tmp, 'utf8')
    const removed = retireStale(tmp, c.unused)
    const after = JSON.parse(fs.readFileSync(tmp, 'utf8'))
    check(
      '退役通道必须真删掉未命中条目并留痕',
      removed.length === 1 && after.entries.length === 1,
      `removed=${removed.length} 剩=${after.entries.length}`
    )
    check('退役后剩下的必须是命中的那条', after.entries[0]?.level === 'WARN', JSON.stringify(after.entries))
    check('退役写回必须是原始形状（不得把编译后的 RegExp 落进仓库）', !('re' in after.entries[0]))
    const again = fs.readFileSync(tmp, 'utf8')
    retireStale(tmp, [])
    check('没有未命中时不得改动文件（空集也要写一遍就是每轮抖 mtime）', fs.readFileSync(tmp, 'utf8') === again)
    check(
      '退役必须减少条目而不是增加（写回后允许表只可能更严）',
      after.entries.length < allow.length,
      `${after.entries.length} vs ${allow.length}`
    )
    void before
    fs.unlinkSync(tmp)
  }

  // 窗口串的**时区口径**（b83）：日志时间戳是 UTC，数据集窗口是 naive-UTC 文本。
  // `Date.parse('2026-10-20 00:00:02')` 在 UTC+8 上按本地时区解释 ⇒ 窗口前移 8 小时，
  // 会把上一轮的 WARN/ERROR 扫进本轮判定（b79 实测过同形错误的代价）。四条双向：
  const epochNaive = windowToEpoch('2026-10-20 00:00:02')
  const epochZ = windowToEpoch('2026-10-20T00:00:02Z')
  check('naive 串必须按 UTC 解析（与带 Z 的同刻）', epochNaive === epochZ, `${epochNaive} vs ${epochZ}`)
  check(
    '带偏移的串必须按偏移解析',
    windowToEpoch('2026-10-20T08:00:02+08:00') === epochZ,
    String(windowToEpoch('2026-10-20T08:00:02+08:00'))
  )
  check('垃圾串必须返回 NaN（不得读成"无窗口"）', Number.isNaN(windowToEpoch('昨天下午')))
  check('空串必须返回 NaN', Number.isNaN(windowToEpoch('')))
  // 同一份夹具按 naive-UTC 窗口过滤，结果必须与带 Z 的完全一致（判据不受调用方写法影响）
  const wNaive = classify(parsed.records, allow, {
    since: new Date(epochNaive).toISOString()
  })
  check('naive 窗口与 Z 窗口必须扫到同一条数', wNaive.scanned === w.scanned, `${wNaive.scanned} vs ${w.scanned}`)

  // 允许表自身必须拒绝坏形状
  for (const [name, entries] of [
    ['级别表外', [{ level: 'INFO', match: 'x', why: '理由足够长足够长' }]],
    ['缺理由', [{ level: 'WARN', match: 'x', why: '' }]],
    ['坏正则', [{ level: 'WARN', match: '(', why: '理由足够长足够长' }]]
  ]) {
    let threw = false
    try {
      const tmp = path.join(HERE, `_tmp_allow_${name}.json`)
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries }))
      try {
        loadAllowlist(tmp)
      } finally {
        fs.unlinkSync(tmp)
      }
    } catch {
      threw = true
    }
    check(`允许表坏形状必须拒绝：${name}`, threw)
  }

  // 空日志不得判绿
  const emptyFile = path.join(HERE, '_tmp_backend_empty.log')
  fs.writeFileSync(emptyFile, '')
  try {
    const st = gateState({ file: emptyFile, records: [], unparsed: [], unknown: [], fileTotal: 0 })
    check('空日志必须 EXIT=2（没跑 ≠ 跑干净）', st.code === 2 && /日志为空/.test(st.detail), JSON.stringify(st))
    // 文件非空但窗口里没有东西 ⇒ 同样 EXIT=2，但文案必须指"窗口"（动作是改时间串），
    // 不能写成"日志为空"（动作是查产物）——两条不同的处置不能被一句话糊住
    const stWin = gateState({ file: emptyFile, records: [], unparsed: [], unknown: [], fileTotal: 12 })
    check(
      '窗口内零记录必须与"日志为空"分文案（两者动作不同）',
      stWin.code === 2 && /窗口内/.test(stWin.detail) && !/日志为空/.test(stWin.detail),
      JSON.stringify(stWin)
    )
  } finally {
    fs.unlinkSync(emptyFile)
  }
  const badState = gateState({
    file: DEFAULT_ALLOW,
    records: parsed.records,
    unparsed: parsed.unparsed,
    unknown: c.unknown
  })
  check('存在未登记/裸行必须 EXIT=1', badState.code === 1, JSON.stringify(badState))

  // ==================== 统计量的窗口对账（b85 收口）====================
  // 事故形状：同一窗口两次跑出 2852 → 3137 条——后端在收口之后继续写同一个文件，
  // 而"记录 N / 级别直方图 / 非 tracing 行"三个量全在**整份文件**上统计。
  // 前者只是文档抄住的数字一直动；后者是真判定被污染：窗口外的一条 panic 会把上一轮判红。
  {
    const twoWindow = [
      '2026-10-20T00:00:01.000000Z  INFO a: 窗口内一条',
      '2026-10-20T01:00:00.000000Z  INFO a: 窗口外一条',
      '2026-10-20T01:00:01.000000Z ERROR a: 窗口外一条真失败',
      "thread 'main' panicked at src/y.rs:1"
    ].join('\n')
    const tp = parseLog(twoWindow)
    const w2 = { sinceMs: Date.parse('2026-10-20T00:00:00Z'), untilMs: Date.parse('2026-10-20T00:00:30Z') }
    const recsIn = filterWindow(tp.records, w2)
    check(
      '记录计数只算窗口内（否则"本轮 N 条"每次跑都不同）',
      recsIn.length === 1,
      JSON.stringify(recsIn.map((r) => r.ts))
    )
    check(
      '级别直方图同口径（窗口外的 ERROR 不得出现在本轮统计里）',
      JSON.stringify(summarize(recsIn)) === JSON.stringify({ INFO: 1 }),
      JSON.stringify(summarize(recsIn))
    )
    check(
      '窗口外的裸行不得让本轮判红（同一条 panic 不属于这一轮）',
      filterWindow(tp.unparsed, w2).length === 0 && tp.unparsed.length === 1,
      JSON.stringify(tp.unparsed)
    )
    // 对照组：把窗口推到包含那条 panic 的时刻 ⇒ 必须被抓到。
    // 只判"排除"判不出"一律排除"这种实现（同 ⑳b 的对照组纪律）。
    const w3 = { sinceMs: Date.parse('2026-10-20T00:59:00Z'), untilMs: null }
    check(
      '对照组：同一份文本把窗口挪到裸行之后必须计入（不得退化成"裸行一律排除"）',
      filterWindow(tp.unparsed, w3).length === 1 && filterWindow(tp.records, w3).length === 2,
      JSON.stringify({ bare: filterWindow(tp.unparsed, w3).length, rec: filterWindow(tp.records, w3).length })
    )
    // 文件最开头、任何记录之前的裸行定不了位 ⇒ 必须按窗口内计（fail-closed）
    const headBare = parseLog(
      ["thread 'main' panicked at src/z.rs:1", '2026-10-20T05:00:00.000000Z  INFO a: 之后才有记录'].join('\n')
    )
    check(
      '定不了位的裸行必须算窗口内（宁可多判一条红，也不能让真 panic 因为"没时间戳"被筛掉）',
      headBare.unparsed[0]?.ts === null && filterWindow(headBare.unparsed, w2).length === 1,
      JSON.stringify(headBare.unparsed)
    )
    check(
      '窗口内零记录时 classify 的扫描数也必须为 0（三处共用同一个过滤器，不得各写一份）',
      classify(tp.records, allow, { since: '2026-10-20T00:00:00Z', until: '2026-10-20T00:00:30Z' }).scanned === 0,
      String(classify(tp.records, allow, { since: '2026-10-20T00:00:00Z', until: '2026-10-20T00:00:30Z' }).scanned)
    )
  }

  // ==================== 整机停顿判据（项 G）：合成双向，逐条对照 ====================
  // 真实事故形状（logs/b85_r1.log 原文摘出，消息逐字保留）：05:11:30 之后 37.7s 全静默，
  // 05:12:07.861 起 7 条挤在 4ms 内，三条 503 的 latency 36245/35176/33488ms。
  const stallLines = [
    '2026-10-22T05:11:28.523340Z  INFO stepby_axum::handler::ws_handler: ws.rs:287: WebSocket 连接建立 user_id=1',
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask: 无启用告警规则，本轮评估跳过',
    '2026-10-22T05:12:07.861232Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求；redis 档=Redis 查询/local 档=业务库查询） request_id=1825437f',
    '2026-10-22T05:12:07.862185Z ERROR tower_http::trace::on_failure: on_failure.rs:93: response failed classification=Status code: 503 Service Unavailable latency=36245 ms',
    '2026-10-22T05:12:07.864716Z ERROR stepby_axum::middleware::auth: auth.rs:114: Redis 黑名单/pwd_ver 查询失败（fail-closed 拒绝请求） error=共享态后端操作失败: Failed to acquire connection from pool: Connection pool timed out'
  ]
  const stallParsed = parseLog(stallLines.join('\n'))
  const s1 = detectStalls(stallParsed.records)
  check('整机停顿必须被抓到（37s 全静默 + 恢复瞬间成簇）', s1.length === 1, JSON.stringify(s1.map((x) => x.gapSecs)))
  check(
    '停顿的 artifact 只收 WARN/ERROR，INFO 恢复行不得算进去',
    s1[0]?.artifacts.length === 3 && s1[0]?.gapSecs === 38,
    `实得 ${s1[0]?.artifacts.length} 条 / gap ${s1[0]?.gapSecs}s`
  )
  check(
    '带 latency 横跨停顿的那条必须给出"横跨"理由（这是最硬的一支）',
    s1[0]?.artifacts.some((a) => a.reason.startsWith('latency=36245ms')),
    JSON.stringify(s1[0]?.artifacts.map((a) => a.reason))
  )
  const stallState = gateState({
    file: DEFAULT_ALLOW,
    records: stallParsed.records,
    unparsed: [],
    unknown: classify(stallParsed.records, allow).unknown,
    unused: [],
    stalls: s1
  })
  check(
    '停顿轮必须判 EXIT=2（不作数），既不是通过也不是"未登记"——把环境事故登记成设计内=下次真 503 也被洗掉',
    stallState.code === 2 && /不作数/.test(stallState.detail),
    JSON.stringify(stallState)
  )
  // 反脆弱 1：同样三条 ERROR 但**没有停顿** ⇒ 必须照常判未登记（环境判据不得吞掉真失败）
  const noGapText = stallLines
    .map((l, i) => (i >= 2 ? l.replace('2026-10-22T05:12:07', `2026-10-22T05:11:3${i - 1}`) : l))
    .join('\n')
  const noGapParsed = parseLog(noGapText)
  const s2 = detectStalls(noGapParsed.records)
  const c2 = classify(noGapParsed.records, allow)
  check(
    '反脆弱：同样的三条 ERROR 但无停顿时必须判未登记（不得"看谁都像环境"）',
    s2.length === 0 && c2.unknown.length === 3,
    `实得 stalls=${s2.length} unknown=${c2.unknown.length}`
  )
  // 反脆弱 2：恢复后 10 秒才出现的 ERROR 属于"停顿之后的真失败"，照常判
  const lateOnly = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:12:30.000000Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求）'
  ]
  check(
    '反脆弱：gap 之后 2 秒以外才出现的超时行必须照常判（恢复后的真失败不得被豁免）',
    detectStalls(parseLog(lateOnly.join('\n')).records).length === 0,
    '实得没有停顿才对'
  )
  // 反脆弱 3：只有 1 条超时行、且不带横跨停顿的 latency ⇒ 证据不足，按真失败判
  const single = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:12:07.000000Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求）'
  ]
  check(
    '反脆弱：孤零零一条超时行不足以定性停顿（单条按未登记判，避免"有 gap 就豁免"）',
    detectStalls(parseLog(single.join('\n')).records).length === 0,
    '实得没有停顿才对'
  )
  // 反脆弱 4：19s 的短 gap（阈值以下）不触发——阈值参与判定，不得"看谁都像"
  const shortGap = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:11:49.103210Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求）',
    '2026-10-22T05:11:49.203210Z ERROR tower_http::trace::on_failure: on_failure.rs:93: response failed classification=Status code: 503 Service Unavailable latency=36245 ms'
  ]
  check(
    '反脆弱：阈值（20s）以下的静默不得算停顿（否则任何一次 DB 抖动都成了"环境"）',
    detectStalls(parseLog(shortGap.join('\n')).records).length === 0,
    '实得没有停顿才对'
  )
  // 反脆弱 5：自然空闲（两套件之间）没有 WARN/ERROR ⇒ 不得报停顿
  const idle = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:20:00.000000Z  INFO stepby_axum::handler::auth: 登录成功 user_name=admin'
  ]
  check(
    '反脆弱：长时间空闲但没有任何 WARN/ERROR 必须不报（空闲≠停顿）',
    detectStalls(parseLog(idle.join('\n')).records).length === 0
  )
  // 反脆弱 6：窗口外的停顿不得影响本轮判定（跨轮日志文件是常态：logs/app.log 天天轮转）
  const outside = detectStalls(stallParsed.records, { since: '2026-10-22T05:12:07.500000Z' })
  check('窗口外的静默不得算进本轮（since 之后第一条与停顿无关）', outside.length === 0, JSON.stringify(outside))
  // 单条 latency 横跨也必须成立（最硬的一支不依赖成簇）
  const oneCross = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:12:07.000000Z ERROR tower_http::trace::on_failure: on_failure.rs:93: response failed classification=Status code: 503 Service Unavailable latency=36245 ms'
  ]
  const sCross = detectStalls(parseLog(oneCross.join('\n')).records)
  check(
    '一条 latency 横跨停顿即成立（成簇只是第二条证据，不得当唯一门槛）',
    sCross.length === 1,
    JSON.stringify(sCross)
  )

  if (fails.length) {
    console.error(`SYNTH_FAIL 后端日志判据 ${fails.length} 条：`)
    for (const f of fails) console.error(`  · ${f}`)
    process.exit(1)
  }
  console.log(
    `SYNTH_OK 后端日志判据 ${ran} 条双向（解析/续行/窗口过滤/窗口时区口径/统计量窗口对账/允许表形状/未命中对账/退役通道/空日志与窗口内零记录/未登记必红/整机停顿必判不作数 + 六种"不得算成停顿"的反脆弱）`
  )
  process.exit(0)
}

function main() {
  const args = process.argv.slice(2)
  // `--selftest` 的派发只在文件末尾那一条（旗标纪律扫描器 R3：原先这里还有一条同名派发，
  // 而 main() 只可能在 else 分支被调用 ⇒ 永远走不到；留着的代价是下一个人改错了地方）。
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null
  // `--gate` 必须显式给（原判据文档把它写进用法却无人读 ⇒ 加了不等于没加）。
  // 不给就当"这次不是来要结论的"，EXIT=2：不得把"没声明"读成"通过"，也不得读成"缺陷"。
  if (!args.includes('--gate')) {
    console.error('EXIT=2 必须显式加 --gate（本判据要求调用者声明这次要的是判定；未加 ⇒ 不作结论）')
    process.exit(2)
  }
  const envLog = process.env.STEPBY_BACKEND_LOG || ''
  const file = opt('log') || envLog
  if (!file) {
    console.error('EXIT=2 未提供日志：用 --log=... 或 STEPBY_BACKEND_LOG（没跑 ≠ 跑干净）')
    process.exit(2)
  }
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) {
    console.error(`EXIT=2 日志不存在：${abs}`)
    process.exit(2)
  }
  let allow
  const allowPath = opt('allow') || DEFAULT_ALLOW
  try {
    allow = loadAllowlist(allowPath)
  } catch (e) {
    console.error(`EXIT=2 ${e.message}`)
    process.exit(2)
  }
  // 窗口必填（与 oper-log-audit 同口径）：不给就不判——读着跨轮轮转的 `logs/app.log`
  // 判出来的既不是本轮的通过，也不是本轮的失败。缺省时从本轮数据集自证字段取，
  // 让人不必抄时间串（抄错方向=把上一轮扫进来）。
  const fromDs = windowFromDataset()
  const since = opt('since') || process.env.STEPBY_BACKEND_SINCE || fromDs?.since || ''
  const until = opt('until') || process.env.STEPBY_BACKEND_UNTIL || fromDs?.until || ''
  const sinceMs = windowToEpoch(since)
  const untilMs = windowToEpoch(until)
  if (!Number.isFinite(sinceMs)) {
    console.error(
      `EXIT=2 窗口起点缺失或不可解析：--since= / STEPBY_BACKEND_SINCE / screenshots/deep-e2e-reqstats.json 三处都没拿到可用值` +
        `（给的="${since || '空'}"；naive 串按 UTC 解释）`
    )
    process.exit(2)
  }
  if (until && !Number.isFinite(untilMs)) {
    console.error(`EXIT=2 窗口终点不可解析："${until}"`)
    process.exit(2)
  }
  console.log(
    `  窗口：${since} → ${until || '（到文件末尾）'}（来源：${opt('since') ? '--since' : process.env.STEPBY_BACKEND_SINCE ? 'STEPBY_BACKEND_SINCE' : fromDs ? fromDs.source : '—'}，按 UTC 解释）`
  )
  const parsed = parseLog(fs.readFileSync(abs, 'utf8'))
  const win = {
    since: new Date(sinceMs).toISOString(),
    until: untilMs ? new Date(untilMs).toISOString() : null
  }
  const winMs = { sinceMs, untilMs: Number.isFinite(untilMs) ? untilMs : null }
  // 统计量与判定一律只看窗口内（b85 收口）：收口之后后端还在往同一个文件里写，
  // 全文件计数让"记录 N"每次跑都变大（文档抄住的数字一直在动），
  // 而窗口外的一条裸 panic 会把**上一轮**判红——与 stall 那条"窗口外的静默不得算进本轮"同族。
  const recs = filterWindow(parsed.records, winMs)
  const bare = filterWindow(parsed.unparsed, winMs)
  const stalls = detectStalls(parsed.records, win)
  const { unknown, allowed, unused, scanned } = classify(parsed.records, allow, win)
  console.log(`后端日志：${abs}`)
  console.log(
    `  窗口内记录 ${recs.length} / 级别 ${JSON.stringify(summarize(recs))}` +
      (parsed.records.length === recs.length
        ? ''
        : `（全文件 ${parsed.records.length} 条，窗口外 ${parsed.records.length - recs.length} 条不参与判定）`)
  )
  console.log(
    `  WARN/ERROR 扫描 ${scanned} / 已登记 ${allowed.length} / 未登记 ${unknown.length} / 非 tracing 行 ${bare.length}` +
      `${parsed.unparsed.length === bare.length ? '' : `（全文件 ${parsed.unparsed.length}）`} / 允许表未命中 ${unused.length} / 整机停顿 ${stalls.length} 次`
  )
  for (const s of stalls) {
    console.log(`  ⏸ [整机停顿] ${s.from} → ${s.to} 静默 ${s.gapSecs}s，恢复瞬间 ${s.artifacts.length} 条：`)
    for (const a of s.artifacts.slice(0, 4)) {
      console.log(`      · [${a.level}] ${a.msg.split('\n')[0].slice(0, 150)}（${a.reason}）`)
    }
  }
  if (stalls.length) {
    // 口径闸先于内容闸（AGENTS 门禁全景 ⑨）：停顿轮里"未登记 7 条 / 未命中 15 条"这两张
    // 清单会把人支使去登记与退役，而正确动作只有一个——重跑。所以这里直接结束，不打内容清单。
    console.error(
      `❌ [FATAL] 本轮不作数：日志里有 ${stalls.length} 次整机停顿（阈值 ${STALL_GAP_SECS}s 静默 + 恢复瞬间成簇），` +
        `停顿期间定时器都不推进 ⇒ 这些 503/超时是冻结的积压，不是任何一侧的回归。` +
        `未登记/未命中清单已按口径闸跳过。处置：确认主机没有并行负载（内存 <2GB 会换页放大，见 RUN-RECIPE §3.36），` +
        `然后重跑这一轮——**不得**把它登记进允许表（那张表的语义是"这条设计内失败会发生"）。`
    )
    process.exit(2)
  }
  for (const u of unknown) {
    console.log(`  ❌ [${u.level}] ${u.ts} ${u.msg.split('\n')[0].slice(0, 200)}`)
  }
  for (const u of bare.slice(0, 20)) {
    console.log(`  ❌ [非 tracing] ${u.ts ?? '（文件开头，无法定时）'} ${u.line.slice(0, 200)}`)
  }
  for (const e of unused) {
    console.log(`  ❌ [允许表未命中] ${e.level} /${e.match}/ —— ${e.why}（本轮没再出现，必须撤销）`)
  }
  const st = gateState({
    file: abs,
    records: recs,
    unparsed: bare,
    unknown,
    unused,
    stalls,
    fileTotal: parsed.records.length
  })
  // 退役通道（批八十五 项 F）：只打提示没有动作 = 没判（AGENTS 门禁全景 ⑩）。
  // 写在判定**之后**、且只在数据集有效（code ≠ 2）时写——日志读不到时"未命中"根本无从谈起。
  if (args.includes('--retire-stale')) {
    if (st.code === 2) {
      console.error('EXIT=2 数据集无效（日志缺失/为空），退役判定不作数，允许表未改动')
      process.exit(2)
    }
    const retired = retireStale(allowPath, unused)
    console.log(
      retired.length
        ? `  🧹 已从允许表退役 ${retired.length} 条：${retired.map((e) => `${e.level}/${e.match}/`).join(' ')}`
        : '  🧹 本轮没有需要退役的条目（允许表逐条都还打得住）'
    )
    // 退役后重算一次：结论必须来自**改动后**的表，而不是改动前那次判定的残留
    const allow2 = loadAllowlist(allowPath)
    const again = classify(parsed.records, allow2, win)
    const st2 = gateState({
      file: abs,
      records: recs,
      unparsed: bare,
      unknown: again.unknown,
      unused: again.unused,
      stalls,
      fileTotal: parsed.records.length
    })
    if (st2.code !== 0) {
      console.error(`❌ 退役后仍有问题（未登记 ${again.unknown.length} 条）：${st2.detail}`)
      process.exit(st2.code)
    }
    console.log(`✅ 退役后复判通过：允许表 ${allow2.length} 条，全部本轮命中`)
    return
  }
  if (st.code !== 0) {
    console.error(`❌ 后端日志判据失败：${st.detail}`)
    process.exit(st.code)
  }
  console.log(`✅ 后端日志判据通过：${st.detail}（允许表 ${allow.length} 条，逐条带理由）`)
}

if (process.argv.includes('--selftest')) selftest()
else main()
