/**
 * 跨仓镜像锁：**收件人判据的用例表只能有一份事实源**（b144）。
 *
 * ## 立的案
 *
 * 报表订阅的收件人（`receiveEmail`，逗号分隔）在两个入口都**没有任何表单规则**，
 * 而服务端 `sys_report_service.rs` 用 `split_emails` + `is_valid_email` 判它。
 * 于是两个方向都会坏：
 * - 不加规则：填错要跑一趟网络换回一句「收件邮箱格式不正确」，不点名是哪几个地址；
 * - 按"常见邮箱正则"加规则：`ops@mail` / `root@localhost` / `a@123` 这些**服务端接受**的
 *   自托管/内网形态被前端挡在本地（AGENTS《前端外部输入归一规范》判据 2：
 *   "为安全把合法值也挡掉"同样是缺陷）。
 *
 * ## 这一把锁判四件事
 *
 * 1. **表的存在性**：Rust 侧 `test_is_valid_email_matches_frontend_mirror` 里的
 *    `valid` / `invalid` 两个数组必须解析得出来——解析不到 ⇒ 直接失败（"扫不到"与"干净"必须可分）；
 * 2. **两侧同表**：`emailRecipients.test.ts` 里签字的 `VALID` / `INVALID` 与 Rust 的两个数组
 *    必须**集合相等**（谁单方面加/删一条都红）；
 * 3. **行为镜像**：把 Rust 的表逐条喂给前端实现，合法项必须被接受、非法项必须被拒绝
 *    —— 这才是"前端不严于也不松于服务端"的可执行形态；
 * 4. **接线**：两个订阅入口都必须真的用 `recipientRule`（不是"文件里提到过一次"，
 *    而是各自 `receiveEmail` 键下有一条规则），并且邮件通道没勾时不得拦（服务端也不看）。
 *
 * 读不到 Rust 文件一律**响亮失败**，与 `pageSizeLimit.guard` / `blobTimeout.guard` 同口径。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isRecipientValid, recipientProblem, recipientRule, splitRecipients } from '@/utils/emailRecipients'

const UTIL_DIR = resolve(dirname(fileURLToPath(import.meta.url)))
const SRC = resolve(UTIL_DIR, '..')
const VUE_ROOT = resolve(SRC, '..')
const AXUM_REPORT_SVC = resolve(VUE_ROOT, '..', 'stepby-axum', 'src', 'service', 'sys_report_service.rs')
const CASES_TS = resolve(UTIL_DIR, 'emailRecipients.test.ts')
const SUB_SECTION_VUE = resolve(SRC, 'views', 'system', 'report', 'SubReportSection.vue')
const SUB_PAGE_VUE = resolve(SRC, 'views', 'system', 'report', 'sub', 'index.vue')

/** 取 `marker` 之后第一个 `[...]` 里的全部字符串字面量（两侧语言共用一把小解析器）。 */
function stringList(src: string, marker: string): string[] | null {
  const at = src.indexOf(marker)
  if (at < 0) return null
  const open = src.indexOf('[', at)
  if (open < 0) return null
  const close = src.indexOf(']', open)
  if (close < 0) return null
  const inner = src.slice(open + 1, close)
  const out: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g
  for (const m of inner.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '') as string
    out.push(JSON.parse(`"${raw}"`) as string)
  }
  return out
}

const rust = readFileSync(AXUM_REPORT_SVC, 'utf8')
const rustTable = rust.slice(rust.indexOf('fn test_is_valid_email_matches_frontend_mirror'))
const RUST_VALID = stringList(rustTable, 'let valid')
const RUST_INVALID = stringList(rustTable, 'let invalid')

const casesSrc = readFileSync(CASES_TS, 'utf8')
const TS_VALID = stringList(casesSrc, 'const VALID')
const TS_INVALID = stringList(casesSrc, 'const INVALID')

