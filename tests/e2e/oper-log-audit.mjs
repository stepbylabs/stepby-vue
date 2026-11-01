/**
 * 失败操作日志判据（b81 新增）。
 *
 * 背景：产品的**写操作**会落 `sys_oper_log`，失败也落（`status='1'` + `error_msg`）。
 * 但测试收口过去只看 HTTP/断言/Toast——一个被前端吞掉的 500、或某个写接口"看起来 200、
 * 实际在服务端失败并落审计"的形态，不会让任何判据变红。这里把失败写操作变成**逐条登记**：
 *
 *   · 窗口内 `status='1'` 的每条写操作必须能对上一条"期望失败"的负路径用例；
 *   · 对不上 ⇒ `--gate` 红（真实缺陷，而不是在台账里解释掉）；
 *   · 窗口内一条操作日志都没有 ⇒ EXIT=2（没跑/读错库，不得判成"没有失败"）。
 *
 * 与 backend-log-audit 分工：那边判**服务端日志**（WARN/ERROR/panic），这边判**审计事实**
 * （哪次写真的失败了、错误文案是什么）。两者都不是"grep 一下就算看过"。
 *
 * 用法：
 *   node tests/e2e/oper-log-audit.mjs --selftest
 *   node tests/e2e/oper-log-audit.mjs --since='2026-10-20 18:44:00' --gate
 *   node tests/e2e/oper-log-audit.mjs --db=... --since=... --until=... --allow=...
 *   node tests/e2e/oper-log-audit.mjs --since=... --gate --retire-stale
 *
 * 退出码：0 干净 / 1 有未登记失败或未命中登记 / 2 输入不可用、窗口内无操作记录，
 * **或判定窗口与最近一次 deep-e2e 全量轮的自证窗口不相交（本轮不作数，b103 与
 * backend-log-audit 共用 dataset-window 的口径闸）**。后两支都在 `--retire-stale`
 * 之前返回 ⇒ 退役通道不会在"窗口选错"时删掉真在用的登记。
 *
 * 允许表**未命中**条目（b85 项 F）：本轮一条也没打中的登记 ⇒ 判红并必须撤销；带 `until`
 * 的日落豁免过期后结构上再也打不中，同样点名。`--retire-stale` 是真删通道（未命中为空时
 * 不碰文件），与 backend-log-audit / click-failure-audit 同一条纪律：只打提示、
 * 没有动作通道的信号等于没判。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  duplicateWhyGroups,
  makeProducerLive,
  normalizeProducer,
  selfContainedWhyViolation,
  splitUnused
} from './producer-kit.mjs'
// 与 backend-log-audit **共用一份**窗口解析与"与全量轮自证窗口相交"闸（b103）。
// 原先这边没有这道闸：收口跑部分轮窗口时 82 条负路径登记全被报成"未命中 ⇒ 须撤销"，
// 而 `--retire-stale` 只在 code=2 时拒写 ⇒ 照提示做就是把 82 条真在用的登记一次删光。
// b134：不相交文案的**单一入口** `windowGapDetail`（窗口里跑过分段轮时指向"跑一轮全量 deep-e2e"，
// 而不是让人重跑一遍刚跑过的浏览器套件）。两侧脚本都只准 import 这一个文案函数，避免两份实现漂移。
import {
  fmtWindow,
  readFullRunWindow,
  readPartialRunWindow,
  windowGapDetail,
  windowToEpoch,
  windowsOverlap
} from './dataset-window.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../..')
const DEFAULT_DB = path.join(REPO, 'stepby-axum', 'data', 'stepby.db')
const DEFAULT_ALLOW = path.join(HERE, 'oper-log-allowlist.json')
// 条件型豁免的验证与 backend-log-audit 共用 producer-kit（两份实现必漂）
const PRODUCER_LIVE = makeProducerLive(REPO)

const WINDOW_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** 统一窗口格式：接受 ISO `T`/`Z`，落库文本是 UTC 裸时间（与 oper_time 同口径）。 */
export function normalizeWindow(v) {
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim().replace('T', ' ').replace(/Z$/, '')
  return s
}

export function loadAllowlist(file = DEFAULT_ALLOW) {
  let body
  try {
    body = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`失败操作允许表不可用：${e.message}`)
  }
  if (!body || body.version !== 1) throw new Error('oper-log-allowlist.json version 必须为 1')
  if (!Array.isArray(body.entries)) throw new Error('oper-log-allowlist.json entries 必须是数组')
  const list = body.entries.map((e, i) => {
    const at = `entries[${i}]`
    if (!e || typeof e !== 'object') throw new Error(`${at} 不是对象`)
    if (!/^(GET|POST|PUT|DELETE|PATCH)$/.test(e.method || '')) {
      throw new Error(`${at}.method 必须是 HTTP 方法`)
    }
    const whyViolation = selfContainedWhyViolation(e.why)
    if (whyViolation) throw new Error(`${at}.why：${whyViolation}`)
    // 逐个字段编译并**点名是哪个字段**：合在一条 try 里时，url 与 msg 的坏正则抛同一句话，
    // 用例就只能靠"消息里含不含 .msg"来猜（b87 自检当场红在这一条上）。
    const compile = (field, pattern) => {
      try {
        return new RegExp(pattern)
      } catch (err) {
        throw new Error(`${at}.${field} 不是合法正则：${err.message}`)
      }
    }
    const urlRe = compile('url', e.url)
    const errRe = compile('error', e.error)
    let msgRe = null
    if (e.msg !== undefined && (typeof e.msg !== 'string' || !e.msg)) {
      throw new Error(`${at}.msg 给就必须是非空正则字符串`)
    }
    if (e.msg !== undefined) msgRe = compile('msg', e.msg)
    // `until` 是**历史豁免的日落时间**（不含）：只用于"缺陷已修复、但旧窗口审计行仍需定性"的场景。
    // 没有它就只能永久豁免一个端点形态，未来同类信号会被静默吞掉；有了它，新信号照常红。
    if (e.until !== undefined && (typeof e.until !== 'string' || !WINDOW_RE.test(e.until))) {
      throw new Error(`${at}.until 必须是 YYYY-MM-DD HH:MM:SS`)
    }
    return {
      method: e.method,
      url: String(e.url),
      urlRe,
      error: String(e.error),
      errRe,
      msg: e.msg,
      msgRe,
      until: e.until || null,
      // 条件型豁免锚点（b87）：这条失败只在某个条件成立时才产生，"本轮没出现"不是它作废的证据。
      // 挂锚点 ⇒ 未命中时先验证生产者是否还在源码里；不挂 ⇒ 照旧进 unused（判红并可退役）。
      producer: normalizeProducer(e.producer, at),
      why: String(e.why).trim()
    }
  })
  // 集合级判据（b87）：同表内两条理由逐字相同 ⇒ 装载即抛。
  // "重复文案组数 0"原先只是 AGENTS 里的一次人工测量，没有任何锁——下一批复制粘贴同一句话不会红。
  const dups = duplicateWhyGroups(list)
  if (dups.length) {
    throw new Error(
      `oper-log-allowlist.json 有 ${dups.length} 组逐字相同的 why（登记表必须逐条自足，共用文案等于只登记了一次）：` +
        dups
          .slice(0, 3)
          .map(([t, c]) => `${c} 条 × 「${t.slice(0, 40)}」`)
          .join(' ｜ ')
    )
  }
  return list
}

