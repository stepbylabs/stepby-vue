/**
 * capture-kit 后端日志摘要自检（b73 轮 9 固化，常驻工具，非用例门禁）
 *
 * 为什么需要：`summarizeBackendLogErrors` 是**所有**轮次"综合分析错误警告"环节的入口，
 * 它自己坏掉时不会报错、只会静默给出不可归因的清单（实证：轮 9 前它把历史日期的
 * ×9 `tower_http on_failure 503` 报成本轮信号，消耗一整轮去追一个不存在的问题；
 * 又把 438 行裂成 751 型，计数排序完全失去意义）。
 * 因此用**合成日志**做确定性自检，不依赖运行中的后端与当天日志内容：
 *   ① 窗口：`sinceMs` 之前的行、以及无时间戳的行都必须排除并单独计数；
 *   ② ANSI：修复前落盘的历史日志在 `request_id` 两侧带 ESC 码，聚合键必须先削 ANSI
 *      （产品侧已在 `stepby-axum/src/logger.rs` 关闭 span 层 ANSI，这里是消费侧纵深防御）；
 *   ③ 归一：request_id / UUID / 数字 → N，同形状消息聚成"一型 ×N"；
 *      非 id 的文本差异不得被聚合掉（否则不同业务消息会被误并）。
 *
 * 运行：node tests/e2e/capture-kit-selftest.mjs   （EXIT=0 且打印 SYNTH_OK 为通过）
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import {
  summarizeBackendLogErrors,
  resolveBackendLogDir,
  detectPartialFailure,
  createCaptureHub,
  instrumentClickProto,
  markClickLanded,
  clickFailureRows,
  CLICK_METHOD_NAMES
} from './capture-kit.mjs'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logwin-'))
const esc = String.fromCharCode(27)
// 用真实修复前的形态：span 字段名/等号两侧带 ANSI，request_id 与尾部数字各不相同
// （真实日志里的可变部分就是 id/数字，如 tenant_id= / count= / path=；
//   非 id 的文本差异**不该**被聚合掉，否则会把不同业务消息误并成一型）
const spanWarn = (sec, id, tenant) =>
  `2026-10-16T12:00:0${sec}.000000Z  WARN request{${esc}[3mrequest_id${esc}[0m${esc}[2m=${esc}[0m${id}}: svc::foo: src\\a.rs:10: 租户已停用 tenant_id=${tenant}`

const lines = [
  `2026-10-16T10:00:00.000000Z  INFO pre-window info`,
  `2026-10-16T10:00:01.000000Z ERROR pre-window error`, // 窗口前，应被排除
  spanWarn(1, 'aaaaaaaa-1111-4222-9333-dddddddddddd', 101),
  spanWarn(2, 'bbbbbbbb-1111-4222-9333-dddddddddddd', 202),
  spanWarn(3, 'cccccccc-1111-4222-9333-dddddddddddd', 303), // 三条同形状、仅 id/数字不同 ⇒ 聚成 1 型 ×3
  `2026-10-16T12:30:00.000000Z ERROR svc::bar: src\\b.rs:20: 真实错误信号`,
  // 无时间戳行 → 不可归因，窗口存在时应排除
  `ERROR no-timestamp-orphan`
]
fs.writeFileSync(path.join(dir, 'app.log.2026-10-16'), lines.join('\n') + '\n', 'utf8')

const WINDOW = Date.parse('2026-10-16T11:00:00Z') // 排除两条 10:xx + 无时缀行
const s = summarizeBackendLogErrors({ logDir: dir, sinceMs: WINDOW })

const fail = []
console.log('files=%s total=%s excluded=%s kinds=%s', s.files.join('+'), s.total, s.excluded, s.items.length)
for (const [k, n] of s.items) console.log(`  x${n} ${k}`)

// 窗口内 ERROR/WARN 行：3×spanWarn + 1×bar ERROR = 4
if (s.total !== 4) fail.push(`window total expected 4, got ${s.total}`)
// 排除：pre-window ERROR + 无时缀 ERROR = 2
if (s.excluded !== 2) fail.push(`excluded expected 2, got ${s.excluded}`)
// 去重：3 条同形状 → 1 型；加 bar ERROR → 共 2 型
if (s.items.length !== 2) fail.push(`kinds expected 2, got ${s.items.length}`)
const top = s.items[0]
if (!(top[1] === 3 && /svc::foo/.test(top[0]))) fail.push(`top kind should be x3 svc::foo, got x${top[1]} ${top[0]}`)
// ANSI 已被归一削掉（键里不应残留 ESC）
if (s.items.some(([k]) => k.includes(esc))) fail.push('ANSI leaked into aggregate key')
// request_id 已归一为 N
if (!s.items.some(([k]) => /request_id=N/.test(k))) fail.push('request_id not normalized to N')

// ④ 目录不可读必须显式 missing=true（不能静默当成"本轮无异常"）——b73 轮 10 静默失效的锁
const miss = summarizeBackendLogErrors({ logDir: path.join(dir, 'nope'), sinceMs: WINDOW })
if (!miss.missing) fail.push('nonexistent log dir must report missing=true')
if (miss.total !== 0 || miss.items.length !== 0) fail.push('missing dir must not fabricate findings')

// ⑤ 默认目录锚定文件位置而非 cwd：从任意启动目录都该解析到同一个真实 stepby-axum/logs
const expected = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'stepby-axum', 'logs')
if (path.resolve(resolveBackendLogDir()) !== expected) {
  fail.push(`default log dir should anchor to file, got ${resolveBackendLogDir()}`)
}

// ⑥ 「HTTP 200 但响应体写着一部分失败」判据（批七十九新增捕获面）——双向都要钉：
//    漏报 = 这一族永久隐形（batchLogout 就是这么把"撤不掉会话"报成全绿的）；
//    误报 = 读接口/正常空明细也被记成失败，噪声会把真信号淹掉（同 b69 oper_log 教训）。
const CJ = 'application/json;charset=utf-8'
const partialCases = [
  [
    'batchLogout 真实形态必须抓',
    'POST',
    200,
    CJ,
    '{"code":200,"msg":"操作成功","data":{"successCount":1,"failed":[{"tokenHash":"ab","code":401,"msg":"会话已失效"}]}}',
    true
  ],
  ['errors[] 形态必须抓', 'PUT', 200, CJ, '{"code":200,"data":{"errors":["第 3 行导入失败"]}}', true],
  ['只有 failCount 数字也必须抓', 'DELETE', 200, CJ, '{"code":200,"data":{"successCount":7,"failCount":2}}', true],
  ['方法名小写也要归一后抓到', 'post', 200, CJ, '{"code":200,"data":{"failed":[{"e":1}]}}', true],
  // 反例
  ['读接口不得算部分失败', 'GET', 200, CJ, '{"code":200,"data":{"failed":[1,2,3]}}', false],
  ['明细为空数组不得报', 'POST', 200, CJ, '{"code":200,"data":{"successCount":2,"failed":[]}}', false],
  ['没有 data 不得报', 'POST', 200, CJ, '{"code":200,"data":null}', false],
  ['HTTP >= 400 归 netFails 管，不得重复计数', 'POST', 403, CJ, '{"code":403,"msg":"没有权限"}', false],
  [
    '非 JSON（导出流）不得读体判据',
    'POST',
    200,
    'application/octet-stream',
    '{"code":200,"data":{"failed":[1]}}',
    false
  ],
  ['body.code 非 200 不得进本通道', 'POST', 200, CJ, '{"code":500,"msg":"失败","data":{"failed":[1]}}', false],
  [
    '超长度上限不得解析（性能约束）',
    'POST',
    200,
    CJ,
    '{"code":200,"data":{"failed":[' + '1,'.repeat(12000) + '1]}}',
    false
  ],
  ['非 JSON 文本不得抛（解析失败即 null）', 'POST', 200, CJ, '<html>not json</html>', false]
]
for (const [desc, m, st, ct, text, want] of partialCases) {
  const got = detectPartialFailure(m, st, ct, text) !== null
  if (got !== want) fail.push(`${desc}：期望 ${want}，实际 ${got}`)
}
// 明细必须带得走的取证样本（否则枚举只有条数，对账时无从判断是哪一项）
const sample = detectPartialFailure('POST', 200, CJ, '{"code":200,"data":{"failed":[{"code":401,"msg":"会话已失效"}]}}')
if (!(sample && sample.failedCount === 1 && /会话已失效/.test(sample.sample))) {
  fail.push('部分失败样本缺失，无法逐条对账')
}

// ==================== ③ hub 的导航计数与请求分布（request-storm 的分母与分子）====================
// 为什么这条必须进自检而不只是"跑一轮看看"：`request-storm` 判的是 `次数 / max(1, 导航数)`，
// 分母坏了**不会报错**，只会让所有密度一起变大或变小——密度整体变小的那一半是静默放行，
// 比缺判据更糟（同 §门禁前言"少报比报错更危险"）。所以采集侧自己要有双向锁。
const hubFail = []
let hubChecks = 0
/** 断言条数由计数器给出，不写进文案——写死的数字抄一次就漂一次（同 md_table_guard 的口径）。 */
const assertHub = (desc, ok) => {
  hubChecks += 1
  if (!ok) hubFail.push(desc)
}
{
  const registered = new Map()
  const mkPage = (frameUrl) => {
    const main = { url: () => frameUrl }
    const page = {
      on: (ev, cb) => {
        registered.set(ev, cb)
        return page
      },
      context: () => ({ exposeBinding: () => Promise.resolve() }),
      addInitScript: () => Promise.resolve(),
      mainFrame: () => main
    }
    return { page, main }
  }
  const { page, main } = mkPage('http://127.0.0.1:8080/index')
  const hub = createCaptureHub(page, { tag: 'SYNTH', screenshot: false })
  const req = (method, url) => registered.get('request')({ method: () => method, url: () => url })
  const nav = (frame, url) => {
    // framenavigated 的入参是"发生导航的 frame"；这里按真实语义把它的 url() 换掉
    const prev = frame.url
    frame.url = () => url
    registered.get('framenavigated')(frame)
    frame.url = prev
  }
  nav(main, 'http://127.0.0.1:8080/system/user')
  nav(main, 'https://example.org/a')
  nav(main, 'about:blank')
  nav({ url: () => 'http://127.0.0.1:8080/child' }, 'http://127.0.0.1:8080/child') // 非 main frame
  assertHub(
    `导航计数应为 2（http+https 各一次，about:blank 与子 frame 不计），实际 ${hub.navCount}`,
    hub.navCount === 2
  )
  req('GET', 'http://127.0.0.1:8080/system/user/list')
  req('GET', 'http://127.0.0.1:8080/system/user/12')
  req('GET', 'http://127.0.0.1:8080/system/user/13')
  hub.beginAction('edit')
  req('PUT', 'http://127.0.0.1:8080/system/user')
  const snap = hub.requestStatSnapshot()
  const byKey = Object.fromEntries(snap.map((r) => [r.key, r.count]))
  // 数字归一：`/user/12` 与 `/user/13` 必须并成 `/user/N`，否则同一形状裂成两型、密度各自虚低
  assertHub(`数字未归一：${JSON.stringify(byKey)}`, byKey['load | GET /system/user/N'] === 2)
  assertHub(`beginAction 换桶失败：${JSON.stringify(byKey)}`, byKey['edit | PUT /system/user'] === 1)
  assertHub(
    `快照条数应为 3（list / user-N / edit PUT），实际 ${snap.length}：${JSON.stringify(byKey)}`,
    snap.length === 3
  )
  assertHub('快照未按次数降序，Top-N 打印会取错', snap[0].count >= snap[snap.length - 1].count)
}

