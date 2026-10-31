/**
 * 「手写列表页」采集面的单一实现（b105 立、b119 扩）。
 *
 * 两条守卫都要判"哪些页面是自己取数的列表页"：失败态接线（b105）与
 * 竞态守卫 / 删空回退（b119）。同一个派生写两份必然漂（AGENTS ㉘），
 * 所以采集面、掩码口径与取数函数定界都收在这里。
 *
 * 派生判据（全部按事实，不维护文件清单）：
 * 1. 模板渲染 `<el-table>`（不是 `<el-table-column>`）；
 * 2. **不是** `useCrudTable` 调用方——那一路由组合子自己守卫，不双罚；
 * 3. 取数面二选一：
 *    - `isHandwrittenListPage`：自己声明了 `getList`（`function getList` / `const getList =`）
 *      —— 竞态守卫与删空回退用这一面，因为它的判据要**按名字取函数体**；
 *    - `isFetchingListPage`（b140）：值导入 `@/api/*` 且被 `await` —— 失败态接线用这一面，
 *      它不需要函数名，只看"这页发过请求"。
 *
 * 为什么两张面严格度不同（写在代码里而不是靠人记）：失败态判据是"绑定 + 出口"，
 * 换名不影响可判性，所以面可以放到最宽；竞态判据要定位取数函数体并逐块判票，
 * 目前只能按声明名取体。**放宽失败态面是零成本的覆盖增益；放宽竞态面要先给
 * "受约束面里没声明 `getList` 的那一部分页面"装上 `createLatestGuard`**，那是另一批的活
 * （按实登记为待办，不得静默当成已覆盖）。这一差集的条数与文件名由
 * `listEmptyLoadError.guard.test.ts` ⑦ 的打印行给 —— 注释不抄数，抄一次就漂一次。
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
 * 「自己取数的列表页」——**与函数名无关**的采集面（b140 新增，失败态守卫改用这一面）。
 *
 * 立案：原判据面写的是"声明了 `getList`"，而这个名字本身不是事实。实测
 * `src/views|components` 里渲染 `<el-table>` 且非 `useCrudTable` 的页面共 10 个，
 * 其中 4 个因为函数叫 `load` / `getCacheNames` / `loadEventCatalog` 而**整页不在视野内**
 * （`views/flow/designer/index.vue`、`views/monitor/cache/CacheKeys.vue`、
 * `views/system/user/authRole.vue`、`views/system/webHook/EventCatalogSection.vue`）。
 * 这 4 页恰好都已接线，所以今天没漏过缺陷——但那是运气：**名字规则永远落后于事实一种写法**
 * （与 `build-freshness` 那条"按 `#[cfg(test)] mod` 声明派生、不按目录名跳过"同族）。
 *
 * 事实是三条：渲染 el-table、**发了请求**（值导入的 `@/api/*` 且被 `await`）、不是组合子页。
 * `import type` 不计（类型导入不产生请求）；只渲染本地解析结果、从不请求的表格
 * （如 `components/ExcelImportDialog`：上传文件的解析预览）因此正确地留在面外。
 */
export function isFetchingListPage(masked: string): boolean {
  if (!rendersTable(masked) || CRUD_CALL_RE.test(masked)) return false
  const apiIdents = valueImportedApiNames(masked)
  if (apiIdents.length === 0) return false
  // `await ident(` / `await ident(...)`：请求确实被等待，说明有一条在途响应可能后发先回
  return apiIdents.some((n) => new RegExp(`\\bawait\\s+(?:[\\w.]+\\.)?${n}\\s*\\(`).test(masked))
}

/** 值导入（排除 `import type`）自 `@/api/*` 的绑定名 */
export function valueImportedApiNames(masked: string): string[] {
  const out: string[] = []
  const re = /import\s+(?!type\s)(?:([\s\S]*?)\s+from\s+)?['"]@\/api\/[^'"]+['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(masked))) {
    const clause = m[1]
    if (!clause) continue
    const braces = clause.match(/\{([\s\S]*)\}/)
    const inner = braces ? braces[1] : clause
    for (const part of inner.split(',')) {
      const token = part.trim()
      if (!token || token.startsWith('type ')) continue
      const asSplit = token.split(/\s+as\s+/)
      const name = (asSplit.length > 1 ? asSplit[1] : asSplit[0]).trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push(name)
    }
  }
  return out
}

/**
 * 失败路径上被写入的 ref 名（单一实现，b140）。
 *
 * 为什么需要它：失败态的**合法形态不止一种**——`ListEmpty` 的 `:load-error`、
 * 表格上方的 `el-alert type="error"`、卡片内的失败占位 `v-if` 都算"用户能看见失败"。
 * 判据如果只认 `:load-error="loadError"` 这一种写法，就会把已经做对的页面判成违规
 * （b140 实测：放宽采集面后 8 个"违规"里 5 个是这种假阳性，页面用的是 alert 分支）。
 * 于是判据改成问**事实**：catch 路径有没有写一个 ref，那个 ref 有没有被模板消费。
 *
 * 只认两种失败路径形状（都从 `catch` 这个词出发，块体按括号/花括号配对取）：
 * ① `try { … } catch (e) { X.value = … }`；② `foo().catch(() => { X.value = … })`
 *    与 `foo().catch(() => (X.value = true))`（表达式回调同样进面）。
 */
