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
 * 退出码：0 干净 / 1 有未登记失败或未命中登记 / 2 输入不可用或窗口内无操作记录。
 *
 * 允许表**未命中**条目（b85 项 F）：本轮一条也没打中的登记 ⇒ 判红并必须撤销；带 `until`
 * 的日落豁免过期后结构上再也打不中，同样点名。`--retire-stale` 是真删通道（未命中为空时
 * 不碰文件），与 backend-log-audit / click-failure-audit 同一条纪律：只打提示、
 * 没有动作通道的信号等于没判。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../..')
const DEFAULT_DB = path.join(REPO, 'stepby-axum', 'data', 'stepby.db')
const DEFAULT_ALLOW = path.join(HERE, 'oper-log-allowlist.json')

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
  return body.entries.map((e, i) => {
    const at = `entries[${i}]`
    if (!e || typeof e !== 'object') throw new Error(`${at} 不是对象`)
    if (!/^(GET|POST|PUT|DELETE|PATCH)$/.test(e.method || '')) {
      throw new Error(`${at}.method 必须是 HTTP 方法`)
    }
    const why = typeof e.why === 'string' ? e.why.trim() : ''
    if (why.length < 10) throw new Error(`${at}.why 至少 10 个字符（写清为什么这次失败是设计内）`)
    let urlRe
    let errRe
    let msgRe = null
    try {
      urlRe = new RegExp(e.url)
      errRe = new RegExp(e.error)
      if (e.msg !== undefined) msgRe = new RegExp(e.msg)
    } catch (err) {
      throw new Error(`${at} 的正则不合法：${err.message}`)
    }
    if (e.msg !== undefined && (typeof e.msg !== 'string' || !e.msg)) {
      throw new Error(`${at}.msg 给就必须是非空正则字符串`)
    }
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
      why
    }
  })
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
export function classify(rows, allow) {
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
  return { unknown, allowed, unused: allow.filter((e) => !matched.has(e)) }
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
export function gateState({ dbFile, since, until, opsCount, unknown, unused = [] }) {
  if (!fs.existsSync(dbFile)) return { code: 2, detail: `运行库不存在：${dbFile}` }
  if (!WINDOW_RE.test(since || '') || !WINDOW_RE.test(until || '')) {
    return { code: 2, detail: `窗口必须是 YYYY-MM-DD HH:MM:SS（实际 ${since} .. ${until}）` }
  }
  if (since >= until) return { code: 2, detail: `窗口方向可疑：${since} .. ${until}` }
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
  const dir = fs.mkdtempSync(path.join(REPO, 'stepby-vue', 'tests', 'e2e', '_tmp_oper_'))
  const dbFile = path.join(dir, 'ops.db')
  const db = new DatabaseSync(dbFile)
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
              why: '历史豁免（合成夹具）'
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
  for (const [name, entries] of [
    ['方法表外', [{ method: 'TRACE', url: 'x', error: 'x', why: '理由足够长足够长' }]],
    ['缺理由', [{ method: 'POST', url: 'x', error: 'x', why: '' }]],
    ['坏正则', [{ method: 'POST', url: '(', error: 'x', why: '理由足够长足够长' }]],
    ['坏 msg 正则', [{ method: 'POST', url: 'x', error: 'x', msg: '(', why: '理由足够长足够长' }]],
    ['坏 until', [{ method: 'POST', url: 'x', error: 'x', until: '2026/10/20', why: '理由足够长足够长' }]]
  ]) {
    let threw = false
    try {
      const tmp = path.join(dir, `allow_${name}.json`)
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
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
  if (fails.length) {
    console.error(`SYNTH_FAIL 失败操作判据 ${fails.length} 条：`)
    for (const f of fails) console.error(`  · ${f}`)
    process.exit(1)
  }
  console.log(
    `SYNTH_OK 失败操作日志判据 ${ran} 条双向（窗口/成功行排除/业务 msg 精度/允许表/日落豁免/未命中对账/退役通道/未登记必红/零操作与反向窗口必拒）`
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
  const until = normalizeWindow(opt('until') || process.env.STEPBY_OPER_UNTIL || '') || '9999-12-31 23:59:59'
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
  const { unknown, allowed, unused } = classify(rows, allow)
  console.log(`失败操作日志：${dbFile}`)
  console.log(
    `  窗口 ${since} .. ${until}；操作 ${opsCount} 条；失败 ${rows.length} 条；已登记 ${allowed.length} / 未登记 ${unknown.length} / 允许表未命中 ${unused.length}`
  )
  for (const u of unknown) {
    console.log(`  ❌ ${u.request_method} ${u.oper_url} [${u.oper_time}] ${String(u.error_msg || '').slice(0, 160)}`)
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
  const st = gateState({ dbFile, since, until, opsCount, unknown, unused })
  // 退役通道（只打提示没有动作=没判）：写在判定之后，且数据集无效（code 2）时一律不写。
  if (args.includes('--retire-stale')) {
    if (st.code === 2) {
      console.error('EXIT=2 数据集无效（库/窗口/零操作），退役判定不作数，允许表未改动')
      process.exit(2)
    }
    const allowPath = path.resolve(opt('allow') || DEFAULT_ALLOW)
    const removed = retireStale(allowPath, unused)
    console.log(
      removed.length
        ? `  🧹 已从允许表退役 ${removed.length} 条（本轮及以后不得再靠它们吞信号）`
        : '  🧹 本轮没有需要退役的条目（允许表逐条都还打得住）'
    )
    const allow2 = loadAllowlist(allowPath)
    const again = classify(rows, allow2)
    const st2 = gateState({ dbFile, since, until, opsCount, unknown: again.unknown, unused: again.unused })
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
