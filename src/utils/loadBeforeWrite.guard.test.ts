/**
 * 「读失败不得被当成空数据写回去」的形状守卫（b133）。
 *
 * 立的案（HEAD 实测三处同族）：
 * 1. `views/system/role/index.vue`：`roleMenuTreeselect()` / `deptTreeSelect()` 的 catch 把
 *    `menuOptions` / `deptOptions` 清成 `[]` 后照常打开对话框，保存时提交 `menuIds: []` /
 *    `deptIds: []` ⇒ **一次读失败把该角色的全部授权静默清空**；
 * 2. `profile/msgPref.vue`：`load()` 的 catch 吞掉失败，表单停在默认值（通知全开、免打扰关），
 *    保存按钮照常可用 ⇒ **一次读失败把用户真实偏好覆盖成默认值**；
 * 3. `profile/index.vue`：`getUser()` 失败后 `loading=false`，页面渲染 `<el-empty>`「暂无数据」
 *    ⇒ 把"请求失败"显示成"你没有资料"，且无重试入口。
 *
 * 三条规则（全部**由事实派生采集面**，不按文件名枚举）：
 * - R1 授权族 catch 清空必须同时标记未就绪：`src/views/**` 任意 `.catch(...)` 回调体里出现
 *   `menuOptions/deptOptions/menuIds/deptIds/checkedKeys/... = []|null` 却没有置 `*Loaded=false`
 *   / `loadError=true` ⇒ 违规（"清空成空授权"正是本族要挡的破坏性写入前置）。
 * - R2 授权树读点必须有"读成功"闸：调用 `roleMenuTreeselect` / `roleDeptTreeselect`（响应里带
 *   `checkedKeys`，会被原样写回）的文件，必须同时具备成功置真/失败置假的 flags 与写函数里的早退。
 * - R3 读-写闸接线反查：数据权限对话框消费 `treeLoaded`；偏好页保存前判 `loaded` 且失败态可见
 *   可重试；告警页两个下拉必须可远程搜索且截断可见（b133-D）。
 *
 * 每条规则都配"合成违规必被抓 + 合规反例不误报"，R1 另配**差异法活性**（往每个真实文件末尾
 * 插一条合成违规，命中数必须恰好 +1）与采集面自证（文件数 / 解析到的 catch 体数量下限），
 * 否则"一条都没扫到"与"扫到了且干净"在报告里同形（AGENTS ⑥/⑬）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { functionBody, maskVueScript, maskVueSource, templateRegion } from './listPageSurface'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..')
const VIEWS = path.join(SRC, 'views')

interface Source {
  rel: string
  code: string
}

function collect(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) collect(full, out)
    else if (ent.name.endsWith('.vue')) out.push(full)
    // 判据针对**生产码**：测试文件里的合成夹具字符串不是"页面怎么写"的证据
    else if (ent.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(ent.name)) out.push(full)
  }
  return out
}

function relOf(full: string): string {
  return path.relative(SRC, full).split(path.sep).join('/')
}

export const FILES: Source[] = collect(VIEWS).map((full) => ({
  rel: relOf(full),
  code: fs.readFileSync(full, 'utf8')
}))

/**
 * 把注释与字符串**内容**抹成等长空白（保持偏移、保留引号与 `${}` 里的真实表达式），
 * 避免"注释/示例字符串里的坏形状"被判红。模板串的字面部分同样抹掉，但 `${ ... }`
 * 内部仍是代码（逐字符扫描时递归处理单/双引号与嵌套模板串）。
 */
