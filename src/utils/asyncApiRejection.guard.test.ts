/**
 * 页面层「API 调用拒绝必须有人收尾」守卫（b141）。
 *
 * 立的案（HEAD 实测 7 处 `.vue` 站点）：`try { await <api>() } finally { loading = false }`
 * 没有 catch ⇒ 请求失败时拒绝逸出 async 事件处理器，被全局 errorHandler / ErrorBoundary
 * 接管，用户看到的是「页面加载失败」甚至整页被卸载，而真正的后端理由（拦截器已弹的
 * toast）随页面一起消失。b95/r44 已实证过同一形态（负例 400 → 整页替换）。
 *
 * 判据（事实派生，不按文件名枚举）：
 * 1. 采集面 = `src/views/**` 与 `src/components/**` 下的 `.vue`（**页面/组件层**——
 *    这一层拥有用户可见结局）。`src/utils` / `src/composables` 的上抛是刻意的
 *    分层契约（由调用方决定结局），不在本判据面内。
 * 2. 违规 = `try` 块体内出现 `await <ident>(`，且该 `try` 没有 `catch`（只有 `finally`），
 *    且 `<ident>` 来自 `@/api/**` 或 `@/utils/request` 的导入（请求层函数会 reject；
 *    内部 loader 若已自吞错误则不算——判据只认会 reject 的那一族）。
 * 3. 外层 `try { … } catch { … }` 能接住内层拒绝 ⇒ 不算违规（防误报；b140 的
 *    `useComplianceReport` 就是这一形状，虽然它在 `.ts` 里）。
 *
 * 已知局限（登记为 N-141-A，不判）：只看**文本嵌套**的外层 catch。若内层 try 长在
 * 外层 try 体内的一个嵌套 async 函数里、而该函数的 promise 没有被 await（如未等待的
 * `arr.map(async () => …)`），拒绝实际会逸出，但本判据会按"外层能接住"放过。
 * 真实树该形状 0 处；要判它需要控制流可达性分析，属另一批次的采集面扩张。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface TryBlock {
  start: number
  bodyStart: number
  bodyEnd: number
  hasCatch: boolean
  hasFinally: boolean
}

interface Violation {
  file: string
  line: number
  api: string
}

/** 仓根按**本文件位置**反推（src/utils 的上两层）——守卫自己不得用 process.cwd() */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 注释与字符串内容替换成空格（保留换行与长度），只在代码区做词法判断 */
function maskNonCode(text: string): string {
  const out = text.split('')
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out[i] = ' '
        i++
      }
    } else if (c === '/' && text[i + 1] === '*') {
      out[i] = ' '
      out[i + 1] = ' '
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < text.length) {
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      }
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out[i] = ' '
      i++
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          out[i] = ' '
          i++
          if (i < text.length) {
            if (text[i] !== '\n') out[i] = ' '
            i++
          }
          continue
        }
        if (text[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < text.length) {
        out[i] = ' '
        i++
      }
    } else {
      i++
    }
  }
  return out.join('')
}

function matchBrace(masked: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < masked.length; i++) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 找出全部 try 块及其 catch/finally 归属 */
function findTryBlocks(masked: string): TryBlock[] {
  const blocks: TryBlock[] = []
  const re = /\btry\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(masked))) {
    let k = m.index + 3
    while (k < masked.length && /\s/.test(masked[k])) k++
    if (masked[k] !== '{') continue
    const bodyStart = k
    const bodyEnd = matchBrace(masked, bodyStart)
    if (bodyEnd < 0) continue
    let n = bodyEnd + 1
    while (n < masked.length && /\s/.test(masked[n])) n++
    let hasCatch = false
    let hasFinally = false
    if (masked.startsWith('catch', n)) {
      hasCatch = true
      let c = n + 5
      while (c < masked.length && /\s/.test(masked[c])) c++
      if (masked[c] === '{') {
        const catchEnd = matchBrace(masked, c)
        n = catchEnd < 0 ? masked.length : catchEnd + 1
        while (n < masked.length && /\s/.test(masked[n])) n++
      }
    }
    if (masked.startsWith('finally', n)) hasFinally = true
    blocks.push({ start: m.index, bodyStart, bodyEnd, hasCatch, hasFinally })
  }
  return blocks
}