export function failureFlagNames(scriptMasked: string): string[] {
  const names = new Set<string>()
  const collect = (region: string) => {
    for (const m of region.matchAll(/\b([A-Za-z_$][\w$]*)\.value\s*=(?!=)/g)) names.add(m[1])
  }
  const balanced = (text: string, openIdx: number, open: string, close: string): string | null => {
    if (text[openIdx] !== open) return null
    let depth = 0
    for (let i = openIdx; i < text.length; i += 1) {
      if (text[i] === open) depth += 1
      else if (text[i] === close) {
        depth -= 1
        if (depth === 0) return text.slice(openIdx, i + 1)
      }
    }
    return null
  }
  for (const m of scriptMasked.matchAll(/\bcatch\b/g)) {
    let j = (m.index ?? 0) + 'catch'.length
    const skipSpace = () => {
      while (j < scriptMasked.length && /\s/.test(scriptMasked[j])) j += 1
    }
    skipSpace()
    // `catch (e)` 的参数括号先整组吃掉，再找块体（吃掉之后 j 落在 `)` 之后）
    if (scriptMasked[j] === '(') {
      const head = balanced(scriptMasked, j, '(', ')')
      if (!head) continue
      j += head.length
      skipSpace()
    }
    const block = balanced(scriptMasked, j, '{', '}')
    if (block) collect(block)
  }
  for (const m of scriptMasked.matchAll(/\.catch\s*\(/g)) {
    const at = (m.index ?? 0) + m[0].length - 1
    const cb = balanced(scriptMasked, at, '(', ')')
    if (cb) collect(cb)
  }
  return [...names]
}

/** `<script>` 之前的模板区（HTML 注释已由调用方置空）；没有脚本块时整份当模板 */
export function templateRegion(masked: string): string {
  const start = masked.search(/<script\b[^>]*>/)
  return start < 0 ? masked : masked.slice(0, start)
}

/**
 * 页面是否**把失败显示出来了**：catch 路径写入的某个 ref 被模板消费。
 *
 * 判据方向取"至少要有一条"——一个页面只需要一个失败出口就能区分"失败"与"没有数据"；
 * 逐张表格各自的失败出口属于更严的块级判据（①），两腿不互顶。
 *
 * 这一条按"标识符同名"配对，因此只认得**直接把 ref 写在 catch 里**的页面；
 * 把失败态装进对象/辅助函数（`mark.value = true`）的合法写法它看不见——
 * 那是写法而不是事实，所以另有一条 `hasFailureAffordance`（模板锚定）与之取或。
 */
export function showsFailureState(maskedScript: string, maskedTemplate: string): boolean {
  return failureFlagNames(maskedScript).some((n) => new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(maskedTemplate))
}

/** 开始标签扫描：属性值里的 `>` 不得截断标签（`v-if="a > b"` 是真实存在的写法） */
function openTags(text: string, name: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(new RegExp(`<${name}\\b`, 'gi'))) {
    let i = (m.index ?? 0) + m[0].length
    let quote: string | null = null
    while (i < text.length) {
      const ch = text[i]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        out.push(text.slice(m.index, i + 1))
        break
      }
      i += 1
    }
  }
  return out
}

const NON_STATE_TOKENS = new Set(['true', 'false', 'null', 'undefined', 'and', 'or', 'in', 'of', 'new', 'typeof'])

/**
 * 模板表达式里绑的这个标识符，**脚本到底有没有驱动它**。
 *
 * 三条合法来源（缺一即"死出口"——`v-if="false 的 ref"` 也能把判据骗过去）：
 * ① 真赋值 `X.value = …` / `X = …`（`const X = ref(false)` 这种**声明**不算，
 *    否则"声明了但从不写"的死标志也算接线）；
 * ② 作为裸实参传给别的函数（`loadList('todo', …, todoLoadError, todoLastSuccessAt)`
 *    ——流程页四个 tab 共用一个加载骨架，写的就是形参名）；
 * ③ `.value` 出现在读写两侧之外不必再判：①已覆盖直接写与模板同名的常见形状。
 */
function isDrivenFromScript(name: string, maskedScript: string): boolean {
  const esc = name.replace(/\$/g, '\\$')
  for (const m of maskedScript.matchAll(new RegExp(`\\b${esc}(\\.value)?\\s*=(?!=)`, 'g'))) {
    const before = maskedScript.slice(Math.max(0, (m.index ?? 0) - 24), m.index)
    if (!/\b(?:const|let|var)\s+$/.test(before)) return true
  }
  return new RegExp(`[,\\s(]\\s*${esc}\\s*[,)]`).test(maskedScript)
}

