/**
 * e2e 套件静态守卫的**共用纯函数**（批八十三从 `e2eClickPolicy.guard.test.ts` 抽出）。
 *
 * 为什么单独成模块：`tests/e2e` 下现在有 80+ 个 `.mjs`，多条静态判据（禁 force 点击、
 * 浏览器回调不得引用 Node 侧绑定……）都必须先做同一件事——**把注释/字符串/正则字面量
 * 从采集面剔掉**。这份掩码器本身是有状态的小型解析器，两处各抄一份必然漂移
 * （本仓已为"两份实现必漂"立过多次案），所以刀口只留一份、由各守卫共用。
 *
 * 抽出来的代价也要说清：掩码器的**长度不变式**（掩码后与原文逐字节等长）是行号可信的
 * 前提，任何改动必须由 `e2eClickPolicy.guard.test.ts` 的"每个被扫文件末尾插入合成违规
 * 必须被抓到"那条自证来兜住——那两个守卫文件都 import 本模块，因此一条自证同时护两把刀。
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/** 判据根目录：递归扫这一棵子树，新增/迁移文件不需要再改各守卫文件 */
export const E2E_DIR = 'tests/e2e'

/** `_tmp/` 已 gitignore（临时探针目录）；screenshots 是产物目录、node_modules 不是本仓码 */
export const EXCLUDED_DIRS = new Set(['_tmp', 'node_modules', 'screenshots'])

/**
 * 注释、字符串与正则字面量置空（保留换行与**总长度**），避免文档反例被当成代码。
 *
 * 三件必须一起处理才有意义的事：
 * - 正则字面量：`/` 只有在"前一个有效字符是运算符/开括号/行首"时才是正则，否则是除法；
 *   正则里的引号**不得**被当成字符串开头（这正是上一版把整段代码吞掉的根因）。
 * - 模板字符串：`${ … }` 里是**代码**，必须照常参与掩码判断，里面的引号也不能翻转状态。
 * - 长度不变式：逐字符输出，掩码后与原文等长 ⇒ 报出来的行号仍然可信。
 *
 * `opts` 是给**需要读字面量内容**的判据用的（如文案空格守卫要看 `:has-text("…")` 里的串）：
 * 那种判据只要"注释里的反例不算"，把字符串一并抹掉就等于把判据的输入一起抹没了。
 * 状态机只有一份——字符串/正则照旧**被跟踪边界**，只是不置空，所以字面量里出现的 `//`
 * 仍然不会被误当注释起点。默认值 = 老行为，另一把刀（force 点击守卫）不受影响。
 */
