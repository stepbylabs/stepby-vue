/**
 * 静态守卫：手写列表页的「后发先回」与「删空回退」必须是单一实现（b119）。
 *
 * ## 立的案（本轮 HEAD 实测）
 *
 * 同一份"只让最后一次请求的结局生效"在仓里是 **13 个文件 / 14 个手写计数器 / 15 个发起点**
 * （HEAD 实测：`++xSeq` / `++xId` / 裸 `++seq` 三类形态；`notificationId` 与 `tool/build`
 * 的 `formId` 生成器不计），写法互不相同：`useCrudTable` 的 `listRequestId`、
 * `views/index` 与审计大屏的 `statsSeq` / `alarmSeq`、`flow` 的按 tab 分键 `listSeq` 映射、
 * `MySessionPanel` 的 `requestSeq`（两个发起点共用一个计数器）、两个取数组合子与
 * `CacheOverview` / `ChartCard` 各自的裸 `seq`、公告横幅 / 命令面板 / 报表看板各一份。
 * 更关键的是**手写列表页里 11/13 个一份都没有**（13 个手写列表页中只有 2 个自己实现了）：
 * 用户连按两次回车/翻页，先发的响应后到，表格显示 A 条件的行而搜索框写着 B，
 * 失败标记与 loading 也会被旧请求改写。竞态不报错、不留日志，只在这些页面上
 * 变成"内容与筛选条件对不上"。
 *
 * 同一批还量出第二个缺口：**7 个服务端分页的手写页没有删空回退**（11 个带 `<pagination>`
 * 的接线页里 3 个早已接上、1 页无分页）——
 * 删掉末页最后一条后 `getList()` 拿到 `rows=[] / total>0`，页面停在"暂无数据"，
 * 而前面还有数据（`pageAfterEmptyResult` 早在组合子里就有，只是没接）。
 *
 * ## 判据（采集面与 b105 失败态守卫共用 `utils/listPageSurface`，不写第二份派生）
 *
 * A. 采集面（自己 `getList` + `<el-table>` + 不是 `useCrudTable` 调用方）逐页三查：
 *    接 `createLatestGuard`、`getList` 体内 `begin()`、体内 `isCurrent(...)`；
 * B. 同面里带 `<pagination>` 的页面，`getList` 体内必须有 `pageAfterEmptyResult` /
 *    `clampPageToRowCount`（服务端分页与前端切片分页各一个合法出口）；
 * C. 全 `src/**` 生产码形状锁：不得再出现自定义序号实现——今天 0 处，锁保证第 15 处
 *    进不来；豁免表逐条带理由且**必须仍命中**（失效的豁免要报撤销）。
 *
 * 三条腿：真实树 0 违规 + 合成双向（四种坏形状逐条点名、四类合规不误报）+
 * **差异法活性**（逐文件把接线改坏，必须被抓）——最后一条防"判据恒绿"。
 *
 * ## 自曝（判据第一版的盲区，由盘上变异抓回）
 *
 * 第一版只要求 `getList` 函数体里出现 `isCurrent(`，于是把 `pat/index.vue` 的
 * `.then` 里那一句拆掉（只留 `catch`/`finally` 的）**照常绿**——而"数据落地处不判票、
 * 只在收尾处判"正是最典型的坏法。现改为逐**落地块**判：`.then/catch/finally` 回调
 * （按括号配对，表达式回调也进面）与 `try/catch/finally` 块体里，**只要有状态写入
 * （`.value =`）就必须有 `isCurrent(`**。重做变异后恰红该页、其余五条保持绿。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, collectByExt, lineNumberAt, muteNonCode } from '@/utils/e2eSuiteScanKit'
import { functionBody, isHandwrittenListPage, maskVueScript, maskVueSource } from '@/utils/listPageSurface'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')
const VIEWS_DIR = resolve(SRC_DIR, 'views')

/** 采集面体量下限：本轮实测 13 页；低于下限 = 派生走偏（扫不全 ≠ 没缺口） */
const MIN_SURFACE = 12

/** 本轮修复的 11 页必须真的在面里（"一条都没扫到"与"扫到了且干净"必须可分） */
const MUST_HIT = [
  'views/monitor/job/log.vue',
  'views/monitor/logininfor/MyLoginPanel.vue',
  'views/monitor/pat/index.vue',
  'views/system/dict/data.vue',
  'views/system/notice/ReadUsers.vue',
  'views/system/role/authUser.vue',
  'views/system/role/selectUser.vue',
  'views/system/scimGroup/index.vue',
  'views/system/tenant/index.vue',
  'views/system/user/profile/patToken.vue',
  'views/tool/gen/importTable.vue'
]

