/**
 * 静态守卫：**候选源的分页上限与截断判据必须与服务端契约一致**（b134）。
 *
 * ## 立的案
 *
 * 后端把任何列表请求的 `pageSize` 钳到 `MAX_PAGE_SIZE = 100`
 * （`stepby-axum/src/common/page.rs`；真机取证：请求 500 返回 100 行、`total=17235`）。
 * 由此两种形状是**结构性错误**，且在界面上完全看不出来：
 * ① 前端请求 `pageSize: 200 / 500` —— 意图是"拉全量"，实际永远只拿到 100；
 * ② 截断判据写成 `rows.length >= 请求的 pageSize` —— 请求值大于 100 时**永不成立**，
 *    恰好等于总数时又会误报（100/100 是完整一页）。
 *
 * 三条腿：
 * - L1 真实树不得出现超过服务端上限的 `pageSize` 字面量（含赋值形态）；
 * - L2 不得用"行数 ≥ 阈值"判截断（数字阈值只收 ≥50 的页大小量级，`pwd.length >= 13` 不误报）；
 * - L3 每个 `*Truncated` 的赋值必须锚在 `total` 或 `fetchAllPages` 的 `.truncated` 上。
 *
 * 常量与后端的关系由跨仓对账钉住（读不到 Rust 常量直接失败——"取不到"不得读成"没有约束"，
 * 与 `blobTimeout.guard.test.ts` 同一口径）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { muteNonCode } from '@/utils/e2eSuiteScanKit'
import { SERVER_MAX_PAGE_SIZE } from '@/utils/paging'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VUE_ROOT = resolve(SRC, '..')
const AXUM_PAGE_RS = resolve(VUE_ROOT, '..', 'stepby-axum', 'src', 'common', 'page.rs')

const rel = (p: string) => p.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'generated') continue
      collectSourceFiles(abs, out)
    } else if (
      ent.isFile() &&
      !ent.name.endsWith('.test.ts') &&
      (ent.name.endsWith('.ts') || ent.name.endsWith('.vue'))
    ) {
      out.push(abs)
    }
  }
  return out.sort()
}

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++
  return line
}

/** L1：`pageSize: 500` / `pageSize = 500` 且值大于服务端上限 */
export function findOversizedPageSizes(masked: string): { line: number; value: number }[] {
  const hits: { line: number; value: number }[] = []
  for (const m of masked.matchAll(/\bpageSize\s*[:=]\s*(\d+)\b/g)) {
    const value = Number(m[1])
    if (value > SERVER_MAX_PAGE_SIZE) hits.push({ line: lineOf(masked, m.index ?? 0), value })
  }
  return hits
}

/** L2：拿"行数/条数 ≥ 阈值"当分页截断判据（数字阈值只收页大小量级） */
export function findRequestValueThresholds(masked: string): { line: number; snippet: string }[] {
  const hits: { line: number; snippet: string }[] = []
  for (const m of masked.matchAll(/\b[\w$]+(?:\??\.[\w$]+)*\??\.length\s*>=\s*(\d{2,})\b/g)) {
    if (Number(m[1]) >= 50) hits.push({ line: lineOf(masked, m.index ?? 0), snippet: m[0] })
  }
  for (const m of masked.matchAll(
    /\b[\w$]+(?:\??\.[\w$]+)*\??\.length\s*>=\s*([A-Z][A-Z0-9_]*(?:PAGE_SIZE|LIMIT|MAX|SIZE)[A-Z0-9_]*)\b/g
  )) {
    hits.push({ line: lineOf(masked, m.index ?? 0), snippet: m[0] })
  }
  return hits
}

/** L3：`xTruncated.value = …` 的右侧必须是 false 复位、`total` 比较或 `.truncated` 结果 */
export function findUnanchoredTruncations(masked: string): { line: number; snippet: string }[] {
  const hits: { line: number; snippet: string }[] = []
  for (const m of masked.matchAll(/\b\w*[Tt]runcated\.value\s*=\s*([^\n;]+)/g)) {
    const rhs = (m[1] ?? '').trim()
    if (rhs === 'false' || rhs.includes('total') || rhs.includes('.truncated')) continue
    hits.push({ line: lineOf(masked, m.index ?? 0), snippet: m[0].trim() })
  }
  return hits
}

const FILES = collectSourceFiles(SRC)
const SOURCES = FILES.map((abs) => ({ rel: rel(abs), masked: muteNonCode(readFileSync(abs, 'utf8')) }))