export function muteNonCode(src: string, opts: { keepStrings?: boolean; keepRegex?: boolean } = {}): string {
  const keepStrings = opts.keepStrings === true
  const keepRegex = opts.keepRegex === true
  // 正则字面量可以出现在这些字符之后（保守取常见集；取不到就当除法，除法只会少掩码一段，
  // 不会像"把代码当字符串"那样吞掉整片采集面）
  const REGEX_OK_AFTER = new Set([
    '',
    '(',
    ',',
    '=',
    ':',
    '!',
    '&',
    '|',
    '?',
    '{',
    '[',
    ';',
    '+',
    '-',
    '*',
    '%',
    '^',
    '~',
    '<',
    '>',
    ''
  ])
  let out = ''
  let i = 0
  let prev = ''
  /** 栈：每层是 `tpl`（模板字符串内部）或 `interp`（模板里的 ${ … } 代码段，**深度记在帧上**） */
  const stack: Array<{ kind: 'tpl' | 'interp'; depth: number }> = []
  const emit = (ch: string) => {
    out += ch
    i++
  }
  const blank = (count: number) => {
    for (let k = 0; k < count; k++) {
      out += src[k + i] === '\n' ? '\n' : ' '
    }
    i += count
  }
  /** 等长搬运（keepStrings/keepRegex 模式下的"不抹平"分支；长度不变式对两种模式都要成立） */
  const copy = (count: number) => {
    out += src.slice(i, i + count)
    i += count
  }
  /** 字面量内部：按模式决定原样搬运还是抹平 */
  const lit = (count: number) => (keepStrings ? copy(count) : blank(count))
  const inTemplate = () => stack[stack.length - 1]?.kind === 'tpl'

  while (i < src.length) {
    if (inTemplate()) {
      const c = src[i]
      if (c === '\\') {
        lit(2)
        continue
      }
      if (c === '`') {
        stack.pop()
        lit(1)
        prev = '`'
        continue
      }
      if (c === '$' && src[i + 1] === '{') {
        // 深度必须记在**这一帧**上：用单一全局计数会被内层 `${}` 覆盖，
        // 于是外层的 `}` 数错、整个后续文件的掩码状态一路错位（实测 run-detached.mjs:153
        // 的 `${signal ? \` signal=${signal}\` : ''}` 就是这一形状，它让后面整段代码被吞掉）。
        stack.push({ kind: 'interp', depth: 1 })
        lit(2)
        continue
      }
      lit(1)
      continue
    }
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') emit(' ')
      continue
    }
    if (c === '/' && next === '*') {
      blank(2)
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      blank(2)
      continue
    }
    // 正则字面量：整段置空；字符类 [ … ] 里的 `/` 不算结束；遇到未转义换行就放弃
    // （那说明它其实不是正则，退化为普通字符处理，宁可少掩码也不吞代码）
    if (c === '/' && REGEX_OK_AFTER.has(prev)) {
      let j = i + 1
      let inClass = false
      let closed = false
      while (j < src.length) {
        const r = src[j]
        if (r === '\\') {
          j += 2
          continue
        }
        if (r === '\n') break
        if (inClass) {
          if (r === ']') inClass = false
        } else if (r === '[') inClass = true
        else if (r === '/') {
          closed = true
          break
        }
        j++
      }
      if (closed) {
        j++
        while (j < src.length && /[gimsuyd]/.test(src[j])) j++
        if (keepRegex) copy(j - i)
        else blank(j - i)
        prev = '/'
        continue
      }
      // 落不成正则：当普通字符（除法）处理
      emit(c)
      prev = c
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      lit(1)
      while (i < src.length) {
        if (src[i] === '\\') {
          lit(2)
          continue
        }
        if (src[i] === quote) {
          lit(1)
          break
        }
        if (keepStrings) {
          out += src[i]
          i++
        } else {
          out += src[i] === '\n' ? '\n' : ' '
          i++
        }
      }
      prev = quote
      continue
    }
    if (c === '`') {
      stack.push({ kind: 'tpl', depth: 0 })
      lit(1)
      prev = '`'
      continue
    }
    if (stack[stack.length - 1]?.kind === 'interp') {
      const frame = stack[stack.length - 1]
      if (c === '{') frame.depth++
      else if (c === '}') {
        frame.depth--
        if (frame.depth === 0) {
          stack.pop()
          lit(1)
          prev = '}'
          continue
        }
      }
    }
    emit(c)
    if (!/\s/.test(c)) prev = c
  }
  return out
}

/** 在**掩码后**的文本上找匹配，返回 1-based 行号（掩码保持等长，所以行号可信） */
export function lineHits(masked: string, re: RegExp): number[] {
  const hits: number[] = []
  const scan = new RegExp(re.source, 'g')
  let m: RegExpExecArray | null
  while ((m = scan.exec(masked))) {
    hits.push(masked.slice(0, m.index).split('\n').length)
  }
  return hits
}

/**
 * 只剔注释（字符串与正则字面量**原样保留**）的掩码变体。
 *
 * 给"必须读字面量内容"的判据用（如文案空格守卫要读 `:has-text("…")` 里的标签）。
 * 刀口仍是同一台状态机——不得另写一份注释剥离逻辑，那正是本仓立过案的"两份实现必漂"。
 */