describe('收件人判据的跨仓镜像（b144）', () => {
  it('① 两侧的用例表都必须解析得出来（解析不到 = 判据输入坏了，不得读成"没有差异"）', () => {
    expect(rust, `Rust 源里找不到 test_is_valid_email_matches_frontend_mirror（服务端那张表被改名/删除）`).toContain(
      'fn test_is_valid_email_matches_frontend_mirror'
    )
    for (const [name, list] of [
      ['Rust valid', RUST_VALID],
      ['Rust invalid', RUST_INVALID],
      ['TS VALID', TS_VALID],
      ['TS INVALID', TS_INVALID]
    ] as Array<[string, string[] | null]>) {
      expect(list, `${name} 数组必须能解析出来`).not.toBeNull()
      expect((list ?? []).length, `${name} 解析出的用例数不得低于 6（少于即解析器走偏）`).toBeGreaterThanOrEqual(6)
    }
    // 循环极性必须在：表在而极性没了 ⇒ "两半都当合法测"也能绿
    expect(rustTable, 'valid 表必须由 assert!(is_valid_email(email)) 消费').toContain('assert!(')
    expect(rustTable).toMatch(/for email in valid/)
    expect(rustTable).toMatch(/for email in invalid/)
    expect(rustTable, 'invalid 表必须以取反极性断言').toMatch(/assert!\(\s*!is_valid_email/)
  })

  it('② 两侧同表：任何一方单独增删一条用例都必须红（集合相等，双向）', () => {
    const norm = (list: string[] | null) => [...(list ?? [])].sort()
    expect(norm(TS_VALID), '前端 VALID 必须与 Rust valid 集合相等').toEqual(norm(RUST_VALID))
    expect(norm(TS_INVALID), '前端 INVALID 必须与 Rust invalid 集合相等').toEqual(norm(RUST_INVALID))
    // 两半不得重叠：同一值既"必须接受"又"必须拒绝"说明表被抄坏了
    const overlap = (RUST_VALID ?? []).filter((v) => (RUST_INVALID ?? []).includes(v))
    expect(overlap, '合法/非法两半不得含同一个值').toEqual([])
  })

  it('③ 行为镜像：把服务端的表逐条喂给前端实现，结局必须与极性一致', () => {
    for (const email of RUST_VALID ?? []) {
      expect(isRecipientValid(email), `服务端接受 ${email} ⇒ 前端必须同样接受（不得加严）`).toBe(true)
    }
    for (const email of RUST_INVALID ?? []) {
      expect(isRecipientValid(email), `服务端拒绝 ${email} ⇒ 前端必须同样拒绝（不得放宽）`).toBe(false)
    }
  })

  it('④ 拆分语义同源：trim + 丢空段 + 保序（服务端 split_emails 的用例同样来自 Rust 源）', () => {
    // 不写"整行正则"——那种判据一次 cargo fmt 就红在排版上（前言 ⑰）。
    // 这里按**结构**取：函数名 → 第一个 `split_emails(&Some("<输入>"))` → 其后第一个 `vec![<期望>]`。
    const src = readFileSync(AXUM_REPORT_SVC, 'utf8')
    const fnAt = src.indexOf('fn test_split_emails_matches_frontend_mirror')
    expect(fnAt, 'Rust 侧的 split 对账用例必须存在（否则这一条是虚锁）').toBeGreaterThanOrEqual(0)
    const body = src.slice(fnAt)
    const callAt = body.indexOf('split_emails(&Some(')
    expect(callAt, '必须有一个 split_emails(&Some("…")) 调用').toBeGreaterThanOrEqual(0)
    const strOpen = body.indexOf('"', callAt)
    const strClose = body.indexOf('"', strOpen + 1)
    expect(strOpen >= 0 && strClose > strOpen, '输入字面量必须是双引号串').toBe(true)
    const input = JSON.parse(`"${body.slice(strOpen + 1, strClose)}"`) as string
    const vecAt = body.indexOf('vec![', strClose)
    const vecEnd = vecAt >= 0 ? body.indexOf(']', vecAt) : -1
    expect(vecAt >= 0 && vecEnd > vecAt, '期望值必须是 vec!["…"] 字面量').toBe(true)
    const expected = [...body.slice(vecAt + 5, vecEnd).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) =>
      JSON.parse(`"${x[1]}"`)
    )
    expect(expected.length, '期望数组不得为空（空的话这条断言恒真）').toBeGreaterThan(0)
    expect(splitRecipients(input), '拆分结果必须与服务端逐元素相等（含顺序）').toEqual(expected)
  })

  it('⑤ 接线：两个订阅入口各自都装了这条规则，且未勾邮件通道时不得拦', () => {
    for (const [label, file] of [
      ['SubReportSection.vue', SUB_SECTION_VUE],
      ['report/sub/index.vue', SUB_PAGE_VUE]
    ] as const) {
      const src = readFileSync(resolve(file), 'utf8')
      expect(src, `${label} 必须 import recipientRule`).toContain('recipientRule')
      expect(src, `${label} 必须在 receiveEmail 键下挂规则`).toMatch(/receiveEmail:\s*recipientRule/)
      expect(src, `${label} 的表单必须有 prop="receiveEmail" 的项（规则要挂在真的字段上）`).toContain(
        'prop="receiveEmail"'
      )
    }
    // 语义反证：没勾邮件通道 ⇒ 不判（服务端同样不看这个字段）
    const rule = recipientRule(() => false, { empty: 'e', invalid: (bad) => `i:${bad.join(',')}` })
    const cb = rule.validator as (r: unknown, v: unknown, callback: (err?: Error) => void) => void
    let caught: Error | undefined
    cb(undefined, 'totally not an email', (err?: Error) => {
      caught = err
    })
    expect(caught, '未勾邮件通道时不得拦（那会把"合法的空配置"变成填不下去）').toBeUndefined()
    // 对照组：勾了就必须判，且要点名具体地址
    const on = recipientRule(() => true, { empty: '需要收件人', invalid: (bad) => `不正确：${bad.join(',')}` })
    let err2: Error | undefined
    ;(on.validator as (r: unknown, v: unknown, cb: (e?: Error) => void) => void)(undefined, ' , , ', (e?: Error) => {
      err2 = e
    })
    expect(err2?.message).toBe('需要收件人')
    let err3: Error | undefined
    ;(on.validator as (r: unknown, v: unknown, cb: (e?: Error) => void) => void)(
      undefined,
      'ops@mail, bad mail',
      (e?: Error) => {
        err3 = e
      }
    )
    expect(err3?.message, '必须点名具体不合法的地址').toBe('不正确：bad mail')
    // 合法值必须放行（这一条同时挡住"实现被改成永远报错"的假修复）
    let err4: Error | undefined
    ;(on.validator as (r: unknown, v: unknown, cb: (e?: Error) => void) => void)(
      undefined,
      'ops@mail, root@localhost',
      (e?: Error) => {
        err4 = e
      }
    )
    expect(err4, '自托管合法地址必须放行').toBeUndefined()
  })

  it('⑥ recipientProblem 的三态不得合并（empty 与 invalid 是两句不同的话）', () => {
    expect(recipientProblem('')).toBe('empty')
    expect(recipientProblem('a b@c')).toBe('invalid')
    expect(recipientProblem('ops@mail')).toBeNull()
  })
})
