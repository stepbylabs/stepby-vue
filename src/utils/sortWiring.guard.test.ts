/**
 * 静态守卫：**表头排序的方向裁定与箭头显示都必须走单一实现**（b140 项10）。
 *
 * ## 立的案（真机取证，台账 `docs/optimization/quality-batch-140-2026-10-30.md`）
 *
 * 列表页统一是 `<SkeletonTable v-if="loading">` + `<el-table v-else>`，**每次取数表格都重新挂载**；
 * 而 Element Plus 把排序状态存在表格实例里，重挂载即退回 `default-sort`。于是页面把 EP 回调里的
 * `column.order` 直接透传给后端时，同一个表头点 N 次拿到的 `isAsc` 一次都不变（实测三连点全为
 * `ascending`，`aria-sort` 还停在 `descending`）：**用户点不出反方向，而箭头与数据互相矛盾**。
 *
 * b73 轮 14 曾在 `logininfor` / `operlog` 两页做过一次"把 `defaultSort` 回灌成 URL 里的排序"，
 * 那一只修住了"从分享链接进来再点"这一支，普通两次点击照旧点不出反方向 ——
 * 全量轮的 deep M84 因此把它判成硬失败（3 条），而不是环境耦合。
 *
 * ## 判据形状（按事实派生，不维护文件清单）
 *
 * 采集面 = 模板里 `<el-table>` 开标签上出现 `@sort-change` 的 `.vue`（含 `src/components`）。
 * 每张这样的表格必须同时满足两条腿：
 *
 * - **L1 方向裁定**：绑定的处理器若是本文件声明的函数，函数体内必须调用 `applySortChange(`；
 *   若不是本文件声明（由 `useCrudTable` 提供），本文件必须确有 `useCrudTable(` 调用点。
 *   两支都挡不住的情形是"页面自己写 `queryParams.isAsc = column.order`"——那正是缺陷形状。
 * - **L2 箭头派生**：同一张表格必须绑 `:default-sort="IDENT"`（裸标识符），
 *   且该标识符在脚本里由 `const IDENT = useSortArrow(` 声明。
 *   缺绑定 = 重挂载后箭头消失（用户看不见当前方向）；绑静态常量 = 就是本批的缺陷本身。
 *
 * 五条反脆弱：合法地**没有**可排序表格的页面不得进面；同文件里另一张不带 `@sort-change`
 * 的表格不得因缺 `:default-sort` 被判红；注释与字符串里的 `@sort-change` 不是绑定（掩码后不参与）；
 * 属性里的 `=>`（`:row-key="(row) => row.id"`）不得截断开标签；箭头**表达式体**处理器也是合规写法。
 * 采集面带体量下限（扫不全 ≠ 没缺口），并把本批修过的 15 个文件签成 must-hit 正控。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CRUD_CALL_RE, maskVueScript, maskVueSource, templateRegion } from '@/utils/listPageSurface'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 本批接线并取证过的文件：任何一条不在这份名单里报红、或名单里的文件不在采集面内，都算判据坏 */
const WIRED_FILES = [
  'src/views/monitor/alert/index.vue',
  'src/views/monitor/frontendError/index.vue',
  'src/views/monitor/job/log.vue',
  'src/views/monitor/logininfor/MyLoginPanel.vue',
  'src/views/monitor/logininfor/index.vue',
  'src/views/monitor/operlog/index.vue',
  'src/views/system/auditChange/index.vue',
  'src/views/system/message/log/index.vue',
  'src/views/system/notice/index.vue',
  'src/views/system/role/index.vue',
  'src/views/system/task/index.vue',
  'src/views/system/user/index.vue',
  'src/views/system/webHook/EventCatalogSection.vue',
  'src/views/system/webHook/log/index.vue',
  'src/views/tool/gen/index.vue'
]

/** 采集面下限：低于此数说明扫描器没扫到东西，而不是"都很干净" */
const MIN_SURFACE = 15

function collectVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) collectVue(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

/**
 * 取模板里全部 `<el-table>` **开标签**文本（属性里的 `=>` 会让 `[^>]*` 提前截断，
 * 所以按引号状态逐字符走到真正的闭合 `>`）。
 */
function elTableOpenTags(template: string): string[] {
  const tags: string[] = []
  let i = 0
  while (true) {
    const start = template.indexOf('<el-table', i)
    if (start < 0) break
    // `<el-table-column>` 不是表格本身
    const next = template[start + 9]
    if (next && next !== '>' && next !== ' ' && next !== '\n' && next !== '\r' && next !== '\t') {
      i = start + 9
      continue
    }
    let quote: string | null = null
    let end = -1
    for (let k = start + 9; k < template.length; k += 1) {
      const ch = template[k]
      if (quote) {
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '>') {
        end = k
        break
      }
    }
    if (end < 0) break
    tags.push(template.slice(start, end + 1))
    i = end + 1
  }
  return tags
}

/** 该开标签里的属性值（`@sort-change` / `:default-sort`）；未绑定返回 null */
function attrValue(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i')
  const m = re.exec(tag)
  return m ? m[1] : null
}

/** 本文件声明的函数/箭头常量名（`function NAME(` / `const NAME = (`） */
function isLocalDeclaration(scriptMasked: string, name: string): boolean {
  return (
    new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).test(scriptMasked) ||
    new RegExp(`\\bconst\\s+${name}\\s*=\\s*(?:async\\s*)?(?:function\\s*\\(|[({])`).test(scriptMasked)
  )
}

/**
 * 取处理器的**函数体/表达式体**文本。
 *
 * 为什么不复用 `listPageSurface.functionBody`：它取声明之后的**第一个** `{`，
 * 而排序处理器的形参带对象类型注解 ——
 * `function handleSortChange(column: { prop: string | null; order: string | null }) {`
 * 里第一个花括号是**参数类型**，本批实测 12 个页面因此全部误报。
 * 这里先按括号深度跳过形参列表，再取块体；箭头表达式体（`() => applySortChange(...)`）
 * 取到语句结束（深度归零后的换行或 `;`）。定界失败返回 null ⇒ 调用方按"输入坏了"抛错。
 */
function handlerBody(scriptMasked: string, name: string): string | null {
  const decl = new RegExp(
    `\\b(?:async\\s+)?function\\s+${name}\\s*\\(|\\bconst\\s+${name}\\s*=\\s*(?:async\\s*)?[({]`
  ).exec(scriptMasked)
  if (!decl) return null
  let i = scriptMasked.indexOf('(', decl.index)
  if (i < 0) return null
  // 跳过形参列表
  let depth = 0
  for (; i < scriptMasked.length; i += 1) {
    const ch = scriptMasked[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) break
    }
  }
  if (depth !== 0) return null
  // 参数之后的返回类型注解可能含花括号（`(): { a: 1 } => ...`），只在遇到 `=>` 或 `{` 时定型
  let j = i + 1
  for (; j < scriptMasked.length; j += 1) {
    const ch = scriptMasked[j]
    if (ch === '=' && scriptMasked[j + 1] === '>') {
      const start = j + 2
      let d = 0
      for (let k = start; k < scriptMasked.length; k += 1) {
        const c = scriptMasked[k]
        if ('([{'.includes(c)) d += 1
        else if (')]}'.includes(c)) d -= 1
        else if ((c === '\n' || c === ';') && d <= 0) return scriptMasked.slice(start, k)
      }
      return scriptMasked.slice(start)
    }
    if (ch === '{') {
      let d = 0
      for (let k = j; k < scriptMasked.length; k += 1) {
        if (scriptMasked[k] === '{') d += 1
        else if (scriptMasked[k] === '}') {
          d -= 1
          if (d === 0) return scriptMasked.slice(j, k + 1)
        }
      }
      return null
    }
    if (ch === '\n' || ch === ';') return null
  }
  return null
}

