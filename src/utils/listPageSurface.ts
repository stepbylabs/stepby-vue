/**
 * 「手写列表页」采集面的单一实现（b105 立、b119 扩）。
 *
 * 两条守卫都要判"哪些页面是自己取数的列表页"：失败态接线（b105）与
 * 竞态守卫 / 删空回退（b119）。同一个派生写两份必然漂（AGENTS ㉘），
 * 所以采集面、掩码口径与取数函数定界都收在这里。
 *
 * 派生判据（全部按事实，不维护文件清单）：
 * 1. 自己声明了 `getList`（`function getList` / `async function getList` / `const getList =`）；
 * 2. 模板渲染 `<el-table>`（不是 `<el-table-column>`）；
 * 3. **不是** `useCrudTable` 调用方——那一路由组合子自己守卫，不双罚。
 *
 * 已知局限（按实登记）：只认 `getList` 这个名字。改名成 `loadList` 的页面
 * （如 `views/system/file/index.vue`，它是 `useCrudTable` 页，不在本面）不会自动进面。
 * 判据的价值不在于"覆盖所有页面"，而在于**新增手写列表页必须走同一套纪律**；
 * 真出现别名形态时，第一条断言的体量下限会把"面无端缩小"先报出来。
 */
import { muteNonCode } from '@/utils/e2eSuiteScanKit'

/** 组合子调用形态：泛型尖括号或直接圆括号；裸 import 名 / 路径字符串 / 注释文本都不算 */
export const CRUD_CALL_RE = /\buseCrudTable\s*[<(]/

/** HTML 注释等长置空（保留换行，行号可信）；注释里的反例不是代码 */
export function blankHtmlComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * 模板 + 脚本一起看的掩码：HTML 注释与 JS 注释置空，**字符串保留**
 * （空态绑定、`:load-error="loadError"` 这类判据就长在模板属性字符串里）。
 * keepRegex 让模板里 `/>`、`</el-table>` 的 `/` 不被当成正则起点。
 */
export function maskVueSource(raw: string): string {
  return muteNonCode(blankHtmlComments(raw), { keepStrings: true, keepRegex: true })
}

/** 只看脚本块的代码掩码（字符串与注释都置空）：用于函数体定界，`${}` / 引号里的花括号不得干扰配对 */
export function maskVueScript(raw: string): string {
  const start = raw.search(/<script\b[^>]*>/)
  if (start < 0) return ''
  const open = raw.indexOf('>', start) + 1
  const close = raw.indexOf('</script>', open)
  if (close < 0) return ''
  const body = raw.slice(open, close)
  const padded = raw.slice(0, open).replace(/[^\n]/g, ' ') + body + raw.slice(close).replace(/[^\n]/g, ' ')
  return muteNonCode(padded)
}

export function declaresGetList(masked: string): boolean {
  return /\b(?:async\s+)?function\s+getList\b|\bconst\s+getList\s*=/.test(masked)
}

export function rendersTable(masked: string): boolean {
  return /<el-table(?!-)/.test(masked)
}

export function isHandwrittenListPage(masked: string): boolean {
  return rendersTable(masked) && declaresGetList(masked) && !CRUD_CALL_RE.test(masked)
}

/**
 * 取 `getList` 的函数体（含花括号）。找不到声明返回 null；
 * 声明存在但花括号不配对也返回 null——调用方必须把 null 当"输入坏了"响亮失败，
 * 不得当"没有违规"（否则判据的输入一坏就恒绿）。
 */
export function functionBody(scriptMasked: string, name: string): string | null {
  const patterns = [
    new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`),
    new RegExp(`\\bconst\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`)
  ]
  for (const re of patterns) {
    const m = re.exec(scriptMasked)
    if (!m) continue
    const open = scriptMasked.indexOf('{', m.index + m[0].length)
    if (open === -1) return null
    let depth = 0
    for (let i = open; i < scriptMasked.length; i += 1) {
      const ch = scriptMasked[i]
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) return scriptMasked.slice(open, i + 1)
      }
    }
    return null
  }
  return null
}
