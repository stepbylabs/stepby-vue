/**
 * 写端点触达覆盖对账（批七十九新增）
 *
 * 为什么判据取"运行期真出过的路径"而不是静态 grep 套件源码：静态法只能答"源码里出现过这个
 * 字符串吗"，答不了"这一轮到底有没有真出网"——两种误差它都会犯：
 *   · UI 触发的端点在套件源码里没有路径字面量（只有按钮文案）⇒ 静态会假报"未覆盖"；
 *   · 反过来，套件里**写了**路径用于"取消后不得出网"的护栏断言（87.14 的
 *     `/monitor/slow-sql/clear`：断言 `DELETE 请求数必须 0`）⇒ 静态会假报"已覆盖"。
 * 运行期数据集直接回答唯一有意义的问题：**这个写端点在本轮全量里到底出过网没有**。
 * 而"设计上就不该出网"的端点（跨租户不可逆、整库导出等）由基线**逐条带理由**登记，
 * 不是代码里的通配白名单——将来它被真触达或被删除，基线差集会当场说出来。
 *
 * 三条硬约束（都来自本仓既有纪律）：
 * ① **只认全量轮**：数据集必须带 `full: true`。分段轮（`--feature=N`）的分母是子集，
 *    拿它做覆盖判据会把"没跑"读成"没覆盖"（同 §3.63、`tenant-audit.incremental.*`）。
 * ② **判据源缺失必须响亮失败**：路由目录不可读 / 解析出 0 条 / 数据集不是 full ⇒
 *    非零退出，不得返回空集合让 gate 打 OK（同 §门禁前言第 ② 条）。
 * ③ **棘轮只许降**：`--update-baseline` 先比后写，未覆盖数变多一律拒绝落盘（同 §7.14）。
 *
 * 用法：
 *   node tests/e2e/endpoint-coverage.mjs --selftest                 # 纯合成，不依赖产物
 *   node tests/e2e/endpoint-coverage.mjs                            # 打印本轮对账
 *   node tests/e2e/endpoint-coverage.mjs --gate                     # 与基线做差集，新增未覆盖即红
 *   node tests/e2e/endpoint-coverage.mjs --update-baseline          # 收紧基线（只许降）
 *   node tests/e2e/endpoint-coverage.mjs --update-baseline --migrate-baseline
 *                                                                  # 口径迁移（换触达源）时承认它并落 migratedFrom；
 *                                                                  # 该旗标**只在这条组合下有效**，单用或配 --gate 一律 EXIT=2
 * 退出码：0 正常 / 1 棘轮回退 / 2 输入不可用（数据集缺失或非全量、路由源解析失败、旗标组合无效）
 */
import fs from 'node:fs'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite' // 自检也要用（服务端触达那把的反证必须真跑一次 SQL 窗口）
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertFullRun, assertWindowPrecision, readWindow } from './dataset-window.mjs'
import { duplicateWhyGroups, selfContainedWhyViolation } from './producer-kit.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const ROUTER_DIR = path.join(REPO, 'stepby-axum', 'src', 'router')
const DATASET = path.join(HERE, 'screenshots', 'deep-e2e-reqstats.json')
const BASELINE = path.join(HERE, 'endpoint-coverage-baseline.json')
/**
 * **未触达理由登记表**（b79 收口第三轮）。§7.19/§7.20 早就写了"'设计上就不该出网'的端点由基线
 * 逐条带理由登记"，但基线里只有一个 `uncovered` 字符串数组——**理由从来没处可放**，那条承诺
 * 因此是空的（写了没接线=没写，这次欠的是注释）。现在把它做成一份 git 跟踪的登记表，
 * 判据是：每条未触达都必须有人签过名（有 `kind` + 非空 `why`），否则 `--gate` 直接红。
 * 放在基线**外面**是因为基线每轮全量都会被重写，登记内容不该跟着蒸发。
 */
const REASONS = path.join(HERE, 'endpoint-coverage-reasons.json')
/**
 * 未触达的四种定性（单一事实源；新增分类先改这里，`--gate` 会拒收表外的值）：
 * `by-design` 设计上就不该由测试发（清库、不可逆、改全局态）；
 * `needs-fixture` 缺夹具/真凭据/硬件（xlsx、passkey、AI provider、第三方 client）；
 * `other-suite` 本轮窗口内没打，但同日别的轮（main.mjs 六段等）在 `oper_log` 里留有写痕迹；
 * `todo` **本可自动化**，只是这一批没做——这条是欠账，`--gate` 会单独计数打出来，不许混在水里。
 */
export const REASON_KINDS = ['by-design', 'needs-fixture', 'other-suite', 'todo']
// 扫描面下限：本仓写路由量级是百级，解析出来远小于此就是**正则或路径腐化**，
// 不得让"0 条路由"冒充"全部已覆盖"（同 §门禁前言第 ② 条的"非零探针"）。
const ROUTE_FLOOR = 100
const WRITE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH']

const log = (m) => console.log(`[endpcov] ${m}`)

/** 路径段归一：数字段 / UUID / 长十六进制哈希都折成 `N`，与 reqstats 的归一端点同源。 */
export function normSegment(seg) {
  if (/^\d+$/.test(seg)) return 'N'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return 'N'
  if (/^[0-9a-f]{32,}$/i.test(seg)) return 'N'
  return seg
}

export function normPath(p) {
  const clean = String(p || '')
    .replace(/^\/?prod-api\//, '/')
    .split('?')[0]
  return clean
    .split('/')
    .filter((s) => s !== '')
    .map(normSegment)
}

/**
 * 模板与实测路径逐段匹配。模板里的 `{id}` 匹配任意一段；其余必须字面相等。
 * 长度不同的路径**不得**互相顶替（否则 `/system/user` 会"覆盖" `/system/user/{id}/authRole`）。
 */
export function templateMatchesPath(template, segs) {
  const t = template
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (t.length !== segs.length) return false
  return t.every((raw, i) => {
    const seg = raw.replace(/^\{(.*?)\}$/, (m, inner) => (inner ? '\u0000' : m))
    if (seg === '\u0000') return true
    return seg === segs[i]
  })
}

/** 从 `src/router/*.rs` 解析写路由模板。 */
export function parseWriteRoutes(dir) {
  if (!fs.existsSync(dir)) throw new Error(`路由目录不存在：${dir}`)
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.rs'))
  if (files.length === 0) throw new Error(`路由目录里没有 .rs 文件：${dir}`)
  const routes = []
  // `.route("/a/b", post(handler))` / 跨行写法都要吃到，故允许中间换行
  const re = /\.route\(\s*"([^"]+)"\s*,\s*(get|post|put|delete|patch|head)\s*\(/gis
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    // `matchAll`（不是 `re.entries`——后者不存在：写错时每次调用都在第一个文件上抛
    // `re.entries is not a function`，而自检里"路由源解析条数 < 100 必须抛错"那条
    // 恰好**期望抛错** ⇒ 一个从未真解析过任何路由的实现照样 SYNTH_OK。
    // 教训：期望失败的用例必须同时配一条**期望成功**的，否则"永远失败"的实现能全绿）
    for (const m of text.matchAll(re)) {
      const method = m[2].toUpperCase()
      if (!WRITE_METHODS.includes(method)) continue
      routes.push({ method, template: m[1], file: f })
    }
  }
  // 去重（同一模板可能在多处注册）
  const seen = new Set()
  const uniq = []
  for (const r of routes) {
    const k = `${r.method} ${r.template}`
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(r)
  }
  if (uniq.length < ROUTE_FLOOR) {
    throw new Error(`解析出的写路由只有 ${uniq.length} 条（下限 ${ROUTE_FLOOR}）——正则或路径已腐化，判据不作数`)
  }
  return uniq
}

/**
 * 服务端触达记录（`sys_oper_log`）——**第二个事实源**，用来补 `deep-e2e` 数据集看不见的覆盖面。
 *
 * 为什么必须并进来：`deep-e2e-reqstats.json` 只记录 **deep-e2e 自己**浏览器里出过的网，
 * 而 `main.mjs` 那 144 个功能（用户增删改、角色授权、重置密码…）完全不在里面。
 * 只用客户端数据集判"未触达"，会把 `PUT /system/user`、`DELETE /system/user/{id}`
 * 这类**主套件天天在打**的端点报成盲区（实测本轮基线 161 条里有相当一部分是这一类）——
 * 判据一旦系统性说谎，它的输出就会被当噪声读，比没有判据更糟（同 §门禁前言）。
 * `sys_oper_log` 是服务端写请求的权威留痕（两个套件 + 手工调用都在同一张表里），
 * 取 `DISTINCT (request_method, oper_url)` 并按窗口过滤即可与模板做同一套归一对账。
 *
 * 两条边界（都有反证用例）：
 * · **窗口必填且必须真过滤**：不加窗口等于"今天库内谁打过就算覆盖"，会把覆盖判据松成恒绿；
 *   落在窗口外的行必须看不见（用例 ⑬）。
 * · **零行 = 响亮失败**：窗口写错 / 表被清 ⇒ 绝不能当成"服务端零触达"继续判（用例 ⑭）。
 * 已知不足（不假装全知）：机器遥测通道按 b69 纪律**不写 oper_log**（`/monitor/frontendError/report`
 * 等），这类端点的覆盖只能靠客户端数据集——所以两路是**并集**而不是互相替换。
 */