export function maskComments(code: string): string {
  const out = code.split('')
  const n = code.length
  const blank = (idx: number) => {
    if (idx < n && code[idx] !== '\n') out[idx] = ' '
  }
  function scanQuoted(quote: string, start: number): number {
    let j = start + 1
    while (j < n) {
      if (code[j] === '\\') {
        blank(j)
        blank(j + 1)
        j += 2
        continue
      }
      if (code[j] === quote) return j + 1
      blank(j)
      j += 1
    }
    return j
  }
  function scanTemplate(start: number): number {
    let j = start + 1
    while (j < n) {
      if (code[j] === '\\') {
        blank(j)
        blank(j + 1)
        j += 2
        continue
      }
      if (code[j] === '`') return j + 1
      if (code[j] === '$' && code[j + 1] === '{') {
        let depth = 1
        j += 2
        while (j < n && depth > 0) {
          const c = code[j]
          if (c === "'" || c === '"') {
            j = scanQuoted(c, j)
            continue
          }
          if (c === '`') {
            j = scanTemplate(j)
            continue
          }
          if (c === '{') depth += 1
          else if (c === '}') depth -= 1
          j += 1
        }
        continue
      }
      blank(j)
      j += 1
    }
    return j
  }
  function scanRegex(start: number): number {
    let j = start + 1
    let inClass = false
    while (j < n) {
      const c = code[j]
      if (c === '\\') {
        blank(j)
        blank(j + 1)
        j += 2
        continue
      }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) return j + 1
      else if (c === '\n') return j
      blank(j)
      j += 1
    }
    return j
  }
  function prevSignificant(at: number): { ch: string; word: string } {
    let j = at - 1
    while (j >= 0 && /\s/.test(code[j])) j -= 1
    if (j < 0) return { ch: '', word: '' }
    const ch = code[j]
    let k = j
    while (k >= 0 && /[A-Za-z_$]/.test(code[k])) k -= 1
    return { ch, word: code.slice(k + 1, j + 1) }
  }
  /** 正则字面量的起始启发式：按前一个有效 token 判断，避免把 `/` 当除法 */
  function isRegexStart(at: number): boolean {
    const { ch, word } = prevSignificant(at)
    if (!ch) return true
    if ('(,=:[!&|?{};+-*%<>~^'.includes(ch)) return true
    return [
      'return',
      'typeof',
      'case',
      'in',
      'of',
      'delete',
      'void',
      'instanceof',
      'do',
      'else',
      'yield',
      'await'
    ].includes(word)
  }
  let i = 0
  while (i < n) {
    const c = code[i]
    const d = code[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && code[i] !== '\n') {
        blank(i)
        i += 1
      }
      continue
    }
    if (c === '/' && d === '*') {
      blank(i)
      blank(i + 1)
      i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        blank(i)
        i += 1
      }
      if (i < n) {
        blank(i)
        blank(i + 1)
        i += 2
      }
      continue
    }
    if (c === "'" || c === '"') {
      i = scanQuoted(c, i)
      continue
    }
    if (c === '`') {
      i = scanTemplate(i)
      continue
    }
    if (c === '/' && d !== '=' && isRegexStart(i)) {
      i = scanRegex(i)
      continue
    }
    i += 1
  }
  return out.join('')
}

/**
 * 取所有「失败分支体」：`.catch(...)` 回调 + `try { } catch { }` 语句块。
 * 括号/花括号配对时跳过字符串与模板串；取不到配对（输入坏了）返回空数组，由调用方响亮失败。
 */