export function muteComments(src: string): string {
  return muteNonCode(src, { keepStrings: true, keepRegex: true })
}

/**
 * 按扩展名递归收文件（`collectMjs` 的泛化版，两者共用同一台遍历器）。
 *
 * 立意的原话是"两份实现必漂"：`.mjs` 与 `.vue` 各写一次递归，下一次加扩展名（`.ts` 视图守卫、
 * `.html` 模板）就会漂出第三份。`excludes` 默认沿用 `EXCLUDED_DIRS`。
 */
export function collectByExt(
  rootAbs: string,
  relDir: string,
  ext: string,
  excludes: Set<string> = EXCLUDED_DIRS
): string[] {
  const out: string[] = []
  const abs = relDir ? resolve(rootAbs, relDir) : rootAbs
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name
    if (ent.isDirectory()) {
      if (excludes.has(ent.name)) continue
      out.push(...collectByExt(rootAbs, rel, ext, excludes))
    } else if (ent.isFile() && ent.name.endsWith(ext)) {
      out.push(rel)
    }
  }
  return out.sort()
}

/** 递归收 `.mjs`（跳过产物与临时探针目录），返回相对 `rootAbs` 的路径并排序 */
export function collectMjs(rootAbs: string, relDir: string, excludes: Set<string> = EXCLUDED_DIRS): string[] {
  return collectByExt(rootAbs, relDir, '.mjs', excludes)
}

/**
 * HTML 注释 `<!-- … -->` 置空（**等长**、保留换行），未闭合时一直置空到文本末尾。
 *
 * 为什么必须单独一步：`muteNonCode` 那台状态机认的是 JS 的注释形状（`//`、`/* *\/`），
 * 而 `.vue` 模板里的注释是 `<!-- -->`——不含 `/`，机器看不见。HTML 注释里写一段
 * "旧写法长什么样"（`<!-- <div @click="go()"> -->`）是文档的常态，不剔掉就被当成真站点。
 */
export function blankHtmlComments(html: string): string {
  let out = ''
  let i = 0
  while (i < html.length) {
    const start = html.indexOf('<!--', i)
    if (start < 0) {
      out += html.slice(i)
      break
    }
    out += html.slice(i, start)
    const end = html.indexOf('-->', start + 4)
    const stop = end < 0 ? html.length : end + 3
    for (let k = start; k < stop; k++) out += html[k] === '\n' ? '\n' : ' '
    i = stop
  }
  return out
}

/** SFC 模板区间的切片结果；`lineOffset` = 区间起点之前已有多少行（换算绝对行号用） */
export interface VueTemplateSlice {
  /** 已剔 HTML 注释与 JS 注释、且**与原文等长**的模板文本 */
  code: string
  /** 绝对行号 = 区间内行号 + lineOffset */
  lineOffset: number
}

/**
 * 取出 `.vue` 的模板区间并做两层掩码：HTML 注释 → JS 注释（字符串**保留**，
 * 因为判据要读 `@click="collapsed = !collapsed"` 这类属性值）。
 *
 * 区间端点由 `<template>` 的**嵌套深度**推出，不按 `lastIndexOf('</template>')` 猜：
 * 后者会被 `<script>` 里一句 `'</template>'` 字符串或文档注释里的示例片段骗过去，
 * 把脚本段当成模板扫（多扫=可能误报），而深度扫描在结构坏掉时是"少扫并返回 null"——
 * 采集面为 0 会被各守卫自己的体量下限拦下（少扫不会静默放行）。
 * 返回 `null` = 该文件没有可识别的模板块。
 */
