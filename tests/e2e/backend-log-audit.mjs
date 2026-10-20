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
  const check = (name, cond, detail) => {
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
  console.log(`SYNTH_OK 后端日志判据 ${13} 条双向（解析/续行/窗口/允许表形状/空日志/未登记必红）`)
  process.exit(0)
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) return selftest()
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null
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
  const parsed = parseLog(fs.readFileSync(abs, 'utf8'))
  const { unknown, allowed, scanned } = classify(parsed.records, allow, {
    since: opt('since'),
    until: opt('until')
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
