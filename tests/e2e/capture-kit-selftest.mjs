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
import { summarizeBackendLogErrors, resolveBackendLogDir } from './capture-kit.mjs'

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
const expected = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'stepby-axum',
  'logs'
)
if (path.resolve(resolveBackendLogDir()) !== expected) {
  fail.push(`default log dir should anchor to file, got ${resolveBackendLogDir()}`)
}

console.log(fail.length ? `SYNTH_FAIL: ${fail.join(' | ')}` : 'SYNTH_OK')
process.exit(fail.length ? 1 : 0)
