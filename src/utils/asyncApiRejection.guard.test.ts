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

/** 位置 n 处是否恰好是一个完整关键字（`catchAll` 不得读成 `catch`——b144 变异取证：
 *  原先用 `startsWith('catch', n)`，把 `catch` 改名成 `catchDisabled` 之后判据仍然认为
 *  有 catch ⇒ 活性用例是虚锁） */
function keywordAt(masked: string, n: number, kw: string): boolean {
  if (!masked.startsWith(kw, n)) return false
  const next = masked[n + kw.length]
  return next === undefined || !/[A-Za-z0-9_$]/.test(next)
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
    if (keywordAt(masked, n, 'catch')) {
      hasCatch = true
      let c = n + 5
      while (c < masked.length && /\s/.test(masked[c])) c++
      if (masked[c] === '{') {
        const catchEnd = matchBrace(masked, c)
        n = catchEnd < 0 ? masked.length : catchEnd + 1
        while (n < masked.length && /\s/.test(masked[n])) n++
      }
    }
    if (keywordAt(masked, n, 'finally')) hasFinally = true
    blocks.push({ start: m.index, bodyStart, bodyEnd, hasCatch, hasFinally })
  }
  return blocks
}

/** 从 SFC 里解析「来自请求层的本地函数名」 */
function apiBindings(text: string): Set<string> {
  const names = new Set<string>()
  // 子句**不得跨引号**：`[\s\S]*?` 能从 `import { nextTick }` 一路吃到后面某条
  // `from '@/api/...'`，于是 `nextTick`、`ref`、`computed` 全被当成请求层函数
  // （b144 实测：判据自己的解析器把 'vue' 的导入并进了 api 集合）。
  // 请求层函数会 reject 不代表 `nextTick` 会——把无关名字收进面只会造出假红。
  const importRe = /import\s+(type\s+)?([^'";]*?)\s+from\s+['"](@\/api\/[^'"]+|@\/utils\/request)['"]/g
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

// ==================== 第二腿：模板绑定的处理器里「裸 await 请求层」====================
//
// 第一腿只判 `try { await api() } finally {}` 这一种形状（b141 立案的七处）。b144 复盘时发现
// **连 try 都没有**的那一族同样在逸出，而且更直接：`@click="openEdit(row)"` →
// `const res = await getDataset(id)` 失败 ⇒ 拒绝逸出点击处理器 → 全局 errorHandler /
// ErrorBoundary 接管，整页换成「页面加载失败」，而对话框根本没打开。
// 实测采集面 163 处 `await <请求层>()` 调用点，其中 25 处不在带 catch 的 try 里；
// 逐条读完后的分岔：绝大多数是**把回调交给 `useRowActionGuard` / `guardDocAction` /
// `useWidgetLoad` 这类 helper**（回调在 helper 的 try 里被执行，失败由 helper 统一给结局），
// 或**内部 loader 向上抛给确有 catch 的调用点**（Editor 的 `uploadImage`）。
// 所以判据必须绑在「用户动作的直接处理器」上，而不是"函数体内出现过未接住的 await"——
// 后者会把分层契约那一族全报成缺陷，照着提示去"补 catch"就是把分层设计拆掉（⑯(c)）。
//
// 面 = 模板里被 `@event=` / `v-on:` / `:prop=` / `v-bind:` 引用的名字，且该名字在本文件
// **确实声明成函数**；体内**排除嵌套函数/箭头体**（交给 helper 的回调不在这一面上）。

/** 从模板区取事件与 prop 绑定里出现的标识符（属性值在掩码里会被当字符串抹掉 ⇒ 只能用原文） */
function boundNames(raw: string): Set<string> {
  const tplEnd = raw.indexOf('<script')
  const tpl = tplEnd > 0 ? raw.slice(0, tplEnd) : raw
  const names = new Set<string>()
  const bindRe = /(?:@|v-on:|v-bind:|:)[\w.-]+="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = bindRe.exec(tpl))) {
    const expr = m[1]
    // 只取"被调用的函数"与"整句就是一个引用"两种形状：
    // `@click="fn(row)"` / `@change="fn"` / `@click="await fn(); g()"`
    for (const call of expr.matchAll(/\b(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g)) names.add(call[1])
    if (/^\s*(?:await\s+)?[A-Za-z_$][\w$]*\s*$/.test(expr)) names.add(expr.replace(/^\s*await\s+/, '').trim())
  }
  return names
}

function matchParen(masked: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < masked.length; i++) {
    if (masked[i] === '(') depth++
    else if (masked[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 从「参数括号闭合之后」定位函数体左括号。
 * 两种写法都要走过去：`=> {`（箭头）与 `): Promise<void> {`（**返回类型注解**）。
 * b144 实测：第一版只认"下一个非空白字符是 `{`"，于是 `async function openEdit(row?: FlowDefinition): Promise<void>`
 * 定界失败 ⇒ 活性用例报"取不到函数体"。返回类型是 TS 里最常见的形状之一，
 * 定界器不认识它 = 该处理器静默不在刀口上（⑬ 的"扫不到"与"干净"同形）。
 * 顺带处理 `): { a: number } {` 这种"对象类型注解当返回类型"：块后紧跟块 ⇒ 前一个是类型。
 * 表达式体箭头（`const f = () => x`）返回 -1：没有块可判，不得往后乱抓一个花括号。
 */
function findBlockStart(masked: string, from: number): number {
  let i = from
  let sawColon = false
  let depth = 0
  while (i < masked.length && i - from < 400) {
    const ch = masked[i]
    if (ch === '<' || ch === '(' || ch === '[') depth++
    else if (ch === '>' || ch === ')' || ch === ']') depth--
    else if (depth === 0 && masked.startsWith('=>', i)) {
      let k = i + 2
      while (k < masked.length && /\s/.test(masked[k])) k++
      return masked[k] === '{' ? k : -1
    } else if (depth === 0 && ch === '{') {
      if (sawColon) {
        const end = matchBrace(masked, i)
        if (end > 0) {
          let k = end + 1
          while (k < masked.length && /\s/.test(masked[k])) k++
          if (masked[k] === '{') return k
        }
      }
      return i
    } else if (depth === 0 && ch === ':') sawColon = true
    else if (depth === 0 && (ch === ';' || ch === ',')) return -1
    i++
  }
  return -1
}

/**
 * 取「具名函数」的函数体范围。
 * ⚠ 不得复用"声明后第一个花括号"那一套：形参写成对象类型注解 `openEdit(row: { id: number })`
 * 时第一个花括号是**类型注解**（b140 §3.3 第四次复发）。这里先配平参数括号，再走返回类型注解。
 */
function functionBodyOf(masked: string, name: string): { start: number; end: number; body: string } | null {
  const esc = name.replace(/\$/g, '\\$')
  let after = -1
  const fnRe = new RegExp(`\\bfunction\\s+${esc}\\s*\\(`, 'g')
  const m1 = fnRe.exec(masked)
  if (m1) {
    after = masked.indexOf('(', m1.index + m1[0].length - 1)
  } else {
    const constRe = new RegExp(`\\b(?:const|let)\\s+${esc}\\s*=`, 'g')
    const m2 = constRe.exec(masked)
    if (!m2) return null
    let k = m2.index + m2[0].length
    while (k < masked.length && /\s/.test(masked[k])) k++
    if (masked.startsWith('async', k)) {
      k += 5
      while (k < masked.length && /\s/.test(masked[k])) k++
    }
    if (masked[k] !== '(') return null
    after = k
  }
  const close = matchParen(masked, after)
  if (close < 0) return null
  const start = findBlockStart(masked, close + 1)
  if (start < 0) return null
  const end = matchBrace(masked, start)
  if (end < 0) return null
  return { start, end, body: masked.slice(start + 1, end) }
}

/** 文件内所有「嵌套可执行体」（箭头块体 / 具名与匿名函数体）的范围，用于把 helper 回调排除掉 */
function nestedBodies(masked: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  for (const re of [
    /=>\s*\{/g,
    /\bfunction(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{/g,
    /\basync\s*\([^)]*\)\s*=>\s*\{/g
  ]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(masked))) {
      const open = masked.lastIndexOf('{', m.index + m[0].length)
      const end = matchBrace(masked, open)
      if (end > 0) out.push({ start: open, end })
    }
  }
  return out
}

/** 单文件：模板绑定的处理器里，直接体内未被接住的请求层 await */
function analyzeEscape(rel: string, raw: string): Violation[] {
  const text = raw.replace(/\r\n/g, '\n')
  const apis = apiBindings(text)
  if (apis.size === 0) return []
  const masked = maskNonCode(text)
  const tries = findTryBlocks(masked)
  const nested = nestedBodies(masked)
  const violations: Violation[] = []
  for (const name of boundNames(text)) {
    const fn = functionBodyOf(masked, name)
    if (!fn) continue
    for (const m of fn.body.matchAll(/\bawait\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (!apis.has(m[1])) continue
      const pos = fn.start + 1 + m.index
      // 排除"交给 helper 的回调"：只看**严格位于本处理器体内**的嵌套可执行体。
      // 条件必须带 `r.start > fn.start`——`nestedBodies` 的正则同样会把处理器**自己**的
      // 花括号算成一个函数体，少了这一维就等于把所有裸 await 全放过（判据恒绿）。
      if (nested.some((r) => r.start > fn.start && pos > r.start + 1 && pos < r.end)) continue // 交给 helper 的回调
      const inCaughtTry = tries.some((t) => t.hasCatch && pos > t.bodyStart && pos < t.bodyEnd)
      if (inCaughtTry) continue
      // 就地 `.catch(...)` 链住 ⇒ 有人收尾
      let depth = 0
      let i = masked.indexOf('(', pos)
      for (; i < masked.length; i++) {
        if (masked[i] === '(') depth++
        else if (masked[i] === ')') {
          depth--
          if (depth === 0) break
        }
      }
      if (
        masked
          .slice(i + 1, i + 40)
          .trimStart()
          .startsWith('.catch')
      )
        continue
      violations.push({ file: rel, line: lineOf(text, pos), api: `${name}() 内 await ${m[1]}()` })
    }
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

  it('解析器正控：非请求层模块的导入不得混进 api 集合', () => {
    // 这条钉的是判据自己的输入形状（⑬「锁的输入非空且形状对」）。旧实现用 `[\s\S]*?`，
    // 于是从 `import { nextTick } from 'vue'` 一路吃到后面的 `from '@/api/flow'`，
    // 把 nextTick/ref/computed 全收进"会 reject 的那一族"。
    const names = apiBindings(
      "import { nextTick, ref } from 'vue'\nimport { useI18n } from 'vue-i18n'\nimport { getDataset } from '@/api/report/dataset'\n"
    )
    expect([...names].sort()).toEqual(['getDataset'])
    // 默认导入与 as 别名仍须在面上
    expect(
      [...apiBindings("import request from '@/utils/request'\nimport { listX as listY } from '@/api/x'")].sort()
    ).toEqual(['listY', 'request'])
    // 类型导入不得进面（`import type { … } from '@/api/…'` 运行时不存在）
    expect(apiBindings("import type { ReportDataset } from '@/api/report/dataset'").size).toBe(0)
  })

  it('关键字边界：catch 后紧跟标识符不得算作 catch（变异刀口自身要能被证伪）', () => {
    expect(findTryBlocks(maskNonCode('try { a() } catch (e) { b() }')).filter((t) => t.hasCatch).length).toBe(1)
    expect(findTryBlocks(maskNonCode('try { a() } finally { b() }')).filter((t) => t.hasFinally).length).toBe(1)
    // 把关键字改名（活性用例的做法）与"同名变量"两种形状都不得读成有 catch
    expect(findTryBlocks(maskNonCode('try { a() } catchDisabled (e) { b() }')).filter((t) => t.hasCatch).length).toBe(0)
    expect(findTryBlocks(maskNonCode('try { a() } catchAll.push(1)')).filter((t) => t.hasCatch).length).toBe(0)
    expect(findTryBlocks(maskNonCode('try { a() } finallyBlock.run()')).filter((t) => t.hasFinally).length).toBe(0)
  })

  it('真实树（第二腿）：模板绑定的处理器内不得有未被接住的裸 await 请求层（0 违规）', () => {
    const violations: Violation[] = []
    let handlers = 0
    let sites = 0
    for (const abs of files) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
      const text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
      const masked = maskNonCode(text)
      const apis = apiBindings(text)
      for (const name of boundNames(text)) {
        const fn = functionBodyOf(masked, name)
        if (!fn) continue
        handlers++
        sites += [...fn.body.matchAll(/\bawait\s+([A-Za-z_$][\w$]*)\s*\(/g)].filter((x) => apis.has(x[1])).length
      }
      violations.push(...analyzeEscape(rel, text))
    }
    // 采集面自证：面派生走偏（模板绑定取不到、函数体定界失败）时"零违规"毫无意义
    expect(handlers, `被判定过的事件处理器只有 ${handlers} 个（下限 10 ⇒ 采集面坏了）`).toBeGreaterThanOrEqual(10)
    expect(sites, `处理器体内 await 请求层调用点只有 ${sites} 处（下限 10 ⇒ 采集面坏了）`).toBeGreaterThanOrEqual(10)
    console.warn(
      `asyncApiRejection.guard 第二腿采集面：处理器 ${handlers} 个 / 体内 await 请求层 ${sites} 处 / 逸出 ${violations.length}`
    )
    expect(violations, JSON.stringify(violations)).toEqual([])
  })

  it('合成夹具（第二腿）：裸 await 必抓，helper 回调与内部分层上抛不得误报', () => {
    const base = (tpl: string, script: string) =>
      `<template>${tpl}</template>\n<script setup lang="ts">\n${script}\n</script>\n`
    const apiImport = "import { getThing } from '@/api/x/thing'\n"
    // ① 缺陷形状：模板绑定 + 体内直接 await，无任何 catch ⇒ 必抓
    const bad = base(
      '<button @click="openEdit(row)">改</button>',
      `${apiImport}async function openEdit(row: Row) {\n  const res = await getThing(row.id)\n  form.value = res.data\n}`
    )
    const badHits = analyzeEscape('fixture/bad.vue', bad)
    expect(badHits).toHaveLength(1)
    expect(badHits[0].api).toContain('openEdit()')
    expect(badHits[0].api).toContain('getThing')
    // ② 合规：同一形状加了 catch
    const caught = base(
      '<button @click="openEdit(row)">改</button>',
      `${apiImport}async function openEdit(row: Row) {\n  try {\n    const res = await getThing(row.id)\n    form.value = res.data\n  } catch (e) {\n    return\n  }\n}`
    )
    expect(analyzeEscape('fixture/caught.vue', caught)).toEqual([])
    // ③ 合规：await 在**交给 helper 的回调**里（useRowActionGuard / guardDocAction 的既定形状）
    const callback = base(
      '<button @click="handleRun(row)">跑</button>',
      `${apiImport}async function handleRun(row: Row) {\n  await guarded(\n    row.id,\n    () => confirm(),\n    async () => {\n      await getThing(row.id)\n      ok.value = true\n    }\n  )\n}`
    )
    expect(analyzeEscape('fixture/callback.vue', callback)).toEqual([])
    // ④ 合规：就地 .catch 链住
    const chained = base(
      '<button @click="load()">刷新</button>',
      `${apiImport}async function load() {\n  await getThing(1).catch(() => {})\n}`
    )
    expect(analyzeEscape('fixture/chained.vue', chained)).toEqual([])
    // ⑤ 不判：函数没有绑在模板上（内部 loader 向上抛由调用方收尾，分层契约）
    const unbound = base(
      '<div />',
      `${apiImport}async function fetchInner() {\n  return await getThing(1)\n}\nasync function outer() {\n  try {\n    await fetchInner()\n  } catch {\n    report()\n  }\n}`
    )
    expect(analyzeEscape('fixture/unbound.vue', unbound)).toEqual([])
    // ⑥ 不判：绑定名根本不是本文件的函数（`@click="dialogVisible = true"` 一类）
    expect(
      analyzeEscape(
        'fixture/ref.vue',
        base('<button @click="dialogVisible = true">x</button>', `${apiImport}const dialogVisible = ref(false)`)
      )
    ).toEqual([])
    // ⑦ 定界反例：形参是对象类型注解时，函数体不得取到类型注解的花括号
    const annotated = base(
      '<button @click="openEdit(row)">改</button>',
      `${apiImport}async function openEdit(row: { id: number }) {\n  const res = await getThing(row.id)\n  form.value = res.data\n}`
    )
    expect(analyzeEscape('fixture/annotated.vue', annotated)).toHaveLength(1)
    // ⑧ 定界正控：返回类型注解必须走过去（本仓真实写法 `): Promise<void> {`）
    const returnType = base(
      '<button @click="openEdit(row)">改</button>',
      `${apiImport}async function openEdit(row: Row): Promise<void> {\n  const res = await getThing(row.id)\n  form.value = res.data\n}`
    )
    expect(analyzeEscape('fixture/return-type.vue', returnType)).toHaveLength(1)
    // ⑨ 定界正控：对象类型注解当返回类型时，体取的是**第二个**块
    const objectReturn = base(
      '<button @click="openEdit(row)">改</button>',
      `${apiImport}function openEdit(row: Row): { ok: boolean } {\n  const res = await getThing(row.id)\n  return { ok: !!res }\n}`
    )
    expect(analyzeEscape('fixture/object-return.vue', objectReturn)).toHaveLength(1)
    // ⑩ 不判：表达式体箭头没有块可判，不得往后乱抓一个花括号
    const exprBody = base(
      '<button @click="ping()">ping</button>',
      `${apiImport}const ping = async () => getThing(1)\nconst other = { a: 1 }`
    )
    expect(analyzeEscape('fixture/expr-body.vue', exprBody)).toEqual([])
  })

  it('差异法活性（第二腿）：把本轮修复的 openEdit 的 catch 摘掉必须红', () => {
    const missed: string[] = []
    for (const { rel, handler } of [
      { rel: 'src/views/flow/designer/index.vue', handler: 'openEdit' },
      { rel: 'src/views/report/dataset/index.vue', handler: 'openEdit' }
    ]) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
      // 先证"当前字节是合规的"，否则这条红可能来自别的形状
      expect(analyzeEscape(rel, text), `${rel} 当前应 0 违规`).toEqual([])
      const masked = maskNonCode(text)
      const fn = functionBodyOf(masked, handler)
      if (!fn) {
        missed.push(`${rel}: 取不到 ${handler} 的函数体（定界失败，本轮不作数）`)
        continue
      }
      const body = text.slice(fn.start, fn.end + 1)
      const brokenBody = body.replace(/\bcatch\b/g, 'catchDisabled')
      if (brokenBody === body) {
        missed.push(`${rel}: ${handler} 体内没有 catch ⇒ 这条活性用例是虚锁`)
        continue
      }
      const broken = text.slice(0, fn.start) + brokenBody + text.slice(fn.end + 1)
      const hits = analyzeEscape(rel, broken)
      if (!hits.some((h) => h.api.startsWith(`${handler}()`))) {
        missed.push(`${rel}: 摘掉 ${handler} 的 catch 未被抓（实际报出 ${JSON.stringify(hits.map((h) => h.api))}）`)
      }
    }
    expect(missed, `活性失败：\n${missed.join('\n')}`).toEqual([])
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
