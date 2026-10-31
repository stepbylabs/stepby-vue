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

/**
 * 从拒绝值里读 HTTP 状态码（b140，单一实现）。
 *
 * 为什么需要它：拦截器对不同状态走**不同**的 reject 形状——401 是
 * `sessionExpiredError()` 造的 `Error`（只有 `httpStatus`，没有 `response`，见 `request.ts`
 * 顶部那段"消费侧夹具与产出侧形状不一致"的教训），其余分支原样透出 axios error
 * （`response.status`）。页面里各写各的读法必然漏掉一支：租户导航页就把"任何失败"
 * 一律当成 403 能力位关闭（用户被误导去要求开启一个本来已开启的功能）。
 *
 * 方向：拿不到状态记 **0**（"无法证明是哪一类失败"），不得回落 200 或 500——
 * 取不到被读成一个具体结论，与 `Number(null) === 0`、`NaN > 容差` 恒 false 同族。
 */
export function httpStatusOf(err: unknown): number {
  if (typeof err !== 'object' || err === null) return 0
  const e = err as { response?: { status?: unknown }; httpStatus?: unknown; status?: unknown }
  const raw = e.response?.status ?? e.httpStatus ?? e.status
  const n = Number(raw)
  return Number.isInteger(n) && n >= 100 && n <= 599 ? n : 0
}
