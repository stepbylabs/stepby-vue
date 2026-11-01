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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

/**
 * 纯函数：本文件里**确实是守卫实例**的标识符。
 *
 * ⚠ 为什么需要这一层（b144 盘上变异抓出来的洞，不是想出来的）：判据原先只写 `/\.begin\(\)/`
 * 与 `/\.isCurrent\(/`——**裸方法名，没有接收者**。把产品码的 `detailGuard.begin()` 改成
 * `detailGuardRenamed.begin()`（即"票据接到一个不是守卫的对象上"）时，两条针都照常命中，
 * 十例**全绿**。那等于说：这条锁判的是"文件里出现过 `.begin()` 这几个字符"，而不是
 * "取票这件事接在守卫上"。与前言 ㉘"反向 needle 不得出现在判据源码里"、㊴②"锚点不得由判据
 * 自己的字面量供给"同族——**针必须绑在由事实派生的接收者上**。
 *
 * 三个来源，都是"本文件里的绑定"而不是命名约定：
 * ① `const X = createLatestGuard(`（页面自建）；
 * ② `useCrudTable` 解构出来的 `listGuard`（含 `listGuard: 别名` 形态——任务页就是这么写的）；
 * ③ `const X = { a: createLatestGuard(), b: createLatestGuard() }` 这种**按 tab 分键的容器**
 *    （流程页四个页签共用一个取数函数，一枚全局票据会把"切页签"判成过期）。
 *    容器里的守卫经 `X[key].begin()` 使用，所以取票/判票的**根标识符**就是容器名。
 *
 * ⚠ ③ 这一支不是为通过判据而加的豁免：把它省掉，`views/system/flow/index.vue` 会被报成
 * "创建了守卫却没用"，而它用的是合法形状（AGENTS《前端外部输入归一规范》判据 2 的同一课：
 * "为安全把合法值也挡掉"同样是缺陷，只是这次挡的是自己人）。
 */
export function guardInstanceNames(maskedScript: string): string[] {
  const names = new Set<string>()
  for (const m of maskedScript.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createLatestGuard\s*\(/g)) {
    names.add(m[1])
  }
  for (const m of maskedScript.matchAll(/\{([^{}]*)\}\s*=\s*useCrudTable/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim()
      if (!seg) continue
      const [key, alias] = seg.split(':').map((s) => s.trim())
      if (key === 'listGuard') names.add(alias || key)
    }
  }
  const guardHolder = /createLatestGuard\s*\(/
  for (const m of maskedScript.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{([^{}]*)\}/g)) {
    if (guardHolder.test(m[2])) names.add(m[1])
  }
  return [...names]
}

/**
 * 取票的接收者：分成"确实是守卫实例"与"不是"两桶（后者必须点名，不得当成没写过）。
 * 接收者允许 `X` / `X[key]` / `X.tab` 三种形态，判据只看**根标识符**是不是本文件的守卫实例。
 */
function ticketReceivers(body: string, instances: string[]): { known: string[]; foreign: string[] } {
  const known: string[] = []
  const foreign: string[] = []
  const re = /\b([A-Za-z_$][\w$]*)((?:\s*(?:\.\w+|\[[^\]]*\]))?)\.begin\(\)/g
  for (const m of body.matchAll(re)) {
    const root = m[1]
    if (instances.includes(root)) {
      if (!known.includes(root)) known.push(root)
    } else if (!foreign.includes(`${root}${m[2]}`)) {
      foreign.push(`${root}${m[2]}`)
    }
  }
  return { known, foreign }
}

