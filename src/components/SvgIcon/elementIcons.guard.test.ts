/**
 * 静态守卫：Element Plus 图标**全局注册子集必须覆盖全部按名字使用的站点**（b121）。
 *
 * ## 立的案
 *
 * `svgicon.ts` 历史写法是 `import * as components` 全量注册 293 个图标，整包进首屏
 * （42.3KB gzip / 167KB raw）。真正需要"按名字解析"的只有两类，但它们散落在全部视图里：
 *
 * 1. **模板直接标签** `<Folder />` / `<Document />`——`ElementPlusResolver` 只解析 `El*`
 *    组件，图标标签没有本地 import 时靠全局注册解析；
 * 2. **未绑定的字符串属性** `icon="Refresh"` / `prefix-icon="Search"`——Element Plus
 *    把字符串当全局组件名解析（绑定的 `:icon="Refresh"` 传的是对象，不依赖注册表）；
 * 3. 少量脚本里的字符串图标值（`dashboardLayout.ts` 的 widget 图标等）。
 *
 * 裁剪后漏登记一个名字的表现是**空白图标**：Element Plus 对未注册字符串名静默渲染空，
 * 控制台、a11y 扫描、请求面全都看不见。所以"只保留用到的"必须配一把**由事实派生**的锁：
 * 扫描全部 `.vue`（模板 + script）与生产 `.ts` 的图标字段，逐个与真实导出对账。
 *
 * ## 判定
 *
 * - 模板标签若是 `@element-plus/icons-vue` 的真实导出 ⇒ 必须在 `elementIcons` 里；
 * - 模板 `icon|prefix-icon|suffix-icon="X"` 的值必须在真实导出里（拼错当场红）且在表里；
 * - 脚本 `icon: 'X'` / `titleIcon: 'X'` 只对真实导出取交集（路由 meta 的图标是 SvgIcon
 *   精灵名，不是 Element Plus 图标，不能要求它们都在表里）；
 * - 局部已 import 的标签同样要求登记（**超集**）：只多花几 KB，绝不出现空白图标；
 * - 采集面下限与 must-hit（`Folder` / `Document` / `Refresh` / `Grid`）保证判据真的跑起来了。
 *
 * 全集只有一处合法：表单设计器的 `IconsDialog.vue` 自己 `import *` 并以**组件对象**
 * 渲染（随设计器 chunk 懒加载）。它同样由本守卫钉住——一旦退回按名字渲染就必须重新登记。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as ElementPlusIcons from '@element-plus/icons-vue'
import { elementIcons } from './svgicon'
import {
  collectByExt,
  muteComments,
  plantInVueTemplate,
  vueTemplateRegion,
  EXCLUDED_DIRS
} from '@/utils/e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SRC = resolve(VUE_ROOT, 'src')

/** `@element-plus/icons-vue` 的真实导出名集合（判据的权威来源，不是手抄清单） */
const ICON_EXPORTS = new Set(Object.keys(ElementPlusIcons).filter((name) => /^[A-Z][A-Za-z0-9]*$/.test(name)))

export interface IconScan {
  /** 模板里以直接标签形式出现的图标名（真实导出才计入） */
  tags: string[]
  /** 模板里未绑定的 icon / prefix-icon / suffix-icon 值 */
  attrs: string[]
  /** 脚本里 `icon: 'X'` / `titleIcon: 'X'` 且 X 是真实导出的 */
  script: string[]
  /** 模板属性值不是真实导出（拼错 / 非图标名）——必须为空 */
  unknownAttrs: string[]
}

const TAG_RE = /<([A-Z][A-Za-z0-9]*)(?=[\s/>])/g
const ATTR_RE = /(?:^|\s)(?:icon|prefix-icon|suffix-icon)="([A-Z][A-Za-z0-9]*)"/g
const SCRIPT_RE = /\b(?:icon|titleIcon)\s*:\s*'([A-Z][A-Za-z0-9]*)'/g

/**
 * 纯判据：一份 SFC 源码 → 按名字使用图标的站点。
 * 真实树与合成夹具共用同一条路径（避免"夹具走另一套实现"的假绿）。
 */
export function scanIconNames(src: string): IconScan {
  const out: IconScan = { tags: [], attrs: [], script: [], unknownAttrs: [] }
  const region = vueTemplateRegion(src)
  if (region) {
    for (const m of region.code.matchAll(TAG_RE)) {
      if (ICON_EXPORTS.has(m[1])) out.tags.push(m[1])
    }
    for (const m of region.code.matchAll(ATTR_RE)) {
      out.attrs.push(m[1])
      if (!ICON_EXPORTS.has(m[1])) out.unknownAttrs.push(m[1])
    }
  }
  const scriptText = muteComments(src.replace(/<template>[\s\S]*<\/template>/, ''))
  for (const m of scriptText.matchAll(SCRIPT_RE)) {
    if (ICON_EXPORTS.has(m[1])) out.script.push(m[1])
  }
  return out
}

/** 生产脚本的图标字段（`icon: 'X'`），只取真实导出 */
export function scanScriptIconNames(src: string): string[] {
  const out: string[] = []
  for (const m of muteComments(src).matchAll(SCRIPT_RE)) {
    if (ICON_EXPORTS.has(m[1])) out.push(m[1])
  }
  return out
}

const vueFiles = collectByExt(SRC, '', '.vue', EXCLUDED_DIRS)
const tsFiles = collectByExt(SRC, '', '.ts', EXCLUDED_DIRS).filter(
  (rel) => !rel.endsWith('.test.ts') && !rel.startsWith('i18n/locales/')
)

