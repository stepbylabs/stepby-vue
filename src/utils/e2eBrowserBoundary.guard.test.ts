/**
 * 静态守卫：`page.evaluate` 一类**浏览器回调**里不得引用本文件的 import 绑定（批八十三）。
 *
 * ## 缺陷形态（本批自己被它咬到，实证见下）
 *
 * `page.evaluate(fn, …)` 会把 `fn` **序列化后**送到浏览器执行。函数体里出现的标识符如果是
 * Node 模块作用域的绑定（`import { markClickLanded }`、顶层 `const` 等），浏览器侧根本不存在
 * 这个名字 ⇒ 运行时抛 `ReferenceError`。而这个异常几乎总被同一条链上的 `.catch(() => {})`
 * 吞掉（套件里遍地是这种写法），于是**该行代码静默不存在**：测试照样绿，取证照样少一条。
 *
 * 实证（b83，deep-e2e 的 M1「数据权限」段）：`markClickLanded('数据权限')` 被写在
 * `page.evaluate` 回调**内部**。真实点击通道上线后第一次真跑就记下两条"未救回的点击失败"，
 * 顺藤摸到这里是浏览器上下文、`markClickLanded` 是 Node 侧函数——它一次也没标上过。
 * 同一段的对话框断言仍然 PASS（兜底 `target.click()` 恰好在抛错**之前**执行了），
 * 这正是"绿着错"的形态：结论对、证据链坏。
 *
 * ## 判据为什么 sound
 *
 * 只看**本文件的 import 绑定**：由构造方式保证它们在浏览器里不存在，因此不存在误报空间。
 * 只扫**第一个顶层实参**（真正的回调）：`page.evaluate(PAGE_STATE_PROBE)` 这种"把 Node 侧
 * 函数引用整个传进去"是合法写法（deep-e2e 就这么用），而回调之后的顶层实参是 Node 侧的值，
 * 在里面引用绑定同样合法。参数名与回调内 `const/let/function/class` 同名视为局部遮蔽，不报。
 *
 * 采集面（刀口）与 force 点击守卫**共用** `e2eSuiteScanKit.muteNonCode`：注释里讨论这条规则
 * 时写下的 `page.evaluate` / `markClickLanded` 字样不得被当成代码——本文件的头注释就是形状对照。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectMjs, E2E_DIR, muteNonCode } from './e2eSuiteScanKit'

const ROOT = process.cwd()

/** 回调体在**浏览器**里执行的 API（`exposeFunction` 不在内：它的函数体跑在 Node 侧） */
const BROWSER_CB_RE = /\.(?:evaluate|waitForFunction|evalOnNewDocument|addInitScript|\$eval|\$\$eval)\s*\(/g

const DECL_RE = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g

/**
 * 本文件的 import 绑定名集合。
 *
 * **不能**在掩码后的文本上抽：掩码器会把字符串连同引号一起置空，`from '…'` 就不存在了
 * （第一版正是在这里全军覆没——绑定集合恒空 ⇒ 守卫"零违规"地空转，而"没扫到"与"扫到且干净"
 * 逐字节同形，属本仓立过多次案的那一族）。
 * 因此这些正则跑在**原文**上，但一律用 `^[ \t]*import` 锚到行首：ESM 的 import 必须在顶层，
 * 而判据说明里常把 `import { x } from '…'` 原样抄进块注释（本文件头注释就是一例），那些行
 * 以 `*` / `//` 开头，锚点天然把它们排除。`[\s\S]*?` 覆盖跨行的具名列表。
 */
export function importBindings(src: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]/gm)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim()
      if (!seg) continue
      const as = /as\s+([A-Za-z_$][\w$]*)$/.exec(seg)
      names.add((as ? as[1] : seg).trim())
    }
  }
  for (const m of src.matchAll(/^[ \t]*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1])
  for (const m of src.matchAll(/^[ \t]*import\s+([A-Za-z_$][\w$]*)\s*(?:,[\s\S]*?)?from\s*['"]/gm)) names.add(m[1])
  for (const n of [...names]) if (!/^[A-Za-z_$][\w$]*$/.test(n)) names.delete(n)
  return names
}

/**
 * 从 `openIdx`（指向 `(`）起取**括号平衡**的一段。
 * 掩码后文本里没有字符串/注释，因此只需数括号——这是这份实现成立的前提。
 */
function balanced(text: string, openIdx: number): string {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return text.slice(openIdx, i + 1)
    }
  }
  return text.slice(openIdx)
}