/** 自建序号实现的三种已知形状（全部在 b119 迁移到 createLatestGuard）。
 *  名字里带 `seq` 的都要抓——HEAD 的 14 个计数器里 4 个是**裸 `seq`**，
 *  第一版只认 `xxxSeq`（前缀必填），那四份正是从刀口下溜过去的形状。 */
const AD_HOC_RES: Array<[string, RegExp]> = [
  ['自建计数器（let xxxSeq / let seq = 0）', /\blet\s+(?:[A-Za-z_$][\w$]*)?[Ss]eq\d*\s*=\s*0\b/],
  ['自增票据（++xxxSeq / ++seq）', /\+\+\s*(?:[A-Za-z_$][\w$]*)?[Ss]eq\d*\b/],
  ['listRequestId', /\blistRequestId\b/]
]

/**
 * 形状锁豁免表。方向：**没有任何"取数竞态"性质的计数器配留下**——
 * 纯本地动画帧序号将来若出现，需要在这里带理由登记，而不是让锁自己放宽。
 */
const AD_HOC_ALLOW: Array<{ file: string; why: string }> = []

export interface RuleHit {
  rel: string
  line: number
  rule: string
}

/**
 * 取"落地块"：`.then(` / `.catch(` / `.finally(` 的回调体与 `try` / `catch` / `finally` 的块体。
 *
 * 为什么要按块判而不是按整个函数判：判据第一版只要求函数体里出现 `isCurrent(`，
 * 盘上变异（拆掉 `.then` 里那一句、只留 `catch`/`finally` 的）**照常绿**——
 * 而"数据落地处不判票、只在收尾处判"正是最典型的坏法（旧响应照样覆盖新结果）。
 * 块的边界取关键字之后的第一个 `{`：回调参数里出现对象字面量默认值的情况在本仓不存在，
 * 真出现时块体取不到 ⇒ 由调用方按"输入坏了"报红，不得当成合规。
 */
function landingBlocks(body: string): string[] {
  const out: string[] = []
  /** 从 `open`（指向 `(`）开始的括号配对；不配对返回 null（输入坏了） */
  const parenSpan = (open: number): string | null => {
    let depth = 0
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === '(') depth += 1
      else if (body[i] === ')') {
        depth -= 1
        if (depth === 0) return body.slice(open, i + 1)
      }
    }
    return null
  }
  const braceSpan = (open: number): string | null => {
    let depth = 0
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === '{') depth += 1
      else if (body[i] === '}') {
        depth -= 1
        if (depth === 0) return body.slice(open, i + 1)
      }
    }
    return null
  }
  // 回调形态：`.then(...)` / `.catch(...)` / `.finally(...)` 按括号配对取整段——
  // 回调可以是块体也可以是表达式体（`(r) => (rows.value = r.rows)`），后者没有花括号，
  // 只按 `{` 取块会把这类落地**静默跳过**（盘上合成用例实测：坏形状 ③ 没被抓）。
  for (const m of body.matchAll(/\.(?:then|catch|finally)\s*\(/g)) {
    const span = parenSpan((m.index ?? 0) + m[0].length - 1)
    if (span) out.push(span)
  }
  // 语句形态：`try/catch/finally { ... }` 按花括号配对
  for (const m of body.matchAll(/(?<![\w.])(?:try|catch|finally)\s*(?:\([^)]*\))?\s*\{/g)) {
    const span = braceSpan((m.index ?? 0) + m[0].length - 1)
    if (span) out.push(span)
  }
  return out
}

