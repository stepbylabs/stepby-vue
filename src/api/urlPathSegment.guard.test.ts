/**
 * 静态守卫：URL **路径段**里插入自由字符串形参时必须编码（批七十四 F1）。
 *
 * 缺陷形态：`url: '/monitor/cache/clearCacheKey/' + cacheKey`。键名/表名/字典类型这类
 * **自由字符串**直接拼进路径段时，`#` 会让浏览器把其后内容当片段丢弃，`/` 会被解析成
 * 多一层路径段，`%` 会二次转义 —— 用户可见后果是"清理/查询类指令静默作用到另一个目标"
 * （例：`clearCacheKey('sys_config#x')` 实际清的是 `sys_config`）。
 *
 * 判据只覆盖"被拼接量在类型上可能是自由字符串"的站点：
 * - 形参声明为 `string`（含 `string[]`）才判；声明含 `number` 的一律不判 ——
 *   数字 ID 结构上不可能含 `# ? /`，改编码纯属噪声（本仓 85 处路径拼参都是这一类）；
 * - 名字以 `Id`/`Ids` 结尾的不判（ID 或 ID 列表，实际取值为数字串）；
 * - 已经过 `encodeURIComponent(...)` 的不判。
 *
 * 与 `src/utils/routeParamNumber.guard.test.ts` 同范式：除全量扫描外，必须用**内存里的
 * 合成源码**证明扫描器真能抓到违规（否则判据不约束，锁形同虚设）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 已复核、判定为"取值不是用户自由输入"的站点豁免（新增必须带理由） */
const REVIEWED_EXEMPTIONS: ReadonlyArray<{ file: string; param: string; reason: string }> = [
  {
    file: 'src/api/tool/reportBoard.ts',
    param: 'sourceKey',
    reason: '取值来自后端 listSources() 返回的白名单枚举键，非用户可任意伪造的自由字符串，且服务端对未知 key 直接拒绝'
  }
]

/** F1 已接线的 9 处站点（改回裸拼接必须转红，防止"绕过守卫"） */
const WIRED_ENCODE_COUNTS: ReadonlyArray<{ file: string; min: number }> = [
  { file: 'src/api/monitor/cache.ts', min: 5 },
  { file: 'src/api/monitor/logininfor.ts', min: 1 },
  { file: 'src/api/system/config.ts', min: 1 },
  { file: 'src/api/system/dict/data.ts', min: 1 },
  { file: 'src/api/tool/gen.ts', min: 3 }
]

/** 违规站点描述：file + 行号 + 形参名 */
interface Violation {
  file: string
  line: number
  param: string
}

function walkApiDir(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkApiDir(p, out)
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 标记每个字符是否属于"可执行代码"：注释与字符串字面量内容一律为 false。
 * 扫描器据此避免把注释里的反例、以及文档/测试里的示例字符串当成交接站点。
 */
function buildCodeMask(text: string): boolean[] {
  const mask = new Array<boolean>(text.length).fill(false)
  type Mode = 'code' | 'lineComment' | 'blockComment' | 'single' | 'double' | 'template' | 'templateExpr'
  let mode: Mode = 'code'
  let exprDepth = 0
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const n = text[i + 1]
    switch (mode) {
      case 'code':
        if (c === '/' && n === '/') {
          mode = 'lineComment'
          i += 2
        } else if (c === '/' && n === '*') {
          mode = 'blockComment'
          i += 2
        } else if (c === "'") {
          mode = 'single'
          i += 1
        } else if (c === '"') {
          mode = 'double'
          i += 1
        } else if (c === '`') {
          mode = 'template'
          i += 1
        } else {
          mask[i] = true
          i += 1
        }
        break
      case 'lineComment':
        if (c === '\n') {
          mode = 'code'
          mask[i] = true
        }
        i += 1
        break
      case 'blockComment':
        if (c === '*' && n === '/') {
          mode = 'code'
          i += 2
        } else {
          i += 1
        }
        break
      case 'single':
      case 'double': {
        const quote = mode === 'single' ? "'" : '"'
        if (c === '\\') i += 2
        else if (c === quote) {
          mode = 'code'
          i += 1
        } else i += 1
        break
      }
      case 'template':
        if (c === '\\') i += 2
        else if (c === '`') {
          mode = 'code'
          i += 1
        } else if (c === '$' && n === '{') {
          mode = 'templateExpr'
          exprDepth = 1
          mask[i] = true
          mask[i + 1] = true
          i += 2
        } else i += 1
        break
      case 'templateExpr':
        mask[i] = true
        if (c === '{') exprDepth += 1
        else if (c === '}') {
          exprDepth -= 1
          if (exprDepth === 0) mode = 'template'
        }
        i += 1
        break
    }
  }
  return mask
}