/** 从 SFC 里解析「来自请求层的本地函数名」 */
function apiBindings(text: string): Set<string> {
  const names = new Set<string>()
  const importRe = /import\s+(type\s+)?([\s\S]*?)\s+from\s+['"](@\/api\/[^'"]+|@\/utils\/request)['"]/g
  let m: RegExpExecArray | null
  while ((m = importRe.exec(text))) {
    if (m[1]) continue
    const clause = m[2].trim()
    const named = clause.match(/\{([\s\S]*)\}/)
    if (named) {
      for (const part of named[1].split(',')) {
        const piece = part.trim()
        if (!piece || piece.startsWith('type ')) continue
        const alias = piece.split(/\s+as\s+/)
        const local = (alias[1] ?? alias[0]).trim()
        if (/^[A-Za-z_$][\w$]*$/.test(local)) names.add(local)
      }
    } else if (/^[A-Za-z_$][\w$]*$/.test(clause)) {
      // 默认导入（request 本体）
      names.add(clause)
    }
  }
  return names
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/** 分析单份源码：返回该文件的违规列表 */
function analyzeSource(rel: string, raw: string): Violation[] {
  const text = raw.replace(/\r\n/g, '\n')
  const masked = maskNonCode(text)
  const apis = apiBindings(text)
  if (apis.size === 0) return []
  const blocks = findTryBlocks(masked)
  const violations: Violation[] = []
  for (const block of blocks) {
    if (block.hasCatch) continue
    const body = masked.slice(block.bodyStart + 1, block.bodyEnd)
    const awaited = [...body.matchAll(/\bawait\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((x) => x[1])
    const apiNames = awaited.filter((name) => apis.has(name))
    if (apiNames.length === 0) continue
    // 外层 try 的 catch 能接住该拒绝 ⇒ 不算逸出
    const caughtByOuter = blocks.some(
      (outer) => outer.hasCatch && outer.bodyStart < block.start && block.start < outer.bodyEnd
    )
    if (caughtByOuter) continue
    violations.push({ file: rel, line: lineOf(text, block.start), api: apiNames[0] })
  }
  return violations
}

function collectVueFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collectVueFiles(p, out)
    else if (e.name.endsWith('.vue')) out.push(p)
  }
  return out
}

const files = [...collectVueFiles(path.join(ROOT, 'src/views')), ...collectVueFiles(path.join(ROOT, 'src/components'))]

describe('asyncApiRejection.guard：页面层 API 拒绝不得逸出', () => {
  it('真实树：try/finally 包裹 API 调用必须有 catch（0 违规）', () => {
    const violations: Violation[] = []
    let apiFiles = 0
    let tryBlocks = 0
    for (const abs of files) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
      const text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
      if (apiBindings(text).size > 0) apiFiles++
      tryBlocks += findTryBlocks(maskNonCode(text)).length
      violations.push(...analyzeSource(rel, text))
    }
    // 采集面自证：面必须是事实派生且非空（不是"什么都没扫到"）
    expect(files.length).toBeGreaterThan(150)
    expect(apiFiles).toBeGreaterThan(80)
    expect(tryBlocks).toBeGreaterThan(100)
    // 条数由守卫自打，文档不抄
    console.warn(
      `asyncApiRejection.guard 采集面：${files.length} 个 .vue / 含请求层导入 ${apiFiles} / try 块 ${tryBlocks} / 违规 ${violations.length}`
    )
    expect(violations, JSON.stringify(violations)).toEqual([])
  })

  it('本批修复的站点仍在采集面内（防止"文件被移走/改名"让守卫静默放过）', () => {
    const rels = files.map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))
    for (const must of [
      'src/views/tool/reportBoard/index.vue',
      'src/views/system/tenant/index.vue',
      'src/views/system/scimGroup/index.vue',
      'src/views/report/dataset/index.vue',
      'src/views/report/designer/index.vue',
      'src/views/system/tenant/domain/index.vue',
      'src/components/UserPrefsDialog/index.vue'
    ]) {
      expect(rels).toContain(must)
    }
  })

  it('合成夹具：缺陷形状必抓、合规形状不得误报', () => {
    const base = (script: string) => `<template><div /></template>\n<script setup lang="ts">\n${script}\n</script>\n`
    // ① 修复前的真实形状（漏 catch）⇒ 必抓
    const bad = analyzeSource(
      'fixture/bad.vue',
      base(
        "import { updateScimGroup } from '@/api/system/scimGroup'\n" +
          'async function save() {\n  saving.value = true\n  try {\n    await updateScimGroup(1, {})\n  } finally {\n    saving.value = false\n  }\n}'
      )
    )
    expect(bad).toHaveLength(1)
    expect(bad[0].api).toBe('updateScimGroup')
    // ② 有 catch ⇒ 不得误报
    expect(
      analyzeSource(
        'fixture/ok-catch.vue',
        base(
          "import { updateScimGroup } from '@/api/system/scimGroup'\n" +
            'async function save() {\n  try {\n    await updateScimGroup(1, {})\n  } catch {\n    return\n  } finally {\n    saving.value = false\n  }\n}'
        )
      )
    ).toEqual([])
    // ③ 等待的是内部 loader（不是请求层）⇒ 不得误报
    expect(
      analyzeSource(
        'fixture/ok-local.vue',
        base(
          "import { listTenant } from '@/api/system/tenant'\n" +
            'async function refresh() {\n  try {\n    await loadDashboards()\n  } finally {\n    loading.value = false\n  }\n}'
        )
      )
    ).toEqual([])
    // ④ 外层 catch 能接住 ⇒ 不得误报
    expect(
      analyzeSource(
        'fixture/ok-outer.vue',
        base(
          "import { getPackageFeatures } from '@/api/system/tenant'\n" +
            'async function run() {\n  try {\n    inner()\n  } catch {\n    return\n  }\n}\n' +
            'async function inner() {\n  try {\n    await getPackageFeatures(1)\n  } finally {\n    busy.value = false\n  }\n}'
        )
      )
    ).toHaveLength(1)
    // ⑤ 外层 try 包住内层 try/finally ⇒ 内层拒绝由外层 catch 接住
    expect(
      analyzeSource(
        'fixture/ok-enclosing.vue',
        base(
          "import { getPackageFeatures } from '@/api/system/tenant'\n" +
            'async function run() {\n  try {\n    try {\n      await getPackageFeatures(1)\n    } finally {\n      busy.value = false\n    }\n  } catch {\n    return\n  }\n}'
        )
      )
    ).toEqual([])
    // ⑥ try/finally 里不 await 请求层 ⇒ 不得误报
    expect(
      analyzeSource(
        'fixture/ok-sync.vue',
        base(
          "import { getPackageFeatures } from '@/api/system/tenant'\n" +
            'function run() {\n  try {\n    doSync()\n  } finally {\n    busy.value = false\n  }\n}'
        )
      )
    ).toEqual([])
  })
})
