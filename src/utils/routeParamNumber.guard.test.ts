/**
 * 静态守卫：禁止把路由参数交给裸数值化（`Number()` / `parseInt()` / 一元 `+`）。
 *
 * 缺陷形态：`Number(route.params.userId)` / `Number(rawJobId)` / `+tableId`。
 * `Number()` 对超长数字串**不报错而是折成 IEEE754 浮点**，于是畸形深链会原样出网：
 * 真机取证 `GET /system/user/authRole/1.111111111111111e+99` → 后端
 * `400 Invalid URL: Cannot parse ... to a i64`（见 RUN-RECIPE §3.59、
 * `tests/e2e/screenshots/deep-e2e-net-1792217728192.json`）。
 * 用户看到的是"点了没反应 + 一次注定失败的请求"，而不是本地就能给出的"参数不合法"。
 *
 * 正确写法：`toPositiveInt(route.params.userId)`（`^\d{1,15}$` + `Number.isSafeInteger`
 * 双闸，非法返回 0，调用方以 0 判"不发请求"）。
 *
 * 判据是**取值域污点**而非"同一行正则"（b74 F2）：历史版本只匹配 `Number(` 紧跟 `route.`，
 * 于是 `const raw = route.params.jobId` + 下一行 `Number(raw)`（log.vue）、
 * `const tableId = route.params && route.params.tableId` + `Number(tableId)`（editTable.vue）
 * 这类**跨行别名/解构**形态完全看不见——同类缺陷第七处才被发现即为此证。
 * 现判据：先收集"由 `route.params` / `route.query` 取值赋来的标识符"（经 `toPositiveInt`
 * 包裹的不算污点），再看这些标识符是否被裸数值化消费。
 *
 * 双向对照组（缺一即虚锁）：
 * - 三段合成违规（直接式 / 别名式 / 解构式）必须**全部转红**；
 * - 注释行、字符串字面量、与 route 无关的同名变量、已接线的 `toPositiveInt` 站点必须**零误报**
 *   （"为安全把合法值也挡掉"同样是缺陷，见 agents.md《前端外部输入归一规范》第 1 条）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toPositiveInt } from '@/utils/validate'

/** 已接线的深链入口（b73 五处 + b74 F2 两处）：改回裸数值化或删掉闸门都必须转红 */
const WIRED_SITES = [
  'src/views/system/user/authRole.vue',
  'src/views/system/role/authUser.vue',
  'src/views/system/dict/data.vue',
  'src/views/tool/gen/index.vue',
  'src/composables/useCrudTable.ts',
  'src/views/monitor/job/log.vue',
  'src/views/tool/gen/editTable.vue'
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p)
  }
  return out
}

const IDENT = '[A-Za-z_$][\\w$]*'
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 生成"注释与字符串内容置空"的掩码（保留换行与列位置，便于报出真实行号）。
 * 目的：文档里的反例、示例文案不是代码，不得当成违规（误报即"把合法值挡掉"）。
 */
