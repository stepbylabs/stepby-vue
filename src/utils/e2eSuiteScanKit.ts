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

/** 递归收 `.mjs`（跳过产物与临时探针目录），返回相对 `rootAbs` 的路径并排序 */
export function collectMjs(rootAbs: string, relDir: string, excludes: Set<string> = EXCLUDED_DIRS): string[] {
  const out: string[] = []
  const abs = relDir ? resolve(rootAbs, relDir) : rootAbs
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name
    if (ent.isDirectory()) {
      if (excludes.has(ent.name)) continue
      out.push(...collectMjs(rootAbs, rel, excludes))
    } else if (ent.isFile() && ent.name.endsWith('.mjs')) {
      out.push(rel)
    }
  }
  return out.sort()
}
