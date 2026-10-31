/**
 * 静态守卫：**占闸必须早于任何 await**（b140 项8 C2）。
 *
 * ## 立的案
 *
 * `useRowActionGuard` 的注释把这条纪律写得很清楚：`busy` 是**同步** Set，
 * "只靠响应式 `runningIds` 不行，它在 `await confirm()` 之后才置位，连点会弹出两个确认框，
 * 用户依次确认就会真的投递两次"。项5 把行内动作整体迁进这一份组合子，但**页面自己手写**的
 * 提交闸（`submitting.value = true`）仍然散落在各处，而这一族的坏形状恰好是最直觉的写法：
 *
 * ```ts
 * async function handleSubmit() {
 *   if (!(await validateForm(formRef.value))) return   // ← 先等校验
 *   submitting.value = true                            // ← 才占闸
 *   await save(form.value)
 * }
 * ```
 *
 * 两次点击都停在 `await` 上、都还没占闸 ⇒ 两次校验都过 ⇒ **同一份数据提交两次**。
 * 按钮上的 `:loading="submitting"` 挡不住，因为第一位用户点下去时 `submitting` 还是 false。
 * 这与 b136/b133 修掉的"读失败冒充空值"、b119 的"落地块不判票"是同一族：
 * **动作的结局由一个与它无关的机制决定**（这里是"谁先跑到 await"）。
 *
 * ## 判据形状（按事实派生，不维护文件清单、不认函数名）
 *
 * 1. **闸位来自模板**：`:loading="IDENT"` / `:disabled="IDENT"` / `v-loading="IDENT"`
 *    的**裸标识符**绑定——这才是"用户看得见的那个闸"。成员路径（`ids.includes(row.id)`）
 *    不进面：那一路由 `useRowActionGuard` 自己保证同步占位。
 * 2. **占闸点来自脚本**：同一文件里 `IDENT.value = true` 的写入。
 * 3. **违规 ⇔ 在该写入的任一** enclosing 函数体内**，写入之前出现过 `await`**。
 *    取"任一层"而不是"最内层"：`async () => (flag.value = true)` 这个回调由一个已经
 *    `await` 过的处理器发起时，点击路径上照样先等了——那一层才是事实。
 *
 * 三条反脆弱各自有理由：闸位存在但从不在此文件写入（组合子持有，如 `useCrudTable`
 * 的 `submitLoading`）**不得判红**；先占闸再 await 的合规写法不得判红；
 * `= false`（释放）不参与判定——否则每个 `finally` 都要被判一次。
 * 采集面由"有裸闸位且有占闸点"派生并带体量下限（扫不全 ≠ 没缺口）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { maskVueSource, templateRegion } from '@/utils/listPageSurface'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

/** 裸标识符的闸位绑定（成员路径不进面：那一路由 useRowActionGuard 保证同步占位） */
const GATE_ATTR_RE = /(?:^|\s):(?:loading|disabled)="([A-Za-z_$][\w$]*)"/g
const V_LOADING_RE = /\bv-loading="([A-Za-z_$][\w$]*)"/g

/**
 * 函数体区间（`function` 声明与花括号体箭头）。
 * 掩码后的文本里花括号配对不受字符串/注释干扰，因此可以直接扫。
 */
function functionRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  const blockFrom = (open: number): number | null => {
    if (text[open] !== '{') return null
    let depth = 0
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1
      else if (text[i] === '}') {
        depth -= 1
        if (depth === 0) return i + 1
      }
    }
    return null
  }
  // function 声明：跳过形参括号再取块体（默认参数里的对象字面量会把 indexOf('{') 带偏）
  for (const m of text.matchAll(/\b(?:async\s+)?function\s*[\w$]*\s*/g)) {
    let j = (m.index ?? 0) + m[0].length
    if (text[j] !== '(') continue
    let depth = 0
    while (j < text.length) {
      if (text[j] === '(') depth += 1
      else if (text[j] === ')') {
        depth -= 1
        if (depth === 0) {
          j += 1
          break
        }
      }
      j += 1
    }
    while (/\s/.test(text[j] ?? '')) j += 1
    const end = blockFrom(j)
    if (end !== null) ranges.push({ start: j, end })
  }
  // 箭头函数：`) =>` 或 `x =>` 之后紧跟 `{` 才算块体
  for (const m of text.matchAll(/=>/g)) {
    let j = (m.index ?? 0) + 2
    while (/\s/.test(text[j] ?? '')) j += 1
    const end = blockFrom(j)
    if (end !== null) ranges.push({ start: j, end })
  }
  return ranges
}

