/**
 * 静态守卫：接入 `useCrudTable` 的列表页，`<template #empty>` 槽绑"暂无数据"文案时
 * **必须同时消费 `loadError`**（批八十八，空态分形）。
 *
 * ## 立的案
 *
 * 全仓取证：41 处列表空态一律绑 `common.empty`（另有 3 处经 `EmptyState` 绑兄弟键
 * `common.noData`——渲染出来的仍是同一句"暂无数据"），请求失败被组合子 catch 静默
 * 吞成空列表后，toast 5-6 秒消失、页面落回"暂无数据"——用户在屏幕上无法区分
 * "加载失败"与"真的没有数据"。`useCrudTable` 已新增 `loadError`/`retryLoad`，
 * 空态单一实现收进 `src/components/ListEmpty/index.vue`。
 * 本守卫钉住"新页面不得再回到旧形态、已迁移页面不得把消费点删回去"：
 * 组合子的失败信号发得出、页面不接 = 等于没发。
 *
 * ## 判据形状（逐块而非逐文件）
 *
 * 违规 ⇔ 文件调用 `useCrudTable`（`useCrudTable<` / `useCrudTable(` 形态；
 * 仅 import 名或注释提及不算）且其某个 `<template #empty>` 块（嵌套 template 完整定界）
 * 绑了"暂无数据"类文案（`common.empty` / `common.noData`）且**该块内**未出现 `loadError`。
 * 取"块级"而非"文件级"：多表页面（角色/用户）两张表数据来源不同，
 * 失败态必须接在**它自己那张表**的空态槽上，文件级判定会让副表偷渡主表的消费点。
 * 兄弟键 `common.emptyActionReset` 等 CTA 文案**不得**误判为空态（正则按词尾截断）。
 *
 * 采集面口径：src/views 下全部 .vue 文件。非组合子接入页（手写 getList 的弹窗副表、
 * cache 页等）不在**块级**判据（①②③④⑤⑥）的约束内——它们的空态槽形状各异，
 * 强行纳入会把"未接入"判成"接错"。b105 另立**文件级**判据（⑦⑧）覆盖这一面：
 * "渲染 el-table 且自己有 getList、又不是组合子调用方"的页面，必须出现
 * `:load-error="loadError"` 的接线（由事实派生，不维护文件清单）。
 *
 * 三条腿（与仓内守卫族同一写法）：
 * 1. 真实树：src/views 全量扫描，违规必须 0 处；
 * 2. 合成双向：两种绑文案形状必须被抓；list-empty 接入、非组合子页、HTML 注释、
 *    JS 注释、`common.emptyActionReset` 兄弟键必须**不报**（误报=把合法写法挡掉）；
 * 3. 差异法活性 + 采集面体量下限自证：每个入面文件末尾追加一条合成违规，
 *    **该合成行必须被抓**且命中数严格增加（探针会把未接入文件整体转为受约束文件，
 *    一次点亮多条是事实不是噪声）；文件数/调用点数低于下限一律拒绝判据（扫不全 ≠ 没缺口）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CRUD_CALL_RE,
  declaresGetList,
  failureFlagNames,
  hasFailureAffordance,
  isFetchingListPage,
  maskVueScript,
  maskVueSource,
  rowsFedFromRequest,
  showsFailureState,
  templateRegion
} from '@/utils/listPageSurface'

/** 仓根按本文件位置反推（src/utils 的上两层），与其余守卫同一口径 */
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VIEWS_DIR = resolve(VUE_ROOT, 'src', 'views')

/** 采集面体量下限：视图文件数与 useCrudTable 调用点数（低于下限 = 扫描器走偏，拒绝判据） */
const MIN_VIEWS_FILES = 100
const MIN_CRUD_CALLERS = 25

/**
 * "暂无数据"类空态文案键：只认 `common.empty` / `common.noData` 整键
 * （后面不得再接字母——`common.emptyActionReset` 是 CTA 按钮文案，不是空态本身）。
 */
const EMPTY_TEXT_RE = /common\.(?:empty|noData)(?![A-Za-z])/

/** 偏移 → 1 基行号 */
function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length
}

/**
 * 嵌套感知的 `<template #empty>` 块定界：块内可能再嵌 `<template #default>` /
 * 具名插槽开闭标签，必须按深度配对，第一个 `</template>` 收尾会截在半块上。
 */