function computeMutedMask(src: string): boolean[] {
  const chars = Array.from(src)
  const muted = new Array<boolean>(chars.length).fill(false)
  type Frame = { kind: 'code' | 'template' | 'block' | 'line'; depth: number; quote?: string }
  const stack: Frame[] = [{ kind: 'code', depth: 0 }]
  const mute = (idx: number) => {
    if (idx < chars.length && chars[idx] !== '\n') muted[idx] = true
  }
  let i = 0
  while (i < chars.length) {
    const top = stack[stack.length - 1]
    const c = chars[i]
    if (top.quote) {
      if (c === '\\') {
        mute(i)
        i++
        mute(i)
        i++
        continue
      }
      if (c === top.quote) {
        stack.pop()
        i++
        continue
      }
      mute(i)
      i++
      continue
    }
    if (top.kind === 'line') {
      if (c === '\n') stack.pop()
      else mute(i)
      i++
      continue
    }
    if (top.kind === 'block') {
      if (c === '*' && chars[i + 1] === '/') {
        mute(i)
        i++
        mute(i)
        i++
        stack.pop()
        continue
      }
      mute(i)
      i++
      continue
    }
    if (top.kind === 'template') {
      if (c === '\\') {
        mute(i)
        i++
        mute(i)
        i++
        continue
      }
      if (c === '`') {
        stack.pop()
        i++
        continue
      }
      if (c === '$' && chars[i + 1] === '{') {
        i += 2
        stack.push({ kind: 'code', depth: 1 })
        continue
      }
      mute(i)
      i++
      continue
    }
    // code 帧
    if (c === '/' && chars[i + 1] === '/') {
      stack.push({ kind: 'line', depth: 0 })
      i += 2
      continue
    }
    if (c === '/' && chars[i + 1] === '*') {
      stack.push({ kind: 'block', depth: 0 })
      i += 2
      continue
    }
    if (c === "'" || c === '"') {
      stack.push({ kind: 'code', depth: 0, quote: c })
      i++
      continue
    }
    if (c === '`') {
      stack.push({ kind: 'template', depth: 0 })
      i++
      continue
    }
    if (top.depth > 0) {
      if (c === '{') top.depth++
      else if (c === '}') {
        top.depth--
        if (top.depth === 0) stack.pop()
      }
    }
    i++
  }
  return muted
}

/** 按行返回"只剩代码"的文本（注释/字符串内容已置空格） */
function codeLines(src: string): string[] {
  const muted = computeMutedMask(src)
  return Array.from(src)
    .map((c, idx) => (muted[idx] ? ' ' : c))
    .join('')
    .split('\n')
}

/** 已接闸门的表达式不算污点：`toPositiveInt(route.params.id)` 的产出是安全值 */
function stripGated(expr: string): string {
  return expr.replace(/toPositiveInt\([^()]*\)/g, 'GATED')
}

export interface RouteTaintReport {
  /** 裸数值化消费了 route 来源值的行号（1 起） */
  lines: number[]
  /** 命中说明，便于失败时直接定位形态 */
  details: string[]
}

/**
 * 取值域污点分析：
 * ① `route` / `useRoute()` 的持有者视为 route 载体；
 * ② 被 `载体.params` / `载体.query`（含属性访问、方括号、`&&` 守卫等右值形态）赋值的标识符为污点；
 *    解构 `const { id } = 载体.params` 同样发污点；被非 route 右值重新声明/赋值即洗白；
 * ③ 污点标识符被 `Number(` / `parseInt(` / 一元 `+` 消费即违规。
 */