/** 单文件判定：返回"占闸晚于 await"的违规描述（空数组 = 合规或不在面内） */
export function auditLateGateClaim(rel: string, raw: string): string[] {
  const masked = maskVueSource(raw)
  const gates = new Set<string>()
  for (const m of templateRegion(masked).matchAll(GATE_ATTR_RE)) gates.add(m[1])
  for (const m of templateRegion(masked).matchAll(V_LOADING_RE)) gates.add(m[1])
  if (gates.size === 0) return []
  // 写入点扫**整份掩码文本**：模板区不可能有 `X.value = true`，而 maskVueScript 只截
  // 第一个 script 块（真实 SFC 偶有两块），面不得因为分块而缩小
  const script = masked
  const ranges = functionRanges(script)
  const out: string[] = []
  for (const gate of gates) {
    const claimRe = new RegExp(`\\b${gate.replace(/\$/g, '\\$')}\\.value\\s*=\\s*true`, 'g')
    for (const m of script.matchAll(claimRe)) {
      const at = m.index ?? 0
      const enclosing = ranges.filter((r) => at >= r.start && at < r.end)
      if (enclosing.length === 0) continue
      // 任一外层在写入之前已经 await ⇒ 这次点击路径上"先等后占"，连点会双双通过
      const late = enclosing.find((r) => /\bawait\b/.test(script.slice(r.start, at)))
      if (late) {
        out.push(
          `${rel}: ${gate}.value = true 之前已经 await（函数体起于第 ${lineOf(script, late.start)} 行）` +
            ` ⇒ 两次点击都会通过校验各提交一次；占闸必须是函数体第一件事`
        )
      }
    }
  }
  return out
}

function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length
}

/** 有裸闸位的文件（第一层面） */
function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = resolve(dir, name)
    if (statSync(abs).isDirectory()) {
      if (name === 'types' || name === 'node_modules') continue
      collectFiles(abs, out)
    } else if (name.endsWith('.vue')) out.push(abs)
  }
  return out
}

/** 模板里出现的裸标识符闸位名 */
function gateNames(masked: string): string[] {
  const tpl = templateRegion(masked)
  return [...[...tpl.matchAll(GATE_ATTR_RE)].map((m) => m[1]), ...[...tpl.matchAll(V_LOADING_RE)].map((m) => m[1])]
}

/**
 * 占闸点：`NAME.value = true` 且 NAME 是本页面的闸位、且落在某个函数体内。
 *
 * 三条都是判据的输入，缺一条面就虚：
 * · 只扫 `= true` 而不是任意赋值 —— `multiple.value = !selection.length` 这类
 *   **选中态**标志不是"在途闸"，把任意赋值当占闸点会让面被无关布尔量灌满（实测 85 → 54）；
 * · 必须落在函数体内 —— 模块顶层的赋值没有点击路径可言，本腿不约束（单独计数，不静默）；
 * · 掩码文本与原文**逐字符等长**（`blankHtmlComments` / `muteNonCode` 的契约），
 *   因此掩码下标可以直接切回原文——这条不变式由 ② 断言，不靠注释声明。
 */