interface RealScan {
  names: Set<string>
  unknownAttrs: string[]
  vueCount: number
  tsCount: number
}

function scanRealTree(): RealScan {
  const names = new Map<string, string[]>()
  const unknownAttrs: string[] = []
  const add = (name: string, where: string): void => {
    if (!names.has(name)) names.set(name, [])
    names.get(name)!.push(where)
  }
  for (const rel of vueFiles) {
    const scan = scanIconNames(readFileSync(resolve(SRC, rel), 'utf8'))
    for (const name of [...scan.tags, ...scan.attrs, ...scan.script]) add(name, rel)
    for (const name of scan.unknownAttrs) unknownAttrs.push(`${rel}: icon="${name}"`)
  }
  for (const rel of tsFiles) {
    const scan = scanScriptIconNames(readFileSync(resolve(SRC, rel), 'utf8'))
    for (const name of scan) add(name, rel)
  }
  return { names: new Set(names.keys()), unknownAttrs, vueCount: vueFiles.length, tsCount: tsFiles.length }
}

describe('Element Plus 图标注册表与使用面对账', () => {
  const real = scanRealTree()

  it('采集面自证：扫到足够多的文件与图标名（判据没跑起来必须响亮失败）', () => {
    // b121 实测 200 个 .vue / 298 个生产 .ts；下限留出删页余量，但采不到就响亮失败
    expect(real.vueCount).toBeGreaterThan(180)
    expect(real.tsCount).toBeGreaterThan(250)
    expect(real.names.size).toBeGreaterThanOrEqual(80)
    // must-hit：这些是真实消费面，任何一个缺席都说明扫描逻辑坏了
    for (const name of ['Folder', 'Document', 'Refresh', 'Grid', 'Search']) {
      expect(real.names.has(name), `采集面缺少 ${name}`).toBe(true)
    }
  })

  it('真实树：所有按名字使用的图标都已在注册表里（漏登记 = 空白图标）', () => {
    const missing = [...real.names].filter((name) => !(name in elementIcons)).sort()
    expect(missing, `未登记：${missing.join(', ')}`).toEqual([])
  })

  it('真实树：icon 属性值必须是真实导出（拼错的图标名不许静默）', () => {
    expect(real.unknownAttrs).toEqual([])
  })

  it('注册表里的每个键都是真实导出（防手抄清单腐化）', () => {
    const bogus = Object.keys(elementIcons).filter((name) => !ICON_EXPORTS.has(name))
    expect(bogus).toEqual([])
  })

  it('svgicon.ts 不得回到全量 import；注册必须经 main.ts 生效', () => {
    const registry = readFileSync(resolve(SRC, 'components/SvgIcon/svgicon.ts'), 'utf8')
    expect(registry).not.toMatch(/^import\s+\*\s+as\s+/m)
    const main = readFileSync(resolve(SRC, 'main.ts'), 'utf8')
    expect(main).toMatch(/app\.use\(elementIcons\)/)
  })

  it('表单设计器是唯一全集消费者，且必须以组件对象渲染', () => {
    const dialog = readFileSync(resolve(SRC, 'views/tool/build/IconsDialog.vue'), 'utf8')
    // 必须是 `?catalog` 实例：普通入口会把整包拉进与首屏共享的 chunk（b121 实测 42.4KB → 13.3KB）
    expect(dialog).toMatch(/import \* as ElementPlusIconsVue from '@element-plus\/icons-vue\?catalog'/)
    expect(dialog).toMatch(/iconComponents\[icon\]/)
    const widget = readFileSync(resolve(SRC, 'views/dashboard/WidgetCard.vue'), 'utf8')
    expect(widget).not.toMatch(/@element-plus\/icons-vue/)
  })

  it('扫描器合成双向：标签 / 属性 / 脚本 / 注释 / 拼错', () => {
    const sfc = (tpl: string, script = ''): string =>
      `<template>${tpl}</template>\n<script setup lang="ts">\n${script}\n</script>\n`
    expect(scanIconNames(sfc('<div><Folder /></div>')).tags).toContain('Folder')
    expect(scanIconNames(sfc('<div><ElButton /></div>')).tags).toEqual([])
    expect(scanIconNames(sfc('<div><MyWidget /></div>')).tags).toEqual([])
    expect(scanIconNames(sfc('<!-- <Folder /> --><div />')).tags).toEqual([])
    expect(scanIconNames(sfc('<el-button icon="Refresh" />')).attrs).toEqual(['Refresh'])
    expect(scanIconNames(sfc('<el-button :icon="Refresh" />')).attrs).toEqual([])
    expect(scanIconNames(sfc('<el-button icon="refresh" />')).attrs).toEqual([])
    expect(scanIconNames(sfc('<el-button icon="Refrehs" />')).unknownAttrs).toEqual(['Refrehs'])
    expect(scanScriptIconNames("const a = { icon: 'Grid' }")).toEqual(['Grid'])
    expect(scanScriptIconNames("const a = { icon: 'dashboard' }")).toEqual([])
    expect(scanScriptIconNames("// icon: 'Grid'\nconst a = 1")).toEqual([])
  })

  it('扫描器活性：把真实文件插一条违规，必须被同一个扫描器抓到', () => {
    const rel = 'components/TreePanel/index.vue'
    const original = readFileSync(resolve(SRC, rel), 'utf8')
    const planted = plantInVueTemplate(original, '<el-button icon="Cpu" />')
    const scan = scanIconNames(planted)
    expect(scan.attrs).toContain('Cpu')
    // 原文件里没有这条属性（差异法活性：证明命中的是插入的那一条）
    expect(scanIconNames(original).attrs).not.toContain('Cpu')
  })
})