export function serverTouchedFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    // 零行 = 窗口写错 / 表被清 / SQL 条件腐化，绝不能当成"服务端零触达"继续判（同 §门禁前言）
    throw new Error('服务端触达取到 0 行——不得当成"零触达"继续判覆盖，请先核对窗口与表名')
  }
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const url = String(r.u).split('?')[0].split('#')[0] // oper_url 带查询串（如 ?pageNum=1）
    const method = String(r.m).toUpperCase()
    const key = `${method} ${url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ method, segs: normPath(url), url })
  }
  return out
}

export function serverTouchedFromOperLog(db, since, until) {
  const rows = db
    .prepare(
      `SELECT DISTINCT request_method AS m, oper_url AS u FROM sys_oper_log
        WHERE request_method IN ('POST','PUT','DELETE','PATCH')
          AND oper_time >= ? AND oper_time <= ? AND oper_url IS NOT NULL`
    )
    .all(since, until)
  return serverTouchedFromRows(rows)
}

/** 读取 reqstats 数据集；非全量轮直接失败。 */
export function loadTouched(file) {
  if (!fs.existsSync(file)) throw new Error(`数据集不存在：${file}（需先跑一轮 deep-e2e 全量）`)
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  assertFullRun(d, file)
  if (!Array.isArray(d.rows) || d.rows.length === 0) throw new Error('数据集 rows 为空，判据不作数')
  const touched = []
  for (const row of d.rows) {
    // key 形态：`${动作} | ${方法} ${归一端点}`
    const bar = String(row.key || '').indexOf(' | ')
    if (bar < 0) continue
    const rest = row.key.slice(bar + 3)
    const sp = rest.indexOf(' ')
    if (sp < 0) continue
    const method = rest.slice(0, sp).toUpperCase()
    const url = rest.slice(sp + 1)
    if (!WRITE_METHODS.includes(method)) continue
    touched.push({ method, segs: normPath(url), url })
  }
  if (touched.length === 0) {
    // 全量轮里一条写请求都没有 = 采集坏了，不能当成"零写端点被触达"来判红/判绿
    throw new Error('数据集中没有任何写请求端点——采集面已坏，请先修捕获再判覆盖')
  }
  return touched
}

/**
 * 从数据集读**本轮请求窗口**（`windowStart` / `windowEnd`，UTC 裸文本，与 `sys_oper_log.oper_time` 同口径）。
 *
 * 为什么要机器自己取：此前 `--since/--until` 由人手抄进命令行，抄错一次就把窗口整体前挪 8 小时
 * （本地 UTC+8 上把本地时间当 UTC 传），窗口内一行都没有也照样报"覆盖 0 条"——**看起来像覆盖退化**。
 * 缺字段一律硬失败，不得回落到"不设窗口"（那等于"谁打过都算覆盖"）。
 */
export function loadWindow(file) {
  if (!fs.existsSync(file)) throw new Error(`数据集不存在：${file}（需先跑一轮 deep-e2e 全量）`)
  return readWindow(JSON.parse(fs.readFileSync(file, 'utf8')), file)
}

/** 主对账：返回未触达的写端点（排序后的 `METHOD /template` 列表）。 */
export function analyze(routes, touched) {
  const uncovered = []
  for (const r of routes) {
    const hit = touched.some((t) => t.method === r.method && templateMatchesPath(r.template, t.segs))
    if (!hit) uncovered.push(`${r.method} ${r.template}`)
  }
  uncovered.sort()
  return {
    total: routes.length,
    uncovered,
    touchedKinds: new Set(touched.map((t) => `${t.method} ${t.segs.join('/')}`)).size
  }
}

/**
 * 未触达 × 登记表的对账（纯函数，自检㉑双向钉）。
 * `missing` / `badKind` 是**判据失败**；`stale` 只打 ℹ（那条端点这轮被打过了，登记该退役——
 * 把好消息报成红灯，下一批就没人再登记了）；`todo` 是欠账计数，单独露出来不许混在水里。
 */
export function auditReasons(uncovered, reasons, kinds = REASON_KINDS) {
  const list = Array.isArray(uncovered) ? uncovered : []
  const set = new Set(list)
  const missing = []
  const badKind = []
  /** `missing` 保持"裸键"（调用方按键比对与打印），违规说明另立一张表 —— 两处混一份数组会把键比对变成字符串包含 */
  const missingWhy = {}
  for (const k of list) {
    const e = reasons[k]
    if (!e) {
      missing.push(k)
      continue
    }
    // 理由自足性判据与两张日志允许表共用 producer-kit（b87）：
    // 空 / 短到没有信息量 / `同上` 类跨条目指代 / 以"见上条"开头 ⇒ 都等于没登记。
    // 条目集合一变（新增/删除/排序），指代就指向另一条理由（自检 ㉑ 双向钉 + 两条正控）。
    const violation = selfContainedWhyViolation(e.why)
    if (violation) {
      missing.push(k)
      missingWhy[k] = violation
    } else if (!kinds.includes(e.kind)) badKind.push(`${k}（kind=${JSON.stringify(e.kind)}，表外值）`)
  }
  const stale = Object.keys(reasons).filter((k) => !set.has(k))
  const todo = list.filter((k) => reasons[k]?.kind === 'todo')
  return { missing, missingWhy, badKind, stale, todo, registered: list.length - missing.length }
}

/** 读登记表：缺失 / 解析失败 / 形状不对一律响亮失败（"没登记"与"表坏了"必须可区分）。 */
export function loadReasons(file = REASONS) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `未触达理由登记表不存在：${file}——每条未触达都必须有签名（kind + 非空 why）。` +
        `没有登记表，判据就退化成"记一个数字"，§7.19 承诺的"逐条带理由"会再次落空`
    )
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`登记表形状必须是 { "METHOD /path": { kind, why } }：${file}`)
  }
  // 集合级判据（b87）：同表内两条理由逐字相同 ⇒ 装载即抛。
  // AGENTS 记的"重复文案组数 0"此前只是一次人工测量，没有锁——复制粘贴同一句话不会红。
  const dups = duplicateWhyGroups(Object.values(raw))
  if (dups.length) {
    throw new Error(
      `${file} 有 ${dups.length} 组逐字相同的 why（登记表必须逐条自足，共用文案等于只登记了一次）：` +
        dups
          .slice(0, 3)
          .map(([t, c]) => `${c} 条 × 「${t.slice(0, 40)}」`)
          .join(' ｜ ')
    )
  }
  return raw
}

function runSelftest() {
  const fail = []
  // ① 模板里的 {id} 必须匹配任意数字段
  if (!templateMatchesPath('/system/user/{userId}/authRole', ['system', 'user', '123', 'authRole'])) {
    fail.push('① 参数段未匹配数字路径')
  }
  // ② 长度不同不得互相顶替（`/system/user` 绝不"覆盖" `/system/user/{id}/authRole`）
  if (templateMatchesPath('/system/user', ['system', 'user', '123', 'authRole'])) {
    fail.push('② 短模板顶替了长路径（覆盖判据会假绿）')
  }
  // ③ 64 位哈希段必须被归一（batchLogout / online/{tokenHash} 的真实形态）
  const hex = 'a'.repeat(64)
  if (!templateMatchesPath('/monitor/online/{tokenHash}', normPath(`/monitor/online/${hex}`))) {
    fail.push('③ 长十六进制哈希段未被归一')
  }
  // ④ prod-api 前缀必须被吃掉（嵌入式与代理两种形态同源）
  if (normPath('/prod-api/system/config').join('/') !== 'system/config') {
    fail.push('④ prod-api 前缀未剥离')
  }
  // ⑤ 方法不同不得算触达
  const routes = [{ method: 'POST', template: '/monitor/online/batchLogout', file: 'x.rs' }]
  const a = analyze(routes, [
    { method: 'GET', segs: ['monitor', 'online', 'batchLogout'], url: '/monitor/online/batchLogout' }
  ])
  if (a.uncovered.length !== 1) fail.push('⑤ GET 触达被当成了 POST 端点的覆盖')
  // ⑥ 同一端点被触达 ⇒ 必须判"已覆盖"
  const b = analyze(routes, [
    { method: 'POST', segs: ['monitor', 'online', 'batchLogout'], url: '/monitor/online/batchLogout' }
  ])
  if (b.uncovered.length !== 0) fail.push('⑥ 已触达端点仍被判未覆盖')
  // ⑦ 路由源损坏必须响亮失败，不得返回空集合
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'endpcov-'))
  fs.writeFileSync(path.join(tmp, 'r.rs'), '.route("/x", post(h))\n', 'utf8')
  let threw = false
  try {
    parseWriteRoutes(tmp)
  } catch {
    threw = true
  }
  if (!threw) fail.push('⑦ 路由条数低于下限时没有报错（假干净的通道）')
  let threw2 = false
  try {
    parseWriteRoutes(path.join(tmp, 'nope'))
  } catch {
    threw2 = true
  }
  if (!threw2) fail.push('⑦ 路由目录缺失时没有报错')
  // ⑧ 非 full 数据集必须被拒
  fs.writeFileSync(
    path.join(tmp, 'd.json'),
    JSON.stringify({ full: false, rows: [{ key: 'load | POST /a', count: 1 }] }),
    'utf8'
  )
  let threw3 = false
  try {
    loadTouched(path.join(tmp, 'd.json'))
  } catch {
    threw3 = true
  }
  if (!threw3) fail.push('⑧ 分段轮数据集被接受了（会把"没跑"读成"没覆盖"）')
  // ⑨ full 但没有任何写端点 ⇒ 采集坏了，也必须拒
  // （夹具必须带执行完整性字段：否则它会被 assertFullRun 的前一道闸先拦下，
  //  这条用例就成了"因为别的原因抛错"的空跑——期望抛错的用例必须抛在 It 自己的理由上。）
  fs.writeFileSync(
    path.join(tmp, 'e.json'),
    JSON.stringify({
      full: true,
      modulesPlanned: 90,
      modulesAttempted: 90,
      modulesWithZeroVerdicts: [],
      envNetworkAbort: 0,
      totalVerdictRows: 1,
      rows: [{ key: 'load | GET /a', count: 1 }]
    }),
    'utf8'
  )
  let threw4 = false
  let why4 = ''
  try {
    loadTouched(path.join(tmp, 'e.json'))
  } catch (e) {
    threw4 = true
    why4 = String(e.message)
  }
  if (!threw4) fail.push('⑨ 零写请求的数据集被当成了合法输入')
  else if (!/没有任何写请求/.test(why4)) fail.push(`⑨ 拒绝理由没落在"零写请求"上：${why4}`)

  // ⑩ **正控**：解析必须存在"成功路径"的断言。⑦ 只期望抛错 ⇒ 一个永远抛错的实现
  //（实测就是这种：`re.entries` 根本不是函数，改成 `text.matchAll` 之前每个文件都抛，
  // 而自检照样 SYNTH_OK 九条全绿）也能过。这里数条数、验跨行写法、验方法过滤。
  const okDir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'endpcov-ok-'))
  const lines = []
  for (let i = 0; i < 120; i++) lines.push(`.route("/synthetic/${i}", post(h))`)
  lines.push('.route("/synthetic/get", get(h))') // 读方法必须被滤掉
  lines.push('.route(\n  "/synthetic/{id}",\n  delete(h)\n)') // 跨行注册必须吃到
  fs.writeFileSync(path.join(okDir, 'ok.rs'), lines.join('\n') + '\n', 'utf8')
  const parsed = parseWriteRoutes(okDir)
  if (parsed.length !== 121) fail.push(`⑩ 正控条数不符：解析到 ${parsed.length}，期望 121（120 post + 1 跨行 delete）`)
  if (!parsed.some((r) => r.method === 'DELETE' && r.template === '/synthetic/{id}'))
    fail.push('⑩ 跨行注册的 delete 未被解析（模板带 {id}）')
  if (parsed.some((r) => r.method === 'GET')) fail.push('⑩ 读方法没被滤掉')
  // 真仓路由目录（存在才判：CI 的 doc-gates 只检 stepby-vue，缺 axum 属环境而非判据红）
  if (fs.existsSync(ROUTER_DIR)) {
    const real = parseWriteRoutes(ROUTER_DIR)
    for (const [m, t] of [
      ['POST', '/system/config'],
      ['PUT', '/system/config'],
      ['POST', '/common/upload']
    ]) {
      if (!real.some((r) => r.method === m && r.template === t)) fail.push(`⑩ 真仓路由里没解析到 ${m} ${t}`)
    }
    console.log(`  · ⑩ 正控：合成 121 条 / 真仓 ${ROUTER_DIR} 解析到 ${real.length} 条写路由`)
  }

  // ⑪ 服务端触达源（sys_oper_log 并集）必须双向：窗口内独有端点 ⇒ 覆盖；窗口外 ⇒ 不得算
  // 取数层是"窗口过滤 + DISTINCT"，由 SQL 负责；这里判的是**拿到行之后**的语义，
  // 所以喂给纯函数的行已经是"窗口内"的（窗口外那条根本不会来自 SQL；空窗口抛错另有反证）
  const srv = serverTouchedFromRows([
    { m: 'PUT', u: '/system/user' }, // 只有服务端见过的端点
    { m: 'PUT', u: '/system/user/resetPwd?x=1' }, // 带查询串，须剥掉
    { m: 'put', u: '/system/user' } // 小写方法 + 重复行 ⇒ 必须被去重
  ])
  const sroutes = [
    { method: 'PUT', template: '/system/user', file: 'x.rs' },
    { method: 'PUT', template: '/system/user/resetPwd', file: 'x.rs' },
    { method: 'DELETE', template: '/system/notice/{id}', file: 'x.rs' }
  ]
  const sOnly = analyze(sroutes, srv)
  if (sOnly.uncovered.length !== 1) fail.push(`⑪ 服务端独有触达未被计入（未触达 ${sOnly.uncovered.length}，期望 1）`)
  if (!sOnly.uncovered.includes('DELETE /system/notice/{id}'))
    fail.push('⑪ 窗口外的 oper_log 行被当成覆盖了（判据松成"谁打过都算"）')
  const clientTouched = [{ method: 'PUT', segs: normPath('/system/user'), url: '/system/user' }] // 客户端只见这一个
  const cOnly = analyze(sroutes, clientTouched)
  if (cOnly.uncovered.length !== 2) fail.push(`⑪ 单用客户端数据集时应剩 2 条未触达，实得 ${cOnly.uncovered.length}`)
  // ⑫ 零行必须响亮失败（窗口写错 / 表被清 ≠ "服务端零触达"）：用一个真库的空窗口
  let threw5 = false
  try {
    serverTouchedFromRows([])
  } catch {
    threw5 = true
  }
  if (!threw5) fail.push('⑫ 服务端触达取到空集合时被当成了合法输入')
  // ⑬ 查询串/锚点必须剥掉（否则 `/resetPwd?x=1` 与模板 `/system/user/resetPwd` 永不相等）
  if (!srv.some((r) => r.url === '/system/user/resetPwd')) fail.push('⑬ oper_url 的查询串没被剥掉')
  if (srv.filter((r) => r.url === '/system/user').length !== 1) fail.push('⑬ 重复/小写行没被去重')
  // ⑭ 窗口过滤**真的**发生在 SQL 层（否则这句只是注释）：内存库造一行窗口内、一行窗口外
  const odb = new DatabaseSync(':memory:')
  odb.exec('CREATE TABLE sys_oper_log (request_method TEXT, oper_url TEXT, oper_time TEXT)')
  odb.prepare('INSERT INTO sys_oper_log VALUES (?,?,?)').run('PUT', '/system/user', '2026-10-20 01:00:00')
  odb.prepare('INSERT INTO sys_oper_log VALUES (?,?,?)').run('DELETE', '/system/notice/9', '2026-10-20 05:00:00')
  const win = serverTouchedFromOperLog(odb, '2026-10-20 00:30:00', '2026-10-20 02:30:00')
  if (win.length !== 1 || win[0].url !== '/system/user') fail.push(`⑭ SQL 窗口没生效：${JSON.stringify(win)}`)
  let threw6 = false
  try {
    serverTouchedFromOperLog(odb, '2027-01-01 00:00:00', '2027-01-02 00:00:00')
  } catch {
    threw6 = true
  }
  if (!threw6) fail.push('⑭ 空窗口没有响亮失败')
  odb.close()

  // ⑮–⑱ 窗口自证（b79 收口第二轮）：窗口必须由数据集自己带。人抄窗口会把本地时间当 UTC 传
  // （本地 UTC+8），窗口内一行都没有也照样报"覆盖 0 条"——看起来像覆盖退化，实际是输入没了。
  const TMPD = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-endpcov-'))
  const wOk = path.join(TMPD, 'ok.json')
  fs.writeFileSync(
    wOk,
    JSON.stringify({ full: true, windowStart: '2026-10-20 00:40:00', windowEnd: '2026-10-20 03:03:17', rows: [] })
  )
  const wOld = path.join(TMPD, 'old.json')
  fs.writeFileSync(wOld, JSON.stringify({ full: true, rows: [] }))
  const wRev = path.join(TMPD, 'rev.json')
  fs.writeFileSync(
    wRev,
    JSON.stringify({ full: true, windowStart: '2026-10-20 03:03:17', windowEnd: '2026-10-20 00:40:00', rows: [] })
  )
  let wGot = null
  try {
    wGot = loadWindow(wOk)
  } catch (e) {
    fail.push(`⑮ 带窗口的数据集被拒：${e.message}`)
  }
  if (wGot && (wGot.since !== '2026-10-20 00:40:00' || wGot.until !== '2026-10-20 03:03:17'))
    fail.push(`⑮ 窗口取错：${JSON.stringify(wGot)}`)
  let threwOld = false
  try {
    loadWindow(wOld)
  } catch {
    threwOld = true
  }
  if (!threwOld) fail.push('⑯ 旧格式（无窗口）数据集被静默接受 ⇒ 会被读成"没打过"而不是"窗口缺失"')
  let threwRev = false
  try {
    loadWindow(wRev)
  } catch {
    threwRev = true
  }
  if (!threwRev) fail.push('⑰ 窗口方向颠倒（start ≥ end）没有被拒')
  // ⑱ `sources` 只记源族、不记窗口：换一轮窗口不同，`--gate` 仍必须可比
  // （否则门禁每轮自拒 = 等于没接线，这是把判据接进 run-gates 的前提）
  const t1 = sourceTag({ withOperLog: true })
  const t2 = sourceTag({ withOperLog: true })
  const t3 = sourceTag({ withOperLog: false })
  if (t1 !== t2) fail.push(`⑱ 同族源在不同调用下标签不同（${t1} vs ${t2}）⇒ 门禁会每轮自拒`)
  if (t1 === t3) fail.push('⑱ 两源与单源标签相同 ⇒ 换源不再被发现，白赚一个更低的数字')
  if (!t1.includes('oper_log')) fail.push(`⑱ 两源标签没记 oper_log：${t1}`)
  // ⑲ 基线可比性闸（b79 收口第三轮，两条实测踩出来的 fail-open 之一在此钉住）：
  //    旧基线**没有 sources** 时，原先的 `base.sources && base.sources !== sources` 直接短路放行，
  //    于是"一源基线 vs 两源本轮"打出绿色的"逐条一致或更好"——缺口径字段必须当成**不可比对**。
  const TWO = { sources: 'oper_log+reqstats', withOperLog: true }
  const okBase = {
    full: true,
    sources: 'oper_log+reqstats',
    window: { since: '2026-01-01 00:00:00', until: '2026-01-02 00:00:00' },
    uncovered: ['POST /a']
  }
  const tryBase = (b, opts) => {
    try {
      assertComparableBaseline(b, opts)
      return null
    } catch (e) {
      return e.message
    }
  }
  const baseCases = [
    ['完整两源基线 ⇒ 必须可比对（正控）', okBase, TWO, true],
    [
      '缺 sources 的旧基线 ⇒ 必须拒',
      { full: true, total: 197, uncovered: [] },
      TWO,
      false,
      /旧格式[\s\S]*migrate-baseline/
    ],
    ['sources 与本轮不同 ⇒ 必须拒', { ...okBase, sources: 'reqstats' }, TWO, false, /换源必须先换基线/],
    ['两源口径但基线没带 window ⇒ 必须拒', { ...okBase, window: null }, TWO, false, /window/],
    [
      '单源口径不要求 window（历史基线就是这形状）⇒ 可比对（正控）',
      { ...okBase, sources: 'reqstats', window: null },
      { sources: 'reqstats', withOperLog: false },
      true
    ],
    [
      '窗口方向反 ⇒ 必须拒',
      { ...okBase, window: { since: '2026-01-02 00:00:00', until: '2026-01-01 00:00:00' } },
      TWO,
      false
    ],
    ['未标记 full ⇒ 必须拒', { ...okBase, full: false }, TWO, false],
    ['uncovered 不是数组 ⇒ 必须拒', { ...okBase, uncovered: 161 }, TWO, false],
    ['基线文件为 null ⇒ 必须拒（首建走另一条分支）', null, TWO, false]
  ]
  for (const [desc, b, opts, wantComparable, wantMsg] of baseCases) {
    const err = tryBase(b, opts)
    if ((err === null) !== wantComparable) {
      fail.push(`⑲ ${desc}：实际 ${err === null ? '可比对' : `拒（${String(err).slice(0, 70)}）`}`)
      continue
    }
    // 拒得对还不够，**给的补救路径也要对**：把"基线没有 sources"报成"源集合不一致"，
    // 下一个人就会去改命令行而不是重生成基线（误导的补救文本本身是缺陷）。
    if (wantMsg && !wantMsg.test(String(err))) fail.push(`⑲ ${desc}：补救指引不对 ⇒ ${String(err).slice(0, 90)}`)
  }
  // ㉒ 基线**新鲜度**闸（b82，实测抓回"旧断面当欠账清单"）：口径相同但窗口不同也必须拒，
  //     且要证明它不是一律拒——同窗口必须放行，显式历史窗口（没给当前断面）不得介入。
  const W = { since: '2026-01-01 00:00:00', until: '2026-01-02 00:00:00' }
  const tryFresh = (b, w) => {
    try {
      assertFreshBaseline(b, w)
      return null
    } catch (e) {
      return e.message
    }
  }
  const cases22 = [
    ['基线窗口与本轮断面一致 ⇒ 放行（正控，防"一律拒"）', okBase, W, true],
    [
      '窗口差一秒 ⇒ 必须拒（b81 的真实形态：差 8 小时也照样放行过）',
      okBase,
      { since: W.since, until: '2026-01-02 00:00:01' },
      false
    ],
    ['基线没带窗口而本轮有断面 ⇒ 必须拒（不得当成"一致"）', { ...okBase, window: null }, W, false],
    ['没给当前断面（显式历史 --since/--until）⇒ 本闸不介入（正控）', okBase, { since: '', until: '' }, true]
  ]
  for (const [desc, b, w, wantOk] of cases22) {
    const err = tryFresh(b, w)
    if ((err === null) !== wantOk)
      fail.push(`㉒ ${desc}：实际 ${err === null ? '放行' : `拒（${String(err).slice(0, 60)}）`}`)
  }
  // 变异证伪：把"断面不同"洗成"只在缺窗口时拒"（`w.since !== since` 那半句摘掉）必须让 ㉒ 第 2 条转红
  {
    const lenient = (b, w) => {
      if (!b.window) throw new Error('缺窗口')
      if (!w.since) return b
      return b
    }
    let caught = false
    try {
      lenient(okBase, { since: '2026-09-09 00:00:00', until: '2026-09-10 00:00:00' })
    } catch {
      caught = true
    }
    if (caught) fail.push('㉒ 变异控制组失效：宽松实现本应放行不同断面（说明用例判据写反）')
  }
  // ㉓ 退役登记（b82）：`stale` 从"只打 ℹ"变成有出口的通道，但出口只能删**打过的**。
  //     两条反例分别钉住两个相反方向的错误：删掉未触达条目的理由（新洞就此隐形）、
  //     以及"打过的还留着"（b81 的 17 条假欠账形态）。
  const cases23 = [
    [
      '打过的必须删（b81 那 17 条的形态）',
      {
        'POST /gone': { kind: 'todo', why: '假欠账：本轮两源都证明打过' },
        'POST /still': { kind: 'by-design', why: '清库类' }
      },
      ['POST /still'],
      ['POST /gone']
    ],
    [
      '未触达条目的理由一个都不许删（删了下次就是"没登记"红灯，而不是真缺陷可见）',
      { 'POST /still': { kind: 'todo', why: '本可自动化' } },
      ['POST /still'],
      []
    ],
    ['登记表为空 ⇒ 退役 0 条且不得报错（正控）', {}, ['POST /x'], []],
    [
      '登记集合与未触达集合完全不交 ⇒ 全部可退役，但剩余集合必须为空（防"顺手清空"）',
      {
        'POST /a': { kind: 'other-suite', why: '主套件天天打' },
        'POST /b': { kind: 'other-suite', why: '主套件天天打' }
      },
      [],
      ['POST /a', 'POST /b']
    ]
  ]
  for (const [desc, input, uncovered, wantRemoved] of cases23) {
    const r = JSON.parse(JSON.stringify(input))
    const got = retireStaleKeys(r, uncovered).sort()
    const ok = got.join('|') === [...wantRemoved].sort().join('|')
    // 反向也要判：剩下的键必须正好是"未触达 ∩ 已登记"
    const keepOk =
      Object.keys(r).sort().join('|') ===
      uncovered
        .filter((k) => Object.keys(input).includes(k))
        .sort()
        .join('|')
    if (!ok || !keepOk)
      fail.push(
        `㉓ ${desc}：应删 ${JSON.stringify(wantRemoved)} 实删 ${JSON.stringify(got)}，剩余 ${JSON.stringify(Object.keys(r))}`
      )
  }
  // ⑳ **集合式**棘轮：总数下降但带新项仍算退步（数值棘轮套在集合判据上是第二条 fail-open）
  const reg = coverageRegressions(
    ['POST /a', 'POST /b', 'POST /c', 'POST /d', 'POST /e'],
    ['POST /a', 'POST /b', 'POST /new']
  )
  if (reg.length !== 1 || reg[0] !== 'POST /new') fail.push(`⑳ 集合式对账没抓到新增未触达项：${JSON.stringify(reg)}`)
  if (coverageRegressions(['POST /a'], ['POST /a']).length !== 0) fail.push('⑳ 完全一致被判成退步（正控失败）')
  if (coverageRegressions([], ['POST /x']).length !== 1) fail.push('⑳ 空基线下的新增项没报')
  // ㉑ 未触达登记表对账（双向）：这一条把 §7.19 里"逐条带理由登记"那句承诺变成可执行的判据
  // 理由自足性判据与两张日志允许表**共用 producer-kit 的同一份**（b87）：
  // 这里的夹具文案因此必须写成"真自足"的样子——短到 10 字符以下本身就是被 ban 的形状。
  const R = {
    'POST /a': { kind: 'by-design', why: '清库类，只能测"确认框取消 ⇒ 请求数 0"' },
    'POST /b': { kind: 'todo', why: '本可自动化，需要一条真实的删除链断言' },
    'POST /c': { kind: 'needs-fixture', why: '要真实可解析的 xlsx 夹具，当前夹具集里没有' },
    'POST /d': { kind: 'nonsense', why: '分类写错也要被抓，理由本身是自足的' },
    'POST /e': { kind: 'by-design', why: '   ' },
    'POST /x': { kind: 'needs-fixture', why: '同上：另一条已经写过理由' },
    'POST /y': { kind: 'by-design', why: '短' },
    'POST /z': { kind: 'by-design', why: '见上条同一判据，只是端点不同' },
    'POST /w': { kind: 'other-suite', why: '由 main 套件 F135 覆盖，参见其 metrics 断言' },
    'POST /gone': { kind: 'by-design', why: '这轮已经打过了 ⇒ 只该提示退役' }
  }
  const un21 = [
    'POST /a',
    'POST /b',
    'POST /c',
    'POST /d',
    'POST /e',
    'POST /new',
    'POST /x',
    'POST /y',
    'POST /z',
    'POST /w'
  ]
  const r21 = auditReasons(un21, R)
  const cases21 = [
    [
      '未登记的新洞必须点名',
      r21.missing.join(',') === 'POST /e,POST /new,POST /x,POST /y,POST /z',
      r21.missing.join(',')
    ],
    ['空 why（只有空格）等于没登记', r21.missing.includes('POST /e'), ''],
    ['"同上"类跨条目指代等于没登记（条目集合一变，指代就指向别的理由）', r21.missing.includes('POST /x'), ''],
    ['短到没有信息量的理由必须被点名（b87 起与两张日志表同口径）', r21.missing.includes('POST /y'), ''],
    ['以"见上条"开头的指代同样等于没登记', r21.missing.includes('POST /z'), ''],
    [
      '自足的理由不得被"同上"规则误伤（正控）',
      !r21.missing.includes('POST /a') && !r21.missing.includes('POST /c'),
      JSON.stringify(r21.missing)
    ],
    [
      '"参见某个测试用例"指向的是测试、不是另一条登记条目 ⇒ 必须放行（判据做窄不做宽的正控）',
      !r21.missing.includes('POST /w'),
      JSON.stringify(r21.missing)
    ],
    [
      '表外分类必须落 badKind 而不是 missing',
      r21.badKind.length === 1 && /POST \/d/.test(r21.badKind[0]),
      JSON.stringify(r21.badKind)
    ],
    ['已登记条数 = 总数 - 未登记（正控）', r21.registered === un21.length - r21.missing.length, String(r21.registered)],
    ['欠账 kind=todo 单独计数', r21.todo.length === 1 && r21.todo[0] === 'POST /b', JSON.stringify(r21.todo)],
    [
      '"这轮打过了但仍登记着"只算 stale，不得判红（好消息不能变红灯）',
      r21.stale.length === 1 && r21.stale[0] === 'POST /gone',
      JSON.stringify(r21.stale)
    ],
    [
      '全干净时必须零发现（正控）',
      (() => {
        const c = auditReasons(['POST /a'], {
          'POST /a': { kind: 'by-design', why: '清库类端点，只能测"确认框取消 ⇒ 请求数 0"' }
        })
        return c.missing.length === 0 && c.badKind.length === 0
      })(),
      ''
    ],
    [
      'uncovered 传非数组不得抛，按空集合处理（形状防御）',
      (() => {
        const c = auditReasons(undefined, R)
        return c.missing.length === 0 && c.registered === 0
      })(),
      ''
    ]
  ]
  for (const [desc, ok, detail] of cases21) if (!ok) fail.push(`㉑ ${desc}${detail ? `：实际 ${detail}` : ''}`)
  // ㉔ **执行完整性闸**双向（b82 实测：全量轮跑到 M38 浏览器崩溃，M39–M90 以"✅ 0 / ❌ 0"空跑到底，
  //    汇总仍打"模块: 90"、`full` 仍写 true、reqstats 仍落主文件）。`full` 只证明"不是分段轮"，
  //    不证明"跑完了"——拿崩轮重生成基线会把 M39–M90 覆盖的端点全记成未触达（与 ㉓ 的假欠账同族，
  //    只是这次由崩溃触发）。这里必须同时钉住"崩轮被拒"和"合法轮被放行"，否则前一道闸写坏了
  //    会让所有数据集都被拒、而判据照样"零未触达"。
  const mkRun = (name, body) => {
    const p = path.join(tmp, name)
    fs.writeFileSync(p, JSON.stringify(body), 'utf8')
    return p
  }
  const loadRun = (p) => {
    try {
      return { touched: loadTouched(p), err: '' }
    } catch (e) {
      return { touched: null, err: String(e.message) }
    }
  }
  const good = {
    full: true,
    modulesPlanned: 90,
    modulesAttempted: 90,
    modulesWithZeroVerdicts: [],
    // b89 项 15：断网的一轮不得作为触达数据源（"请求没打到"与"端点未触达"在数据里同形）
    envNetworkAbort: 0,
    totalVerdictRows: 1300,
    windowStart: '2026-01-01 00:00:00',
    windowEnd: '2026-01-02 00:00:00',
    rows: [{ key: 'act | POST /system/config', count: 2, navs: 1 }]
  }
  const cases24 = [
    [
      '崩轮（有模块产出 0 条判定）必须拒，且理由指向崩溃',
      (() => {
        const r = loadRun(
          mkRun('crashed.json', { ...good, modulesWithZeroVerdicts: Array.from({ length: 52 }, (_, i) => i + 39) })
        )
        return r.touched === null && /0 条判定/.test(r.err) && /崩溃/.test(r.err)
      })()
    ],
    [
      '提前终止（计划 90 / 入场 38，后面模块连 moduleStats 都没有）必须拒',
      (() => {
        const r = loadRun(mkRun('early.json', { ...good, modulesAttempted: 38 }))
        return r.touched === null && /提前终止/.test(r.err)
      })()
    ],
    [
      '缺执行完整性字段的旧格式数据集必须拒（旧格式无法证明"每个模块都跑了"）',
      (() => {
        const stripped = { ...good }
        delete stripped.modulesPlanned
        delete stripped.modulesWithZeroVerdicts
        const r = loadRun(mkRun('legacy.json', stripped))
        return r.touched === null && /完整性字段/.test(r.err)
      })()
    ],
    [
      '环境性网络中断的那一轮必须拒（b89 实测：断网 15720 条 ERR_NETWORK_IO_SUSPENDED，而隔离复跑该模块 13✅/❌0）',
      (() => {
        const r = loadRun(mkRun('envabort.json', { ...good, envNetworkAbort: 15720 }))
        return r.touched === null && /环境性网络中断/.test(r.err) && !/环境性网络中断计数字段/.test(r.err)
      })()
    ],
    [
      '缺 envNetworkAbort 字段必须拒（旧格式无法证明本轮没被污染），而 0 必须放行',
      (() => {
        const stripped = { ...good }
        delete stripped.envNetworkAbort
        const r = loadRun(mkRun('noenv.json', stripped))
        const okRefuse = r.touched === null && /环境性网络中断计数字段/.test(r.err)
        const okPass = loadRun(mkRun('envzero.json', { ...good, envNetworkAbort: 0 })).touched !== null
        return okRefuse && okPass
      })()
    ],
    [
      '判定行总数为 0 必须拒（采集器已坏，结论不作数）',
      (() => {
        const r = loadRun(mkRun('norows.json', { ...good, totalVerdictRows: 0 }))
        return r.touched === null && /判定行总数为 0/.test(r.err)
      })()
    ],
    [
      '合法全量轮必须放行并带出写端点（正控：闸不得一律拒）',
      (() => {
        const r = loadRun(mkRun('ok-round.json', good))
        return r.touched !== null && r.touched.length === 1 && r.touched[0].method === 'POST'
      })()
    ]
  ]
  for (const [desc, ok] of cases24) if (!ok) fail.push(`㉔ ${desc}`)
  // ㉕ **窗口精度闸**双向（b82 实测）：runner 曾把 `windowEnd` 截到整秒，而 `oper_time` 带小数秒，
  //    SQL 侧是字符串比较 ⇒ 落在最后一秒内的写入全被排除，本轮最后一个模块（M90）的 5 个写端点
  //    被同一轮的判据读成"未触达"。消费方必须自己证精度，而不是替生产者把窗口放宽一秒。
  const cases25 = [
    [
      '整秒窗口必须拒，且理由指向字符串比较把最后一秒排除',
      (() => {
        try {
          assertWindowPrecision({ windowStart: '2026-01-01 00:00:00', windowEnd: '2026-01-02 00:00:00' }, '(夹具)')
          return false
        } catch (e) {
          return /只到整秒/.test(e.message) && /字符串比较/.test(e.message)
        }
      })()
    ],
    [
      '带毫秒的窗口必须放行（正控：闸不得一律拒）',
      (() => {
        try {
          assertWindowPrecision(
            { windowStart: '2026-01-01 00:00:00.123', windowEnd: '2026-01-02 00:00:00.987' },
            '(夹具)'
          )
          return true
        } catch {
          return false
        }
      })()
    ],
    [
      '缺字段/空串不由本闸管（readWindow 已负责），这里必须不抛',
      (() => {
        try {
          assertWindowPrecision({ windowStart: '', windowEnd: undefined }, '(夹具)')
          return true
        } catch (e) {
          fail.push(`㉕ 缺字段被本闸抢着报了（应与 readWindow 分工）：${e.message}`)
          return false
        }
      })()
    ]
  ]
  for (const [desc, ok] of cases25) if (!ok) fail.push(`㉕ ${desc}`)
  // ㉖ **旗标必须有生效路径**（b83 C3）：`--migrate-baseline` 只有配 `--update-baseline` 才改变行为；
  //    单用或配 `--gate` 都是"读了但走不到"。这类缺陷的输出与正常跑逐字节同形，只能由组合闸拦。
  const cases26 = [
    ['单用 --migrate-baseline 必须拒（不写基线 ⇒ 无效）', migrateChannelCheck(['--migrate-baseline']) !== null],
    [
      '--migrate-baseline + --gate 必须拒（口径闸在 gate 一支恒 FATAL）',
      migrateChannelCheck(['--gate', '--migrate-baseline']) !== null
    ],
    [
      '--migrate-baseline + --retire-stale 必须拒（退役同样要求同口径可比）',
      migrateChannelCheck(['--retire-stale', '--migrate-baseline']) !== null
    ],
    [
      '--migrate-baseline + --update-baseline 必须放行（正控：闸不得一律拒）',
      migrateChannelCheck(['--update-baseline', '--migrate-baseline']) === null
    ],
    ['不带该旗标的常规组合必须放行（正控）', migrateChannelCheck(['--gate', '--operlog']) === null],
    [
      '拒绝理由必须点名可用的那条通道（否则人只会再试一次别的错组合）',
      /--update-baseline/.test(migrateChannelCheck(['--migrate-baseline']) || '')
    ]
  ]
  for (const [desc, ok] of cases26) if (!ok) fail.push(`㉖ ${desc}`)
  fs.rmSync(TMPD, { recursive: true, force: true })

  if (fail.length) {
    console.log('SYNTH_FAIL:')
    fail.forEach((f) => console.log(`  · ${f}`))
    return 1
  }
  // 条数：①–⑱ 是手编号的既有用例（18 条），⑲⑳ 由用例表长度派生——新增用例时只有 18 那一个是常量，
  // 它对应代码里确实存在的 18 个编号，不是一句凭记忆的叙述。
  console.log(
    `SYNTH_OK 写端点触达判据 ${18 + baseCases.length + cases22.length + cases23.length + 3 + cases21.length + cases24.length + cases25.length + cases26.length} 条双向（既有用例 18 条：4 类响亮失败 + 正控条数 + ` +
      `服务端触达源 4 条 + 窗口自证 3 条 + 源族标签 1 条；基线可比性 ${baseCases.length} 条；基线新鲜度 ${cases22.length} 条；` +
      `集合式棘轮 3 条；未触达登记表对账 ${cases21.length} 条；退役登记 ${cases23.length} 条；执行完整性闸 ${cases24.length} 条；` +
      `窗口精度闸 ${cases25.length} 条；旗标生效路径 ${cases26.length} 条）`
  )
  return 0
}

/**
 * 本次跑用了哪些**源族**（写进基线，防止"两源结果与一源基线"做差集 ⇒ 数字白赚）。
 * 只记族不记窗口：窗口每轮都不同，写进比对键会让 `--gate` 每轮都拒绝比对（那就等于没接线）；
 * 具体窗口另存 `window` 字段供人核对。
 */
function sourceTag({ withOperLog }) {
  return (withOperLog ? ['oper_log', 'reqstats'] : ['reqstats']).sort().join('+')
}

/**
 * 棘轮的**集合式**回归判据（b79 收口第三轮）。
 * 原实现只比"未触达条数有没有变多"，那是数值棘轮套在集合判据上：本轮新增 3 条未触达、
 * 同时消掉 5 条，总数下降 ⇒ 通过。但"新增的那 3 条"恰恰是判据要抓的退化（某个天天打的
 * 写端点这轮不打了）。所以必须逐条对账：`基线里没有的未触达项` 一律算退步，条数只是次要信号。
 */
export function coverageRegressions(prevUncovered, curUncovered) {
  const prev = new Set(prevUncovered)
  return curUncovered.filter((k) => !prev.has(k))
}

/**
 * 基线可比性闸（b79 收口第三轮）：**缺口径字段一律拒绝比对**，而不是"没记就当成一致"。
 * b79 实测踩过：旧基线没有 `sources`，`base.sources && base.sources !== sources` 这一条
 * 短路放行，`--gate` 拿着"一源基线 vs 两源本轮"打了绿色的"逐条一致或更好"——
 * 换判据白赚一个更低的数字，正是 §7.19 立这条纪律要避免的事，却被自己的短路求值绕过去了。
 */
export function assertComparableBaseline(base, { sources, withOperLog, fileLabel = BASELINE }) {
  if (!base) throw new Error(`基线不存在：${fileLabel}（用 --update-baseline 在全量轮后生成）`)
  if (base.full !== true) {
    throw new Error(`基线未标记 full（实际 ${JSON.stringify(base.full)}）——分段轮基线与全量轮不可比对（§3.63）`)
  }
  if (!Array.isArray(base.uncovered)) throw new Error('基线没有 uncovered 数组，无法逐条对账')
  if (typeof base.sources !== 'string' || !base.sources) {
    throw new Error(
      `基线没有记录 sources（旧格式，${fileLabel}）⇒ **无法确认判据口径**（几个触达源、有没有并服务端留痕），拒绝比对。` +
        `要么用与基线相同的旗标跑，要么显式加 --migrate-baseline 承认这是口径迁移`
    )
  }
  if (base.sources !== sources) {
    throw new Error(
      `基线源集合是 ${base.sources}，本轮是 ${sources}——换源必须先换基线（拿两源结果对一源基线会白赚一个更低的数字）`
    )
  }
  if (withOperLog) {
    const w = base.window
    if (!w || typeof w.since !== 'string' || typeof w.until !== 'string') {
      throw new Error(
        `两源口径下基线必须带 window（实际 ${JSON.stringify(w)}）——服务端那一路按窗口取数，` +
          `没有窗口就无法确认两次是同一时间口径，拒绝比对`
      )
    }
    if (w.since >= w.until) throw new Error(`基线窗口方向可疑：${w.since} .. ${w.until}`)
  }
  return base
}

/**
 * 退役登记（b82，纯函数 + `--retire-stale` 旗标）。
 *
 * `stale`（"这轮真被打过、登记表里还挂着理由"）此前**只打 ℹ**。b81 的实测后果就是它的代价：
 * 18 条 `kind=todo` 里 17 条早已由 M88/M89/main 打过，台账却照单记下"18 条待补"，
 * 于是下一批会去已覆盖的端点上重复造判据，而真缺口混在里面看不出来。
 * **采了不判 = 没判**（b79 ⑨ 那条纪律对"提示类输出"同样成立）。
 *
 * 规则：只删"当前未触达集合里没有对应条目"的键；未触达但没登记的键**一个都不碰**
 * （那是要补的理由，不是能退役的条目）。返回被删的键，由调用方打印留痕。
 */
export function retireStaleKeys(reasons, uncoveredKeys) {
  const keep = new Set(uncoveredKeys)
  const stale = Object.keys(reasons).filter((k) => !keep.has(k))
  for (const k of stale) delete reasons[k]
  return stale
}

/**
 * 基线**新鲜度**闸（b82 新增，实测抓回一类"记大欠账"的漂移）。
 *
 * `assertComparableBaseline` 只确认两次比的是同一**口径**（源集合、有没有窗口字段），
 * 不确认是同一**断面**。b81 收口时就是这样漏的：基线停在 `2026-10-20 04:59–05:45`，
 * 而它旁边的数据集自证窗口是 `18:44–19:36`——差 8 小时，`--gate` 照样绿。
 * 后果不是假绿而是**记大欠账**：那 8 小时里 M88/main 真打过 17 个写端点，
 * 台账却把 18 条记成 `kind=todo` 欠账（实测 `--operlog` 用当前断面跑，todo 只剩 5 条）。
 * 方向与 b74 轮 25 的"静默少报"相反，同源成因相同：**判据读的是自己的旧断面，而不是事实**。
 *
 * 只在窗口"由数据集自证"时要求新鲜：显式 `--since/--until` 是历史对账的合法用法，
 * 那种时候断面不同正是目的，所以本闸只在调用方确认窗口来自数据集时才由 main 触发。
 */
export function assertFreshBaseline(base, { since, until, fileLabel = BASELINE }) {
  if (!since || !until) return base // 没给当前断面 = 本闸无从判起（调用方负责只在有断面时进来）
  const w = base && base.window
  if (!w || typeof w.since !== 'string' || typeof w.until !== 'string') {
    throw new Error(
      `本轮断面是 ${since} .. ${until}，但基线没带可比窗口（实际 ${JSON.stringify(w)}）⇒ ` +
        `无法确认两边是同一时间断面，拒绝比对。请用产生本轮数据集的那一次全量同批跑 --update-baseline`
    )
  }
  if (w.since !== since || w.until !== until) {
    throw new Error(
      `基线窗口 ${w.since} .. ${w.until} ≠ 本轮数据集自证窗口 ${since} .. ${until}（${fileLabel}）⇒ ` +
        `差集比的是两个时间断面的库，不是同一轮。必须与重生成基线同批：先跑全量，再 --update-baseline；` +
        `拿旧断面当欠账清单会把已覆盖的端点记成 todo（b81 实测 18 条里 17 条属此类）`
    )
  }
  return base
}

/**
 * 基线落盘。`window` 只在两源口径下有意义（服务端那一路按窗口取数）；
 * 单源基线留 `window: null` 并写明原因，避免下一个人以为"窗口丢了"。
 * `note` 里钉住一条会随时间失效的事实：`sys_oper_log` 保留 90 天，
 * 超窗后两源 `--gate` 的触达数会**因为库里没行而下跌**——那读起来像覆盖退化，
 * 实际是判据输入被保留期清掉了。所以基线必须随每轮全量重生成，不能当长期档案。
 */
function writeBaseline({ sources, total, uncovered, since, until, withOperLog, migratedFrom }) {
  const body = {
    generatedAt: new Date().toISOString(),
    full: true,
    sources,
    total,
    window: withOperLog ? { since, until } : null,
    // 口径迁移必须**写在文件里**，不能让"数字变小"这件事冒充覆盖变好：
    // 这份基线如果是从不可比对的旧基线覆盖来的，就如实记下旧基线的口径与条数。
    ...(migratedFrom ? { migratedFrom } : {}),
    note: withOperLog
      ? '两源并集：reqstats（客户端出网）∪ sys_oper_log DISTINCT(方法,路径)（服务端权威留痕）。oper_log 保留 90 天 ⇒ 窗口过期后必须用新一轮全量重生成基线，不得拿旧窗口的差集判新状态。'
      : '单源（仅 reqstats）：UI 触发的端点没有路径字面量、而断言里的路径字符串会造成假报，故已改走两源并集（--operlog）。此基线仅存事实，不再作为判据口径。',
    uncovered
  }
  fs.writeFileSync(BASELINE, JSON.stringify(body, null, 2) + '\n', 'utf8')
  return body
}

/**
 * `--migrate-baseline` 的**可用组合**判据（b83 C3）。
 * 这个旗标只在"写基线"那一条路径上真的改变行为（① 口径闸从 FATAL 降为 WARN，② 落 `migratedFrom`）。
 * 单独使用、或配 `--gate` 使用时，它被代码读了、但那条路径算不到它 ⇒ **静默无效**：
 * 使用者以为"我承认了这是口径迁移"，实际什么都没发生（与 b82 §11 的 `--accept-new-key`
 * 死代码、`--retire-stale` 缺 `comparable` 同族——**旗标的前提必须由旗标所在的那条路径真的成立**）。
 * 报错误的组合而不是让它空跑，因为"跑了且无效"与"跑了且有效"从输出上看不出来。
 */
function migrateChannelCheck(list) {
  if (!list.includes('--migrate-baseline')) return null
  if (!list.includes('--update-baseline')) {
    return (
      '--migrate-baseline 只在写基线时有效（口径闸降级为 WARN + 落 migratedFrom），' +
      `没带 --update-baseline 时它不改变任何行为。当前旗标：${list.join(' ') || '(无)'}`
    )
  }
  if (list.includes('--gate')) {
    return (
      '--migrate-baseline 与 --gate 互斥：口径闸在 --gate 那一律 FATAL（不承认迁移），' +
      '两个一起给等于把承诺挂在自己永远走不到的分支上。先用 --update-baseline --migrate-baseline 迁移口径，再单独 --gate'
    )
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) process.exit(runSelftest())
  const migrateErr = migrateChannelCheck(args)
  if (migrateErr) {
    console.log(`[FATAL] ${migrateErr}`)
    process.exit(2)
  }
  const withOperLog = args.includes('--operlog')
  let since = (args.find((a) => a.startsWith('--since=')) || '').slice('--since='.length)
  let until = (args.find((a) => a.startsWith('--until=')) || '').slice('--until='.length)
  let routes, touched
  const sources = sourceTag({ withOperLog })
  // 窗口是不是"数据集自证"的？显式 --since/--until 是历史对账的合法用法，
  // 那种场景下断面不同正是目的，新鲜度闸不得拦（拦了就没法回答"三周前那条到底覆盖没有"）。
  let windowFromDataset = false
  try {
    routes = parseWriteRoutes(ROUTER_DIR)
    touched = loadTouched(DATASET)
    if (withOperLog) {
      if (!since || !until) {
        // 不给人抄窗口的机会：窗口由数据集自证（runner 写入，UTC 口径与 oper_time 一致）。
        // 显式给了 --since/--until 仍然以人给的为准（历史对账需要能指定任意窗口）。
        const w = loadWindow(DATASET)
        // 窗口精度必须不小于被查询列（b82 实测：runner 曾把窗口截到整秒，而 `oper_time` 带小数秒
        // ⇒ 字符串比较把"落在最后一秒内"的写入全排除，本轮最后一个模块的 5 个写端点被静默判成未触达）
        assertWindowPrecision(JSON.parse(fs.readFileSync(DATASET, 'utf8')), DATASET)
        since = w.since
        until = w.until
        windowFromDataset = true
        log(`窗口取自数据集自证字段：${since} .. ${until}（UTC，与 oper_time 同口径同精度）`)
      }
      const { DB_PATH } = await import('./db-path.mjs')
      const db = new DatabaseSync(DB_PATH, { readOnly: true })
      try {
        touched = touched.concat(serverTouchedFromOperLog(db, since, until))
      } finally {
        db.close()
      }
    }
  } catch (e) {
    console.log(`[FATAL] ${e.message}`)
    process.exit(2)
  }
  const res = analyze(routes, touched)
  log(
    `触达源 ${sources} / 写路由 ${res.total} 条 / 触达到的写端点类型 ${res.touchedKinds} 种 / 未触达 ${res.uncovered.length} 条`
  )
  const cur = res.uncovered
  // **口径闸必须排在登记表闸之前**（b79 实测）：登记表条目是相对**两源**未触达集合定义的，
  // 拿单源旗标跑 ⇒ 服务端那一路白捡的 25 条（161 − 136）全都不在登记表里，被报成"没登记理由"，
  // 而真正的问题是旗标与基线不同口径。顺序写反会把人引去给**已被服务端证明打过**的端点补登记——
  // 那等于让判据把事实改成与自己一致，之后 `--gate` 恒绿（导错方向的闸比没有闸更糟）。
  let base = null
  if (fs.existsSync(BASELINE)) {
    try {
      base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    } catch (e) {
      console.log(`[FATAL] 基线文件解析失败：${BASELINE} — ${e.message}（"没有基线"与"基线坏了"必须可区分）`)
      process.exit(2)
    }
  }
  const migrate = args.includes('--migrate-baseline')
  let comparable = false
  // `--retire-stale` 也在这一支里（b82 接线缺陷）：退役通道自己要求 `comparable`（下面 ③ 那道闸），
  // 而这个标志**原先只在 `--gate`/`--update-baseline` 时被赋值** ⇒ 拿新鲜断面来退役也永远被拒，
  // 报的还是一句"先跑全量、同批 --update-baseline"，而基线恰恰是刚用同批数据写过的。
  // 与 §11 那条 `--accept-new-key` 死代码同族：**旗标要求的前提，必须由旗标所在的那条路径真的算出来**。
  if (args.includes('--gate') || args.includes('--update-baseline') || args.includes('--retire-stale')) {
    // 首次生成（基线文件不存在）不需要可比性；其余一律先过口径闸（缺 sources / 缺 window 都拒）。
    if (base || args.includes('--gate')) {
      try {
        assertComparableBaseline(base || {}, { sources, withOperLog })
        comparable = true
      } catch (e) {
        if (args.includes('--gate') || !migrate) {
          console.log(`[FATAL] ${e.message}`)
          process.exit(2)
        }
        console.log(`[WARN] 口径迁移（--migrate-baseline）：${e.message}`)
      }
    }
  }
  // 口径闸之后、内容闸之前再钉一道**新鲜度闸**（b82）：同一口径不同断面，比出来的
  // 是"两个时间断面的差"，会把已被真实覆盖的端点记成欠账（实测 18 条 todo 里 17 条如此）。
  // 退役通道同样必须过这道闸：拿旧断面"退役"等于把"旧断面没打过"这个假象永久签名进登记表，
  // 比记大欠账更糟——欠账至少还看得见。
  if (
    comparable &&
    (args.includes('--gate') || args.includes('--retire-stale')) &&
    withOperLog &&
    windowFromDataset &&
    base
  ) {
    try {
      assertFreshBaseline(base, { since, until })
    } catch (e) {
      console.log(`[FATAL] ${e.message}`)
      process.exit(2)
    }
  }
  // 每条未触达都必须有签名：登记表缺失/坏形状 ⇒ EXIT=2；有未登记项 ⇒ `--gate` 红、
  // `--update-baseline` **拒绝落盘**（把没看过的新洞写进基线，等于用"收紧"的名义把它藏起来）。
  let reasons
  try {
    reasons = loadReasons()
  } catch (e) {
    console.log(`[FATAL] ${e.message}`)
    process.exit(2)
  }
  const reg = auditReasons(cur, reasons)
  log(
    `未触达登记：${reg.registered}/${cur.length} 条已签名（kind=todo 欠账 ${reg.todo.length} 条；登记可退役 ${reg.stale.length} 条）`
  )
  if (reg.missing.length || reg.badKind.length) {
    console.log(`❌ 未触达但没登记理由：${reg.missing.length} 条；登记值非法：${reg.badKind.length} 条`)
    reg.missing
      .slice(0, 20)
      .forEach((k) =>
        console.log(`    · ${reg.missingWhy[k] ? `登记的理由不合格（${reg.missingWhy[k]}）：` : '无登记：'}${k}`)
      )
    reg.badKind.slice(0, 20).forEach((k) => console.log(`    · 非法分类：${k}`))
    if (args.includes('--gate') || args.includes('--update-baseline')) {
      console.log(`    判据：未触达要逐条定性写进 ${REASONS}（kind ∈ ${REASON_KINDS.join(' / ')}），再谈收紧基线`)
      console.log(
        `    注意口径：本表的签名集合按**触达源**划分，当前用的是 ${sources}（基线记的是 ${base && base.sources ? base.sources : '(无基线)'}）——换旗标请先换登记表`
      )
      process.exit(1)
    }
  } else if (reg.todo.length) {
    log(
      `ℹ 欠账 ${reg.todo.length} 条（本可自动化，这一批没做）：${reg.todo.slice(0, 8).join(', ')}${reg.todo.length > 8 ? ' …' : ''}`
    )
  }
  // `--retire-stale`：把"本轮已被证明打过、登记表里还挂着理由"的条目真正删掉。
  // 只在**同口径 + 新鲜断面**下允许——否则退役的是"旧断面没打过"的假象，
  // 那等于用一次退役把 §5 那个缺陷永久洗进登记表（比记大欠账更糟：欠账至少还看得见）。
  if (args.includes('--retire-stale')) {
    if (!withOperLog || !comparable || !windowFromDataset || !base) {
      console.log(
        `❌ 拒绝退役登记：需要 --operlog + 可比对且窗口取自数据集自证的基线（实际 withOperLog=${withOperLog} comparable=${comparable} windowFromDataset=${windowFromDataset} 基线=${base ? '有' : '无'}）` +
          `\n    先跑全量、同批 --update-baseline，再退役；拿旧断面退役会把已覆盖的假欠账永久签名`
      )
      process.exit(2)
    }
    if (reg.missing.length || reg.badKind.length) {
      console.log('❌ 拒绝退役登记：当前未触达集合里还有没签名/签名非法的条目，先补理由再退役')
      process.exit(1)
    }
    const removed = retireStaleKeys(reasons, cur)
    fs.writeFileSync(REASONS, JSON.stringify(reasons, null, 2) + '\n', 'utf8')
    log(`已退役 ${removed.length} 条登记（本轮两源都证明打过）；剩余 ${Object.keys(reasons).length} 条`)
    removed.slice(0, 24).forEach((k) => log(`    · 退役：${k}`))
    if (removed.length > 24) log(`    · …另 ${removed.length - 24} 条`)
  }
  if (args.includes('--gate') || args.includes('--update-baseline')) {
    const prev = base && Array.isArray(base.uncovered) ? base.uncovered : null
    if (prev) {
      log(
        `窗口对账：基线记的是 ${base.window ? `${base.window.since} .. ${base.window.until}` : '(无，单源基线)'}，本轮实际用 ${since} .. ${until}`
      )
      // 集合式对账：**任何**基线里没有的未触达项都是退步，条数下降不能抵消它
      const added = coverageRegressions(prev, cur)
      const removed = prev.filter((k) => !cur.includes(k))
      if (added.length) {
        console.log(
          `❌ 新增未触达写端点 ${added.length} 条（基线 ${prev.length} → 本轮 ${cur.length}，另消掉 ${removed.length} 条）：`
        )
        added.forEach((k) => console.log(`    · ${k}`))
        if (args.includes('--gate')) process.exit(1)
      } else {
        log(`✅ 与基线逐条一致或更好（基线 ${prev.length} → 本轮 ${cur.length}，消掉 ${removed.length} 条，新增 0 条）`)
      }
      if (args.includes('--update-baseline')) {
        if (added.length || cur.length > prev.length) {
          console.log(
            `❌ 拒绝放松棘轮：新增未触达 ${added.length} 条 / 本轮总数 ${cur.length} > 基线 ${prev.length}，基线**未改动**`
          )
          process.exit(1)
        }
        writeBaseline({
          sources,
          total: res.total,
          uncovered: cur,
          since,
          until,
          withOperLog,
          // 口径迁移这件事必须由文件自己说出来，否则下一个人会把这个更低的数字读成"覆盖变好了"
          // （`comparable` 用的是**上面那道已经跑过的闸**，不在这里重复判一次——两处判据会漂）
          ...(comparable || !migrate
            ? {}
            : { migratedFrom: { sources: base.sources ?? null, window: base.window ?? null, uncovered: prev.length } })
        })
        log(
          `✅ 基线已收紧：未触达 ${cur.length} 条（原 ${prev.length}）${migrate ? '（口径迁移，已记 migratedFrom）' : ''}`
        )
        process.exit(0)
      }
    } else if (args.includes('--update-baseline')) {
      writeBaseline({ sources, total: res.total, uncovered: cur, since, until, withOperLog })
      log(`✅ 基线已生成：${BASELINE}（未触达 ${cur.length} / 共 ${res.total}）`)
      process.exit(0)
    }
  }
  if (cur.length) {
    console.log('---- 本轮全量未触达的写端点 ----')
    cur.forEach((k) => console.log(`  · ${k}`))
  }
  process.exit(0)
}

// **只有被当命令执行时才跑入口**（b79 收口第三轮）：本文件底部原先是裸 `main()`，
// 于是 `import` 它的那个脚本会被 argv 语义劫持——实测 `request-storm --selftest` 一 import
// 就打印**本文件**的 SYNTH_OK 并 `process.exit(0)`，自己 12 组一条没跑却"绿"了。
// 共享纯函数模块 `dataset-window.mjs` 解决的是"两份实现必漂"，这条解决的是"判据脚本根本不可 import"
// ——收口期的跨窗口对账脚本也需要这里的 `analyze` / `serverTouchedFromOperLog`，而不是复制一份判据。
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