/** 深度感知的顶层逗号切分（`data: { a: string, b: number }` 内部不拆） */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const c of list) {
    if ('([{<'.includes(c)) depth += 1
    else if (')]}>'.includes(c)) depth -= 1
    if (c === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/**
 * 从形参列表取出"可能是自由字符串"的参数名。
 * 声明含 number（如 `number | string`）与 `Id`/`Ids` 结尾的名字一律不判，见文件头判据。
 */
function freeStringParamNames(paramList: string): string[] {
  const names: string[] = []
  for (const part of splitTopLevel(paramList)) {
    const m = /^([A-Za-z_$][\w$]*)\s*\??\s*:\s*(.+)$/.exec(part)
    if (!m) continue
    const [, name, type] = m
    if (/\bnumber\b/.test(type)) continue
    if (!/\bstring\b/.test(type)) continue
    if (/Ids?$/i.test(name)) continue
    names.push(name)
  }
  return names
}

/** 形参签名：命名函数 + 箭头函数（可带返回类型注解） */
const SIGNATURE_RE = /function\s*[\w$]*\s*\(([^()]*)\)|\(([^()]*)\)\s*(?::[^=;{}]{0,200})?=>/g

/** 去掉已编码片段后，表达式里是否仍裸引用该形参 */
function referencesRaw(expr: string, name: string): boolean {
  const stripped = expr.replace(/encodeURIComponent\((?:[^()]|\([^()]*\))*\)/g, '""')
  const re = new RegExp(`(^|[^.\\w$])${name}\\b`)
  return re.test(stripped)
}

/**
 * 从 `url:` 冒号后读出**完整但仅此一项**的表达式：
 * 顶层逗号或（未被 `+` 续行的）换行即止 —— 否则会把同行的 `params: { q }` 也算进 URL，
 * 查询参数由 axios 自行序列化，不是路径段，不该判。
 */
function readUrlExpr(text: string, from: number): string {
  let out = ''
  let depth = 0
  let quote: string | null = null
  let i = from
  while (i < text.length) {
    const c = text[i]
    if (quote) {
      out += c
      if (c === '\\') {
        out += text[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c
      out += c
      i += 1
      continue
    }
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    if (depth <= 0 && (c === ',' || c === '}')) break
    if (depth === 0 && c === '\n') {
      // 拼接换行：值以 + 结尾时续读下一行
      if (!out.trimEnd().endsWith('+')) break
      out += ' '
      i += 1
      continue
    }
    out += c
    i += 1
  }
  return out
}

/**
 * 只保留表达式里的**标识符文本**：剥掉单/双引号字面量，模板字符串则丢弃静态文本、
 * 仅保留 `${...}` 插值内容 —— 否则 `/common/download?fileName=` 里的字面 `fileName`
 * 会被当成对同名形参的引用（实测误报点）。
 */
function stripLiterals(expr: string): string {
  let out = ''
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c === "'" || c === '"') {
      i += 1
      while (i < expr.length && expr[i] !== c) i += expr[i] === '\\' ? 2 : 1
      i += 1
      out += '""'
      continue
    }
    if (c === '`') {
      i += 1
      let depth = 0
      while (i < expr.length) {
        const d = expr[i]
        if (depth === 0) {
          if (d === '`') {
            i += 1
            break
          }
          if (d === '$' && expr[i + 1] === '{') {
            depth = 1
            i += 2
            continue
          }
          i += 1
          continue
        }
        if (d === '{') depth += 1
        else if (d === '}') depth -= 1
        else out += d
        i += 1
      }
      continue
    }
    out += c
    i += 1
  }
  return out
}

/** 扫描一段源码，返回未编码的自由字符串路径段站点 */
function findUnencodedPathSegments(text: string, file: string): Violation[] {
  const mask = buildCodeMask(text)
  const lineOf = (idx: number) => text.slice(0, idx).split('\n').length
  const signatures: { index: number; params: string[] }[] = []
  for (const m of text.matchAll(SIGNATURE_RE)) {
    if (!mask[m.index]) continue
    const paramList = m[1] ?? m[2] ?? ''
    const params = freeStringParamNames(paramList)
    if (params.length) signatures.push({ index: m.index, params })
  }
  const violations: Violation[] = []
  for (const m of text.matchAll(/\burl\s*:\s*/g)) {
    if (!mask[m.index]) continue
    const value = readUrlExpr(text, m.index + m[0].length)
    const scope = signatures.filter((s) => s.index < m.index).pop()
    if (!scope) continue
    for (const param of scope.params) {
      const exempted = REVIEWED_EXEMPTIONS.some((e) => e.file === file && e.param === param)
      if (exempted) continue
      // 字符串字面量与模板静态文本里的同名文本不是引用
      if (referencesRaw(stripLiterals(value), param)) {
        violations.push({ file, line: lineOf(m.index), param })
      }
    }
  }
  return violations
}

/** Windows 路径统一成仓库相对的 posix 形态，供豁免表按文件名比对 */
function rel(p: string): string {
  return p.replace(/\\/g, '/')
}

describe('静态守卫：URL 路径段插入自由字符串形参必须 encodeURIComponent', () => {
  it('src/api 不存在未编码的自由字符串路径段', () => {
    const violations = walkApiDir('src/api').flatMap((f) => findUnencodedPathSegments(readFileSync(f, 'utf8'), rel(f)))
    expect(violations, violations.map((v) => `${v.file}:${v.line} ${v.param}`).join('\n')).toEqual([])
  })

  it('九处已接线站点确实使用 encodeURIComponent（防"改回裸拼接且绕过守卫"）', () => {
    for (const { file, min } of WIRED_ENCODE_COUNTS) {
      const count = (readFileSync(file, 'utf8').match(/encodeURIComponent\(/g) ?? []).length
      expect(count, `${file} 的 encodeURIComponent 调用数`).toBeGreaterThanOrEqual(min)
    }
  })

  it('控制组：扫描器真能抓到违规写法（证明上两条不是虚锁）', () => {
    const cases: { title: string; src: string; expectViolations: string[] }[] = [
      {
        title: 'string 形参裸拼进路径段 ⇒ 必须命中',
        src: `export function clearCacheKey(cacheKey: string): Promise<AjaxResult> {\n  return request({\n    url: '/monitor/cache/clearCacheKey/' + cacheKey,\n    method: 'delete'\n  })\n}\n`,
        expectViolations: ['cacheKey']
      },
      {
        title: 'string 形参裸插进模板字符串 ⇒ 必须命中',
        src: `export function getDicts(dictType: string): Promise<AjaxResult> {\n  return request({\n    url: \`/system/dict/data/type/\${dictType}\`,\n    method: 'get'\n  })\n}\n`,
        expectViolations: ['dictType']
      },
      {
        title: 'number 形参不判（数字 ID 结构上不含 # ? /）',
        src: `export function getData(dictCode: number): Promise<AjaxResult> {\n  return request({\n    url: '/system/dict/data/' + dictCode,\n    method: 'get'\n  })\n}\n`,
        expectViolations: []
      },
      {
        title: 'number | string 联合形参不判',
        src: `export function delConfig(configId: number | string): Promise<AjaxResult> {\n  return request({\n    url: '/system/config/' + configId,\n    method: 'delete'\n  })\n}\n`,
        expectViolations: []
      },
      {
        title: 'Id / Ids 结尾形参不判（ID 与 ID 列表）',
        src: `export function revokePat(patId: string): Promise<AjaxResult> {\n  return request({ url: '/monitor/pat/' + patId, method: 'delete' })\n}\nexport function removeDataset(datasetIds: string): Promise<AjaxResult> {\n  return request({ url: '/report/dataset/' + datasetIds, method: 'delete' })\n}\n`,
        expectViolations: []
      },
      {
        title: '已编码站点不命中（含模板与拼接两种写法）',
        src: `export function unlockLogininfor(userName: string): Promise<AjaxResult> {\n  return request({ url: '/monitor/logininfor/unlock/' + encodeURIComponent(userName), method: 'post' })\n}\nexport function delClient(clientId: string): Promise<AjaxResult> {\n  return request({ url: \`/profile/sso-grants/\${encodeURIComponent(clientId)}\`, method: 'delete' })\n}\n`,
        expectViolations: []
      },
      {
        title: '注释行与字符串字面量自身不得误报',
        src: `// url: '/monitor/cache/getKeys/' + cacheName  ← 反例说明，不是站点\nexport function listCacheKey(cacheName: string): Promise<AjaxResult> {\n  const doc = "url: '/monitor/cache/getKeys/' + cacheName"\n  void doc\n  return request({ url: '/monitor/cache/getKeys/' + encodeURIComponent(cacheName), method: 'get' })\n}\n`,
        expectViolations: []
      },
      {
        title: '模板静态文本里的同名文本不是引用（实测误报点：?fileName= 后跟同名形参）',
        src: `export function downloadFileBlob(fileName: string): Promise<Blob> {\n  return request({ url: \`/common/download?fileName=\${encodeURIComponent(fileName)}&delete=false\`, method: 'get' })\n}\n`,
        expectViolations: []
      },
      {
        title: '模板里有静态同名文本 + 未编码的真实引用 ⇒ 仍须命中',
        src: `export function downloadFileBlob(fileName: string): Promise<Blob> {\n  return request({ url: \`/common/download?fileName=list&name=\${fileName}\`, method: 'get' })\n}\n`,
        expectViolations: ['fileName']
      },
      {
        title: 'params/data 里的 string 形参不判（axios 自行序列化查询串）',
        src: `export function search(q: string): Promise<AjaxResult> {\n  return request({ url: '/common/search', method: 'get', params: { q } })\n}\n`,
        expectViolations: []
      }
    ]

    for (const c of cases) {
      const found = findUnencodedPathSegments(c.src, 'synthetic.ts').map((v) => v.param)
      expect(found.sort(), c.title).toEqual([...c.expectViolations].sort())
    }
  })
})