/** 按**顶层逗号**切实参（括号/方括号/花括号内的逗号不算分隔） */
function topLevelArgs(span: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (let i = 1; i < span.length - 1; i++) {
    const c = span[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    if (c === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts
}

/** 回调实参里"真正在浏览器执行的那段代码"；传函数引用（非内联）时返回空串 ⇒ 不判 */
function callbackBody(firstArg: string): string {
  const arrow = firstArg.indexOf('=>')
  const fn = firstArg.search(/\bfunction\b/)
  if (arrow < 0 && fn < 0) return ''
  const start = arrow >= 0 && (fn < 0 || arrow < fn) ? arrow + 2 : firstArg.indexOf('{', fn)
  const rest = firstArg.slice(start)
  const brace = rest.search(/\S/)
  if (brace < 0) return ''
  if (rest[brace] === '{') {
    // 块体：取花括号平衡的一段
    let depth = 0
    for (let i = brace; i < rest.length; i++) {
      if (rest[i] === '{') depth++
      else if (rest[i] === '}') {
        depth--
        if (depth === 0) return rest.slice(brace + 1, i)
      }
    }
    return rest.slice(brace + 1)
  }
  // 表达式体：整段就是函数体（顶层逗号已在 `topLevelArgs` 阶段被切掉）
  return rest
}

/** 回调实参的形参名（`(t) =>` / `({a, b}) =>` / `t =>`） */
function paramNames(firstArg: string): Set<string> {
  const arrow = firstArg.indexOf('=>')
  const fnMatch = /\bfunction\s*\(([^)]*)\)/.exec(firstArg)
  const raw = arrow >= 0 ? firstArg.slice(0, arrow) : fnMatch ? `(${fnMatch[1]})` : ''
  const names = new Set<string>()
  for (const m of raw.matchAll(/[A-Za-z_$][\w$]*/g)) names.add(m[0])
  if (arrow >= 0) {
    const head = raw.trim()
    const bare = /^[A-Za-z_$][\w$]*$/.test(head) ? head : ''
    if (bare) names.add(bare)
  }
  return names
}

export interface BoundaryHit {
  name: string
  line: number
}

/**
 * 违规清单：浏览器回调体内引用了本文件的 import 绑定。
 * `masked` 与原文等长 ⇒ 行号直接按原文算。
 */
export function findNodeBindingsInBrowserCallbacks(src: string): BoundaryHit[] {
  const masked = muteNonCode(src)
  const bindings = importBindings(src)
  if (bindings.size === 0) return []
  const hits: BoundaryHit[] = []
  for (const m of masked.matchAll(BROWSER_CB_RE)) {
    const openIdx = (m.index ?? 0) + m[0].length - 1
    const span = balanced(masked, openIdx)
    const args = topLevelArgs(span)
    if (!args.length) continue
    const body = callbackBody(args[0])
    if (!body) continue
    const shadowed = new Set([...paramNames(args[0]), ...[...body.matchAll(DECL_RE)].map((d) => d[1])])
    for (const name of bindings) {
      if (shadowed.has(name)) continue
      // 三种"同名但不是引用"的形状必须排除，否则规则一上线就是三处误报（实测：
      // `a11y-full.mjs` 里 `.join(' ')` 两处、`main.mjs` 里对象键 `path: location.pathname` 一处）：
      // ① 前面是 `.` ⇒ 成员访问/方法调用（`arr.join(...)`、`o.path`、`a?.join`）；
      // ② 后面跟 `:` ⇒ 对象字面量的键（`{ path: x }`）；
      // ③ 标识符边界：`path` 不得从 `_path` / `paths` 里被切出来。
      // 简写 `{ path }` **不排除**——那确实是对绑定的引用，在浏览器里必抛。
      const probe = new RegExp(`(?:^|[^.\\w$])${name.replace(/\$/g, '\\$')}(?!\\w)(?!\\s*:)`)
      if (probe.test(body)) {
        const abs = (m.index ?? 0) + span.indexOf(body.slice(0, Math.min(body.length, 20)))
        hits.push({ name, line: masked.slice(0, Math.max(0, abs)).split('\n').length })
      }
    }
  }
  return hits
}

const suiteFiles = collectMjs(resolve(ROOT, E2E_DIR), '')

describe('e2e 浏览器/Node 边界守卫 · import 绑定不得出现在 page.evaluate 回调里', () => {
  it('扫描面自证：入口文件收进来，且至少扫到 20 个 `.mjs`', () => {
    expect(suiteFiles.length).toBeGreaterThanOrEqual(20)
    for (const known of ['main.mjs', 'deep-e2e.mjs', 'capture-kit.mjs', 'e2e/run/runner.mjs']) {
      expect(suiteFiles).toContain(known)
    }
    expect(suiteFiles.some((f) => f.startsWith('modules/'))).toBe(true)
    expect(suiteFiles.some((f) => f.includes('_tmp'))).toBe(false)
  })

  it('刀口自证：真实树里确有浏览器回调（否则本守卫在空转）', () => {
    let callbacks = 0
    for (const rel of suiteFiles) {
      const masked = muteNonCode(readFileSync(resolve(ROOT, E2E_DIR, rel), 'utf8'))
      callbacks += [...masked.matchAll(BROWSER_CB_RE)].length
    }
    expect(callbacks).toBeGreaterThan(100)
  })

  it('全套件当前零违规（本批修完 M1 那一处之后的实测状态）', () => {
    const bad: string[] = []
    for (const rel of suiteFiles) {
      const src = readFileSync(resolve(ROOT, E2E_DIR, rel), 'utf8')
      for (const h of findNodeBindingsInBrowserCallbacks(src)) bad.push(`${rel}:${h.line} ${h.name}`)
    }
    expect(bad).toEqual([])
  })

  it('合成违规必须被抓到（块体与表达式体两种形状）', () => {
    const block = [
      "import { markClickLanded } from './capture-kit.mjs'",
      "await page.evaluate(() => { markClickLanded('数据权限') }).catch(() => {})"
    ].join('\n')
    const expr = ["import { log } from './x.mjs'", "await page.evaluate(() => log('点了'))"].join('\n')
    expect(findNodeBindingsInBrowserCallbacks(block).map((h) => h.name)).toContain('markClickLanded')
    expect(findNodeBindingsInBrowserCallbacks(expr).map((h) => h.name)).toContain('log')
    // 排除"对象键"之后，**简写属性** `{ path }` 仍然必须报——那确实引用了 Node 侧绑定，
    // 与 `path: x` 的区别正是"读值"与"写键"。放宽到把简写也放过，等于把整条规则关掉。
    const shorthand = "import path from 'node:path'\nawait page.evaluate(() => ({ path }))"
    expect(findNodeBindingsInBrowserCallbacks(shorthand).map((h) => h.name)).toContain('path')
  })

  it('合法写法必须零误报（对照组，防把规则写成一律报）', () => {
    const cases = [
      // ① 绑定用在回调之外
      "import { markClickLanded } from './c.mjs'\nconst ok = await page.evaluate((t) => t, 'x')\nmarkClickLanded('数据权限')",
      // ② 把 Node 侧函数引用整体传入（deep-e2e 的 PAGE_STATE_PROBE 形状）
      "import { PAGE_STATE_PROBE } from './page-state.mjs'\nawait page.evaluate(PAGE_STATE_PROBE)",
      // ③ 回调之后的顶层实参是 Node 侧的值 ⇒ 合法
      "import { markClickLanded } from './c.mjs'\nawait page.evaluate((t) => { void t }, markClickLanded)",
      // ④ 形参遮蔽同名绑定
      "import fs from 'node:fs'\nawait page.evaluate((fs) => ({ n: fs }), { n: 1 })",
      // ⑤ 回调内局部声明遮蔽
      "import { log } from './c.mjs'\nawait page.evaluate(() => { const log = (x) => x; log(1) })",
      // ⑥ 注释与字符串里的名字不得算代码（掩码器由另一把守卫共用）
      "import { markClickLanded } from './c.mjs'\nawait page.evaluate(() => { /* markClickLanded 已在外层标过 */ })",
      // ⑦ 同名**方法调用**不是引用（实测误报形状：a11y-full.mjs 的 `.join(' ')`）
      "import { join } from 'node:path'\nawait page.evaluate(() => ['a', 'b'].join('-'))",
      // ⑧ 同名**对象键**不是引用（实测误报形状：main.mjs 的 `path: location.pathname`）
      "import path from 'node:path'\nawait page.evaluate(() => ({ path: location.pathname }))",
      // ⑨ 可选链上的成员访问同样不是引用
      "import { log } from './c.mjs'\nawait page.evaluate(() => window.navigator?.log)"
    ]
    for (const src of cases) {
      expect(findNodeBindingsInBrowserCallbacks(src), src.slice(0, 60)).toEqual([])
    }
  })

  it('刀口自证：每个被扫文件末尾插入一条合成违规都必须被抓到', () => {
    const probe =
      "\nimport { __b83BoundaryProbe } from './probe.mjs'\nawait page.evaluate(() => { __b83BoundaryProbe() })\n"
    const missed: string[] = []
    for (const rel of suiteFiles) {
      const src = readFileSync(resolve(ROOT, E2E_DIR, rel), 'utf8')
      const hits = findNodeBindingsInBrowserCallbacks(src + probe)
      if (!hits.some((h) => h.name === '__b83BoundaryProbe')) missed.push(rel)
    }
    expect(missed, `插入合成违规却抓不到的文件：${missed.join(', ')}`).toEqual([])
  })
})