/** 返回 violations（`文件名: 说明`）；输入坏了必须抛，不得当成"没有违规" */
export function auditSortWiring(rel: string, raw: string): string[] {
  const violations: string[] = []
  const masked = maskVueSource(raw)
  const template = templateRegion(masked)
  const scriptMasked = maskVueScript(raw)
  if (raw.includes('<script') && scriptMasked === '') {
    throw new Error(`${rel}: 脚本块掩码结果为空（脚本块定界失败），判据输入坏了`)
  }
  const tags = elTableOpenTags(template).filter((tag) => /@sort-change="/i.test(tag))
  if (tags.length === 0) return violations
  for (const tag of tags) {
    const handler = attrValue(tag, '@sort-change')
    if (!handler || !handler.trim()) {
      violations.push(`${rel}: @sort-change 绑定值为空，表格根本没有排序处理器`)
      continue
    }
    // L1 方向裁定
    const bare = /^([A-Za-z_$][\w$]*)$/.exec(handler.trim())
    if (!bare) {
      violations.push(`${rel}: @sort-change="${handler}" 不是裸标识符，无法反查它走的是哪条实现`)
    } else {
      const name = bare[1]
      if (isLocalDeclaration(scriptMasked, name)) {
        const body = handlerBody(scriptMasked, name)
        if (body === null) {
          throw new Error(`${rel}: 处理器 ${name} 声明存在但函数体定界失败，判据输入坏了`)
        }
        if (!/\bapplySortChange\s*\(/.test(body)) {
          violations.push(
            `${rel}: 排序处理器 ${name} 的函数体内未调用 applySortChange —— 方向由 EP 实例状态决定，重挂载后点不出反方向`
          )
        }
      } else if (!CRUD_CALL_RE.test(scriptMasked)) {
        violations.push(
          `${rel}: @sort-change="${name}" 既不是本文件声明的函数，本文件也没有 useCrudTable 调用点 —— 处理器来源不可归因`
        )
      }
    }
    // L2 箭头派生
    const sortAttr = attrValue(tag, ':default-sort')
    if (sortAttr === null) {
      violations.push(`${rel}: 带 @sort-change 的表格没有 :default-sort —— 重挂载后箭头与数据方向不可见`)
      continue
    }
    const arrow = /^([A-Za-z_$][\w$]*)$/.exec(sortAttr.trim())
    if (!arrow) {
      violations.push(`${rel}: :default-sort="${sortAttr}" 不是裸标识符，无法证明它由下发参数派生`)
      continue
    }
    if (!new RegExp(`\\bconst\\s+${arrow[1]}\\s*=\\s*useSortArrow\\s*\\(`).test(scriptMasked)) {
      violations.push(
        `${rel}: :default-sort="${arrow[1]}" 不是 useSortArrow(...) 的派生值 —— 箭头会与真正下发的排序互相矛盾`
      )
    }
  }
  return violations
}

function surfaceFiles(): Array<{ rel: string; raw: string }> {
  const files = collectVue(resolve(SRC_DIR, 'src'))
  return (
    files
      .map((full) => ({ full, rel: full.replace(SRC_DIR + '\\', '').replace(/\\/g, '/') }))
      .filter(({ full }) => {
        const raw = readFileSync(full, 'utf8')
        return /@sort-change="/.test(raw)
      })
      // 行尾归一：判据读的是代码形状，不是工作副本的行尾风格（CRLF 工作仓不应产生红）
      .map(({ rel, full }) => ({ rel, raw: readFileSync(full, 'utf8').replace(/\r\n/g, '\n') }))
  )
}

describe('表头排序接线守卫（方向裁定 + 箭头派生单一实现）', () => {
  const surface = surfaceFiles()

  it('① 采集面自证：面由事实派生、条数打印、下限成立', () => {
    expect(surface.length).toBeGreaterThanOrEqual(MIN_SURFACE)
    const rels = surface.map((f) => f.rel)
    for (const wired of WIRED_FILES) {
      expect(rels, `本批接线过的 ${wired} 必须在采集面内`).toContain(wired)
    }
    console.warn(`[sortWiring] 采集面 ${surface.length} 个 .vue（含 @sort-change 的表格）`)
  })

  it('② 真实树 0 违规：15 个接线文件逐条通过两条腿', () => {
    const all: string[] = []
    for (const { rel, raw } of surface) all.push(...auditSortWiring(rel, raw))
    expect(all).toEqual([])
  })

  it('③ 合成违规：缺陷形状必须被抓，且五类合规写法不误报', () => {
    const table = (extra: string) =>
      `<template><el-table :data="rows" @sort-change="handleSortChange"${extra}><el-table-column prop="a" /></el-table></template>
<script setup lang="ts">
import { ref } from 'vue'
const rows = ref([])
const queryParams = ref<{ orderByColumn?: string; isAsc?: string }>({})
function handleSortChange(column: { prop: string | null; order: string | null }) {
  queryParams.value.orderByColumn = column.prop
  queryParams.value.isAsc = column.order
  getList()
}
function getList() {}
</script>`

    // L1：手写透传（缺陷形状）—— 摘掉 applySortChange 必须红
    const bare = auditSortWiring(
      'synth/bare.vue',
      table(' :default-sort="sortArrow"').replace(
        'const rows = ref([])',
        'const rows = ref([])\nconst sortArrow = useSortArrow(queryParams)'
      )
    )
    expect(bare.join('\n')).toContain('未调用 applySortChange')

    // L2a：箭头绑静态常量
    const constant = auditSortWiring(
      'synth/constant.vue',
      table(' :default-sort="defaultSort"').replace(
        'const rows = ref([])',
        'const rows = ref([])\nconst defaultSort = { prop: "a", order: "descending" }\nconst noop = applySortChange'
      )
    )
    expect(constant.join('\n')).toContain('不是 useSortArrow(...) 的派生值')

    // L2b：完全没有 :default-sort
    const noArrow = auditSortWiring('synth/noarrow.vue', table(''))
    expect(noArrow.join('\n')).toContain('没有 :default-sort')

    // L2c：声明了同名 ref 但不是派生
    const deadFlag = auditSortWiring(
      'synth/deadflag.vue',
      table(' :default-sort="sortArrow"').replace(
        'const rows = ref([])',
        'const rows = ref([])\nconst sortArrow = ref({})\nconst noop = applySortChange'
      )
    )
    expect(deadFlag.join('\n')).toContain('不是 useSortArrow(...) 的派生值')

    // L1b：处理器来源不可归因（既非本文件函数，也没有 useCrudTable）
    const orphan = auditSortWiring(
      'synth/orphan.vue',
      table(' :default-sort="sortArrow"')
        .replace(
          'function handleSortChange(column: { prop: string | null; order: string | null }) {',
          'function unused(column: { prop: string | null; order: string | null }) {'
        )
        .replace(
          'const rows = ref([])',
          'const rows = ref([])\nconst sortArrow = useSortArrow(queryParams)\nconst noop = applySortChange'
        )
    )
    expect(orphan.join('\n')).toContain('处理器来源不可归因')

    // 合规反例 1：注释/字符串里的 @sort-change 不算绑定
    const commented = `<template><!-- @sort-change="handleSortChange" --><el-table :data="rows"><el-table-column prop="a" /></el-table></template>
<script setup lang="ts">const rows = [] // 这里提到过 @sort-change="x"
</script>`
    expect(auditSortWiring('synth/commented.vue', commented)).toEqual([])

    // 合规反例 2：同文件另一张**不可排序**的表格不要求 :default-sort
    const secondTable = `<template><el-table :data="rows" @sort-change="handleSortChange" :default-sort="sortArrow" /><el-table :data="detailRows" /></template>
<script setup lang="ts">
import { applySortChange } from '@/utils/sortDirection'
import { useSortArrow } from '@/composables/useSortArrow'
const rows = [] as any[]
const detailRows = [] as any[]
const queryParams = ref<{ orderByColumn?: string; isAsc?: string }>({})
const sortArrow = useSortArrow(queryParams)
function handleSortChange(column: { prop: string | null; order: string | null }) {
  applySortChange(queryParams.value, column)
}
</script>`
    expect(auditSortWiring('synth/secondtable.vue', secondTable)).toEqual([])

    // 合规反例 3：由 useCrudTable 提供处理器的页面（本批 3 页的形状）不得判红
    const viaComposable = `<template><el-table :data="rows" @sort-change="handleSortChange" :default-sort="sortArrow" /></template>
<script setup lang="ts">
import { useSortArrow } from '@/composables/useSortArrow'
const rows = [] as any[]
const { queryParams, handleSortChange } = useCrudTable({} as any)
const sortArrow = useSortArrow(queryParams)
</script>`
    expect(auditSortWiring('synth/viacomposable.vue', viaComposable)).toEqual([])

    // 合规反例 4：属性里的 `=>`（row-key 箭头函数）不得截断开标签
    const withArrowAttr = `<template><el-table :data="rows" :row-key="(row: any) => row.id" @sort-change="handleSortChange" :default-sort="sortArrow" /></template>
<script setup lang="ts">
import { applySortChange } from '@/utils/sortDirection'
import { useSortArrow } from '@/composables/useSortArrow'
const rows = [] as any[]
const queryParams = ref<{ orderByColumn?: string; isAsc?: string }>({})
const sortArrow = useSortArrow(queryParams)
function handleSortChange(column: { prop: string | null; order: string | null }) {
  applySortChange(queryParams.value, column)
}
</script>`
    expect(auditSortWiring('synth/arrowattr.vue', withArrowAttr)).toEqual([])

    // 合规反例 5：箭头**表达式体**处理器（`() => applySortChange(...)`）也是合规写法
    const exprBody = `<template><el-table :data="rows" @sort-change="onSort" :default-sort="sortArrow" /></template>
<script setup lang="ts">
import { applySortChange } from '@/utils/sortDirection'
import { useSortArrow } from '@/composables/useSortArrow'
const rows = [] as any[]
const queryParams = ref<{ orderByColumn?: string; isAsc?: string }>({})
const sortArrow = useSortArrow(queryParams)
const onSort = (column: { prop: string | null; order: string | null }) => applySortChange(queryParams.value, column)
</script>`
    expect(auditSortWiring('synth/exprbody.vue', exprBody)).toEqual([])

    // 缺陷形状：表达式体里手写透传 —— 定界必须真的取到了体，而不是"整文件里出现过关键字"
    const exprBodyBad = exprBody.replace(
      'const onSort = (column: { prop: string | null; order: string | null }) => applySortChange(queryParams.value, column)',
      'const onSort = (column: { prop: string | null; order: string | null }) => { queryParams.value.isAsc = column.order }\nconst applySortChangeUnused = applySortChange'
    )
    expect(auditSortWiring('synth/exprbodybad.vue', exprBodyBad).join('\n')).toContain('未调用 applySortChange')
  })

  it('④ 活性（差异法）：每个真实文件摘掉任一条腿都必须被抓', () => {
    let handlerChecked = 0
    let arrowChecked = 0
    for (const { rel, raw } of surface) {
      // 摘掉方向裁定：applySortChange( → applySortChangeBroken(
      const noAdjudicate = raw.replace(/\bapplySortChange\s*\(/g, 'applySortChangeBroken(')
      if (noAdjudicate !== raw) {
        const hits = auditSortWiring(rel, noAdjudicate)
        expect(hits.length, `${rel}：摘掉 applySortChange 后必须报红`).toBeGreaterThan(0)
        // 红的必须是**裁定**这一支，而不是顺带撞到的箭头支
        expect(hits.join('\n'), `${rel}：摘裁定后的红必须点名裁定腿`).toContain('未调用 applySortChange')
        handlerChecked += 1
      }
      // 摘掉箭头派生：useSortArrow( → useSortArrowBroken(
      const noArrow = raw.replace(/\buseSortArrow\s*\(/g, 'useSortArrowBroken(')
      if (noArrow !== raw) {
        const hits = auditSortWiring(rel, noArrow)
        expect(hits.length, `${rel}：摘掉 useSortArrow 后必须报红`).toBeGreaterThan(0)
        expect(hits.join('\n'), `${rel}：摘派生后的红必须点名派生腿`).toContain('不是 useSortArrow(...) 的派生值')
        arrowChecked += 1
      }
    }
    console.warn(
      `[sortWiring] 活性探针：${handlerChecked} / ${surface.length} 个文件有本地裁定调用点且摘掉即被抓；${arrowChecked} / ${surface.length} 个文件箭头派生摘掉即被抓`
    )
    // 下限只由"这一支有没有被摘过"决定（面上有调用点的全部都得判），**不记 HEAD 的文件数**
    expect(handlerChecked, '一条都没摘到裁定 ⇒ 面上没有本地 applySortChange 调用点，探针空跑').toBeGreaterThan(0)
    expect(arrowChecked, '一条都没摘到派生 ⇒ 探针空跑').toBeGreaterThan(0)
  })
})