export function vueTemplateRegion(src: string): VueTemplateSlice | null {
  const start = src.search(/^<template[\s>]/m)
  if (start < 0) return null
  const re = /<(\/?)template\b/g
  re.lastIndex = start
  let depth = 0
  let end = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[1] === '/') {
      depth--
      if (depth === 0) {
        end = m.index
        break
      }
    } else {
      depth++
    }
  }
  if (end < 0) return null
  const code = blankHtmlComments(src.slice(start, end))
  let lineOffset = 0
  for (let i = 0; i < start; i++) if (src[i] === '\n') lineOffset++
  return { code: muteComments(code), lineOffset }
}

/** 索引处的 1-based 行号（掩码等长 ⇒ 报出来的行号可信） */
export function lineNumberAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/**
 * "点击语义"的属性名判据（`@click` / `@dblclick` / `@mousedown` / `@mouseup` / `@change`，
 * 含 `v-on:` 写法与任意修饰符尾巴）。
 *
 * 两把 a11y 守卫共用：一把判"挂了点击但键盘到不了"，一把判"切换展开态却没声明 aria-expanded"。
 * 事件集合各写一份，下一次加 `@pointerdown` 就只有一把守卫会跟上（两份实现必漂）。
 */
const CLICK_SEMANTIC_RE = /^(@|v-on:)(click|dblclick|mousedown|mouseup|change)(\.|$)/
export function isClickSemanticAttr(name: string): boolean {
  return CLICK_SEMANTIC_RE.test(name)
}

/**
 * 把合成站点插进 SFC 模板的最前面（紧跟 `<template>` 那一行）。
 *
 * 为什么不是"文件末尾追加"（`.mjs` 那两把守卫的做法）：`.vue` 的模板区间止于根 `</template>`，
 * 追加到文件末尾会落进 `<script>`/`<style>`，也就是落在采集面之外 ⇒ 差异法活性自证恒不成立，
 * 或者更糟——判据被改成"整文件扫描"从而开始把脚本当模板。
 */
export function plantInVueTemplate(src: string, snippet: string): string {
  return src.replace(/^(<template[\s>][^\n]*\r?\n)/, `$1${snippet}\n`)
}

/**
 * 只保留 `.vue` 里 `<script …>` … `</script>` 区间的原文，其余部分**等长置空**。
 *
 * 为什么模板与样式必须剔出采集面（而不是"多扫一点总没错"）：模板区间的属性值在 JS 状态机里
 * 是字符串，`muteNonCode` 会把它们整段抹掉，于是"模板里真的写了 `localStorage.x`"这一形状
 * 结构上永远看不见。但 Vue 3 的实例代理（`PublicInstanceProxyHandlers`）**不回落全局对象**，
 * 模板表达式取到的是 `undefined` —— 模板里写存储调用不是漏检，是不可能发生。
 * ⚠️ 这一前提由 `webStorage.guard.test.ts` 的"globalProperties 不得再挂存储"那条锁钉住：
 * 若有人往 `app.config.globalProperties` 里塞回 `$cache`/`localStorage` 这一族（M-12 刚清掉），
 * 本函数的取向就必须翻成"模板也进面"。
 *
 * 置空而非删除 ⇒ 行号仍然对得上原文（与掩码器同一条长度不变式）。
 */
export function blankOutsideVueScripts(src: string): string {
  const spans: Array<[number, number]> = []
  const re = /<script\b[^>]*>[\s\S]*?<\/script>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) spans.push([m.index, m.index + m[0].length])
  if (spans.length === 0) {
    // 没有脚本块（纯展示 SFC）：整个文件都不在面上，等长置空后掩码器仍返回等长结果
    return src.replace(/[^\n]/g, ' ')
  }
  let out = ''
  let cursor = 0
  for (const [start, end] of spans) {
    out += src.slice(cursor, start).replace(/[^\n]/g, ' ')
    out += src.slice(start, end)
    cursor = end
  }
  out += src.slice(cursor).replace(/[^\n]/g, ' ')
  return out
}