export function extractCatchBodies(masked: string): { body: string; index: number }[] {
  const out: { body: string; index: number }[] = []
  const callRe = /\.catch\s*\(/g
  let m: RegExpExecArray | null
  while ((m = callRe.exec(masked)) !== null) {
    const start = m.index + m[0].length
    let depth = 1
    let i = start
    while (i < masked.length && depth > 0) {
      const c = masked[i]
      if (c === '"' || c === "'" || c === '`') {
        const quote = c
        i += 1
        while (i < masked.length) {
          if (masked[i] === '\\') {
            i += 2
            continue
          }
          if (masked[i] === quote) {
            i += 1
            break
          }
          i += 1
        }
        continue
      }
      if (c === '(') depth += 1
      else if (c === ')') depth -= 1
      i += 1
    }
    if (depth !== 0) return []
    out.push({ body: masked.slice(start, i - 1), index: m.index })
    callRe.lastIndex = i
  }
  // `try {} catch { … }` / `catch (e) { … }`：只认语句块（`.catch(` 后面跟的是箭头，不会误命中）
  const stmtRe = /catch\s*(?:\([^)]*\))?\s*\{/g
  while ((m = stmtRe.exec(masked)) !== null) {
    const open = m.index + m[0].length - 1
    let depth = 1
    let i = open + 1
    while (i < masked.length && depth > 0) {
      if (masked[i] === '{') depth += 1
      else if (masked[i] === '}') depth -= 1
      i += 1
    }
    if (depth !== 0) return []
    out.push({ body: masked.slice(open + 1, i - 1), index: open })
    stmtRe.lastIndex = i
  }
  return out.sort((a, b) => a.index - b.index)
}

/** 授权族数据名：被清空即等于"该角色没有任何授权/该用户没有偏好" */
const AUTH_DATA =
  /(menuOptions|deptOptions|menuIds|deptIds|checkedKeys|menuTree|deptTree|treeData|treeOptions|^menus$|^depts$)/i
/** 合规标记：catch 里必须同时写下"没读到"这一事实 */
const FAILURE_MARK =
  /(Loaded|loaded)\s*\.value\s*=\s*false|loadError\s*\.value\s*=\s*true|loadFailed\s*\.value\s*=\s*true/

/** 取 catch 体所属函数名（`function foo(` / `const foo = (...) =>`） */
export function enclosingFunctionName(masked: string, index: number): string | null {
  const head = masked.slice(0, index)
  const decl =
    /(?:function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?\{|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>)/g
  let name: string | null = null
  let m: RegExpExecArray | null
  while ((m = decl.exec(head)) !== null) name = m[1] ?? m[2]
  return name
}

/**
 * 第二种安全形状（b134）：catch `return false` 把失败交回调用方，且**每个** `await fn(` 调用点
 * 都写成 `if (!(await fn(...)))` —— 表单根本不会打开（比"置未就绪但表单照开"更早一步拦住）。
 * 已知局限：只认 `await fn(` 这一形态（`fn().then` 之类看不见），故要求**全部**调用点都被闸住。
 */
export function failureIsGatedByCallers(masked: string, fn: string, body: string): boolean {
  if (!/\breturn\s+false\b/.test(body)) return false
  const callRe = new RegExp(`await\\s+${fn}\\s*\\(`, 'g')
  let calls = 0
  let m: RegExpExecArray | null
  while ((m = callRe.exec(masked)) !== null) {
    const before = masked.slice(Math.max(0, m.index - 60), m.index)
    if (!/if\s*\(\s*!\s*\(\s*$/.test(before)) return false
    calls += 1
  }
  return calls > 0
}

/** R1：catch 里清空授权族数据却没有标记未就绪，也没有把失败交给被闸住的调用方 ⇒ 违规 */
export function auditCatchClears(rel: string, code: string): string[] {
  const masked = maskComments(code)
  const out: string[] = []
  for (const { body, index } of extractCatchBodies(masked)) {
    const line = masked.slice(0, index).split('\n').length
    const clears = [
      ...body.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*?)\.value\s*=\s*(\[\s*\]|null)(?![A-Za-z0-9_$])/g)
    ].filter((m) => AUTH_DATA.test(m[1]))
    const objectFallback = [...body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\[\s*\]/g)].filter((m) => AUTH_DATA.test(m[1]))
    if (clears.length === 0 && objectFallback.length === 0) continue
    if (FAILURE_MARK.test(body)) continue
    const fn = enclosingFunctionName(masked, index)
    if (fn && failureIsGatedByCallers(masked, fn, body)) continue
    const names = [...clears.map((m) => m[1]), ...objectFallback.map((m) => m[1])].join(', ')
    out.push(`${rel}:${line}: catch 把 ${names} 清空/回落成空值却没有置「未就绪」标记（读失败会被当成空授权写回去）`)
  }
  return out
}

/** R2：授权树读点（响应带 checkedKeys、会被写回）所在的文件 */
export function authTreeReaderFiles(files: Source[]): Source[] {
  return files.filter((f) =>
    /roleMenuTreeselect\s*\(|roleDeptTreeselect\s*\(|setCheckedKeys\(\s*\w+\.checkedKeys/.test(f.code)
  )
}

const EXEMPT_AUTH_READERS = [
  {
    rel: 'components/TreePanel/index.vue',
    why: '通用树面板只负责渲染与回填，数据从哪来、是否读到由调用方判定（就绪闸落在 role/index.vue 与 DataScopeDialog.vue）',
    mustMatch: /\.setCheckedKeys\(/
  }
]

function find(files: Source[], rel: string): Source {
  const f = files.find((x) => x.rel === rel)
  if (!f) throw new Error(`判据输入坏了：采集面里找不到 ${rel}`)
  return f
}

/** 采集面之外的定点文件（如通用组件豁免条目）按 src 根读取 */
function readSrc(rel: string): Source {
  return { rel, code: fs.readFileSync(path.join(SRC, rel), 'utf8') }
}

/**
 * b148：uploadConfig 的两条出口（「保存」与「测试」）都必须有**函数级**就绪闸。
 *
 * 立案不是理论：这一族的第一个断面是 b133 的"按钮 :disabled 挡住就行"，而盘上变异
 * （摘掉 `onTest` 首行的 `if (!loaded.value) return`，保留模板 disabled）在 page 用例上
 * **照常绿**——禁用按钮让点击根本派发不出来，于是"函数是安全边界"这句只剩注释。
 * 两层各判一次：函数体里必须有早退（拦截任何**其它**调用点，例如以后加的键盘快捷键），
 * 模板里必须有 `:disabled`（对用户诚实：按钮看起来就不能点）。
 *
 * 取不到函数体也**算违规**并写明"输入坏了"——`functionBody` 返回 null 时若当成"没有违规"，
 * 采集面一坏判据就恒绿（前言 ⑥/⑬）。
 */
export function uploadConfigGateGaps(code: string): string[] {
  const script = maskVueScript(code)
  const tpl = templateRegion(maskVueSource(code))
  const out: string[] = []
  for (const fn of ['onSave', 'onTest']) {
    const body = functionBody(script, fn)
    if (body === null) {
      out.push(`${fn}：函数体取不到 ⇒ 判据输入坏了，不得读成"没有违规"`)
      continue
    }
    if (!/if\s*\(\s*!\s*loaded\.value\s*\)\s*return/.test(body)) {
      out.push(`${fn}：体内没有「没读到服务端配置就不发请求」的早退（空默认值会被当成用户意图）`)
    }
    const paired = new RegExp(`:disabled="!loaded"[^>]*@click="${fn}"|@click="${fn}"[^>]*:disabled="!loaded"`)
    if (!paired.test(tpl)) {
      out.push(`${fn}：对应按钮缺 :disabled="!loaded"（函数闸是边界、禁用是提示，缺一都是下一个入口会漏）`)
    }
  }
  return out
}

describe('读失败不得被当成空数据写回去（b133）', () => {
  it('采集面自证：扫到的文件与解析出的 catch 体都不为空', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(100)
    const bodies = FILES.reduce((n, f) => n + extractCatchBodies(maskComments(f.code)).length, 0)
    // "0 违规"与"一个 catch 都没解析到"必须可分
    expect(bodies).toBeGreaterThanOrEqual(50)
  })

  it('R1 真实树：catch 清空授权族数据必须同时标记未就绪（0 违规）', () => {
    const violations = FILES.flatMap((f) => auditCatchClears(f.rel, f.code))
    expect(violations).toEqual([])
  })

  it('R1 合成违规必被抓、合规形状不误报', () => {
    const bad = [
      'menuTreeselect().then(r => { menuOptions.value = r.data }).catch(() => { menuOptions.value = [] })',
      'roleMenuTreeselect(id).catch(() => ({ menus: [] }))',
      'deptTreeSelect(id).catch(() => { deptOptions.value = null })',
      'a().catch(() => { if (x) { menuOptions.value = [] } })',
      // try/catch 是本仓的主流写法（roles 页修复后就是这一形态），必须同样进采集面
      'try { await a() } catch { menuOptions.value = [] }',
      'try { await a() } catch (e) { deptOptions.value = null }',
      // 失败交回调用方但没有任何调用点闸住它 ⇒ 照样是"照常打开表单"
      'function loadA() { return a().catch(() => { menuOptions.value = []; return false }) }\nloadA()',
      // 有调用方闸门、但 catch 声称成功 ⇒ 闸门恒不生效
      'function loadA() { return a().catch(() => { menuOptions.value = []; return true }) }\nasync function c() { if (!(await loadA())) return }'
    ]
    for (const src of bad) {
      expect(auditCatchClears('synthetic.vue', src), `未抓到：${src}`).toHaveLength(1)
    }
    const good = [
      'a().catch(() => { menuOptions.value = []; menuTreeLoaded.value = false })',
      'a().catch(() => { deptOptions.value = []; deptTreeLoaded.value = false })',
      'a().catch(() => { loadError.value = true; loaded.value = false })',
      'try { await a() } catch { menuOptions.value = []; menuTreeLoaded.value = false }',
      // b134 的第二条安全路径：失败返回 false 且全部调用点 `if (!(await fn(` 拒开表单
      'function loadA() { return a().catch(() => { menuOptions.value = []; return false }) }\nasync function c() { if (!(await loadA())) return }',
      'const loadB = async () => a().catch(() => { deptOptions.value = null; return false })\nasync function c() { if (!(await loadB(1))) { return } }',
      // 非授权族的数据清空不属于本族（下拉/缓存键等没有"写回空授权"的后果）
      'a().catch(() => { keys.value = []; eventOptionsFull.value = [] })',
      // 注释与字符串里的坏形状不算代码
      '// a().catch(() => { menuOptions.value = [] })',
      'const doc = "a().catch(() => { menuOptions.value = [] })"',
      'const doc = `a().catch(() => { menuOptions.value = [] })`'
    ]
    for (const src of good) {
      expect(auditCatchClears('synthetic.vue', src), `误报：${src}`).toEqual([])
    }
    // 模板串里 `${}` 内部仍是代码：藏在这里的真实坏形状必须照常抓到
    expect(
      auditCatchClears('synthetic.vue', 'const s = `x${a().catch(() => { menuOptions.value = [] })}y`')
    ).toHaveLength(1)
    // 正则字面量里的引号/反引号不得让掩码器脱轨（曾把后面的真实代码整段吞掉）
    expect(
      auditCatchClears('synthetic.vue', 'const re = /[\'"`]/; a().catch(() => { menuOptions.value = [] })')
    ).toHaveLength(1)
    expect(
      auditCatchClears('synthetic.vue', 'const re = /push\\(`/.test(x); a().catch(() => { menuOptions.value = [] })')
    ).toHaveLength(1)
    // 除法里的 `/` 不是正则起始
    expect(
      auditCatchClears('synthetic.vue', 'const half = n / 2; a().catch(() => { menuOptions.value = [] })')
    ).toHaveLength(1)
  })

  it('R1 差异法活性：每个真实文件末尾插入两条合成违规（.catch 与 try/catch 各一）都必须被抓到', () => {
    for (const f of FILES) {
      const before = auditCatchClears(f.rel, f.code).length
      const mutated = `${f.code}\nmenuTreemenu().catch(() => { menuOptions.value = [] })\ntry { await x() } catch { deptOptions.value = [] }\n`
      expect(auditCatchClears(f.rel, mutated).length, `${f.rel} 的合成违规没有被抓到`).toBe(before + 2)
    }
  })

  it('R2 授权树读点必须带「读成功」闸与写函数早退', () => {
    const readers = authTreeReaderFiles(FILES).map((f) => f.rel)
    expect(readers.length).toBeGreaterThanOrEqual(1)
    expect(readers).toContain('views/system/role/index.vue')
    // 豁免条目必须仍命中（否则豁免就是死的，AGENTS ㊉）
    for (const e of EXEMPT_AUTH_READERS) {
      expect(e.mustMatch.test(readSrc(e.rel).code), `${e.rel} 的豁免理由已失效`).toBe(true)
    }
    const role = find(FILES, 'views/system/role/index.vue')
    expect(role.code).toMatch(/if\s*\(\s*!\s*menuTreeLoaded\.value\s*\)/)
    expect(role.code).toMatch(/if\s*\(\s*!\s*\(\s*await\s+getMenuTreeselect\(\)\s*\)\s*\)\s*return/)
    // 部门树侧的就绪闸落在对话框（提交函数已随块迁入 DataScopeDialog.vue），父级只负责"没读到就不开"
    expect(role.code).toMatch(/if\s*\(\s*!\s*(menuRes|treeRes)\s*\)\s*return/)
    expect(role.code).toMatch(/:tree-loaded="deptTreeLoaded"/)
  })

  it('R3 数据权限对话框消费 treeLoaded 并在提交前拦一次', () => {
    const dlg = find(FILES, 'views/system/role/DataScopeDialog.vue')
    expect(dlg.code).toMatch(/:\s*disabled="!treeLoaded"/)
    expect(dlg.code).toMatch(/if\s*\(\s*!\s*props\.treeLoaded\s*\)/)
    expect(dlg.code).toMatch(/dataScope\(/)
  })

  it('R3 偏好页：读成功前保存被禁、失败态可见可重试', () => {
    const p = find(FILES, 'views/system/user/profile/msgPref.vue')
    expect(p.code).toMatch(/:disabled="!loaded"/)
    expect(p.code).toMatch(/if\s*\(\s*!\s*loaded\.value\s*\)\s*return/)
    expect(p.code).toMatch(/data-test="msg-pref-load-error"/)
    expect(p.code).toMatch(/@click="load"/)
  })

  it('R3 uploadConfig：保存与测试两条出口都要有函数级闸，模板 :disabled 只是第二层', () => {
    const p = find(FILES, 'views/system/uploadConfig/index.vue')
    const gaps = uploadConfigGateGaps(p.code)
    expect(gaps, gaps.join('\n')).toEqual([])

    // 合成双向：三种退化各只点名自己那一处（互不顶班），合规夹具必须 0 报。
    const OK = [
      '<template>',
      '  <el-button :disabled="!loaded" icon="Connection" @click="onTest">测试</el-button>',
      '  <el-button :disabled="!loaded" @click="onSave">保存</el-button>',
      '</template>',
      '<script setup lang="ts">',
      'const loaded = ref(false)',
      'async function onSave() { if (!loaded.value) return }',
      'async function onTest() { if (!loaded.value) return }',
      '</script>'
    ].join('\n')
    expect(uploadConfigGateGaps(OK)).toEqual([])
    // ① 摘掉函数闸（正是盘上变异 F-C 的形状）：只点名 onTest 的早退缺失
    const noGuard = OK.replace('async function onTest() { if (!loaded.value) return }', 'async function onTest() {}')
    const g1 = uploadConfigGateGaps(noGuard)
    expect(g1).toHaveLength(1)
    expect(g1[0]).toContain('onTest：体内没有')
    // ② 摘掉模板禁用：只点名第二层，函数闸那条不受影响
    const noDisabled = OK.replace(
      '<el-button :disabled="!loaded" icon="Connection" @click="onTest">',
      '<el-button icon="Connection" @click="onTest">'
    )
    const g2 = uploadConfigGateGaps(noDisabled)
    expect(g2).toHaveLength(1)
    expect(g2[0]).toContain('onTest：对应按钮缺')
    // ③ 把早退只写在注释里：掩码后不算（刀口只能落在代码上，前言 ⑬）
    const commentOnly = OK.replace(
      'async function onSave() { if (!loaded.value) return }',
      'async function onSave() {\n// if (!loaded.value) return\n}'
    )
    const g3 = uploadConfigGateGaps(commentOnly)
    expect(g3).toHaveLength(1)
    expect(g3[0]).toContain('onSave：体内没有')
    // ④ 声明都不存在 ⇒ 输入坏了，不得读成"没有违规"
    const gone = OK.replace('async function onTest() { if (!loaded.value) return }', '')
    const g4 = uploadConfigGateGaps(gone)
    expect(g4).toHaveLength(1)
    expect(g4[0]).toContain('onTest：函数体取不到')
  })

  it('R3 个人主页：读失败必须可见且可重试，不得显示成"暂无数据"', () => {
    const p = find(FILES, 'views/system/user/profile/index.vue')
    expect(p.code).toMatch(/data-test="profile-load-error"/)
    expect(p.code).toMatch(/v-if="loadError"/)
    expect(p.code).toMatch(/@click="getUser"/)
    expect(p.code).toMatch(/v-else-if="!loading && !loadError"/)
  })

  it('R3 告警表单参考数据：远程搜索接线、截断可见、既有失败态保留', () => {
    const p = find(FILES, 'views/monitor/alert/index.vue')
    expect(p.code).toMatch(/<el-select[\s\S]{0,400}?filterable[\s\S]{0,400}?remote/)
    expect(p.code).toMatch(/:remote-method="searchChannels"/)
    expect(p.code).toMatch(/:remote-method="searchTemplates"/)
    // b134 把两处手写搜索收进共用组合子：竞态保护（createLatestGuard 票据）随之下沉到单一实现，
    // 这里同时钉住"页面用共用件"与"共用件里有票据"——只钉页面会把重构后的合法形态判红
    expect(p.code).toMatch(/useRemoteOptions<SysMsgChannel>/)
    expect(p.code).toMatch(/useRemoteOptions<SysMsgTemplate>/)
    expect(readSrc('composables/useRemoteOptions.ts').code).toMatch(/createLatestGuard\(\)/)
    expect(p.code).toMatch(/data-test="channel-truncated"/)
    expect(p.code).toMatch(/data-test="template-truncated"/)
    // b133 自纠：这两个下拉的失败态在 HEAD 早就存在（optionsLoadError + retryLoadOptions），
    // 我把"未接线"误判过一次，这里把它钉成回归锁，防止下一次"重构"把它删掉
    expect(p.code).toMatch(/v-if="optionsLoadError"/)
    expect(p.code).toMatch(/retryLoadOptions/)
  })
})