// ⑩ DOM 兜底的救回必须**成组**（b83 实测）：`clickButton()` 一次调用会留下"真点失败 + 收遮罩后
//    再点失败"两条行，然后才走 DOM 兜底。旧 markClickLanded 只标最近一条 ⇒ 第一条永远显示
//    "未救回"，允许表就得为一族**已被证明救回**的形状逐轮签字（登记率被噪声吃掉，正是
//    endpoint-coverage 实测过的"每轮必红于是没人登记"的入口）。
//    自检不需要浏览器：造一个六个点击方法都会拒绝的假原型，即可复现真实形状。
const clickFail = []
let clickChecks = 0
const assertClick = (desc, ok) => {
  clickChecks += 1
  if (!ok) clickFail.push(desc)
}
{
  const mkHub = (tag) => {
    const main = { url: () => 'http://127.0.0.1:8080/x' }
    const page = {
      on: () => page,
      context: () => ({ exposeBinding: () => Promise.resolve() }),
      addInitScript: () => Promise.resolve(),
      mainFrame: () => main
    }
    return createCaptureHub(page, { tag, screenshot: false })
  }
  const proto = {}
  for (const name of CLICK_METHOD_NAMES) {
    proto[name] = async (sel) => {
      throw new Error(`Timeout 1000ms exceeded waiting for locator('${sel}')`)
    }
  }
  assertClick('假原型没打上补丁，后面的结论都不作数', instrumentClickProto(proto))
  const recv = {}
  const nap = (ms) => new Promise((r) => setTimeout(r, ms))
  const bad = (sel) =>
    proto.click
      .call(recv, sel, { timeout: 1000 })
      .then(() => false)
      .catch(() => true)
  const unrec = (sel) => clickFailureRows().filter((r) => r.selector === sel && !r.recovered).length

  mkHub('SYNCLICK')
  const SEL = 'button:has-text("取 消")'
  // bad() 返回"这次点击是否失败"（rejected ⇒ true），补丁必须原样把拒绝传出去且留下一条行
  assertClick(`失败点击必须留下一条行并把拒绝传出`, (await bad(SEL)) === true)
  await bad(SEL)
  assertClick(`兜底前两条都必须未救回，实际未救回=${unrec(SEL)}`, unrec(SEL) === 2)
  assertClick('DOM 兜底成功却没能标中任何一条', markClickLanded('取 消') === true)
  await nap(6)
  assertClick(`同一次调用的两条失败必须一起救回，实际仍剩 ${unrec(SEL)}`, unrec(SEL) === 0)
  await bad(SEL)
  await nap(6)
  assertClick(`兜底之后的新失败属于**下一次调用**，必须未救回，实际=${unrec(SEL)}`, unrec(SEL) === 1)

  // 对照组一：needle 对不上不得洗白（"标了个别的"不能把这条救回来）
  const SEL2 = '.app-container button:has-text("新增")'
  await bad(SEL2)
  assertClick('needle 不匹配却返回了命中', markClickLanded('根本不存在') === false)
  assertClick(`未被点名的选择器不得被洗白，实际未救回=${unrec(SEL2)}`, unrec(SEL2) === 1)

  // 对照组二：跨标签不得互相救回（M40 的成功兜底不能把 M1 的同文本失败洗绿）
  const SEL3 = 'button:has-text("保存")'
  mkHub('SYNCLICK2')
  await bad(SEL3)
  mkHub('SYNCLICK')
  assertClick('跨标签的同文本失败被"救回"了——归因边界失效', markClickLanded('保存') === false)
  assertClick(`跨标签失败必须仍然未救回，实际=${unrec(SEL3)}`, unrec(SEL3) === 1)
  mkHub('SYNCLICK2')
  assertClick('回到同标签后应当标中，却没标中', markClickLanded('保存') === true)
  assertClick(`同标签兜底后应全部救回，实际未救回=${unrec(SEL3)}`, unrec(SEL3) === 0)
  // 空白 needle 一律拒绝（否则空串会匹配任意 selector，等于把所有失败洗绿）
  assertClick('空白 needle 不得标中任何一条', markClickLanded('   ') === false)
}

const allFail = fail.concat(hubFail, clickFail)
const partialFirm = partialCases.filter((c) => c[5]).length

console.log(
  allFail.length
    ? `SYNTH_FAIL: ${allFail.join(' | ')}`
    : `SYNTH_OK 捕获工具自检：部分失败判据 ${partialCases.length} 条双向（${partialFirm} 必抓 / ` +
        `${partialCases.length - partialFirm} 必不抓）+ hub 采集侧 ${hubChecks} 条` +
        `（导航只算 main frame 的 http(s)、数字归一、beginAction 换桶、快照条数、降序）` +
        `+ 点击兜底成组救回 ${clickChecks} 条（同调用成组 / 下一次调用不连坐 / needle 不匹配不洗白 / 跨标签不互救）`
)
process.exit(allFail.length ? 1 : 0)