/**
 * 把合成站点插进 `.vue` 的**最后一个** `<script>` 块开头（紧跟开始标签那一行）。
 *
 * 与 `plantInVueTemplate` 同理但方向相反：插错区间（比如插进模板）会让活性自证恒不成立，
 * 而"恒不成立"的差异法活性正是最容易写错的形状。文件没有 script 块时原样返回 ⇒
 * 调用方必须自己断"确实插进去了"（`webStorage.guard.test.ts` 逐文件那条就是这么写的）。
 */
export function plantInVueScript(src: string, snippet: string): string {
  const re = /<script\b[^>]*>[^\n]*\r?\n/g
  let last: { index: number; lineEnd: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) last = { index: m.index, lineEnd: m.index + m[0].length }
  if (!last) return src
  return `${src.slice(0, last.lineEnd)}${snippet}\n${src.slice(last.lineEnd)}`
}

/** 一个 HTML 属性：`name` 含前导 `:`/`v-bind:`/`@`/`v-on:` 原样，`value` 为去掉外层引号的值 */
export interface TagAttr {
  name: string
  value: string
}

/**
 * 解析开始标签的属性串（引号感知）。
 *
 * 为什么不给判据直接拿正则扫整段属性文本：`v-html="'<div @click=x()>'"` 这类
 * **属性值里含标签形状文本**会被 `/@click=/` 读成一个站点（把数据当代码，同 ⑬ 的教训）。
 * 按属性名逐个切出来后，判据只看"这个标签自己挂了哪个属性"，值里的 markup 不参与。
 */
export function splitTagAttrs(attrs: string): TagAttr[] {
  const out: TagAttr[] = []
  let i = 0
  while (i < attrs.length) {
    while (i < attrs.length && /[\s/]/.test(attrs[i])) i++
    if (i >= attrs.length) break
    const nameStart = i
    while (i < attrs.length && attrs[i] !== '=' && !/\s/.test(attrs[i])) i++
    const name = attrs.slice(nameStart, i)
    if (!name) break
    let value = ''
    if (attrs[i] === '=') {
      i++
      const q = attrs[i]
      if (q === '"' || q === "'") {
        i++
        const vStart = i
        while (i < attrs.length && attrs[i] !== q) i++
        value = attrs.slice(vStart, i)
        i++
      } else {
        const vStart = i
        while (i < attrs.length && !/\s/.test(attrs[i])) i++
        value = attrs.slice(vStart, i)
      }
    }
    out.push({ name, value })
  }
  return out
}

/**
 * 遍历掩码后文本里的**开始标签**（`</div>`、`<!doctype`、`a < b` 都不算），
 * 回调给 `(标签名, 属性原文, 标签起始下标)`。
 *
 * 单一实现给两把 a11y 守卫共用：属性区用"未加引号的 `>` 收尾"，引号内的 `<`/`>` 当数据跳过，
 * 因此 `<p>他说"<div @click=x()>";</p>` 这种文本节点不会冒出一个假站点（文本区整段跳过）。
 * 遇到未加引号的 `<`（结构已坏）就地停在该标签并继续往后扫，宁可少扫一段也不吞掉后续。
 */
export function forEachStartTag(text: string, visit: (name: string, attrs: string, index: number) => void): void {
  let i = 0
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) return
    const next = text[lt + 1] ?? ''
    if (!/[A-Za-z]/.test(next)) {
      i = lt + 1
      continue
    }
    let j = lt + 1
    while (j < text.length && /[\w.-]/.test(text[j])) j++
    const name = text.slice(lt + 1, j)
    const attrsStart = j
    while (j < text.length) {
      const c = text[j]
      if (c === '"' || c === "'") {
        const q = c
        j++
        while (j < text.length && text[j] !== q) j++
        j++
        continue
      }
      if (c === '>' || c === '<') break
      j++
    }
    visit(name, text.slice(attrsStart, j), lt)
    i = Math.max(j + 1, lt + 1)
  }
}