function claimSites(masked: string): number[] {
  const ranges = functionRanges(masked)
  const out: number[] = []
  for (const n of gateNames(masked)) {
    const re = new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\.value\\s*=\\s*true`, 'g')
    for (const m of masked.matchAll(re)) {
      const at = m.index ?? -1
      if (ranges.some((r) => at >= r.start && at < r.end)) out.push(at)
    }
  }
  return out.sort((a, b) => a - b)
}

const rel = (abs: string) => abs.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')

describe('静态守卫：占闸必须早于任何 await', () => {
  const files = collectFiles(SRC_DIR)
  // 本腿真正约束的面 = 页面有裸闸位 **且** 在函数体里真的写过 `闸位.value = true`
  // （组合子持有的 `submitLoading` 一类由组合子的单测负责；选中态布尔量不是占闸点）
  const claiming = files.filter((f) => claimSites(maskVueSource(readFileSync(f, 'utf8'))).length > 0)

  it('① 真实树：任何页面都不得"先 await 再占闸"', () => {
    const report: string[] = []
    for (const f of claiming) report.push(...auditLateGateClaim(rel(f), readFileSync(f, 'utf8')))
    console.warn(
      `[busyGateGuard] 采集面 src ${files.length} 个 .vue / 有函数内占闸点 ${claiming.length} 个 / 违规 ${report.length} 处`
    )
    expect(report, `占闸晚于 await（连点会重复提交）：\n${report.join('\n')}`).toEqual([])
  })

  it('② 采集面体量自证 + 掩码长度不变式（判据下标直接切原文，靠的就是这条）', () => {
    expect(files.length, `src 采集面 ${files.length} 个 .vue`).toBeGreaterThanOrEqual(180)
    expect(claiming.length, `有函数内占闸点的页面 ${claiming.length} 个`).toBeGreaterThanOrEqual(40)
    const drift: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      if (maskVueSource(text).length !== text.length) drift.push(rel(f))
    }
    expect(drift, `掩码文本与原文长度不等的文件（占闸点下标会切错位置）：\n${drift.join('\n')}`).toEqual([])
  })

  it('③ 合成双向：晚占闸必须被抓；先占闸 / 组合子形态不得误报', () => {
    const tpl = (attr: string) => `<template><el-button ${attr} @click="submit">ok</el-button></template>`

    const late = `${tpl(':loading="submitting"')}
<script setup>const submitting = ref(false)
async function submit() {
  if (!(await validateForm(formRef.value))) return
  submitting.value = true
  await save(form.value)
  submitting.value = false
}</script>`
    expect(auditLateGateClaim('late.vue', late), '先 await 后占闸必须被抓').toHaveLength(1)

    // 合规：占闸是函数体第一件事，await 都排在它之后
    const first = `${tpl(':loading="submitting"')}
<script setup>const submitting = ref(false)
async function submit() {
  submitting.value = true
  try {
    if (!(await validateForm(formRef.value))) return
    await save(form.value)
  } finally {
    submitting.value = false
  }
}</script>`
    expect(auditLateGateClaim('first.vue', first), '先占闸不得误报').toEqual([])

    // 合规：释放（= false）不参与判定
    const release = `${tpl(':loading="exporting"')}
<script setup>const exporting = ref(false)
async function handleExport() {
  exporting.value = true
  await downloadFile()
  exporting.value = false
}</script>`
    expect(auditLateGateClaim('release.vue', release), '释放点不得算占闸点').toEqual([])

    // 合规：闸位由组合子持有（页面里从不写它）
    const owned = `${tpl(':loading="submitLoading"')}
<script setup>const { submitLoading, submit } = useCrudTable({ listApi })</script>`
    expect(auditLateGateClaim('owned.vue', owned), '本文件不写的闸位不得判红').toEqual([])

    // 合规：成员路径闸位（useRowActionGuard 的 runningIds.includes(...)）不进面
    const member = `<template><el-button :loading="runningIds.includes(row.id)" @click="push(row)">x</el-button></template>
<script setup>async function push(row) { await confirmBox(); await api(row.id) }</script>`
    expect(auditLateGateClaim('member.vue', member), '成员路径闸位不属于本腿的面').toEqual([])

    // 必须被抓：占闸写在**已 await 过的处理器所发起的回调**里（取"任一层"而不是最内层）
    const nested = `${tpl(':loading="busy"')}
<script setup>const busy = ref(false)
async function open(row) {
  await loadDetail(row.id)
  rows.forEach((r) => {
    if (r.id === row.id) busy.value = true
  })
}</script>`
    expect(auditLateGateClaim('nested.vue', nested), '外层先 await、内层才占闸同样必须被抓').toHaveLength(1)

    // 控制组：同一个形状但外层没有 await ⇒ 必须不报（否则上一条是恒真）
    const nestedClean = `${tpl(':loading="busy"')}
<script setup>const busy = ref(false)
function open(row) {
  rows.forEach((r) => {
    if (r.id === row.id) busy.value = true
  })
}</script>`
    expect(auditLateGateClaim('nestedClean.vue', nestedClean), '外层不 await 时必须不报').toEqual([])
  })

  it('④ 差异法活性：每个受约束页面把 await 插到占闸点之前，该页必须转为违规', () => {
    const escaped: string[] = []
    for (const f of claiming) {
      const text = readFileSync(f, 'utf8')
      const at = claimSites(maskVueSource(text))[0]
      // 紧贴在占闸语句之前插入一次 await：真实违规形状。插在**语句起点**而不是行首，
      // 否则单行函数（`async function f() { x.value = true }`）会把 await 落到函数体外。
      const mutated = `${text.slice(0, at)}await tick();${text.slice(at)}`
      if (auditLateGateClaim(rel(f), mutated).length === 0) escaped.push(rel(f))
    }
    console.warn(`[busyGateGuard] 活性探针：${claiming.length} 个受约束页面，插入 await 后仍不报 = ${escaped.length}`)
    expect(escaped, `插入"占闸前先 await"后仍未被抓住的页面：\n${escaped.join('\n')}`).toEqual([])
  })
})