export function findUngatedRouteNumbers(src: string): RouteTaintReport {
  const lines = codeLines(src)
  const tainted = new Set<string>()
  const containers = new Set<string>()
  const owners = new Set<string>(['route'])
  const details: string[] = []

  const ownersAlt = () => [...owners].map(escapeRe).join('|')
  /** `X.params` / `X.query` 形态的取值（含 `?.`、方括号） */
  const sourceRe = () => new RegExp(`\\b(?:${ownersAlt()})\\.(?:params|query)\\b`)
  /** 右值整体就是 params/query 本体（后面不接属性访问）⇒ 同时登记为容器 */
  const wholeObjectRe = () => new RegExp(`^\\s*\\b(?:${ownersAlt()})\\.(?:params|query)\\b\\s*(?!\\??[.\\[(])`)
  const useRouteRe = /^\s*useRoute\s*\(/
  const destructRe = new RegExp(`^(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*(.*)$`)
  const declRe = new RegExp(`^(?:const|let|var)\\s+(${IDENT})\\s*(?::[^=]+)?=\\s*(.*)$`)
  const reassignRe = new RegExp(`^(${IDENT})\\s*=(?!=)\\s*(.*)$`)
  const convRe = new RegExp(`\\b(?:Number|parseInt)\\s*\\(\\s*(${IDENT})\\s*(\\.)?`, 'g')

  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) return

    const report = (why: string) => {
      details.push(`${idx + 1}: ${why} => ${line}`)
    }

    // ① 污点收集
    const destruct = destructRe.exec(line)
    const decl = destruct ? null : declRe.exec(line) || reassignRe.exec(line)
    if (destruct) {
      const rhs = stripGated(destruct[2])
      if (sourceRe().test(rhs)) {
        destruct[1].split(',').forEach((part) => {
          const name = /(?:^|:)\s*([A-Za-z_$][\w$]*)/.exec(part.trim())?.[1]
          if (name) tainted.add(name)
        })
      }
    } else if (decl) {
      const [, name, rhsRaw] = decl
      const rhs = stripGated(rhsRaw)
      if (useRouteRe.test(rhsRaw)) owners.add(name)
      else if (sourceRe().test(rhs)) {
        tainted.add(name)
        if (wholeObjectRe().test(rhsRaw)) containers.add(name)
      } else {
        // 非 route 来源的重新声明/赋值即洗白，避免同名变量误报
        tainted.delete(name)
        containers.delete(name)
      }
    }

    // ② 消费判定：Number()/parseInt() 的头部实参
    for (const m of line.matchAll(convRe)) {
      const [, name, dot] = m
      if (dot ? containers.has(name) || owners.has(name) : tainted.has(name)) {
        report(dot ? `${name}.<prop> 容器取自 route 未过闸门` : `${name} 源自 route 未过闸门`)
        return
      }
    }

    // ③ 消费判定：一元 +。前一非空字符若为标识符/数字/`)`/`]`/引号/`+`/`-`，则是二元加或自增
    for (const name of tainted) {
      const m = new RegExp(`\\+\\s*${escapeRe(name)}\\b`).exec(line)
      if (!m) continue
      const prev = line.slice(0, m.index).replace(/\s+$/, '').slice(-1)
      if (prev && /[\w$)\]'"`+-]/.test(prev)) continue
      report(`+${name} 一元数值化未过闸门`)
      return
    }
  })

  // ④ 跨行直取式（`Number(\n  route.params.x`）逐行判据看不见，展平后再扫一遍
  const flat: string[] = []
  const lineAt: number[] = []
  lines.forEach((l, idx) => {
    for (const ch of l) {
      flat.push(ch)
      lineAt.push(idx + 1)
    }
    flat.push(' ')
    lineAt.push(idx + 1)
  })
  const flatText = flat.join('')
  const ownersAltNow = ownersAlt()
  const crossLineRes = [
    new RegExp(`\\b(?:Number|parseInt)\\s*\\(\\s*(?:${ownersAltNow})\\.(?:params|query)\\b`, 'g'),
    new RegExp(`\\+\\s*(?:${ownersAltNow})\\.(?:params|query)\\b`, 'g')
  ]
  const seen = new Set<number>(details.map((d) => Number(d.slice(0, d.indexOf(':')))))
  for (const re of crossLineRes) {
    for (const m of flatText.matchAll(re)) {
      const line = lineAt[m.index]
      if (seen.has(line)) continue
      const prev = flatText.slice(0, m.index).replace(/\s+$/, '').slice(-1)
      if (re.source.startsWith('\\+') && prev && /[\w$)\]'"`+-]/.test(prev)) continue
      seen.add(line)
      details.push(`${line}: 跨行直取 route 参数未过闸门 => ${lines[line - 1].trim()}`)
    }
  }

  return { lines: [...new Set(details.map((d) => Number(d.slice(0, d.indexOf(':')))))].sort((a, b) => a - b), details }
}