/** 站点接线表：每个候选源必须经共用实现，并保留失败/截断的可见出口 */
type Needle = string | { needle: string; atLeast: number }
const SITE_WIRING: Record<string, Needle[]> = {
  'src/views/system/flow/index.vue': [
    'useRemoteOptions<SysUser>',
    'data-test="flow-user-search-error"',
    'data-test="flow-user-truncated"'
  ],
  'src/views/system/report/sub/index.vue': [
    'useRemoteOptions<SysReport>',
    ':remote-method="searchReports"',
    'data-test="report-options-error"',
    'data-test="report-options-truncated"'
  ],
  'src/views/monitor/alert/index.vue': [
    'useRemoteOptions<SysMsgChannel>',
    'useRemoteOptions<SysMsgTemplate>',
    'data-test="channel-truncated"'
  ],
  'src/views/system/scimGroup/index.vue': ['fetchAllPages', 'data-test="scim-role-truncated"'],
  'src/views/report/designer/index.vue': ['fetchAllPages', 'data-test="datasets-truncated"'],
  'src/views/system/webHook/EventCatalogSection.vue': ['fetchAllPages', 'optionsTruncated'],
  'src/views/system/webHook/index.vue': ['data-test="event-catalog-truncated"'],
  'src/views/system/report/SubReportSection.vue': [
    'fetchAllPages',
    'data-test="sub-list-load-error"',
    'data-test="sub-list-truncated"'
  ],
  // 新增与修改是**两个**入口：只闸住其中一个，另一个照样能把「上级为空」的表单提交出去。
  // 因此这里按"至少两处"计数——只看"出现过一次"，撤掉任一入口时判据仍然绿（b134 盘上变异实测）。
  'src/views/system/menu/index.vue': ['parentTreeLoadFailed', { needle: 'if (!(await getTreeselect()))', atLeast: 2 }],
  'src/views/system/dept/index.vue': [
    'parentTreeLoadFailed',
    'if (!(await loadDeptOptions())',
    { needle: 'if (!(await loadDeptOptions', atLeast: 2 }
  ]
}

export function findMissingWiring(files: Record<string, string>, table: Record<string, Needle[]>): string[] {
  const missing: string[] = []
  for (const [rel, needles] of Object.entries(table)) {
    const text = files[rel] ?? ''
    for (const n of needles) {
      const needle = typeof n === 'string' ? n : n.needle
      const need = typeof n === 'string' ? 1 : n.atLeast
      const got = text.split(needle).length - 1
      if (got < need) missing.push(`${rel} 缺少 ${needle}（至少 ${need} 处，实际 ${got}）`)
    }
  }
  return missing
}

