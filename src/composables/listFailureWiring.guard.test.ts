/**
 * useCrudTable 页面的「失败态必须接线」守卫（b118）。
 *
 * 立的案（真机取证见台账 b118 §1）：`useCrudTable` 自 b88 起就提供 `loadError` /
 * `retryLoad`，但接线靠每个页面记得——本轮实测有 3 页（system/file、monitor/job、
 * report/dataset）**一次都没引用过 loadError**：列表请求失败时 table 的默认空态
 * 渲染「暂无数据」，与"真的没有数据"在屏幕上逐像素同形（b90 ① 的同一家族）。
 *
 * 采集面**由事实派生**（不按文件名枚举）：`src/views/**` 里同时 import useCrudTable
 * 且渲染 `<el-table` 的 `.vue` 即进面。三件事逐页判：
 * 1. 解构块里必须有 `loadError`（只接线不使用 = 没接）；
 * 2. 失败态必须是可访问的渲染出口：`<list-empty :load-error="loadError">`
 *    或页面自己的 `v-if="loadError"` 分支；
 * 3. 走 ListEmpty 时 `@retry` 必须接到 `retryLoad` / `getList`（失败态里没有重试
 *    ⇒ 用户只能整页刷新）。
 *
 * 合成夹具覆盖"坏了必须抓到"，另配两条真实树正控：采集面体量下限 + 三枚本轮
 * 修复页确实在面里（"一条都没扫到"与"扫到了且干净"必须可分，前言 ⑥）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIEWS = path.resolve(HERE, '../views')

function collectVue(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) collectVue(full, out)
    else if (ent.name.endsWith('.vue')) out.push(full)
  }
  return out
}

/** 采集面：真正调用 useCrudTable 且渲染 el-table 的页面（相对路径 → 源码） */
export function collectSurface(files: { rel: string; code: string }[]): { rel: string; code: string }[] {
  // 只认"解构赋值 = useCrudTable"这一形态：手写列表页会从同一模块 import
  // pageAfterEmptyResult / resetQueryDefaults 等纯函数，光看文本里有没有
  // "useCrudTable" 会把它们一起拉进面（实测 11 条误报，b118）。
  return files.filter((f) => /\}\s*=\s*useCrudTable/.test(f.code) && f.code.includes('<el-table'))
}

/** 从 `} = useCrudTable<...>({` 之前的那段解构里取绑定名 */
export function destructuredNames(code: string): string[] {
  const at = code.indexOf('= useCrudTable')
  if (at < 0) return []
  const open = code.lastIndexOf('const {', at)
  if (open < 0) return []
  const block = code.slice(open + 'const {'.length, at)
  return block
    .split(',')
    .map((s) =>
      s
        .replace(/[}\s]+$/, '')
        .split(':')[0]
        .trim()
    )
    .filter(Boolean)
}

/** 逐页判三件事，返回违规清单（空 = 干净） */
export function auditPage(rel: string, code: string): string[] {
  const out: string[] = []
  if (!destructuredNames(code).includes('loadError')) {
    out.push(`${rel}: 未从 useCrudTable 解构 loadError（失败会落回"暂无数据"）`)
  }
  const usesListEmpty = /<list-empty\b/.test(code)
  const localBranch = /v-if="loadError"/.test(code)
  if (usesListEmpty) {
    if (!/:load-error="loadError"/.test(code)) {
      out.push(`${rel}: <list-empty> 没有绑定 :load-error（失败态不会显示）`)
    }
    if (!/@retry="(retryLoad|getList)"/.test(code)) {
      out.push(`${rel}: 失败态缺少 @retry="retryLoad|getList"（用户只能整页刷新）`)
    }
  } else if (!localBranch) {
    out.push(`${rel}: 既没有 <list-empty> 失败态，也没有 v-if="loadError" 本地分支`)
  }
  return out
}

const GOOD = `
<script setup lang="ts">
const { dataList, loadError, retryLoad, getList } = useCrudTable({} as never)
</script>
<template><el-table :data="dataList">
  <template #empty><list-empty :load-error="loadError" @retry="retryLoad" /></template>
</el-table></template>
`

const BAD_NO_DESTRUCTURE = `
<script setup lang="ts">
const { dataList, getList } = useCrudTable({} as never)
</script>
<template><el-table :data="dataList" /></template>
`

const BAD_EMPTY_UNBOUND = `
<script setup lang="ts">
const { dataList, loadError, getList } = useCrudTable({} as never)
</script>
<template><el-table :data="dataList">
  <template #empty><list-empty @retry="getList" /></template>
</el-table></template>
`

const BAD_NO_RETRY = `
<script setup lang="ts">
const { dataList, loadError, retryLoad } = useCrudTable({} as never)
</script>
<template><el-table :data="dataList">
  <template #empty><list-empty :load-error="loadError" /></template>
</el-table></template>
`

const GOOD_LOCAL_BRANCH = `
<script setup lang="ts">
const { dataList, loadError } = useCrudTable({} as never)
</script>
<template><el-alert v-if="loadError" title="x" /><el-table :data="dataList" /></template>
`

const NOT_A_COMPOSABLE_PAGE = `
<script setup lang="ts">
const dataList = ref([])
</script>
<template><el-table :data="dataList" /></template>
`

describe('useCrudTable 页面失败态接线守卫（b118）', () => {
  const files = collectVue(VIEWS).map((abs) => ({
    rel: path.relative(path.resolve(HERE, '..'), abs).replaceAll('\\', '/'),
    code: fs.readFileSync(abs, 'utf8')
  }))
  const surface = collectSurface(files)

  it('采集面体量下限：派生出的页面数不得异常缩小', () => {
    // 本轮实测 30 页（`src/views/**` 里 `} = useCrudTable` 且渲染 `<el-table>`）；
    // 下限取 25 防"扫不到文件"被读成"没有违规"，又不把具体页数钉死（增删页面不该红）
    expect(surface.length).toBeGreaterThanOrEqual(25)
  })

  it('真实树：全部 useCrudTable 表格页都已接线失败态', () => {
    const violations = surface.flatMap((f) => auditPage(f.rel, f.code))
    expect(violations).toEqual([])
  })

  it('正控：本轮修复的三页确实在采集面里（must-hit）', () => {
    const rels = surface.map((f) => f.rel)
    for (const rel of [
      'views/system/file/index.vue',
      'views/monitor/job/index.vue',
      'views/report/dataset/index.vue'
    ]) {
      expect(rels, `${rel} 必须进面`).toContain(rel)
    }
  })

  it('合成双向：合规页 0 违规，四种坏形状逐条点名', () => {
    expect(auditPage('good.vue', GOOD)).toEqual([])
    expect(auditPage('good-local.vue', GOOD_LOCAL_BRANCH)).toEqual([])
    expect(auditPage('bad1.vue', BAD_NO_DESTRUCTURE).join()).toContain('未从 useCrudTable 解构 loadError')
    expect(auditPage('bad2.vue', BAD_EMPTY_UNBOUND).join()).toContain('没有绑定 :load-error')
    expect(auditPage('bad3.vue', BAD_NO_RETRY).join()).toContain('缺少 @retry')
  })

  it('反证：不 import useCrudTable 的表格页不进面（手写取数页由 listEmptyLoadError.guard 负责）', () => {
    expect(collectSurface([{ rel: 'x.vue', code: NOT_A_COMPOSABLE_PAGE }])).toEqual([])
  })
})