function emptyTemplateBlocks(masked: string): Array<{ body: string; line: number }> {
  const out: Array<{ body: string; line: number }> = []
  for (const m of masked.matchAll(/<template #empty>/g)) {
    const start = m.index ?? 0
    let j = start + '<template #empty>'.length
    let depth = 1
    while (depth > 0) {
      const nextOpen = masked.indexOf('<template', j)
      const nextClose = masked.indexOf('</template>', j)
      if (nextClose === -1) {
        throw new Error('扫描器定界失败：存在未闭合的 <template #empty>（输入损坏不得静默）')
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++
        j = nextOpen + '<template'.length
      } else {
        depth--
        j = nextClose + '</template>'.length
      }
    }
    out.push({ body: masked.slice(start, j), line: lineOf(masked, start) })
  }
  return out
}

/** 单文件的违规行号列表（判据主体，纯函数：真实树与合成夹具共用同一份实现） */
function violationLines(text: string): number[] {
  // 掩码口径三件套（现由 listPageSurface 单一实现提供）：
  // · HTML 注释等长置空：模板里的说明注释不是代码；
  // · JS 注释置空，但**字符串保留**——空态绑定就长在模板属性字符串里；
  // · keepRegex：模板里 `/>`、`</el-table>` 的 `/` 会被 JS 掩码器当成"正则起点"，
  //   默认分支把整段**置空**、吞掉 `</template>` 闭合标签（探针实测），块定界当场失衡。
  const masked = maskVueSource(text)
  if (!CRUD_CALL_RE.test(masked)) return []
  const hits: number[] = []
  for (const block of emptyTemplateBlocks(masked)) {
    if (EMPTY_TEXT_RE.test(block.body) && !/loadError/.test(block.body)) hits.push(block.line)
  }
  return hits
}

/** 手写列表页的最小体量（低于下限 = 派生逻辑走偏，拒绝判据而不是报 0 违规） */
const MIN_HANDWRITTEN_LIST_PAGES = 12

/**
 * 受约束面（取数面 ∩ 行集来自请求结果）的下限。
 * 这一栏才是本腿真正判的东西，所以它必须**单独**有体量自证：
 * `rowsFedFromRequest` 整体判否时，取数面照样是 19，而违规恒 0——只数上一栏就看不见这一栏塌了。
 */
const MIN_CONSTRAINED_LIST_PAGES = 12

/**
 * 手写列表页的失败态判据（b105 立、b140 换面 + 换尺）
 *
 * 违规 ⇔ 该页**渲染 el-table 且自己发过请求**（`isFetchingListPage`，与函数名无关）、
 * 行集**可能来自请求结果**（`rowsFedFromRequest`，排除纯表单弹窗）、**不是** `useCrudTable`
 * 调用方（那一路由块级判据 ① 负责），且**没有可观测的失败出口**。
 *
 * "没有失败出口"由**两条腿取或**判定，缺一条都会长出假信号：
 * · `showsFailureState`：catch 写的标识符被模板读到（最直接的同名配对）；
 * · `hasFailureAffordance`：模板里有 `list-empty :load-error` / `el-alert type="error" + v-if`
 *   且绑的是脚本写过的状态（认得"失败态装进对象 / 由共用骨架回写"的合法写法）。
 *
 * b140 的三处变化，各自都有实测成因：
 * 1. **采集面不再要求函数叫 `getList`**。原先按名字派生，实测有 4 个"渲染表格 + 自己取数"
 *    的页面整页不在视野内（`load` / `getCacheNames` / `loadEventCatalog` 三种别名）——
 *    那 4 页恰好都已接线，所以没漏过缺陷，但**名字规则永远落后于事实一种写法**。
 * 2. **合规尺从"有没有 `:load-error=\"loadError\"` 这串字面量"换成上面两条腿**。
 *    放宽面后第一轮报出 8 处，逐条回页面看，**5 处是假阳性**（页面用
 *    `el-alert v-if="loadError"` / 卡片失败占位分支，同样把"失败"和"没有数据"分开了）。
 *    把判据建成"只认一种写法"，结局就是要么误报一片被人放宽，要么逼所有人改写成同一种形状
 *    ——两者都是把工具的错误当成产品缺陷（前言 ⑨"错误提示把人支使去把事实签反"）。
 * 3. **加一条前置条件：行集得可能来自请求**。同一轮报出的另一处是
 *    `views/tool/gen/createTable.vue`——建表弹窗的表格行由用户逐条录入，
 *    页面唯一的 `await` 是提交而不是取数；给它装失败态就是为不会发生的形状编理由
 *    （前言 ㉜/⑯(c)：前提不成立时换判据，不是加豁免）。
 */
function handwrittenListViolation(text: string): boolean {
  const masked = maskVueSource(text)
  if (!isFetchingListPage(masked)) return false
  const script = maskVueScript(text)
  if (!script) return false
  const template = templateRegion(masked)
  if (!rowsFedFromRequest(template, script)) return false
  return !showsFailureState(script, template) && !hasFailureAffordance(template, script)
}

/** 受约束面：本腿真正会判到的文件（取数面 ∩ 行集来自请求结果） */
function constrainedListPages(): Array<{ rel: string; text: string }> {
  const out: Array<{ rel: string; text: string }> = []
  for (const f of walkVue(VIEWS_DIR)) {
    const text = readFileSync(f, 'utf8')
    const masked = maskVueSource(text)
    if (!isFetchingListPage(masked)) continue
    const script = maskVueScript(text)
    if (!script) continue
    if (!rowsFedFromRequest(templateRegion(masked), script)) continue
    out.push({ rel: f.slice(VUE_ROOT.length + 1).replace(/\\/g, '/'), text })
  }
  return out
}

/**
 * 把一个页面的**失败出口**整体致盲（只动模板，不动脚本——脚本决定它在不在面上）。
 * 三条分别对应判据的三条认法，缺一支探针就有一部分页面"永远抓不到"：
 * ① 组件名换掉 ⇒ `list-empty` 的 `:load-error` 出口不再成立；
 * ② 失败文案与 `type="error"` 换掉 ⇒ alert 出口不再成立；
 * ③ catch 标志在模板里的引用消音 ⇒ 同名配对腿不再成立。
 */
function stripFailureOutlets(text: string): string {
  const cut = text.search(/<script\b/)
  const head = cut < 0 ? text : text.slice(0, cut)
  const tail = cut < 0 ? '' : text.slice(cut)
  const flags = failureFlagNames(maskVueScript(text))
  const muted = flags.reduce(
    (acc, n) => acc.replace(new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`, 'g'), '__mutedFlag'),
    head
  )
  return (
    muted
      .replace(/\blist-empty\b/g, 'el-empty')
      .replace(/\bListEmpty\b/g, 'ElEmpty')
      .replace(/common\.loadFailed/g, 'common.empty')
      .replace(/common\.staleDataHintAt/g, 'common.empty')
      // alert 的失败语义从两个方向一起抹：档位与文案键
      .replace(/type="error"/g, 'type="info"')
      .replace(/:type="[^"]*"/g, ':type="\'info\'"') + tail
  )
}

function walkVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      walkVue(abs, out)
      continue
    }
    if (name.endsWith('.vue')) out.push(abs)
  }
  return out
}

const viewFiles = walkVue(VIEWS_DIR)
const crudCallers = viewFiles.filter((f) => CRUD_CALL_RE.test(maskVueSource(readFileSync(f, 'utf8'))))

describe('静态守卫：useCrudTable 页面的 #empty 槽必须消费 loadError', () => {
  it('① 真实树：绑"暂无数据"但未消费 loadError 的组合子空态槽必须 0 处', () => {
    const report: string[] = []
    for (const f of viewFiles) {
      const rel = f.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')
      for (const line of violationLines(readFileSync(f, 'utf8'))) {
        report.push(`${rel}:${line} <template #empty> 绑"暂无数据"文案但未接 loadError（失败与空态同形）`)
      }
    }
    expect(report, `空态分形回流：\n${report.join('\n')}`).toEqual([])
  })

  it('② 采集面体量自证：文件面与调用点数不得低于下限（扫不全 ≠ 没缺口）', () => {
    expect(viewFiles.length, `src/views 采集面 ${viewFiles.length} 个 .vue，低于下限`).toBeGreaterThanOrEqual(
      MIN_VIEWS_FILES
    )
    expect(crudCallers.length, `调用 useCrudTable 的页面 ${crudCallers.length} 个，低于下限`).toBeGreaterThanOrEqual(
      MIN_CRUD_CALLERS
    )
    // 条数一律由本守卫自己打印，文档不抄数
    console.warn(
      `[listEmptyGuard] 采集面 src/views ${viewFiles.length} 个 .vue / 调用 useCrudTable ${crudCallers.length} 个 / 违规 0 处`
    )
  })

  it('③ 合成：两种绑文案形状必须被抓且点名行号', () => {
    const cases: Array<[string, string, number]> = [
      [
        'el-empty 绑 common.empty',
        `<template><el-table><template #empty><el-empty :description="t('common.empty')" /></template></el-table></template>\n<script setup>const c = useCrudTable<Row>({ listApi: listRow })</script>`,
        1
      ],
      [
        'EmptyState 绑兄弟键 common.noData',
        `<template><el-table>
  <template #empty>
    <EmptyState :description="t('common.noData')" />
  </template>
</el-table></template>
<script setup>const c = useCrudTable<Row>({ listApi: listRow })</script>`,
        2
      ],
      [
        '块内嵌 <template #default>（定界必须按深度而非首个闭合标签）',
        `<template><el-table><template #empty>
  <div><template #extra><span>x</span></template></div>
  <el-empty :description="t('common.empty')" />
</template></el-table></template>
<script setup>useCrudTable<Row>({ listApi: listRow })</script>`,
        1
      ]
    ]
    for (const [name, src, expectLine] of cases) {
      const lines = violationLines(src)
      expect(lines.length, `${name} 必须被抓`).toBe(1)
      expect(lines[0], `${name} 行号必须指到 #empty 槽`).toBe(expectLine)
    }
  })

  it('④ 合成反例：合规接入 / 非组合子页 / 注释与兄弟键必须不报（误报=把合法写法挡掉）', () => {
    const clean: Array<[string, string]> = [
      [
        'list-empty 消费 loadError（迁移后的标准形状）',
        `<template><el-table><template #empty><list-empty :load-error="loadError" @retry="retryLoad" /></template></el-table></template>\n<script setup>const { loadError, retryLoad } = useCrudTable<Row>({ listApi: listRow })</script>`
      ],
      [
        '失败分叉在块内（绑文案 + loadError 同块共存）',
        `<template><el-table><template #empty>
  <el-empty v-if="loadError" :description="t('common.loadFailed')" />
  <el-empty v-else :description="t('common.empty')" />
</template></el-table></template>
<script setup>useCrudTable<Row>({ listApi: listRow })</script>`
      ],
      [
        '未调用组合子（仅 import 名 / 路径字符串提及）',
        `<template><el-table><template #empty><el-empty :description="t('common.empty')" /></template></el-table></template>\n<script setup>import { useCrudTable } from '@/composables/useCrudTable'</script>`
      ],
      [
        'HTML 注释里的反例不是代码',
        `<template><el-table>
  <!-- 旧形态：<template #empty><el-empty :description="t('common.empty')" /></template> 已废弃 -->
  <template #empty><list-empty :load-error="loadError" /></template>
</el-table></template>
<script setup>useCrudTable<Row>({ listApi: listRow })</script>`
      ],
      [
        'JS 行注释里的绑定不计入块',
        `<template><el-table><template #empty><list-empty :load-error="loadError" /></template></el-table></template>\n<script setup>\n// t('common.empty') 是历史反例\nuseCrudTable<Row>({ listApi: listRow })\n</script>`
      ],
      [
        '兄弟键 common.emptyActionReset 是 CTA 文案不是空态绑定',
        `<template><el-table><template #empty>
  <list-empty :load-error="loadError"><EmptyState :reset-text="t('common.emptyActionReset')" /></list-empty>
</template></el-table></template>\n<script setup>useCrudTable<Row>({ listApi: listRow })</script>`
      ]
    ]
    for (const [name, src] of clean) {
      expect(violationLines(src), `${name} 不得误报`).toEqual([])
    }
  })

  it('⑤ 差异法活性：每个入面文件末尾追加合成违规，该合成行必须被抓（扫到 ≠ 恒 0）', () => {
    const synthetic = `\n<template #empty><el-empty :description="t('common.empty')" /></template>\nconst __listEmptyProbe = useCrudTable<Probe>({ listApi: listProbe })\n`
    const missed: string[] = []
    for (const f of viewFiles) {
      const rel = f.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')
      const text = readFileSync(f, 'utf8')
      const before = violationLines(text)
      const full = text + synthetic
      const after = violationLines(full)
      // 合成块追加在文件末尾 ⇒ 它是文本里**最后一个** #empty 槽，行号由拼接结果自己算
      const synLine = lineOf(full, full.lastIndexOf('<template #empty>'))
      // 允许一次追加点亮**多**条：探针把未接入文件转为"调用组合子"，
      // 该文件既有的绑文案块（非组合子时代写下、尚未迁移）随之全部进入约束——
      // 判据要求"合成行必须在命中里 + 命中数严格增加"，"恰好 +1"会把存量欠账误报成扫描器坏。
      if (!after.includes(synLine) || after.length <= before.length)
        missed.push(`${rel}: ${before.length} → ${after.length} (probe@${synLine})`)
    }
    expect(missed, `追加合成违规后未被抓到/命中未增的文件：\n${missed.join('\n')}`).toEqual([])
  })

  it('⑥ 单一实现住在组件里：页面侧不得再复制 el-empty 绑 common.empty 的失败分支模板', () => {
    // 判据：ListEmpty/index.vue 是全仓唯一"在空态里绑 common.empty 且不接 loadError 于同块"的合法站点；
    // 组合子必须暴露 loadError 与 retryLoad（删掉任何一个 = 本锁失去输入，先红在这里）
    const impl = readFileSync(resolve(VUE_ROOT, 'src', 'components', 'ListEmpty', 'index.vue'), 'utf8')
    expect(impl, '空态单一实现必须绑 common.empty 于正常分支').toContain("t('common.empty')")
    expect(impl, '失败分支必须用 common.loadFailed（既有词条）').toContain("t('common.loadFailed')")
    expect(impl, '失败分支必须有重试入口').toContain("emit('retry')")
    const composable = readFileSync(resolve(VUE_ROOT, 'src', 'composables', 'useCrudTable.ts'), 'utf8')
    expect(composable, '组合子必须暴露 loadError 状态').toMatch(/loadError:\s*Ref<boolean>/)
    expect(composable, '组合子必须暴露 retryLoad 方法').toMatch(/retryLoad:\s*\(\)\s*=>\s*void/)
    expect(
      (composable.match(/loadError\.value\s*=/g) || []).length,
      '写点必须成对（成功置假/失败置真）'
    ).toBeGreaterThanOrEqual(2)
  })

  it('⑦ 真实树：自取数的列表页（渲染 el-table + await 过 API，与函数名无关）必须接失败态，0 处违规', () => {
    const offenders: string[] = []
    const excluded: string[] = []
    let fetching = 0
    for (const f of viewFiles) {
      const rel = f.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')
      const text = readFileSync(f, 'utf8')
      if (isFetchingListPage(maskVueSource(text))) {
        fetching++
        const sc = maskVueScript(text)
        if (!sc || !rowsFedFromRequest(templateRegion(maskVueSource(text)), sc)) {
          excluded.push(rel)
        }
      }
      if (handwrittenListViolation(text)) {
        offenders.push(
          `${rel}: 加载失败会落回"暂无数据"（两条腿都不成立：既没有 catch 标志被模板读到，也没有 list-empty / 失败文案的 alert 出口）`
        )
      }
    }
    const pages = constrainedListPages()
    const constrained = pages.length
    // N-140-C 的"两面差集"必须是**打印出来的事实**，不得留在注释里当记住的数：
    // 竞态面（`latestRequest.guard`）按 `declaresGetList` 取体，这一部分页面在它视野外。
    const noGetName = pages.filter((p) => !declaresGetList(maskVueSource(p.text))).map((p) => p.rel)
    // 采集面自证：派生逻辑坏了（正则走偏/目录读空）必须响亮失败，不得报"0 违规"
    // 条数一律由本守卫自己打印，文档不抄数；打印排在判定之前——红了也要能看见本轮的面有多大
    console.warn(
      `[listEmptyGuard] 自取数列表页 ${fetching} 个 / 受约束面（行集来自请求）${constrained} 个 / 违规 ${offenders.length} 处` +
        ` / 其中未声明 getList（竞态面看不见，N-140-C）${noGetName.length} 个${noGetName.length ? `：${noGetName.join(', ')}` : ''}` +
        (excluded.length ? ` / 前置条件排除：${excluded.join(', ')}` : '')
    )
    expect(
      fetching,
      `自取数列表页采集面 ${fetching} 个，低于下限 ${MIN_HANDWRITTEN_LIST_PAGES}（扫不全 ≠ 没缺口）`
    ).toBeGreaterThanOrEqual(MIN_HANDWRITTEN_LIST_PAGES)
    expect(
      constrained,
      `受约束面 ${constrained} 个，低于下限 ${MIN_CONSTRAINED_LIST_PAGES}（前置条件被整体判否 = 派生坏了，不得当成"没有页面受约束"）`
    ).toBeGreaterThanOrEqual(MIN_CONSTRAINED_LIST_PAGES)
    expect(offenders, `手写列表页失败态回流：\n${offenders.join('\n')}`).toEqual([])
  })

  it('⑧ 合成双向：缺失败出口必须被抓；ListEmpty / alert / 别名 / 无取数 / 组合子不得误报', () => {
    const page = (body: string) => `<template><el-table :data="rows">${body}</el-table></template>`
    const emptySlot = `<template #empty><el-empty :description="t('common.empty')" /></template>`
    // 夹具必须是**单个 `<script setup>` 块**：真实 SFC 只有一个脚本块，而 `maskVueScript`
    // 只取第一个块——把 import 单列一块会让判据读不到逻辑（前言 ㉓：夹具的形状必须等于
    // 生产码真实产出的形状，否则判据测的是自己的解析器）
    const script = (body: string) =>
      `<script setup>import { listApi } from '@/api/system/demo'\nconst rows = ref([])\n${body}</script>`

    // 必须被抓：有取数 + 有表格 + 空态只绑文案，且失败无处可写
    const bad = `${page(emptySlot)}
${script('async function getList() { const res = await listApi(); rows.value = res.rows }')}`
    expect(handwrittenListViolation(bad), '没有失败出口的自取数列表页必须被抓').toBe(true)

    // 必须被抓：**别名取数**同样缺失败出口（换面之前这一形状整页不可见）
    const badAlias = `${page(emptySlot)}
${script('async function loadRows() { const res = await listApi(); rows.value = res.rows }')}`
    expect(handwrittenListViolation(badAlias), '取数函数不叫 getList 也不能逃出失败态判据').toBe(true)

    // 必须被抓：catch 写了标志，但**模板从不读它**（失败态存在却看不见）
    const invisible = `${page(emptySlot)}
${script('const loadError = ref(false)\nasync function getList() { try { const res = await listApi(); rows.value = res.rows; loadError.value = false } catch { loadError.value = true } }')}`
    expect(handwrittenListViolation(invisible), '失败标志不被模板消费 = 用户仍然看不见失败，必须被抓').toBe(true)

    // 必须被抓：`.catch(() => {})` 吞掉（历史上最常见的形状）——结果取不到时行集落空，
    // 而页面既不标失败也不给重试入口
    const swallowed = `${page(emptySlot)}
${script('async function getList() { const res = await listApi().catch(() => ({})); rows.value = res.rows || [] }')}`
    expect(handwrittenListViolation(swallowed), '吞掉失败的 catch 必须被抓').toBe(true)

    // 不得误报：ListEmpty 标准接线
    const wired = `${page('<template #empty><list-empty :load-error="loadError" @retry="getList" /></template>')}
${script('const loadError = ref(false)\nasync function getList() { try { const res = await listApi(); rows.value = res.rows; loadError.value = false } catch { loadError.value = true } }')}`
    expect(handwrittenListViolation(wired), 'ListEmpty 接线不得误报').toBe(false)

    // 不得误报：**alert 形态**（catch 写的标志由表格上方的 el-alert 消费）
    // 这一条就是 b140 放宽面后 8 报 5 假阳性的形状——判据必须认它，否则等于逼全仓改成一种写法
    const alertWired = `<template>
  <el-alert v-if="loadError" type="error" :title="t('common.loadFailed')" show-icon />
  <el-table :data="rows"><template #empty><el-empty :description="t('common.empty')" /></template></el-table>
</template>
${script('const loadError = ref(false)\nasync function getList() { try { const res = await listApi(); rows.value = res.rows; loadError.value = false } catch { loadError.value = true } }')}`
    expect(handwrittenListViolation(alertWired), 'alert 形态的失败态同样把失败与空态分开了，不得误报').toBe(false)

    // 不得误报：**别名 ref**（真实页面写的是 eventCatalogLoadError）
    const aliasWired = `${page('<template #empty><ListEmpty :load-error="eventCatalogLoadError" @retry="loadEventCatalog" /></template>')}
${script('const eventCatalogLoadError = ref(false)\nasync function loadEventCatalog() { try { const res = await listApi(); rows.value = res.rows; eventCatalogLoadError.value = false } catch { eventCatalogLoadError.value = true } }')}`
    expect(handwrittenListViolation(aliasWired), '别名 ref 的正常接线不得被字面名判成违规').toBe(false)

    // 不得误报：**共用骨架回写**——catch 里写的是形参名 `mark`，模板读的是 `failed`。
    // 这一形状就是 flow 页"四个 tab 共用一个 loadList、另有两个 await 过的导入 API"的真实形状，
    // 只按同名配对判它必假阳性；现在由"模板锚定失败出口 + 出口绑的状态在脚本里被赋过值"这条腿认下它。
    const skeleton = `<script setup>import { listApi, countApi } from '@/api/system/demo'
const rows = ref([])
const count = ref(0)
const failed = ref(false)
async function run(loader, put, mark) {
  try { const r = await loader(); put.value = r.rows } catch { mark.value = true }
}
async function loadCount() { try { const c = await countApi(); count.value = Number(c.data ?? 0) } catch {} }
async function getList() { await run(() => listApi(), rows, failed); loadCount() }</script>`
    const skeletonWired = `<template>
  <el-alert v-if="failed" type="error" :title="t('common.loadFailed')" show-icon />
  <el-table :data="rows"><template #empty><el-empty :description="t('common.empty')" /></template></el-table>
</template>
${skeleton}`
    expect(isFetchingListPage(maskVueSource(skeletonWired)), '夹具必须真的进面（否则反证是空跑）').toBe(true)
    expect(handwrittenListViolation(skeletonWired), '同名配对看不见骨架回写，但失败出口腿必须认它').toBe(false)
    // 反证：同一个骨架、失败态**没上模板** ⇒ 两条腿都不成立，必须被抓
    // （这一条挡住"骨架回写腿恒放行"的退化：摘掉 affordance 的接线要求它就抓不到了）
    const skeletonInvisible = `${page(emptySlot)}
${skeleton}`
    expect(handwrittenListViolation(skeletonInvisible), '骨架回写的失败态若没上模板必须被抓').toBe(true)
    // 反证：出口在、`v-if` 也绑了标识符，但该标志**只声明不写、也不交给任何骨架**
    // ⇒ 死出口（屏幕永远不会亮）。这一条挡住"接线要求被写成恒真"的退化。
    const deadFlag = `<template>
  <el-alert v-if="failed" type="error" :title="t('common.loadFailed')" show-icon />
  <el-table :data="rows"><template #empty><el-empty :description="t('common.empty')" /></template></el-table>
</template>
<script setup>import { listApi } from '@/api/system/demo'
const rows = ref([])
const failed = ref(false)
async function getList() { const res = await listApi(); rows.value = res.rows }</script>`
    expect(
      hasFailureAffordance(templateRegion(maskVueSource(deadFlag)), maskVueScript(deadFlag)),
      '死出口不得算接线'
    ).toBe(false)
    expect(handwrittenListViolation(deadFlag), '绑了从不赋值的标志 = 失败永远看不见，必须被抓').toBe(true)

    // 必须被抓：**"页面上有 alert"不等于"失败有出口"**。这条 alert 的 v-if 绑的是一个与
    // 失败无关的待办计数（流程页的 pendingCount 提醒正是这一形状：type="warning" + 文案
    // 与取数结局无关）。把它认成出口，等于允许任何页面用一条常驻提醒顶掉失败态，
    // 而屏幕上仍然是"加载失败"与"没有数据"逐像素同形。
    const warningUnrelated = `<template>
  <el-alert v-if="pendingCount > 0" type="warning" :title="t('flow.pendingHint')" show-icon :closable="false" />
  <el-table :data="rows"><template #empty><el-empty :description="t('common.empty')" /></template></el-table>
</template>
<script setup>import { listApi, countApi } from '@/api/system/demo'
const rows = ref([])
const pendingCount = ref(0)
const loadError = ref(false)
async function getList() { try { const res = await listApi(); rows.value = res.rows; loadError.value = false } catch { loadError.value = true } }
async function loadCount() { const c = await countApi(); pendingCount.value = Number(c.data ?? 0) }</script>`
    expect(
      hasFailureAffordance(templateRegion(maskVueSource(warningUnrelated)), maskVueScript(warningUnrelated)),
      '"warning 档 + 与失败无关的文案"不得被算作失败出口'
    ).toBe(false)
    expect(handwrittenListViolation(warningUnrelated), '只有无关提醒的自取数列表页必须被抓').toBe(true)

    // 不得误报：静态表格（没有取数入口，失败态无从谈起）
    const staticTable = `${page(emptySlot)}
<script setup>const rows = [{ id: 1 }]</script>`
    expect(handwrittenListViolation(staticTable), '不发请求的静态表格不得误报').toBe(false)

    // 不得误报：有 API 导入但**从不 await**（例如只注册回调、表格来自本地解析结果）
    const noAwait = `${page(emptySlot)}
<script setup>import { listApi } from '@/api/system/demo'
const rows = parsedFromFile.value
onMounted(() => window.addEventListener('offline', listApi))</script>`
    expect(handwrittenListViolation(noAwait), '没有请求的页面不得进面').toBe(false)

    // 不得误报：**建表弹窗**——渲染了表格，也确实 await 了导入的 API，但行集由用户逐条录入，
    // 那一次 await 是提交而不是取数（b140 实测的假阳性形状；前提不成立就不得进面）。
    // 三条断言把"排除它的是哪一条腿"钉死：取数面必须认它发了请求，前置条件必须判否。
    const formDialog = `<template>
  <el-dialog v-model="visible">
    <el-table :data="form.columns"><template #empty><el-empty :description="t('common.empty')" /></template></el-table>
  </el-dialog>
</template>
<script setup>import { saveTable } from '@/api/tool/gen'
const visible = ref(false)
const form = ref({ tableName: '', columns: [] })
async function handleSubmit() {
  const res = await saveTable(form.value)
  if (res.code === 200) visible.value = false
}</script>`
    expect(isFetchingListPage(maskVueSource(formDialog)), '取数面必须认它确实 await 过导入的 API').toBe(true)
    expect(
      rowsFedFromRequest(templateRegion(maskVueSource(formDialog)), maskVueScript(formDialog)),
      '把这条排除在外的是"行集来自请求结果"这条前置条件'
    ).toBe(false)
    expect(handwrittenListViolation(formDialog), '行集来自本地录入的表单弹窗不得进失败态面').toBe(false)

    // 不得误报：组合子调用方由块级判据 ① 负责，不做双罚
    const crudPage = `${page(emptySlot)}
<script setup>import { listApi } from '@/api/system/demo'
const c = useCrudTable<Row>({ listApi })
async function getList() { const res = await listApi(); c.rows.value = res.rows }</script>`
    expect(handwrittenListViolation(crudPage), '组合子页面不得被本腿重复判红').toBe(false)
  })

  it('⑨ 失败标志提取自证：catch 语句块与 .catch( 回调两条形状都要认，且不误收非失败路径', () => {
    // ① try/catch 语句块
    expect(failureFlagNames(`try { await a() } catch (e) { bad.value = true }`)).toEqual(['bad'])
    // ② .catch( 的表达式回调（没有花括号，最容易漏的一支）
    expect(failureFlagNames(`a().catch(() => (bad.value = true))`)).toEqual(['bad'])
    // ③ 两条都要认（漏一支 = 换写法就逃过）
    expect(
      new Set(failureFlagNames(`try { a() } catch { one.value = true } b().catch(() => (two.value = true))`))
    ).toEqual(new Set(['one', 'two']))
    // ④ 只认 `=`，不得把 `===` 的比较当成写入
    expect(failureFlagNames(`if (other.value === true) { x }`)).toEqual([])
    // ⑤ 失败路径之外写入的 ref 不算失败标志（成功分支清标志不算）
    expect(failureFlagNames(`async function f() { await a(); done.value = true }`)).toEqual([])
    // ⑥ catch 的**嵌套块**里的写入也要认（写在 if 分支里同样是失败路径）
    expect(failureFlagNames(`try { a() } catch { if (e) { deep.value = true } }`)).toEqual(['deep'])
    // ⑦ 模板消费判定按名字，不区分绑定形态
    expect(showsFailureState(`try { a() } catch { bad.value = true }`, `<el-alert v-if="bad" />`)).toBe(true)
    expect(showsFailureState(`try { a() } catch { bad.value = true }`, `<el-table :data="rows" />`)).toBe(false)
  })

  it('⑩ 差异法活性（文件级腿）：把每个受约束页面的两条出口都摘掉，该页必须转为违规', () => {
    // 这一条判的是"本腿到底约不约束得住每一个页面"：真实树 0 违规有两种可能——
    // 页面真的接了失败态，或判据根本没落到它们身上（⑥"零捕获 ≠ PASS"在文件级腿上的形状）。
    // 落法是把两条腿同时机械致盲（list-empty 换掉组件名 / 失败文案与 type=error 换掉 /
    // catch 标志在模板里的引用整体消音），每个受约束页面都必须因此转成违规。
    const pages = constrainedListPages()
    expect(pages.length, '受约束面为空 = 本探针空跑，不得据此判绿').toBeGreaterThan(0)
    const escaped: string[] = []
    for (const { rel, text } of pages) {
      expect(handwrittenListViolation(text), `${rel} 当前必须是合规的（否则 ⑦ 与 ⑩ 的断面不同批）`).toBe(false)
      if (!handwrittenListViolation(stripFailureOutlets(text))) {
        escaped.push(rel)
      }
    }
    console.warn(
      `[listEmptyGuard] 文件级腿活性探针：${pages.length} 个受约束页面，摘掉出口后仍不报 = ${escaped.length}`
    )
    expect(escaped, `摘掉失败出口后仍未被抓住的页面（判据没落在它们身上）：\n${escaped.join('\n')}`).toEqual([])
  })
})