/**
 * 模板里的**失败出口**是否存在，且该出口绑的是脚本驱动的状态（b140 项8）。
 *
 * 为什么需要第二条腿：`showsFailureState` 靠"catch 里写的标识符 == 模板读的标识符"配对，
 * 于是"失败态装进对象 / 由共用骨架写回"这类合法写法会被判成违规（同一缺陷在 b113 的
 * 轮询守卫上已经踩过一次：**判据按写法建，换一种写法就漏或就假阳性**）。
 * 出口形状只认两种"用户能看见失败"的载体：
 * ① `list-empty` 的 `:load-error`（组件契约上自带失败分支与重试入口）；
 * ② `el-alert` 带 `v-if`，且要么 `type="error"`、要么文案点名失败
 *    （`common.loadFailed` / `common.staleDataHintAt`）。
 * 两条都要求绑定的表达式里**至少有一个标识符被脚本驱动**（`isDrivenFromScript`）——否则
 * `v-if="false 的 ref"` 这种死出口也算接线，判据就恒绿了。
 *
 * ②刻意不接受"warning 档 + 与失败无关的文案"：流程页那条 `v-if="pendingCount > 0"`
 * 的待办提醒正是 warning 档，认它会让"刷新失败屏上仍是旧数据且毫无提示"这一真实缺陷
 * 继续躲过判据。
 */
export function hasFailureAffordance(maskedTemplate: string, maskedScript: string): boolean {
  const wired = (expr: string) =>
    [...expr.matchAll(/[A-Za-z_$][\w$]*/g)].some((m) => {
      const n = m[0]
      return !NON_STATE_TOKENS.has(n) && isDrivenFromScript(n, maskedScript)
    })

  for (const tag of [...openTags(maskedTemplate, 'list-empty'), ...openTags(maskedTemplate, 'ListEmpty')]) {
    const bound = /(?:^|\s):load-error="([^"]*)"/.exec(tag)
    if (bound && wired(bound[1])) return true
  }
  for (const tag of openTags(maskedTemplate, 'el-alert')) {
    const cond = /(?:^|\s)v-if="([^"]*)"/.exec(tag)
    if (!cond || !wired(cond[1])) continue
    if (/type="error"/.test(tag)) return true
    if (/common\.(?:loadFailed|staleDataHintAt)/.test(tag)) return true
  }
  return false
}

/** `const X = await …` / `X = await …` 形式里承接请求结果的局部标识符 */
export function awaitedResultNames(maskedScript: string): string[] {
  const out = new Set<string>()
  for (const m of maskedScript.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*await\b/g)) out.add(m[1])
  return [...out]
}

/**
 * 表格行集是否可能来自请求结果（b140 项8 的采集面前置条件）。
 *
 * 立案：放宽后的面把 `views/tool/gen/createTable.vue` 也抓了进来——它是建表弹窗，
 * `<el-table :data="form.columns">` 的行集由用户逐条录入（`push` / 硬编码默认列），
 * `await createTable(...)` 是**提交**而不是取数，失败已经由 `modal.msgError` 报出。
 * 给它装失败态 = 为一个不会发生的形状编理由（前言 ⑯(c)）。
 *
 * 前置条件因此写成事实：**页面把请求结果写进了响应式状态**。四种真实形状取或
 * （宁可多算，绝不少算——这一条只负责"页面根本不取数"的排除，不负责判红）：
 * ① `X.value = await …`；② `X.value = <结果标识符>.…`；
 * ③ `.then(` 回调体内写 `.value`；④ 裸 `:data="X"` 的 X 在脚本里被赋值或作为实参传给取数骨架
 *    （流程页四个 tab 共用一个 `loadList(key, loader, rows, total)`，写的是形参名）。
 */
export function rowsFedFromRequest(maskedTemplate: string, maskedScript: string): boolean {
  if (/\.value\s*=\s*await\b/.test(maskedScript)) return true
  if (
    awaitedResultNames(maskedScript).some((n) =>
      new RegExp(`\\.value\\s*=\\s*[^;{\\n]*\\b${n.replace(/\$/g, '\\$')}\\s*[.[]`).test(maskedScript)
    )
  ) {
    return true
  }
  if (/\.then\s*\([^]*?\.value\s*=/.test(maskedScript)) return true
  const bareData = [...maskedTemplate.matchAll(/:data="([A-Za-z_$][\w$]*)"/g)].map((m) => m[1])
  return bareData.some((n) => {
    const esc = n.replace(/\$/g, '\\$')
    return (
      new RegExp(`\\b${esc}\\.value\\s*=`).test(maskedScript) ||
      new RegExp(`[,\\s(]\\s*${esc}\\s*[,)]`).test(maskedScript)
    )
  })
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
