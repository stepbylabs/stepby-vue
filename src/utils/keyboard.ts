/**
 * 键盘事件的单一口径（b114）
 *
 * 立的案（真机取证，`tests/e2e/_tmp/probe-b114-hotkeys3.mjs`）：
 * ① 在「用户名称」搜索框里按 `?` ⇒ **弹出「键盘快捷键」模态框且 `?` 根本没进入输入框**
 *   （`helpDialogCount=1`、`inputValue=""`）——快捷键在 keydown 就抢走了焦点，字符随之丢失；
 * ② 同一个输入框里按 `Ctrl+Shift+D` ⇒ **整站切到暗色**；`Alt+T` ⇒ **主题色被换掉**
 *   （输入法/编辑器里这些键另有含义）；
 * ③ 输入法组合态下按 Enter ⇒ **发出 3 次 `/system/user/list` 请求**
 *   （用户只是想把候选词上屏，却触发了一次查询）。
 *
 * 两条统一口径，各自只住一处：
 * - **全局快捷键必须尊重焦点**：焦点在可编辑目标里时不触发（判定 `isEditableTarget`）；
 * - **输入法组合态的 Enter/Escape 属于输入法**：
 *   - keyup 层**吞掉**（`stopPropagation`）：组件里的 `@keyup.enter`（全仓 140 处 enter 处理器，
 *     其中约 50 处挂在列表搜索框上）与 `@keyup.esc` 无需逐站点改造；
 *   - keydown 层**只拦 Escape 且只 stopPropagation**：Element Plus 的对话框/抽屉/下拉
 *     在 **document 级 keydown** 上关自己（`hooks/use-escape-keydown` 不判组合态），
 *     而"取消候选词"的 Esc 恰好也是 keydown ⇒ 不拦就会连对话框一起关掉、已填内容全丢。
 *     实测（CDP `Input.imeSetComposition` + 真实 Esc，`probe-b114-ime-escape2.mjs`）：
 *     组合态 Esc 的 keydown 带 `isComposing=true`、EP 照常关闭对话框（`imeEscapeCloses=true`）。
 *
 * 为什么是**捕获阶段**、而不是逐站点加判断：
 * - `keyup` 不承载默认动作（Enter 在 textarea 换行、候选词上屏都由浏览器/输入法负责），
 *   吞掉它不会破坏输入；而 `keydown` 上 `preventDefault` 会**打断候选词提交**（部分内核），
 *   所以本模块在 keydown 上**从不 preventDefault**，只停传播；
 * - `compositionend` 在 Chrome 里**先于** Enter 的 keyup 发生（keydown → compositionend → keyup，
 *   且 keyup 的 `isComposing` 已是 false）⇒ 只判 `isComposing` 会漏掉真正的「上屏回车」，
 *   必须额外记一个短暂的尾窗（`IME_TAIL_MS`，同一物理按键的 keyup 在几个毫秒内到）；
 *   该尾窗**只用于 keyup**——Escape 的 keydown 发生在 compositionend **之前**，把它套进去
 *   会把"用户刚取消组合、紧接着关对话框"的那次 Esc 一起吞掉；
 * - 逐站点改 140 处是永久税：漏一处就复现，且新增页面会再漏。
 *
 * 反过来，**Enter 的 keydown** 仍由需要它的处理器自己判 `isImeComposing(e)`（命令面板的
 * Enter 执行、Esc 关闭）——那里我们是"不要执行动作"，且 Enter 的 keydown 不能停传播
 * （表单/输入法都要用它），不能靠全局捕获代劳。
 */

/** 可编辑目标：能接收文本输入的元素（含 Element Plus 的只读筛选输入框与富文本宿主） */
export const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'

/** 该元素（或其祖先）是否是文本输入面 */
export function isEditableElement(el: Element | null | undefined): boolean {
  if (!el || typeof el.closest !== 'function') return false
  return el.closest(EDITABLE_SELECTOR) !== null
}

/**
 * 事件目标是否落在文本输入面里。
 * 用 `closest` 鸭子判断而非 `instanceof Element`：跨 iframe/跨 realm 的节点 `instanceof` 会假阴。
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return isEditableElement(target as Element)
}

/**
 * 键盘事件是否仍处于输入法组合态。
 * `keyCode === 229` 是「输入法正在处理这个按键」的历史信号（Chrome 组合态 keydown 会给 229）。
 */
export function isImeComposing(e: { isComposing?: boolean; keyCode?: number }): boolean {
  return e.isComposing === true || e.keyCode === 229
}

/** 全局快捷键的忽略判据：按键落在输入面里，或当前焦点本身就在输入面里 */
export function shouldIgnoreGlobalHotkey(target: EventTarget | null, active: Element | null): boolean {
  return isEditableTarget(target) || isEditableElement(active)
}

/** 组合态需要吞掉 keyup 的按键：上屏回车与取消组合的 Esc */
const IME_GUARD_KEYS = new Set(['Enter', 'Escape'])

/**
 * 同一物理按键的 keyup 通常紧跟 compositionend（实测个位数毫秒）。
 * 50ms 足够覆盖「下一条按键不可能来自同一次按下」，也不会伤到用户紧接着按的第二次 Enter。
 */
const IME_TAIL_MS = 50

/**
 * 安装输入法按键守卫（应用生命周期内一次）。返回卸载函数（单测用）。
 *
 * keyup：可编辑目标上的 Enter / Escape，组合进行中或刚结束（`IME_TAIL_MS` 内）⇒ 吞掉。
 * keydown：可编辑目标上**正在组合**的 Escape ⇒ 只停传播（不 preventDefault）。
 *   — Element Plus 的对话框/抽屉/下拉在 document 级 keydown 上关自己，不判组合态；
 *   — Enter 的 keydown 刻意不拦：输入法提交候选词、表单默认提交都要它。
 */
export function installImeKeyGuard(doc: Document = document, win: Window = window): () => void {
  let composing = false
  let suppressUntil = 0

  const onCompositionStart = (): void => {
    composing = true
  }
  const onCompositionEnd = (): void => {
    composing = false
    suppressUntil = Date.now() + IME_TAIL_MS
  }
  // 元素在组合中被移除/失焦时浏览器可能不补 compositionend ⇒ 不能把 composing 永久钉在 true
  const onFocusOut = (): void => {
    composing = false
  }
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    if (!isEditableTarget(e.target)) return
    // 这里刻意不套 IME_TAIL_MS：Escape 的 keydown 在 compositionend 之前，
    // 尾窗只描述"同一次上屏按键的 keyup"，套到 keydown 上会吞掉用户紧接着的关窗动作。
    if (!composing && !isImeComposing(e)) return
    e.stopPropagation()
    e.stopImmediatePropagation()
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    if (!IME_GUARD_KEYS.has(e.key)) return
    if (!isEditableTarget(e.target)) return
    if (!composing && !isImeComposing(e) && Date.now() >= suppressUntil) return
    e.stopPropagation()
    e.stopImmediatePropagation()
  }

  doc.addEventListener('compositionstart', onCompositionStart, true)
  doc.addEventListener('compositionend', onCompositionEnd, true)
  doc.addEventListener('focusout', onFocusOut, true)
  win.addEventListener('keydown', onKeyDown, true)
  win.addEventListener('keyup', onKeyUp, true)

  return () => {
    doc.removeEventListener('compositionstart', onCompositionStart, true)
    doc.removeEventListener('compositionend', onCompositionEnd, true)
    doc.removeEventListener('focusout', onFocusOut, true)
    win.removeEventListener('keydown', onKeyDown, true)
    win.removeEventListener('keyup', onKeyUp, true)
  }
}
