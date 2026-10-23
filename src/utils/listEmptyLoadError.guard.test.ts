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
 * cache 页等）不在本锁约束内——它们的失败态由各页本地 ref 接同一 ListEmpty，
 * 无统一状态源可锁，强行纳入会把"未接入"判成"接错"。
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
import { muteNonCode } from '@/utils/e2eSuiteScanKit'

/** 仓根按本文件位置反推（src/utils 的上两层），与其余守卫同一口径 */
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VIEWS_DIR = resolve(VUE_ROOT, 'src', 'views')

/** 采集面体量下限：视图文件数与 useCrudTable 调用点数（低于下限 = 扫描器走偏，拒绝判据） */
const MIN_VIEWS_FILES = 100
const MIN_CRUD_CALLERS = 25

/** 组合子调用形态：泛型尖括号或直接圆括号；裸 import 名 / 路径字符串 / 注释文本都不算 */
const CRUD_CALL_RE = /\buseCrudTable\s*[<(]/
/**
 * "暂无数据"类空态文案键：只认 `common.empty` / `common.noData` 整键
 * （后面不得再接字母——`common.emptyActionReset` 是 CTA 按钮文案，不是空态本身）。
 */
const EMPTY_TEXT_RE = /common\.(?:empty|noData)(?![A-Za-z])/

/** HTML 注释等长置空（保留换行，行号可信）；注释里的反例不是代码 */
function blankHtmlComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

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
  // 掩码口径三件套，每件都各有理由（缺一即判据的输入坏）：
  // · HTML 注释等长置空：模板里的说明注释不是代码；
  // · muteNonCode(keepStrings)：JS 注释置空，但**字符串保留**——空态绑定
  //   （`:description="t('common.empty')"`）就长在模板属性字符串里，
  //   连字符串一起抹掉等于把判据的输入抹没；
  // · keepRegex：模板里 `/>`、`</el-table>` 的 `/` 会被 JS 掩码器当成"正则起点"，
  //   默认分支把整段**置空**、吞掉 `</template>` 闭合标签（探针实测），块定界当场失衡；
  //   keepRegex 让这类伪正则区间原样搬运，注释与字符串的处理不受影响。
  const masked = muteNonCode(blankHtmlComments(text), { keepStrings: true, keepRegex: true })
  if (!CRUD_CALL_RE.test(masked)) return []
  const hits: number[] = []
  for (const block of emptyTemplateBlocks(masked)) {
    if (EMPTY_TEXT_RE.test(block.body) && !/loadError/.test(block.body)) hits.push(block.line)
  }
  return hits
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
const crudCallers = viewFiles.filter((f) =>
  CRUD_CALL_RE.test(muteNonCode(blankHtmlComments(readFileSync(f, 'utf8')), { keepStrings: true, keepRegex: true }))
)

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
})