describe('静态守卫：路由数字参数必须经 toPositiveInt', () => {
  it('全 src 不存在未经闸门的 route 参数数值化（污点判据，含跨行别名/解构）', () => {
    const offenders = walk('src')
      .map((f) => {
        const report = findUngatedRouteNumbers(readFileSync(f, 'utf8'))
        return [f, report] as const
      })
      .filter(([, report]) => report.lines.length > 0)
    expect(offenders, offenders.map(([f, r]) => `${f}\n  ${r.details.join('\n  ')}`).join('\n')).toEqual([])
  })

  it('七处已接线站点确实使用 toPositiveInt（防"改回旧写法且绕过守卫"）', () => {
    for (const file of WIRED_SITES) {
      expect(readFileSync(file, 'utf8'), file).toContain('toPositiveInt(')
    }
  })

  it('控制组 A：三段合成违规（直接式 / 别名式 / 解构式）必须全部转红', () => {
    const cases = [
      ['直接式', `const userId = Number(route.params.userId)\n`],
      ['别名式', `const rawJobId = route.params.jobId\nconst jobId = Number(rawJobId)\n`],
      ['解构式', `const { tableId } = route.params\nconst id = Number(tableId)\n`],
      ['守卫短路式', `const tableId = route.params && route.params.tableId\ngetGenTable(Number(tableId))\n`],
      ['容器式', `const query = route.query\nconst pageNum = Number(query.pageNum)\n`],
      ['一元加号式', `const raw = route.params.jobId\nconst id = +raw\n`],
      ['parseInt 式', `const raw = route.query.id\nconst id = parseInt(raw)\n`],
      ['跨行直取式', `const id = Number(\n  route.params.userId\n)\nvoid id\n`]
    ]
    for (const [kind, sample] of cases) {
      expect(findUngatedRouteNumbers(sample).lines.length, kind).toBeGreaterThan(0)
    }
  })

  it('控制组 B：注释 / 字符串 / 无关同名变量 / 已接线写法不得误报', () => {
    const clean = [
      ['注释行', `// const userId = Number(route.params.userId)\n`],
      ['块注释', `/* Number(route.params.userId) 是反例 */\nconst a = 1\n`],
      ['字符串字面量', `const doc = 'Number(route.params.userId)'\nconst tpl = "Number(route.query.x)"\n`],
      ['无关同名变量', `const userId = 5\nconst id = Number(userId)\n`],
      ['重新赋值洗白', `const raw = route.params.userId\nconst raw2 = props.userId\nconst id = Number(raw2)\n`],
      ['已接线：闸门包裹', `const userId = toPositiveInt(route.params.userId)\nconst n = userId\nvoid n\n`],
      ['闸门后再数值化', `const raw = route.params.userId\nconst id = Number(toPositiveInt(raw))\n`],
      ['合法字符串拼接', `const raw = route.params.userId\nconst path = '/x/' + raw\nvoid path\n`],
      ['跨行合法拼接', `const path = '/x/' +\n  route.params.userId\nvoid path\n`],
      ['自增不是取数', `let i = 0\nconst raw = route.params.userId\nvoid raw\ni++\nconst j = i + 1\nvoid j\n`],
      ['后端字段同名取值', `const row = { jobId: 3 }\nconst n = Number(row.jobId)\nvoid n\n`]
    ]
    for (const [kind, sample] of clean) {
      expect(findUngatedRouteNumbers(sample).lines, kind).toEqual([])
    }
  })

  it('控制组 C：畸形入参在本地即被判定为"不发请求"（0），不产生出网值', () => {
    expect(toPositiveInt('1'.repeat(100))).toBe(0)
    // 对照旧写法：同一入参会产出一个"看起来合法"的数字并被拼进 URL
    expect(Number('1'.repeat(100))).toBeGreaterThan(0)
  })

  it('控制组 D：扫描器自身不得对真实修复形态失明（log.vue 修复前/后对账）', () => {
    const before = `const rawJobId = route.params?.jobId\nconst jobId = rawJobId !== undefined ? Number(rawJobId) : NaN\nvoid jobId\n`
    const after = `const jobId = toPositiveInt(route.params?.jobId)\nif (jobId !== 0) getJob(jobId)\n`
    expect(findUngatedRouteNumbers(before).lines.length).toBeGreaterThan(0)
    expect(findUngatedRouteNumbers(after).lines).toEqual([])
  })
})