/** 从审计的 json_result 里取业务 msg（脱敏后的响应体）；非 JSON/缺字段一律返回空串。 */
export function businessMsg(row) {
  try {
    const body = JSON.parse(row.json_result || '{}')
    return typeof body?.msg === 'string' ? body.msg : ''
  } catch {
    return ''
  }
}

export function findFailures(db, since, until) {
  return db
    .prepare(
      `SELECT oper_id, request_method, oper_url, oper_name, error_msg, json_result, oper_time
       FROM sys_oper_log
       WHERE status = '1' AND substr(oper_time, 1, 19) >= ? AND substr(oper_time, 1, 19) <= ?
       ORDER BY oper_time, oper_id`
    )
    .all(since, until)
}

export function countOps(db, since, until) {
  // 秒级窗口：落库文本带 9 位小数秒（sea-orm/PG 口径），直接比较字符串会把 `until` 当秒的
  // `xx:xx:00.123` 判到窗口外——截到秒再比，窗口端点自身才算"在内"。
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM sys_oper_log WHERE substr(oper_time, 1, 19) >= ? AND substr(oper_time, 1, 19) <= ?`
    )
    .get(since, until).c
}

/**
 * 逐条对账：命中/未登记/**本轮未命中的条目**。
 *
 * `unused` 这一支是批八十五 项 F 补的（与 backend-log-audit / click-failure-audit /
 * endpoint-coverage 同一条纪律）：允许表是**本轮对账**，不是永久白名单。
 * 只判"未登记的必须红"，条目会随缺陷修复越积越多，最后没人敢删。
 * 用**条目对象身份**做集合键而不是拼字符串：`urlRe`/`errRe` 是 RegExp，`String(re)` 会把
 * `/x/g` 与 `/x/` 分得很清，但拼串一旦改动（加字段、改分隔符）两处口径就漂——
 * 身份比对没有可漂的表示层。
 */
export function classify(rows, allow, { verify = PRODUCER_LIVE } = {}) {
  const unknown = []
  const allowed = []
  const matched = new Set()
  for (const r of rows) {
    // `error_msg` 在多数写失败里只有 "HTTP 400"（中间件只拿到状态码），业务原因在
    // `json_result.msg`。允许表带 `msg` 时必须同时命中，避免"该端点任何 400 都算设计内"。
    const msg = businessMsg(r)
    const hit = allow.find(
      (e) =>
        e.method === r.request_method &&
        e.urlRe.test(r.oper_url || '') &&
        e.errRe.test(r.error_msg || '') &&
        (!e.msgRe || e.msgRe.test(msg)) &&
        (!e.until || String(r.oper_time || '').slice(0, 19) < e.until)
    )
    if (hit) {
      matched.add(hit)
      allowed.push({ ...r, why: hit.why, business: msg })
    } else unknown.push({ ...r, business: msg })
  }
  const staleAll = allow.filter((e) => !matched.has(e))
  const { unused, held } = splitUnused(staleAll, verify)
  return { unknown, allowed, unused, held }
}

/**
 * 把本轮未命中的条目从允许表删掉（动作通道；空集不碰文件）。
 * 写回原始 JSON 形状，绝不把编译出的 RegExp 落进仓库。
 */
export function retireStale(file, unused) {
  if (!unused.length) return []
  const body = JSON.parse(fs.readFileSync(file, 'utf8'))
  const drop = new Set(unused.map((e) => JSON.stringify([e.method, e.url, e.error, e.msg ?? null, e.until ?? null])))
  const kept = []
  const removed = []
  for (const e of body.entries) {
    const k = JSON.stringify([e.method, e.url, e.error, e.msg ?? null, e.until ?? null])
    if (drop.has(k)) removed.push(e)
    else kept.push(e)
  }
  fs.writeFileSync(file, JSON.stringify({ ...body, entries: kept }, null, 2) + '\n', 'utf8')
  return removed
}

/** 输入可用性：窗口方向、库存在、窗口内确有操作记录（否则"零失败"是没证据）。 */
export function gateState({
  dbFile,
  since,
  until,
  opsCount,
  unknown,
  unused = [],
  win = null,
  dsWin = null,
  partialWin = null
}) {
  if (!fs.existsSync(dbFile)) return { code: 2, detail: `运行库不存在：${dbFile}` }
  if (!WINDOW_RE.test(since || '') || !WINDOW_RE.test(until || '')) {
    return { code: 2, detail: `窗口必须是 YYYY-MM-DD HH:MM:SS（实际 ${since} .. ${until}）` }
  }
  if (since >= until) return { code: 2, detail: `窗口方向可疑：${since} .. ${until}` }
  // 口径闸（b103）：判定窗口与最近一次 deep-e2e 全量轮的自证窗口**不相交**时，这一把里
  // 根本没有浏览器轮次流量 ⇒ 允许表里那些负路径 witness 结构上不可能出现，
  // "未命中 N 条"是**窗口选错**，不是豁免该撤销。取向是加闸不是放宽：UNRUN(2)，
  // 且退役通道在 code=2 时本来就拒写（这正是它保护不可逆动作的那条腿）。
  // 排在"零操作"之前：两者同时成立时报"没跑/读错库"会把人支使去查库，
  // 而正确答案是"窗口没盖住那轮"。立案事实见 dataset-window.mjs 的 windowsOverlap。
  if (win && !windowsOverlap(win, dsWin)) {
    return { code: 2, detail: windowGapDetail(win, dsWin, partialWin) }
  }
  if (Number(opsCount) === 0) return { code: 2, detail: `窗口内没有任何操作日志（没跑/读错库，不得判成零失败）` }
  const bad = unknown.length + unused.length
  return {
    code: bad ? 1 : 0,
    detail: `窗口内操作 ${opsCount} 条 / 失败未登记 ${unknown.length} 条 / 允许表未命中 ${unused.length} 条`
  }
}

function selftest() {
  const fails = []
  // 条数由脚本自己数（同 backend-log-audit）：硬编码的用例数加一条就变成假账
  let ran = 0
  const check = (name, cond, detail) => {
    ran++
    if (!cond) fails.push(`${name}${detail ? `：${detail}` : ''}`)
  }
  // 临时夹具库落**系统临时目录**（与 build-freshness / endpoint-coverage / capture-kit 同口径）。
  // 原先写在 tests/e2e 里：自检一旦在中途抛错，第 597 行那句清理就跑不到，于是工作树里留下
  // 未跟踪的合成 SQLite 库（b87 实测留下 4 个 `_tmp_oper_*` 目录），下一次 `git add -A`
  // 就把夹具提进仓——判据自己成了噪声源。清理挂 process 'exit' 钩子，异常与 process.exit 两条路都跑。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oper-log-audit-'))
  let fixtureDb = null
  process.on('exit', () => {
    try {
      fixtureDb?.close()
    } catch {
      /* 已关闭 */
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* Windows 下文件仍被占用时留给系统回收，不得让清理反过来把自检判成失败 */
    }
  })
  check('临时夹具必须落在系统临时目录，不得写进 tests/e2e', !dir.startsWith(HERE), dir)
  const dbFile = path.join(dir, 'ops.db')
  const db = new DatabaseSync(dbFile)
  fixtureDb = db
  db.exec(`CREATE TABLE sys_oper_log (
    oper_id INTEGER PRIMARY KEY, request_method TEXT, oper_url TEXT, oper_name TEXT,
    error_msg TEXT, json_result TEXT, oper_time TEXT, status TEXT)`)
  const ins = (m, u, e, msg, t, s) =>
    db
      .prepare(
        'INSERT INTO sys_oper_log (request_method,oper_url,oper_name,error_msg,json_result,oper_time,status) VALUES (?,?,?,?,?,?,?)'
      )
      .run(m, u, 'admin', e, msg ? JSON.stringify({ code: 400, msg }) : '', t, s)
  ins('POST', '/system/post', 'HTTP 400', '岗位编码已存在', '2026-10-20 19:01:14', '1')
  ins(
    'POST',
    '/system/file/upload',
    'HTTP 400',
    '无法识别的图片格式，仅支持 jpg/jpeg/png/gif',
    '2026-10-20 19:05:59',
    '1'
  )
  ins('POST', '/system/user', '权限拒绝：缺少所需权限 system:user:add', '', '2026-10-20 18:52:10', '1')
  ins('POST', '/system/notice', '', '', '2026-10-20 18:50:00', '0') // 成功行不参与
  // 端点自身必须算在窗口内：落库是 9 位小数秒，按字符串直接比 `<= 20:00:00` 会把它排除。
  ins('PUT', '/system/notice', '', '', '2026-10-20 20:00:00.123456789', '0')
  ins('POST', '/system/post', 'boom', '', '2026-10-19 00:00:00', '1') // 窗口外
  const allow = [
    { method: 'POST', urlRe: /^\/system\/post$/, errRe: /^HTTP 400$/, msgRe: /岗位编码已存在/, why: '唯一性负路径' },
    {
      method: 'POST',
      urlRe: /^\/system\/file\/upload$/,
      errRe: /^HTTP 400$/,
      msgRe: /无法识别的图片格式/,
      why: 'magic bytes 负路径'
    },
    {
      method: 'POST',
      urlRe: /^\/system\/user$/,
      errRe: /权限拒绝/,
      msgRe: null,
      why: '越权负路径（中间件在响应体之前拒绝，无 json_result）'
    }
  ]
  const since = '2026-10-20 18:44:00'
  const until = '2026-10-20 20:00:00'
  const failures = findFailures(db, since, until)
  check('只取窗口内失败行（成功行/窗口外不计）', failures.length === 3, JSON.stringify(failures.map((r) => r.oper_id)))
  const c = classify(failures, allow)
  check('三条设计内失败全部命中允许表', c.allowed.length === 3 && c.unknown.length === 0, JSON.stringify(c))
  // 同一端点、同一 HTTP 状态码但业务原因不同 ⇒ 不得被允许表吞掉（否则允许表退化成
  // "这个接口任何 400 都算设计内"，真实缺陷会被洗绿）。
  const wrongReason = {
    oper_id: 1000,
    request_method: 'POST',
    oper_url: '/system/post',
    error_msg: 'HTTP 400',
    json_result: JSON.stringify({ code: 400, msg: '数据库连接失败' }),
    oper_time: '2026-10-20 19:10:00'
  }
  const cWrong = classify([...failures, wrongReason], allow)
  check(
    '同端点同状态码但业务原因不同必须报未登记',
    cWrong.unknown.length === 1 && cWrong.unknown[0].business === '数据库连接失败',
    JSON.stringify(cWrong.unknown)
  )
  const missingJson = { ...wrongReason, oper_id: 1001, json_result: '' }
  const cMissing = classify([...failures, missingJson], allow)
  check('允许表要求 msg 但审计缺 json_result 时必须报（不得退化成只看状态码）', cMissing.unknown.length === 1)

  // 日落豁免：同一行在 until 之前放行、之后必须重新变红（否则一次豁免会永久吞掉同类信号）。
  const sunset = [
    {
      method: 'POST',
      urlRe: /^\/system\/post$/,
      errRe: /^HTTP 400$/,
      msgRe: /岗位编码已存在/,
      until: '2026-10-20 19:05:00',
      why: '历史豁免'
    }
  ]
  const sunsetRow = {
    oper_id: 1002,
    request_method: 'POST',
    oper_url: '/system/post',
    error_msg: 'HTTP 400',
    json_result: JSON.stringify({ code: 400, msg: '岗位编码已存在' }),
    oper_time: '2026-10-20 19:04:59'
  }
  const early = sunsetRow
  const late = { ...sunsetRow, oper_id: 1003, oper_time: '2026-10-20 19:05:00' }
  check('until 之前的历史行可豁免', classify([early], sunset).allowed.length === 1)
  check('until 当秒起（不含）必须重新变红', classify([late], sunset).unknown.length === 1)

  // 允许表**未命中**对账 + 退役通道（b85 项 F，与 backend-log-audit 同一条纪律）。
  // 用临时文件跑退役，绝不碰仓库里那份（自检不得改写判据输入）。
  {
    const tmp = path.join(HERE, '_tmp_oper_retire.json')
    fs.writeFileSync(
      tmp,
      JSON.stringify(
        {
          version: 1,
          entries: [
            {
              method: 'POST',
              url: '^/system/post$',
              error: '^HTTP 400$',
              msg: '岗位编码已存在',
              until: '2026-10-20 19:05:00',
              why: '合成夹具的历史豁免：这条 400 来自已修复的重复岗位编码缺陷，只在旧窗口里存在'
            }
          ]
        },
        null,
        2
      )
    )
    const a = loadAllowlist(tmp)
    const cls = classify([late], a)
    check(
      '过期日落豁免条目必须同时报"未登记"和"未命中"（结构上再也打不中）',
      cls.unused.length === 1 && cls.unknown.length === 1
    )
    check('命中的条目不得算未命中（否则退役通道会删掉活条目）', classify([early], a).unused.length === 0)
    check(
      '未命中必须把判定拉成 EXIT=1（只打提示没有动作=没判）',
      gateState({
        dbFile: tmp,
        since: '2026-10-20 19:00:00',
        until: '2026-10-20 20:00:00',
        opsCount: 5,
        unknown: [],
        unused: cls.unused
      }).code === 1
    )
    const removed = retireStale(tmp, cls.unused)
    const after = JSON.parse(fs.readFileSync(tmp, 'utf8'))
    check(
      '退役通道必须真删掉未命中条目并留痕',
      removed.length === 1 && after.entries.length === 0,
      `removed=${removed.length}`
    )
    check(
      '退役写回必须是原始形状（不得把编译出的 RegExp 落进仓库）',
      !('urlRe' in (after.entries[0] ?? {})) && Array.isArray(after.entries)
    )
    const snap = fs.readFileSync(tmp, 'utf8')
    retireStale(tmp, [])
    check('没有未命中时不得改动文件（允许表已被删空也要保住原始字节）', fs.readFileSync(tmp, 'utf8') === snap)
    fs.unlinkSync(tmp)
  }
  // 条件型豁免通道（b87，收台账 b86 §17 N-1）：与 backend-log-audit 共用 producer-kit，
  // 这一组双向用例判的是"未命中"这一条判定本身不再误伤条件型条目，同时**不得反过来把
  // 真正的废条目洗成 held**——所以"锚点找不到""文件读不到""没挂锚点"三支都必须照旧红。
  {
    const mk = (entries) => {
      const f = path.join(HERE, '_tmp_oper_producer.json')
      fs.writeFileSync(f, JSON.stringify({ version: 1, entries }, null, 2))
      return f
    }
    const base = { method: 'POST', url: '^/system/quota$', error: '^HTTP 429$', why: '配额超限才会产生（合成夹具）' }
    const rowNever = {
      request_method: 'DELETE',
      oper_url: '/nothing',
      error_msg: 'HTTP 404',
      json_result: '',
      oper_time: '2026-10-20 19:10:00'
    }
    const srcDir = path.join(HERE, '_tmp_oper_prod')
    fs.mkdirSync(srcDir, { recursive: true })
    const srcFile = path.join(srcDir, 'svc.rs')
    fs.writeFileSync(srcFile, 'pub async fn fire() {}\n')
    const verify = makeProducerLive(HERE)
    const noProducer = classify([rowNever], loadAllowlist(mk([base])), { verify })
    check(
      '没挂锚点的未命中条目必须照旧进 unused（新通道不得成为绕过判定的后门）',
      noProducer.unused.length === 1 && noProducer.held.length === 0,
      JSON.stringify({ u: noProducer.unused.length, h: noProducer.held.length })
    )
    const live = classify(
      [rowNever],
      loadAllowlist(mk([{ ...base, producer: { file: '_tmp_oper_prod/svc.rs', contains: 'pub async fn fire' } }])),
      { verify }
    )
    check(
      '生产者锚点仍在源码里 ⇒ 记 held、不得判红、不得进退役集合',
      live.held.length === 1 && live.unused.length === 0,
      JSON.stringify({ u: live.unused.length, h: live.held.length })
    )
    check(
      'held 必须带可核对的验证凭据（打给人看的理由不能是空的）',
      typeof live.held[0]?.heldNote === 'string' && live.held[0].heldNote.includes('锚点已核'),
      String(live.held[0]?.heldNote)
    )
    check(
      'held 不得把判定拉成 EXIT=1（本轮没出现的条件型条目不是失败）',
      gateState({
        dbFile: srcFile,
        since: '2026-10-20 19:00:00',
        until: '2026-10-20 20:00:00',
        opsCount: 5,
        unknown: [],
        unused: live.unused
      }).code === 0
    )
    const deadAnchor = classify(
      [rowNever],
      loadAllowlist(mk([{ ...base, producer: { file: '_tmp_oper_prod/svc.rs', contains: 'pub async fn gone' } }])),
      { verify }
    )
    check(
      '锚点已从源码里消失 ⇒ 条目确实过期，必须回到 unused 并写明理由（生产者被删掉时豁免就该撤销）',
      deadAnchor.unused.length === 1 && /找不到锚点/.test(String(deadAnchor.unused[0]?.heldNote)),
      JSON.stringify(deadAnchor.unused.map((e) => e.heldNote))
    )
    const missingFile = classify(
      [rowNever],
      loadAllowlist(mk([{ ...base, producer: { file: '_tmp_oper_prod/nope.rs', contains: 'x' } }])),
      { verify }
    )
    check(
      '锚点文件读不到 ⇒ 验证不通过，不得被读成"生产者还在"（fail-closed）',
      missingFile.unused.length === 1 && missingFile.held.length === 0
    )
    const badShapes = [
      ['空 contains（includes(空串) 恒真 = 判据关掉）', { file: '_tmp_oper_prod/svc.rs', contains: '' }],
      ['file 不是字符串', { file: 1, contains: 'x' }],
      ['producer 不是对象', 'svc.rs']
    ]
    let shapeThrown = 0
    for (const [name, producer] of badShapes) {
      try {
        loadAllowlist(mk([{ ...base, producer }]))
      } catch {
        shapeThrown += 1
        continue
      }
      fails.push(`producer 形状坏了必须抛错却没抛：${name}`)
    }
    check('三种坏形状（空锚点/非字符串/非对象）都必须在装载时就抛', shapeThrown === badShapes.length)
    fs.unlinkSync(path.join(HERE, '_tmp_oper_producer.json'))
    fs.rmSync(srcDir, { recursive: true, force: true })
    // 真实树正控（非恒真版）：装载真表 + 逐条核对锚点 + 断条目量级没坏。
    // ⚠ 本表当前**没有**条件型条目——b86 窗口（覆盖 deep + main + a11y + 两次 action-inventory）
    // 实测 84 条逐条命中、未命中 0 条，说明它们全部是"用例每轮刻意制造的负路径"。
    // 所以这里不把某条硬编成 producer（那是给不可能发生的分支编理由，见 AGENTS 前言 ⑯(c)），
    // 而是把"真表能装载、形状与条目量级没坏、已挂的锚点必须逐条验证得过"钉住：
    // 将来第一条真条件型信号进来时，直接挂锚点即可，不会再被"本轮没出现 ⇒ 撤销"误删。
    const realAllow = loadAllowlist()
    const anchored = realAllow.filter((e) => e.producer)
    check(
      `真实允许表装载后条目量级不得塌（当前 ${realAllow.length} 条）`,
      realAllow.length >= 60,
      `实际 ${realAllow.length}`
    )
    check(
      `真实允许表的 ${anchored.length} 条 producer 锚点必须逐条在源码里找得到`,
      anchored.every((e) => PRODUCER_LIVE(e.producer).live),
      JSON.stringify(
        anchored.filter((e) => !PRODUCER_LIVE(e.producer).live).map((e) => [e.url, PRODUCER_LIVE(e.producer).note])
      )
    )
    // 反向对照（b149）：锚点的解析根是**生产路径**用的 REPO，而合成夹具的锚点相对 HERE。
    // 这两条如果共用一个 verifier，"真实表锚点是否存在"就取决于自检顺手把哪个根传进去——
    // b149 第一条真实锚点（`stepby-axum/src/handler/sys_backup_handler.rs`）正是被这一支
    // 用 HERE 解析成 `tests/e2e/stepby-axum/…` ENOENT 而判红的：红得对（它确实抓住了"锚点
    // 在生产路径上读不到"这一型），但抓的是**自检自己传错根**，不是产品的锚点坏了。
    // 所以这里必须钉住"换成夹具根时至少有一条读不到"，证明解析根是承重的、不是巧合放行。
    const wrongRoot = makeProducerLive(HERE)
    check(
      '同一批锚点换成夹具根解析必须至少有一条读不到（证明解析根是承重的，不是"路径恰好两边都在"）',
      anchored.length > 0 && anchored.some((e) => !wrongRoot(e.producer).live),
      JSON.stringify(anchored.map((e) => [e.url, wrongRoot(e.producer).live]))
    )
    check(
      '每条允许表条目都必须自带 why（跨条目指代的理由一旦条目集合变了就指向别处）',
      realAllow.every((e) => (e.why || '').trim().length >= 10)
    )
  }
  const unknownRow = {
    oper_id: 999,
    request_method: 'POST',
    oper_url: '/system/role',
    error_msg: 'HTTP 500',
    json_result: '',
    oper_time: '2026-10-20 19:10:00'
  }
  const c2 = classify([...failures, unknownRow], allow)
  check('未登记失败必须报', c2.unknown.length === 1 && c2.unknown[0].oper_id === 999)
  check('窗口内操作计数含成功行且含端点秒', countOps(db, since, until) === 5, String(countOps(db, since, until)))
  const clean = gateState({ dbFile, since, until, opsCount: 5, unknown: [] })
  check('干净窗口 EXIT=0', clean.code === 0, JSON.stringify(clean))
  const bad = gateState({ dbFile, since, until, opsCount: 5, unknown: [unknownRow] })
  check('未登记失败 EXIT=1', bad.code === 1, JSON.stringify(bad))
  const empty = gateState({
    dbFile,
    since: '2026-01-01 00:00:00',
    until: '2026-01-02 00:00:00',
    opsCount: 0,
    unknown: []
  })
  check('窗口内零操作 EXIT=2（没跑 ≠ 零失败）', empty.code === 2, JSON.stringify(empty))
  const reversed = gateState({ dbFile, since: until, until: since, opsCount: 4, unknown: [] })
  check('窗口方向反了 EXIT=2', reversed.code === 2, JSON.stringify(reversed))
  // 口径闸（b103）：与 backend-log-audit 共用 dataset-window 的实现。这一组的每条都必须
  // 能独立判红——尤其是"正控"：窗口盖住那轮时，同样的未命中必须照常判 1，
  // 否则口径闸就成了"把所有未命中洗成不作数"的新通道（AGENTS ⑯(c) 那一族）。
  {
    const dsWin = { sinceMs: Date.parse('2026-10-20T09:00:00Z'), untilMs: Date.parse('2026-10-20T10:00:00Z') }
    const before = { sinceMs: Date.parse('2026-10-20T01:00:00Z'), untilMs: Date.parse('2026-10-20T02:00:00Z') }
    const disjoint = gateState({
      dbFile,
      since,
      until,
      opsCount: 5,
      unknown: [],
      unused: [allow[0]],
      win: before,
      dsWin
    })
    check(
      '窗口与全量轮自证窗口不相交 ⇒ EXIT=2 且点名"不相交"（不得报允许表未命中、更不得据此退役）',
      disjoint.code === 2 && /不相交/.test(disjoint.detail),
      JSON.stringify(disjoint)
    )
    const disjointEmpty = gateState({ dbFile, since, until, opsCount: 0, unknown: [], win: before, dsWin })
    check(
      '不相交且窗口内零操作 ⇒ 报"窗口选错"而不是"没跑/读错库"（口径闸先于内容闸）',
      disjointEmpty.code === 2 && /不相交/.test(disjointEmpty.detail),
      JSON.stringify(disjointEmpty)
    )
    const covered = gateState({
      dbFile,
      since,
      until,
      opsCount: 5,
      unknown: [],
      unused: [allow[0]],
      win: { sinceMs: Date.parse('2026-10-20T09:10:00Z'), untilMs: Date.parse('2026-10-20T09:20:00Z') },
      dsWin
    })
    check(
      '正控：窗口盖住那轮时同样的未命中必须照常判 1（口径闸不得把真信号洗绿）',
      covered.code === 1,
      JSON.stringify(covered)
    )
    const noDs = gateState({
      dbFile,
      since,
      until,
      opsCount: 5,
      unknown: [],
      unused: [allow[0]],
      win: before,
      dsWin: null
    })
    check('数据集取不到时不得触发口径闸（否则"缺数据集"被报成"窗口不对"）', noDs.code === 1, JSON.stringify(noDs))
    const nanWin = gateState({
      dbFile,
      since,
      until,
      opsCount: 5,
      unknown: [],
      unused: [allow[0]],
      win: { sinceMs: NaN, untilMs: NaN },
      dsWin
    })
    check('窗口不可解析时不得触发口径闸（NaN 不得读成"不相交"）', nanWin.code === 1, JSON.stringify(nanWin))
    // b134：不相交但窗口里**确实跑过分段轮**时，结论仍是 UNRUN，指向的动作必须换成
    // "跑一轮全量 deep-e2e"——否则会让人重跑一遍刚跑过的浏览器套件（AGENTS ⑨ 文案指错方向）。
    const partial = {
      sinceMs: Date.parse('2026-10-20T01:10:00Z'),
      untilMs: Date.parse('2026-10-20T01:20:00Z'),
      modules: 1,
      source: '合成夹具'
    }
    const partialGap = gateState({
      dbFile,
      since,
      until,
      opsCount: 5,
      unknown: [],
      unused: [allow[0]],
      win: before,
      dsWin,
      partialWin: partial
    })
    check(
      '不相交且窗口里跑过分段轮 ⇒ 文案点名"分段轮"并要求跑一轮全量 deep-e2e（不得让人重跑浏览器套件）',
      partialGap.code === 2 &&
        /分段轮/.test(partialGap.detail) &&
        /全量/.test(partialGap.detail) &&
        !/先跑一轮浏览器套件/.test(partialGap.detail),
      JSON.stringify(partialGap)
    )
    const partialElsewhere = gateState({
      dbFile,
      since,
      until,
      opsCount: 5,
      unknown: [],
      unused: [allow[0]],
      win: before,
      dsWin,
      partialWin: {
        ...partial,
        sinceMs: Date.parse('2026-10-19T01:00:00Z'),
        untilMs: Date.parse('2026-10-19T02:00:00Z')
      }
    })
    check(
      '分段轮窗口与判定窗口不相交 ⇒ 必须退回旧文案（别处的分段轮不得当成本轮证据）',
      partialElsewhere.code === 2 &&
        /先跑一轮浏览器套件/.test(partialElsewhere.detail) &&
        !/分段轮/.test(partialElsewhere.detail),
      JSON.stringify(partialElsewhere)
    )
  }
  // 坏形状必须**因为自己那一处**被拒：夹具理由一律写成自足的长句，否则"方法坏了"会被
  // "理由太短"抢先抛出而照样 non-zero ⇒ 用例看着绿、实际没约束到被测那一支
  // （AGENTS 前言 ⑩ 的"崩掉同样非零，但『红在哪条』这条信息丢了"，同一族）。
  const OK_WHY = '这是一条自足的理由，写明为什么这次失败是设计内'
  let badIdx = 0
  for (const [name, entries, expectInMsg] of [
    ['方法表外', [{ method: 'TRACE', url: 'x', error: 'x', why: OK_WHY }], '.method'],
    ['缺理由', [{ method: 'POST', url: 'x', error: 'x', why: '' }], '.why'],
    ['坏正则', [{ method: 'POST', url: '(', error: 'x', why: OK_WHY }], '正则'],
    ['坏 msg 正则', [{ method: 'POST', url: 'x', error: 'x', msg: '(', why: OK_WHY }], '.msg'],
    ['坏 until', [{ method: 'POST', url: 'x', error: 'x', until: '2026-10-20', why: OK_WHY }], '.until'],
    // b87 起三处登记表共用 producer-kit 的同一条自足性判据
    ['"同上"类跨条目指代', [{ method: 'POST', url: 'x', error: 'x', why: `${OK_WHY}，同上一条` }], '同上'],
    ['以"见上条"开头', [{ method: 'POST', url: 'x', error: 'x', why: '见上条同一判据，只是端点不同' }], '指代'],
    ['短到没有信息量', [{ method: 'POST', url: 'x', error: 'x', why: '本可自动化，短' }], '个字符'],
    [
      '同表内两条逐字相同的理由',
      [
        { method: 'POST', url: '^/a$', error: 'x', why: OK_WHY },
        { method: 'DELETE', url: '^/b$', error: 'x', why: OK_WHY }
      ],
      '组'
    ]
  ]) {
    let threw = ''
    // 文件名只用序号：用例名里有引号与中文，Windows 上直接 ENOENT（b87 实测踩过）
    const tmp = path.join(dir, `allow_bad_${++badIdx}.json`)
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries }))
    try {
      loadAllowlist(tmp)
    } catch (e) {
      threw = String(e.message)
    } finally {
      fs.unlinkSync(tmp)
    }
    check(`允许表坏形状必须拒绝：${name}`, threw.includes(expectInMsg), `抛出的话是「${threw}」`)
  }
  // 正控：指向**测试用例**的"参见"不是跨条目指代，必须放行（误伤会逼人把理由写短）
  {
    const tmp = path.join(dir, 'allow_ok_xref.json')
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        version: 1,
        entries: [
          {
            method: 'POST',
            url: '^/system/backup/self-export$',
            error: '^权限拒绝$',
            why: '由权限中间件在写出响应体之前拒绝，参见 M90 的 403/404 前后配对断言'
          }
        ]
      })
    )
    let threw = ''
    try {
      loadAllowlist(tmp)
    } catch (e) {
      threw = String(e.message)
    } finally {
      fs.unlinkSync(tmp)
    }
    check('合法"参见某用例"的理由必须放行（正控，防判据扩大化）', threw === '', `抛出的话是「${threw}」`)
  }
  // 真实树正控：已提交的允许表必须装载得过（新判据把存量真表洗红就是判据坏了，不是数据坏了）
  {
    const loaded = loadAllowlist()
    check(
      '真实允许表在新自足性判据下必须装载得过',
      loaded.length >= 60,
      `装载 ${loaded.length} 条（b87 修掉了那条以"同上一条"开头的理由）`
    )
  }
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
  check(
    '自检收尾后 tests/e2e 里不得有任何 _tmp_oper_* 残留（历史遗留也必须被这条抓到）',
    !fs.readdirSync(HERE).some((n) => n.startsWith('_tmp_oper_')),
    fs
      .readdirSync(HERE)
      .filter((n) => n.startsWith('_tmp_oper_'))
      .join(', ')
  )
  if (fails.length) {
    console.error(`SYNTH_FAIL 失败操作判据 ${fails.length} 条：`)
    for (const f of fails) console.error(`  · ${f}`)
    process.exit(1)
  }
  console.log(
    `SYNTH_OK 失败操作日志判据 ${ran} 条双向（窗口/成功行排除/业务 msg 精度/允许表/日落豁免/未命中对账/退役通道/未登记必红/零操作与反向窗口必拒/窗口相交口径闸）`
  )
  process.exit(0)
}

function main() {
  const args = process.argv.slice(2)
  // 注：`--selftest` 的派发**只在文件末尾那一条**（`if (...) selftest() else main()`）。
  // 原先这里还有一条同名派发，而 main() 只可能在 else 分支被调用 ⇒ 永远走不到，
  // 改它的人会以为改了派发逻辑而实际什么都没发生（旗标纪律扫描 `e2e_flag_discipline.py`
  // 的"同一脚本不得有两条 --selftest 派发"就是为此立的）。
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null
  // 用法说明里承诺了 `--gate`，而上一版代码**没有任何读点**（旗标纪律扫描器 R1 报的）：
  // 加了和不加行为一致，等于对调用者撒了个"这次是你要求判定的"的谎。现在要求显式声明：
  // 不给 ⇒ EXIT=2（不作结论），给了 ⇒ 判定。两处既有调用者（run-gates 的 `operlog`、
  // RUN-RECIPE 的收口命令）本来就带 `--gate`，所以这一改不会把任何现有闸变松。
  if (!args.includes('--gate')) {
    console.error('EXIT=2 必须显式加 --gate（本判据要求调用者声明这次要的是判定；未加 ⇒ 不作结论）')
    process.exit(2)
  }
  const dbFile = path.resolve(opt('db') || DEFAULT_DB)
  const since = normalizeWindow(opt('since') || process.env.STEPBY_OPER_SINCE || '')
  const untilGiven = normalizeWindow(opt('until') || process.env.STEPBY_OPER_UNTIL || '')
  const until = untilGiven || '9999-12-31 23:59:59'
  if (!since) {
    console.error('EXIT=2 必须给 --since=（或 STEPBY_OPER_SINCE，UTC，与 oper_time 同口径；窗口不得退化成"不设限"）')
    process.exit(2)
  }
  if (!fs.existsSync(dbFile)) {
    console.error(`EXIT=2 运行库不存在：${dbFile}`)
    process.exit(2)
  }
  let allow
  try {
    allow = loadAllowlist(opt('allow') || DEFAULT_ALLOW)
  } catch (e) {
    console.error(`EXIT=2 ${e.message}`)
    process.exit(2)
  }
  const db = new DatabaseSync(dbFile)
  let rows
  let opsCount
  try {
    opsCount = countOps(db, since, until)
    rows = findFailures(db, since, until)
  } finally {
    db.close()
  }
  const { unknown, allowed, unused, held } = classify(rows, allow)
  // 口径闸的输入：判定窗口 + 最近一次 deep-e2e **全量**轮的自证窗口（后者可能取不到 ⇒ null，
  // 此时那一支不得触发——"缺数据集"不得被报成"窗口不对"）。
  const winMs = { sinceMs: windowToEpoch(since), untilMs: untilGiven ? windowToEpoch(untilGiven) : null }
  const fromDs = readFullRunWindow(HERE)
  const dsWin = fromDs ? { sinceMs: windowToEpoch(fromDs.since), untilMs: windowToEpoch(fromDs.until) } : null
  // 只有"窗口里跑过分段轮"时才换文案（结论仍是 UNRUN）：否则会让人重跑一遍刚跑过的套件
  const partialWin = readPartialRunWindow(HERE)
  console.log(`失败操作日志：${dbFile}`)
  console.log(
    `  窗口 ${since} .. ${until}；操作 ${opsCount} 条；失败 ${rows.length} 条；已登记 ${allowed.length} / 未登记 ${unknown.length} / 允许表未命中 ${unused.length} / 条件型未触发但生产者仍在 ${held.length}`
  )
  if (dsWin) console.log(`  全量轮自证窗口：${fmtWindow(dsWin)}（口径闸输入；不相交时本轮不作数）`)
  // 判定排在**逐条清单之前**（AGENTS ⑨ 口径闸先于内容闸）：判定不可用时（窗口不相交 / 零操作 /
  // 库与窗口形状坏），把"允许表未命中 82 条"逐条列出来只会把人支使去撤销真在用的登记——
  // backend-log-audit 早在 b88 就是这个形状，这边 b103 才对齐。
  const st = gateState({ dbFile, since, until, opsCount, unknown, unused, win: winMs, dsWin, partialWin })
  if (st.code === 2) {
    console.error(`❌ 失败操作判据不作数：${st.detail}`)
    process.exit(2)
  }
  for (const u of unknown) {
    console.log(`  ❌ ${u.request_method} ${u.oper_url} [${u.oper_time}] ${String(u.error_msg || '').slice(0, 160)}`)
  }
  // 条件型豁免：这条失败只在某个条件成立时才产生（配额超限、依赖抖动、真的慢过一次）。
  // 本轮没出现**不是**它作废的证据——撤销的后果是条件再次成立时判红，把人支使去补回同一句理由。
  // 只有生产者锚点经源码核实仍在，才走这一支；验证不过一律回到 unused 照旧判红（见 producer-kit）。
  for (const e of held) {
    console.log(`  ℹ [条件型豁免未触发] ${e.method} ${e.url} /${e.error}/ —— ${e.why}；${e.heldNote}`)
  }
  for (const e of unused) {
    // 日落豁免（带 until）过期后**结构上不可能再命中**：这类条目留着就是"永久白名单"，
    // 与 b81 立它时的承诺（只覆盖已修复缺陷的历史行）相反。文案分开点是为了让处置动作明确：
    // 前者"撤销即可"，后者还要确认缺陷是否真的修完了。
    const expired = e.until && e.until <= since
    console.log(
      `  ❌ [允许表未命中${expired ? '·日落已过期' : ''}] ${e.method} ${e.url} /${e.error}/` +
        `${e.msg ? ` /${e.msg}/` : ''}${e.until ? ` until=${e.until}` : ''} —— ${e.why}`
    )
  }
  // 退役通道（只打提示没有动作=没判）：写在判定之后；判定为 code 2 已在上面直接退出，
  // 所以不可逆的写文件动作在"窗口选错/没有流量"时结构上到不了。
  if (args.includes('--retire-stale')) {
    const allowPath = path.resolve(opt('allow') || DEFAULT_ALLOW)
    const removed = retireStale(allowPath, unused)
    console.log(
      removed.length
        ? `  🧹 已从允许表退役 ${removed.length} 条（本轮及以后不得再靠它们吞信号）`
        : '  🧹 本轮没有需要退役的条目（允许表逐条都还打得住）'
    )
    const allow2 = loadAllowlist(allowPath)
    const again = classify(rows, allow2)
    const st2 = gateState({
      dbFile,
      since,
      until,
      opsCount,
      unknown: again.unknown,
      unused: again.unused,
      win: winMs,
      dsWin,
      partialWin
    })
    if (st2.code !== 0) {
      console.error(`❌ 退役后仍有问题（未登记 ${again.unknown.length} 条）：${st2.detail}`)
      process.exit(st2.code)
    }
    console.log(`✅ 退役后复判通过：允许表 ${allow2.length} 条，全部本轮命中`)
    return
  }
  if (st.code !== 0) {
    console.error(`❌ 失败操作判据失败：${st.detail}`)
    process.exit(st.code)
  }
  console.log(`✅ 失败操作判据通过：${st.detail}（允许表 ${allow.length} 条，逐条带理由）`)
}

if (process.argv.includes('--selftest')) selftest()
else main()
