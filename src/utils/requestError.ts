/**
 * 请求层拒绝的分类标记（批一百零三）——单一事实源。
 *
 * 背景：`AppMain` 用 `ErrorBoundary` 包住整棵页面树，任何**未被页面捕获**的异步拒绝都会
 * 触发整页卸载。接口失败与"用户取消确认框"都不是渲染错误，不该把页面变成"页面加载失败"。
 *
 * 两件事必须同源：
 * - **产出侧**（`utils/request.ts` 的末位响应拦截器）给每个从请求链逸出的拒绝打标记；
 * - **消费侧**（`components/ErrorBoundary`）按标记分类。
 *
 * 分成独立模块而不是从 `request.ts` 导出：边界组件只依赖这两个谓词，不必把 axios
 * 与整条拦截器链拖进它的依赖图（也让单测不需要加载请求层）。
 */

export const REQUEST_ERROR_FLAG = '__stepbyRequestError'

/** 给拒绝值打上"出自请求层"标记（对象冻结等极端情况下静默失败，不影响请求本身） */
export function markRequestLayerError(err: unknown): void {
  if (typeof err !== 'object' || err === null) return
  try {
    ;(err as Record<string, unknown>)[REQUEST_ERROR_FLAG] = true
  } catch {
    // 打不上标记时边界按未知错误保守处理
  }
}

/** 该拒绝是否出自请求层（已由拦截器向用户提示 / 属于接口失败语义） */
export function isRequestLayerError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as Record<string, unknown>)[REQUEST_ERROR_FLAG] === true
}

/** Element Plus 确认框/输入框的"用户取消"拒绝值（`'cancel'` 取消 / `'close'` 关闭） */
const DIALOG_CANCEL_VALUES = new Set(['cancel', 'close'])

/** 该拒绝是否只是用户取消了对话框（正常分支，既非错误也不该卸载页面） */
export function isDialogCancel(err: unknown): boolean {
  return typeof err === 'string' && DIALOG_CANCEL_VALUES.has(err)
}