/** 纯函数：单文件的违规清单（真实树与合成夹具共用同一份实现） */
export function auditListPage(rel: string, raw: string): string[] {
  const masked = maskVueSource(raw)
  if (!isHandwrittenListPage(masked)) return []
  const out: string[] = []
  const body = functionBody(maskVueScript(raw), 'getList')
  if (body === null) {
    // 声明存在但定界失败 = 判据的输入坏了。不得当作"合规"（恒绿方向）。
    return [`${rel}: 无法定位 getList 函数体（判据输入损坏，本轮不作数）`]
  }
  const wired = /from\s+['"]@\/composables\/latestRequest['"]/.test(masked) && /\bcreateLatestGuard\b/.test(masked)
  if (!wired) {
    out.push(`${rel}: 未接 createLatestGuard（并发/连点刷新时旧响应会覆盖新结果）`)
  } else {
    if (!/\.begin\(\)/.test(body)) out.push(`${rel}: getList 内未调用 guard.begin()（拿不到票据）`)
    // 每个落地块（成功 / 失败 / 收尾）都必须判票：只判一处等于旧响应仍能改另外两处
    for (const block of landingBlocks(body)) {
      if (!/\.value\s*=/.test(block)) continue
      if (!/\.isCurrent\(/.test(block)) {
        out.push(`${rel}: getList 的落地块内有状态写入但未判 guard.isCurrent(...)（旧响应仍会落地）`)
      }
    }
  }
  if (/<pagination\b/.test(masked) && !/\b(?:pageAfterEmptyResult|clampPageToRowCount)\s*\(/.test(body)) {
    out.push(`${rel}: 带分页但未做删空回退（末页最后一条删除后停在空页）`)
  }
  return out
}

/** 纯函数：单文件的"自建序号"命中（形状锁，白名单由调用侧比对） */
export function scanAdHocCounters(rel: string, raw: string): RuleHit[] {
  const src = rel.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw
  const code = muteNonCode(src)
  const out: RuleHit[] = []
  for (const [rule, re] of AD_HOC_RES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
    let m: RegExpExecArray | null
    while ((m = g.exec(code))) out.push({ rel, line: lineNumberAt(code, m.index), rule })
  }
  return out
}

function walkVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = resolve(dir, name)
    if (statSync(abs).isDirectory()) walkVue(abs, out)
    else if (name.endsWith('.vue')) out.push(abs)
  }
  return out
}

const viewRel = (abs: string) =>
  abs
    .slice(SRC_DIR.length + 1)
    .split('\\')
    .join('/')

describe('手写列表页竞态守卫与删空回退（b119）', () => {
  const viewFiles = walkVue(VIEWS_DIR)
  const surface = viewFiles.filter((f) => isHandwrittenListPage(maskVueSource(readFileSync(f, 'utf8'))))

  it('① 采集面：派生出的手写列表页数与本轮修复页必须在面里', () => {
    expect(viewFiles.length, `src/views 采集面 ${viewFiles.length} 个 .vue`).toBeGreaterThanOrEqual(100)
    expect(
      surface.length,
      `手写列表页采集面 ${surface.length} 个，低于下限 ${MIN_SURFACE}（扫不全 ≠ 没缺口）`
    ).toBeGreaterThanOrEqual(MIN_SURFACE)
    const rels = surface.map(viewRel)
    for (const rel of MUST_HIT) expect(rels, `${rel} 必须进面`).toContain(rel)
    // 条数一律由本守卫自己打印，文档不抄数
    console.warn(`[latestRequestGuard] 手写列表页采集面 ${surface.length} 个 / must-hit ${MUST_HIT.length} 个`)
  })

  it('② 真实树：每页都接了竞态守卫，带分页的页做了删空回退（0 违规）', () => {
    const violations = surface.flatMap((f) => auditListPage(viewRel(f), readFileSync(f, 'utf8')))
    expect(violations, `手写列表页竞态/回退违规：\n${violations.join('\n')}`).toEqual([])
  })

  it('③ 形状锁：生产码里不得再有自建序号实现，豁免必须仍命中', () => {
    const files = ['.ts', '.vue']
      .flatMap((ext) => collectByExt(SRC_DIR, '', ext))
      .filter((rel) => !rel.endsWith('.test.ts'))
      .filter((rel) => rel.split('\\').join('/') !== 'composables/latestRequest.ts')
      .map((rel) => rel.split('\\').join('/'))
    const hits = files.flatMap((rel) => scanAdHocCounters(rel, readFileSync(resolve(SRC_DIR, rel), 'utf8')))
    const allowed = new Set(AD_HOC_ALLOW.map((a) => a.file))
    const bad = hits.filter((h) => !allowed.has(h.rel))
    expect(
      bad,
      `自建序号实现回流（应改用 @/composables/latestRequest 的 createLatestGuard）：\n${bad
        .map((h) => `${h.rel}:${h.line} ${h.rule}`)
        .join('\n')}`
    ).toEqual([])
    const hitFiles = new Set(hits.map((h) => h.rel))
    const stale = AD_HOC_ALLOW.filter((a) => !hitFiles.has(a.file)).map((a) => a.file)
    expect(stale, `失效的豁免（仍在册但代码里已无命中）：${stale.join(', ')}`).toEqual([])
    for (const entry of AD_HOC_ALLOW) {
      expect(entry.why.length, `豁免理由必须自足：${entry.file}`).toBeGreaterThanOrEqual(12)
      expect(entry.why).not.toMatch(/同上|见上|参见上/)
    }
    // 反脆弱：裸 `seq` 形态必须也在刀口上——HEAD 的 14 个计数器里有 4 个是裸 `seq`，
    // 第一版正则要求前缀必填，那四份恰好从刀口下溜过去（"扫到了且干净"与"没扫到"必须可分）
    const bare = scanAdHocCounters('synthetic.ts', 'let seq = 0\nconst my = ++seq\n')
    expect(
      bare.map((h) => h.rule),
      `裸 seq 计数器必须被抓，实际命中：${JSON.stringify(bare)}`
    ).toHaveLength(2)
  })

  it('④ 组合子自己必须用同一份原语（删掉接线 = 锁失去输入，先红在这里）', () => {
    const composable = readFileSync(resolve(SRC_DIR, 'composables', 'useCrudTable.ts'), 'utf8')
    expect(composable, '组合子必须 import createLatestGuard').toMatch(
      /import\s*\{\s*createLatestGuard\s*\}\s*from\s*'@\/composables\/latestRequest'/
    )
    expect(composable, '组合子必须实际创建守卫实例').toMatch(/createLatestGuard\s*\(\s*\)/)
    expect(composable, '列表请求必须 begin() 取票').toMatch(/\.begin\(\)/)
    expect(composable, '落地处必须判票').toMatch(/\.isCurrent\(/)
  })

  it('⑤ 合成双向：四种坏形状逐条点名，四类合规不得误报', () => {
    const page = (body: string, extra = '') =>
      `<template><el-table :data="rows"><template #empty><list-empty :load-error="loadError" /></template></el-table>${extra}</template>
<script setup lang="ts">
import { createLatestGuard } from '@/composables/latestRequest'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'
const rows = ref([])
const guard = createLatestGuard()
function getList() {
  ${body}
}
</script>`

    // 合规 ①：取票 + 判票 + 回退（标准形状）
    expect(
      auditListPage(
        'good.vue',
        page('const t = guard.begin(); if (!guard.isCurrent(t)) return; pageAfterEmptyResult(1, 0, 0)')
      )
    ).toEqual([])
    // 合规 ②：无分页的页面不必写回退
    expect(
      auditListPage('good-nopag.vue', page('const t = guard.begin(); if (!guard.isCurrent(t)) return', '')).join()
    ).not.toContain('删空回退')
    // 合规 ③：组合子页面由组合子负责，本守卫不双罚
    const crud = `<template><el-table :data="rows" /></template>
<script setup lang="ts">
const { dataList, listRequestId } = useCrudTable<Row>({ listApi })
</script>`
    expect(auditListPage('crud.vue', crud)).toEqual([])
    // 合规 ④：静态表格（没有自己的取数入口）不在面上
    expect(auditListPage('static.vue', '<template><el-table :data="rows" /></template>')).toEqual([])

    // 坏 ①：完全没接守卫（连 import 都没有）
    const noGuard = page('listApi().then((r) => (rows.value = r.rows))')
      .split("import { createLatestGuard } from '@/composables/latestRequest'")
      .join('')
    expect(auditListPage('bad1.vue', noGuard).join()).toContain('未接 createLatestGuard')
    // 坏 ②：接了守卫但不取票
    const noBegin = page('if (!guard.isCurrent(0)) return; listApi()')
    expect(auditListPage('bad2.vue', noBegin).join()).toContain('未调用 guard.begin()')
    // 坏 ③：取票但每个落地处都不判票
    const noCheck = page('const t = guard.begin(); listApi().then((r) => (rows.value = r.rows))')
    expect(auditListPage('bad3.vue', noCheck).join()).toContain('未判 guard.isCurrent')
    // 坏 ④：带分页但不做删空回退
    const noRollback = page(
      'const t = guard.begin(); if (!guard.isCurrent(t)) return; listApi()',
      '<pagination :total="total" v-model:page="pageNum" />'
    )
    expect(auditListPage('bad4.vue', noRollback).join()).toContain('未做删空回退')
  })

  it('⑥ 差异法活性：逐页把接线改坏必须被抓（判据不得恒绿）', () => {
    const missed: string[] = []
    for (const f of surface) {
      const rel = viewRel(f)
      const raw = readFileSync(f, 'utf8')
      const brokenWiring = auditListPage(rel, raw.split('createLatestGuard').join('createLatestGuardRenamed'))
      if (!brokenWiring.some((m) => m.includes('未接 createLatestGuard'))) missed.push(`${rel}: 改坏守卫接线未被抓`)
      if (/<pagination\b/.test(maskVueSource(raw))) {
        const brokenRollback = auditListPage(
          rel,
          raw
            .split('pageAfterEmptyResult(')
            .join('pageAfterEmptyResultRenamed(')
            .split('clampPageToRowCount(')
            .join('clampPageToRowCountRenamed(')
        )
        if (!brokenRollback.some((m) => m.includes('未做删空回退'))) missed.push(`${rel}: 改坏删空回退未被抓`)
      }
    }
    expect(missed, `差异法活性失败：\n${missed.join('\n')}`).toEqual([])
  })
})