/** 落地块必须由**同一批发票的守卫实例**判票（换个对象的 isCurrent 不算数） */
function blockJudgedBy(block: string, receivers: string[]): boolean {
  return receivers.some((n) =>
    new RegExp(`\\b${n.replace(/\$/g, '\\$')}(?:\\.\\w+|\\[[^\\]]*\\])?\\.isCurrent\\(`).test(block)
  )
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
    const instances = guardInstanceNames(maskVueScript(raw))
    const { known, foreign } = ticketReceivers(body, instances)
    if (foreign.length > 0) {
      out.push(`${rel}: getList 在 ${foreign.join(' / ')}.begin() 上取票，而它不是本文件的守卫实例`)
    }
    if (known.length === 0 && foreign.length === 0) {
      out.push(`${rel}: getList 内未调用 guard.begin()（拿不到票据）`)
    }
    // 每个落地块（成功 / 失败 / 收尾）都必须判票：只判一处等于旧响应仍能改另外两处
    for (const block of landingBlocks(body)) {
      if (!/\.value\s*=/.test(block)) continue
      if (!blockJudgedBy(block, known)) {
        out.push(`${rel}: getList 的落地块内有状态写入但未判票（旧响应仍会落地）`)
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
    // b144：按**语义**认这条 import（花括号里含这个名字即可），不再要求它是唯一说明符——
    // 组合子现在同时导入值与类型（`createLatestGuard, type LatestGuard`，返回值契约里要写
    // `listGuard: LatestGuard`）。旧写法把"字节形状"当事实，一次加类型就红在排版上（前言 ⑰）。
    expect(composable, '组合子必须 import createLatestGuard').toMatch(
      /import\s*\{[^}]*\bcreateLatestGuard\b[^}]*\}\s*from\s*'@\/composables\/latestRequest'/
    )
    expect(composable, '组合子必须实际创建守卫实例').toMatch(/createLatestGuard\s*\(\s*\)/)
    expect(composable, '列表请求必须 begin() 取票').toMatch(/\.begin\(\)/)
    expect(composable, '落地处必须判票').toMatch(/\.isCurrent\(/)
    // b144 新增的承诺：守卫必须**对外暴露**——页面绕过 getList 自己取数（静默轮询）时，
    // 只有共用这一枚才能保证"屏上该是哪一批行"只有一个时间线。撤掉暴露 = 那些页面只能各造一枚。
    expect(composable, '返回值契约必须暴露 listGuard（静默轮询与手动刷新共用同一枚的前提）').toMatch(
      /listGuard:\s*LatestGuard/
    )
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
    expect(auditListPage('bad3.vue', noCheck).join()).toContain('未判票')
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

  // ==================== 规则 D：b144 承诺面（非列表页的取数链） ====================
  //
  // 规则 A 的面是"手写列表页"（`<el-table>` + 自己 `getList`）。b144 清出的这一族**不在**
  // 那张面上，成因同形而形状不同：
  // - **行内详情取数**（点「编辑」→ `getXxx(row.id)` → 填表单 → 开弹窗）：连点两行时，
  //   先发的响应后到会把 A 行（含主键）整份填进表单，而用户以为在改 B ⇒ `submitForm`
  //   用的就是表单里的主键 ⇒ **写错对象**，不是显示错位；
  // - **嵌套选择**（缓存页：名 → 键 → 值）：三层各问"最后一次"，共用一枚会互相把对方的
  //   在飞请求判成过期；
  // - **绕过组合子的静默轮询**（任务页每 5s）：与手动刷新各拿一枚 ⇒ 轮询的旧响应覆盖
  //   刚点的新结果，而"屏上该是哪一批行"是同一个问题（必须共用同一枚）。
  //
  // 这一族**没有可靠的共同字面形状**可以派生采集面（不像手写列表页有 `<el-table` +
  // `} = useCrudTable`），所以做成**承诺面**（AGENTS ㉗：分母来自承诺而不是本轮事实），
  // 并逐**函数**判而不是"文件里出现过一次"（b134(c)/b140(d) 实测：存在一次 ≠ 每个入口都有）。
  const WIRED_TARGETS: Array<{ rel: string; fns: string[] }> = [
    { rel: 'views/system/tenant/index.vue', fns: ['openEdit'] },
    { rel: 'views/system/scimGroup/index.vue', fns: ['openEdit'] },
    { rel: 'views/system/role/index.vue', fns: ['handleFieldPerm'] },
    { rel: 'views/monitor/cache/CacheKeys.vue', fns: ['getCacheNames', 'getCacheKeys', 'handleCacheValue'] },
    { rel: 'views/monitor/cache/CacheStats.vue', fns: ['loadPrefixStats', 'loadHotKeys'] },
    {
      rel: 'views/monitor/observability/index.vue',
      fns: ['getSlowList', 'getSlowStats', 'getErrorList', 'getErrorStats', 'getRedisStats']
    },
    { rel: 'views/monitor/aiHistory/index.vue', fns: ['load'] },
    { rel: 'views/system/task/index.vue', fns: ['silentRefresh'] },
    { rel: 'views/system/report/SubReportSection.vue', fns: ['getSubList', 'handleSubEdit'] },
    // b144 新接：设计器/数据集的「编辑」是把详情**派生成可编辑态**（写侧事故面），
    // 失败还会让拒绝逸出点击处理器（asyncApiRejection 第二腿同批立案）。
    { rel: 'views/flow/designer/index.vue', fns: ['load', 'openEdit'] },
    { rel: 'views/report/dataset/index.vue', fns: ['openEdit'] }
  ]

  /** 纯函数：单个承诺站点的判据（真实树与合成夹具共用同一份实现） */
  function auditWiredTarget(rel: string, raw: string, fn: string): string[] {
    const masked = maskVueScript(raw)
    const body = functionBody(masked, fn)
    // 站点消失 = 判据输入坏了，必须响亮失败；把它读成"合规"就是恒绿方向（前言 ⑥）
    if (body === null) return [`${rel}::${fn}: 找不到函数体（承诺站点消失或被改名，本轮不作数）`]
    const instances = guardInstanceNames(masked)
    if (instances.length === 0) {
      return [`${rel}::${fn}: 本文件没有任何守卫实例（既没自建 createLatestGuard，也没解构 listGuard）`]
    }
    const out: string[] = []
    const { known, foreign } = ticketReceivers(body, instances)
    if (foreign.length > 0) {
      out.push(`${rel}::${fn}: 取票写在 ${foreign.join(' / ')}.begin() 上，而它不是本文件的守卫实例`)
    }
    if (known.length === 0 && foreign.length === 0) {
      out.push(`${rel}::${fn}: 未取票（没有任何本文件守卫实例的 .begin()）`)
    }
    for (const block of landingBlocks(body)) {
      if (!/\.value\s*=/.test(block)) continue
      if (!blockJudgedBy(block, known)) {
        out.push(`${rel}::${fn}: 落地块内有状态写入但未判票（旧响应仍会覆盖新结果）`)
      }
    }
    return out
  }

  it('⑦ 规则 D 真实树：每个承诺站点逐函数判票（0 违规）', () => {
    const violations: string[] = []
    let judged = 0
    for (const target of WIRED_TARGETS) {
      const abs = resolve(SRC_DIR, target.rel)
      if (!existsSync(abs)) {
        violations.push(`${target.rel}: 承诺的文件不存在（判据输入坏了）`)
        continue
      }
      const raw = readFileSync(abs, 'utf8')
      for (const fn of target.fns) {
        judged += 1
        violations.push(...auditWiredTarget(target.rel, raw, fn))
      }
    }
    console.warn(`[latestRequestGuard] 承诺面函数 ${judged} 个 / 文件 ${WIRED_TARGETS.length} 个`)
    expect(judged, '承诺面不得空跑（一个函数都没判 = 判据自己坏了）').toBeGreaterThanOrEqual(15)
    expect(violations, `b144 竞态接线违规：\n${violations.join('\n')}`).toEqual([])
  })

  it('⑧ 规则 D 的合成双向：坏形状必须点名、合规不得误报、站点消失必须响亮失败', () => {
    // 形参**不得写对象类型注解**：`functionBody` 取"声明后的第一个花括号"，形参注解里的
    // `{ id: number }` 会被当成函数体（b140 §3.3 那条同族教训在夹具侧复发过一次，
    // 就是本条用例的第一版红在这里暴露的）。
    const sfc = (body: string) =>
      `<template><el-table :data="rows" /></template>
<script setup lang="ts">
import { createLatestGuard } from '@/composables/latestRequest'
const guard = createLatestGuard()
function openEdit(row: Row) {
  ${body}
}
</script>`
    // 合规：取票 + 每个落地处判票
    expect(
      auditWiredTarget(
        'good.vue',
        sfc(
          'const t = guard.begin(); api().then((r) => { if (!guard.isCurrent(t)) return; form.value = r.data }).catch(() => { if (!guard.isCurrent(t)) return; err.value = true })'
        ),
        'openEdit'
      )
    ).toEqual([])
    // 坏 ①：不取票
    expect(
      auditWiredTarget('bad1.vue', sfc('api().then((r) => { form.value = r.data })'), 'openEdit').join()
    ).toContain('未取票')
    // 坏 ②：取票但数据落地处不判票（只判 finally 是最典型的半接线，b119 盘上变异抓回的形状）
    const half = sfc(
      'const t = guard.begin(); api().then((r) => { form.value = r.data }).finally(() => { if (!guard.isCurrent(t)) return; loading.value = false })'
    )
    const halfOut = auditWiredTarget('bad2.vue', half, 'openEdit').join()
    expect(halfOut, `半接线必须点名，实际：${halfOut}`).toContain('落地块内有状态写入但未判票')
    // 站点消失：函数不存在时必须报"本轮不作数"，不得返回空集
    expect(
      auditWiredTarget('gone.vue', sfc('const t = guard.begin()'), 'openDeletion').join(),
      '承诺站点消失必须响亮失败'
    ).toContain('找不到函数体')
    // 坏 ③：**票据接在非守卫对象上**（b144 盘上变异 detailGuard → detailGuardRenamed 的形状）。
    // 这一条就是新增接收者绑定的理由：旧的裸 `.begin()` 针在这份代码上照常命中 ⇒ 十例全绿。
    const foreign = sfc('const t = guardRenamed.begin(); api().then((r) => { form.value = r.data })')
    const foreignOut = auditWiredTarget('bad3.vue', foreign, 'openEdit').join()
    expect(foreignOut, `取票接到非守卫对象上必须点名，实际：${foreignOut}`).toContain('不是本文件的守卫实例')
    // 坏 ④：判票写在**另一个对象**上也不认（防"guard.begin() + other.isCurrent()"这种张冠李戴）
    const mismatch = sfc(
      'const t = guard.begin(); api().then((r) => { if (!other.isCurrent(t)) return; form.value = r.data })'
    )
    expect(auditWiredTarget('bad4.vue', mismatch, 'openEdit').join(), '落地块的判票必须由取票的那枚实例做').toContain(
      '落地块内有状态写入但未判票'
    )
    // 坏 ⑤：本文件根本没有守卫实例（整块被删）⇒ 响亮失败，不得读成"这个函数不需要票"
    const noInstance = `<template><el-table :data="rows" /></template>
<script setup lang="ts">
function openEdit(row: Row) {
  api().then((r) => { form.value = r.data })
}
</script>`
    expect(auditWiredTarget('bad5.vue', noInstance, 'openEdit').join(), '文件里没有守卫实例时必须点名').toContain(
      '没有任何守卫实例'
    )
    // 合规 ②：由 useCrudTable **解构**而来的 listGuard 同样是本文件的守卫实例
    // （任务页的静默轮询就是这个形状；只认 `const X = createLatestGuard()` 会把它判成违规）
    const destructured = `<template><el-table :data="rows" /></template>
<script setup lang="ts">
const {
  listGuard: pageGuard,
  getList
} = useCrudTable<Row>({ listApi })
function silentRefresh() {
  const t = pageGuard.begin(); listApi().then((r) => { if (!pageGuard.isCurrent(t)) return; rows.value = r.rows })
}
</script>`
    expect(auditWiredTarget('ok-destructured.vue', destructured, 'silentRefresh')).toEqual([])
    // 合规 ③：**按 tab 分键的容器**（流程页形状）——根标识符是容器名，取票/判票都写在 `C[key]` 上
    const holder = `<template><el-table :data="rows" /></template>
<script setup lang="ts">
const guards = { todo: createLatestGuard(), done: createLatestGuard() }
function getList(key) {
  const t = guards[key].begin(); listApi(key).then((r) => { if (!guards[key].isCurrent(t)) return; rows.value = r.rows })
}
</script>`
    expect(auditWiredTarget('ok-holder.vue', holder, 'getList'), '容器形态不得误报').toEqual([])
    // 坏 ⑥：同一个容器语法用在**非守卫对象**上必须被抓（防"合法形状"变成通配针）。
    // ⚠ 夹具里必须**同时存在**一枚真守卫：否则先撞上"本文件没有任何守卫实例"那条，
    //     这一条腿就永远没有生效路径（前言 ⑥ 的"必须有一条真能转红的用例"在夹具侧的同款坑）。
    const foreignHolder = `<template><el-table :data="rows" /></template>
<script setup lang="ts">
const guards = { todo: createLatestGuard() }
function getList(key) {
  const t = caches[key].begin(); listApi(key).then((r) => { if (!caches[key].isCurrent(t)) return; rows.value = r.rows })
}
</script>`
    expect(auditWiredTarget('bad6.vue', foreignHolder, 'getList').join(), '非守卫容器的取票必须点名').toContain(
      '不是本文件的守卫实例'
    )
    // 反证：落地块里没有状态写入（纯日志/纯提示）不得要求判票，否则每轮误报
    expect(
      auditWiredTarget(
        'quiet.vue',
        sfc('const t = guard.begin(); api().then(() => { modal.msgSuccess("ok") }).catch((e) => { console.error(e) })'),
        'openEdit'
      )
    ).toEqual([])
  })

  it('⑨ 规则 D 差异法活性：逐站点把判票/取票摘掉必须被抓（承诺面不是画出来的）', () => {
    // 变异只能改在**原文**上：`functionBody` 吃的是掩码后的源码（字符串与注释已被置空），
    // 拿掩码体回 `raw.split(...)` 替换是空操作——第一版就是这么写的，12 个站点里只有
    // 6 个"没被抓"，而它们恰好是**不含字符串字面量**的那几份（含字符串的替换从未命中，
    // 于是探针在它们身上恒报"未被抓"）。改成整文件替换 `.isCurrent(` / `.begin()`。
    const missed: string[] = []
    for (const target of WIRED_TARGETS) {
      const abs = resolve(SRC_DIR, target.rel)
      const raw = readFileSync(abs, 'utf8')
      const noJudge = raw.split('.isCurrent(').join('.isCurrentRenamed(')
      const noBegin = raw.split('.begin()').join('.beginRenamed()')
      for (const fn of target.fns) {
        if (noJudge === raw) {
          missed.push(`${target.rel}::${fn}: 该文件里没有可摘的判票（承诺站点是虚的）`)
          continue
        }
        const broken = auditWiredTarget(target.rel, noJudge, fn)
        if (!broken.some((m) => m.includes('未判票'))) {
          missed.push(`${target.rel}::${fn}: 摘掉判票未被抓（该函数的写状态落地不在刀口上）`)
        }
        const unbegun = auditWiredTarget(target.rel, noBegin, fn)
        if (!unbegun.some((m) => m.includes('未取票'))) {
          missed.push(`${target.rel}::${fn}: 摘掉取票未被抓（begin() 这一维不在刀口上）`)
        }
      }
    }
    expect(missed, `规则 D 活性失败：\n${missed.join('\n')}`).toEqual([])
  })

  it('⑩ 换查询身份必须先作废在飞请求（新建分支与详情守卫同源）', () => {
    // b119 第三条义务：`begin()` 只在"有新请求"时存在；而"点新增"那一刻没有请求可发，
    // 屏上的表单却被换成空白模板 ⇒ 唯一能让在飞的编辑详情失去写权的手段是 invalidate()。
    // 漏掉它的结局是"新建一条别人配置的租户"（写侧事故），不是显示错位。
    // b144 把这一条做成表：设计器与数据集的「新建」走的是 openEdit 的 else 分支，
    // 同一句义务在两处都必须成立（"修一处不是修一类"第六次）。
    const INVALIDATE_SITES = [
      { rel: 'views/system/tenant/index.vue', fn: 'openAdd', guard: 'detailGuard' },
      { rel: 'views/flow/designer/index.vue', fn: 'openEdit', guard: 'detailGuard' },
      { rel: 'views/report/dataset/index.vue', fn: 'openEdit', guard: 'detailGuard' }
    ] as const
    for (const site of INVALIDATE_SITES) {
      const abs = resolve(SRC_DIR, site.rel)
      const raw = readFileSync(abs, 'utf8')
      const masked = maskVueScript(raw)
      // 表里写的名字必须是**本文件真实声明的守卫实例**：只把名字当字面量匹配，就会重演
      // ⑦ 那个洞（实例被改名 ⇒ 名字针打不中而判据不报）。这里让它反过来受约束：
      // 名字不在实例集合里 ⇒ 直接红，逼着改名的人同时改这张表（改判据必须是有意识的动作）。
      expect(
        guardInstanceNames(masked),
        `${site.rel}: ${site.guard} 必须是本文件派生出的守卫实例（不是字面量猜测）`
      ).toContain(site.guard)
      const body = functionBody(masked, site.fn)
      expect(body, `${site.rel}::${site.fn} 必须存在（承诺站点消失）`).not.toBeNull()
      expect(body ?? '', `${site.rel}::${site.fn} 必须先 ${site.guard}.invalidate()`).toMatch(
        new RegExp(`${site.guard}\\.invalidate\\(\\)`)
      )
      // 反证：把这一句改名后必须判否（同 ⑨ 的刀法）
      const broken = raw.split(`${site.guard}.invalidate()`).join(`${site.guard}.invalidateRenamed()`)
      expect(functionBody(maskVueScript(broken), site.fn) ?? '').not.toMatch(
        new RegExp(`${site.guard}\\.invalidate\\(\\)`)
      )
    }
    // 每个 `invalidate` / `begin` 调用点都必须落在一个守卫实例上（不猜名字，也不认裸方法名）
    const guardedFiles = walkVue(VIEWS_DIR).filter((f) => /createLatestGuard\s*\(/.test(readFileSync(f, 'utf8')))
    const withoutAnyGuardUse = guardedFiles
      .map((f) =>
        f
          .slice(SRC_DIR.length + 1)
          .split('\\')
          .join('/')
      )
      .filter((rel) => {
        const masked = maskVueScript(readFileSync(resolve(SRC_DIR, rel), 'utf8'))
        const instances = guardInstanceNames(masked)
        // 与 ticketReceivers 同一套接收者语法（`X.begin()` / `X[key].begin()`）：
        // 只认裸 `X.begin()` 会把流程页那种"按 tab 分键的容器"误报成"接了闸却没接线"。
        return !instances.some((n) =>
          new RegExp(`\\b${n.replace(/\$/g, '\\$')}(?:\\.\\w+|\\[[^\\]]*\\])?\\.(begin|invalidate)\\(`).test(masked)
        )
      })
    expect(
      withoutAnyGuardUse,
      `创建了守卫却一次都没用它（"接了闸却没接线"）：${withoutAnyGuardUse.join(', ')}`
    ).toEqual([])
  })
})