describe('候选源分页口径守卫（b134）', () => {
  it('真实树：pageSize 不超过服务端上限、不以请求值判截断、截断赋值锚在 total', () => {
    // 采集面自证：扫少了与"干净"在报告里同形
    expect(FILES.length).toBeGreaterThanOrEqual(350)
    const pageSizeMentions = SOURCES.reduce((n, f) => n + [...f.masked.matchAll(/\bpageSize\b/g)].length, 0)
    expect(pageSizeMentions).toBeGreaterThanOrEqual(40)

    const oversized = SOURCES.flatMap((f) =>
      findOversizedPageSizes(f.masked).map((h) => `${f.rel}:${h.line} pageSize=${h.value}`)
    )
    expect(oversized).toEqual([])

    const thresholds = SOURCES.flatMap((f) =>
      findRequestValueThresholds(f.masked).map((h) => `${f.rel}:${h.line} ${h.snippet}`)
    )
    expect(thresholds).toEqual([])

    const truncations = SOURCES.flatMap((f) =>
      findUnanchoredTruncations(f.masked).map((h) => `${f.rel}:${h.line} ${h.snippet}`)
    )
    expect(truncations).toEqual([])
  })

  it('L1 合成：>100 必抓、=100 放行、注释里的反例不算', () => {
    expect(findOversizedPageSizes(muteNonCode('const q = { pageSize: 500 }')).length).toBe(1)
    expect(findOversizedPageSizes(muteNonCode('query.pageSize = 200')).length).toBe(1)
    expect(findOversizedPageSizes(muteNonCode('const q = { pageSize: 101 }')).length).toBe(1)
    expect(findOversizedPageSizes(muteNonCode('const q = { pageSize: 100 }')).length).toBe(0)
    expect(findOversizedPageSizes(muteNonCode('// 旧实现是 pageSize: 500\nconst q = { pageSize: 100 }')).length).toBe(0)
  })

  it('L2 合成：length>=100 必抓、length<total 放行、密码长度阈值不误报、常量形态必抓', () => {
    expect(findRequestValueThresholds(muteNonCode('if (rows.length >= 100) {}')).length).toBe(1)
    expect(findRequestValueThresholds(muteNonCode('if (rows?.length >= 50) {}')).length).toBe(1)
    expect(findRequestValueThresholds(muteNonCode('if (rows.length >= DROPDOWN_PAGE_SIZE) {}')).length).toBe(1)
    expect(findRequestValueThresholds(muteNonCode('if (rows.length < total) {}')).length).toBe(0)
    expect(findRequestValueThresholds(muteNonCode('if (pwd.length >= 13) {}')).length).toBe(0)
    expect(findRequestValueThresholds(muteNonCode('if (list.length >= 1) {}')).length).toBe(0)
  })

  it('L3 合成：按请求值判截断必抓、total/枚举结果放行', () => {
    expect(findUnanchoredTruncations(muteNonCode('xTruncated.value = rows.length >= 100')).length).toBe(1)
    expect(findUnanchoredTruncations(muteNonCode('xTruncated.value = res.truncated')).length).toBe(0)
    expect(findUnanchoredTruncations(muteNonCode('xTruncated.value = res.total > rows.length')).length).toBe(0)
    expect(findUnanchoredTruncations(muteNonCode('xTruncated.value = false')).length).toBe(0)
  })

  it('跨仓对账：前端 SERVER_MAX_PAGE_SIZE 必须等于后端 MAX_PAGE_SIZE', () => {
    const rust = readFileSync(AXUM_PAGE_RS, 'utf8')
    const m = /pub const MAX_PAGE_SIZE\s*:\s*u64\s*=\s*(\d+)\s*;/.exec(rust)
    expect(m, 'page.rs 里的 MAX_PAGE_SIZE 必须可解析（判据源缺失不得静默放行）').not.toBeNull()
    expect(SERVER_MAX_PAGE_SIZE).toBe(Number(m![1]))
  })

  it('接线反查：十个站点都必须经共用实现并给出失败/截断出口（含反证）', () => {
    const files = Object.fromEntries(Object.keys(SITE_WIRING).map((r) => [r, readFileSync(join(VUE_ROOT, r), 'utf8')]))
    expect(findMissingWiring(files, SITE_WIRING)).toEqual([])

    // 反证：同一份表对"少了 needle 的内容"必须点名到站点与 needle（否则这条腿恒绿）
    const broken = { 'src/views/demo.vue': 'const x = 1' }
    const miss = findMissingWiring(broken, { 'src/views/demo.vue': ['useRemoteOptions', 'data-test="x-truncated"'] })
    expect(miss).toHaveLength(2)
    expect(miss[0]).toContain('src/views/demo.vue')
    expect(miss[0]).toContain('useRemoteOptions')

    // 「两个入口都要闸住」的计数形态：只出现一次必须点名（b134 盘上变异实测的洞——
    // 撤掉新增入口的闸之后，只判"出现过一次"的实现仍然全绿，而那个入口照样能提交错误层级）
    const once = { 'src/views/demo.vue': 'if (!(await loadTree())) {}' }
    const onceMiss = findMissingWiring(once, {
      'src/views/demo.vue': [{ needle: 'if (!(await loadTree()))', atLeast: 2 }]
    })
    expect(onceMiss).toHaveLength(1)
    expect(onceMiss[0]).toContain('至少 2 处，实际 1')
  })

  it('差异法活性：每一份被扫文件末尾插入三条合成违规都必须被抓到', () => {
    const synthetic =
      '\nconst __probe = { pageSize: 500 }\nconst __probe2 = rows.length >= 100\nconst __probe3 = demoTruncated.value = rows.length >= 100\n'
    let caught = 0
    for (const f of SOURCES) {
      const mutated = muteNonCode(readFileSync(join(VUE_ROOT, f.rel), 'utf8') + synthetic)
      const ok =
        findOversizedPageSizes(mutated).length >= 1 &&
        findRequestValueThresholds(mutated).length >= 1 &&
        findUnanchoredTruncations(mutated).length >= 1
      if (ok) caught++
    }
    expect(caught).toBe(SOURCES.length)
  })
})
