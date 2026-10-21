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
 *
 * 用法：
 *   node tests/e2e/backend-log-audit.mjs --selftest
 *   STEPBY_BACKEND_LOG=D:/.../logs/b81_r2.log node tests/e2e/backend-log-audit.mjs --gate
 *   node tests/e2e/backend-log-audit.mjs --log=... --since=2026-10-20T18:44:00Z --until=...
 *
 * 退出码：0 干净 / 1 有未登记信号或不可解析行 / 2 输入不可用。
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
 */
export function parseLog(text) {
  const records = []
  const unparsed = []
  let cur = null
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(ANSI_RE, '')
    if (!line.trim()) continue
    const m = LINE_RE.exec(line)
    if (m) {
      cur = { ts: m[1], level: m[2], msg: m[3], lines: 1 }
      records.push(cur)
      continue
    }
    // 只认缩进/`at`/行号形态的续行。不能因为"上一条是 ERROR"就把任何裸行都吞进去——
    // panic / stderr 裸输出正是要从 tracing 缝隙里抓出来的东西，吞掉等于判据自盲。
    const continuation = /^\s+at\s|^\s+\d+:\s|^\s{2,}/.test(line)
    if (cur && continuation) {
      cur.msg += `\n${line}`
      cur.lines += 1
    } else {
      unparsed.push(line)
    }
  }
  return { records, unparsed }
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

/** 按级别 + 消息正则匹配允许表；返回未登记项与已登记项（后者保留是为了让汇总能报数）。 */
export function classify(records, allow, { since = null, until = null } = {}) {
  const sinceMs = since ? Date.parse(since) : null
  const untilMs = until ? Date.parse(until) : null
  const unknown = []
  const allowed = []
  let scanned = 0
  for (const r of records) {
    if (r.level !== 'WARN' && r.level !== 'ERROR') continue
    const t = Date.parse(r.ts)
    if (sinceMs !== null && Number.isFinite(t) && t < sinceMs) continue
    if (untilMs !== null && Number.isFinite(t) && t > untilMs) continue
    scanned += 1
    const hit = allow.find((e) => e.level === r.level && e.re.test(r.msg))
    if (hit) allowed.push({ ...r, why: hit.why })
    else unknown.push(r)
  }
  return { unknown, allowed, scanned }
}

function summarize(records) {
  const byLevel = {}
  for (const r of records) byLevel[r.level] = (byLevel[r.level] || 0) + 1
  return byLevel
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

function gateState({ file, records, unparsed, unknown }) {
  if (!fs.existsSync(file)) return { code: 2, detail: `日志不存在：${file}` }
  if (records.length === 0) return { code: 2, detail: `日志为空（没有任何 tracing 记录）：${file}` }
  const bad = unknown.length + unparsed.length
  return {
    code: bad ? 1 : 0,
    detail: `${records.length} 条记录 / 未登记 ${unknown.length} 条 / 非 tracing 行 ${unparsed.length} 条`
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
    const st = gateState({ file: emptyFile, records: [], unparsed: [], unknown: [] })
    check('空日志必须 EXIT=2（没跑 ≠ 跑干净）', st.code === 2, JSON.stringify(st))
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

  if (fails.length) {
    console.error(`SYNTH_FAIL 后端日志判据 ${fails.length} 条：`)
    for (const f of fails) console.error(`  · ${f}`)
    process.exit(1)
  }
  console.log(`SYNTH_OK 后端日志判据 ${ran} 条双向（解析/续行/窗口过滤/窗口时区口径/允许表形状/空日志/未登记必红）`)
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
  try {
    allow = loadAllowlist(opt('allow') || DEFAULT_ALLOW)
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
  const { unknown, allowed, scanned } = classify(parsed.records, allow, {
    since: new Date(sinceMs).toISOString(),
    until: untilMs ? new Date(untilMs).toISOString() : null
  })
  console.log(`后端日志：${abs}`)
  console.log(`  记录 ${parsed.records.length} / 级别 ${JSON.stringify(summarize(parsed.records))}`)
  console.log(
    `  WARN/ERROR 扫描 ${scanned} / 已登记 ${allowed.length} / 未登记 ${unknown.length} / 非 tracing 行 ${parsed.unparsed.length}`
  )
  for (const u of unknown) {
    console.log(`  ❌ [${u.level}] ${u.ts} ${u.msg.split('\n')[0].slice(0, 200)}`)
  }
  for (const u of parsed.unparsed.slice(0, 20)) {
    console.log(`  ❌ [非 tracing] ${u.slice(0, 200)}`)
  }
  const st = gateState({ file: abs, records: parsed.records, unparsed: parsed.unparsed, unknown })
  if (st.code !== 0) {
    console.error(`❌ 后端日志判据失败：${st.detail}`)
    process.exit(st.code)
  }
  console.log(`✅ 后端日志判据通过：${st.detail}（允许表 ${allow.length} 条，逐条带理由）`)
}

if (process.argv.includes('--selftest')) selftest()
else main()
