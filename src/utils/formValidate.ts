import { nextTick } from 'vue'
import type { FormInstance } from 'element-plus'

/**
 * Element Plus 表单校验的统一入口（批七十九 P1）。
 *
 * 缺陷形态：`async function submit() { await formRef.value?.validate(); ... }`。
 * EP 的**零参 `validate()`** 在校验失败时返回**被拒绝的 Promise**（拒绝值是字段错误对象），
 * 裸 `await` 让拒绝逸出点击处理器 ⇒ unhandledrejection ⇒ 被布局层 ErrorBoundary 捕获，
 * 整个子树（含正在填写的对话框）被换成错误兜底。用户看到的不是"哪一格没填"，
 * 而是"点了确定，表单整块消失、什么都没保存"。
 *
 * 真机取证（b79 M87 流程待办「提交请假单」，标题留空点确定）：
 * `console=[error] [ErrorBoundary] ... info: https://vuejs.org/error-reference/#runtime-6`
 * ——`runtime-6` 即 `ErrorCodes.COMPONENT_EVENT_HANDLER`，正是"组件事件处理器里抛出的异常"；
 * 同时刻 `.el-form-item__error` 数量为 0，因为红字连同表单一起被卸载了。
 *
 * 本仓另有两处**已正确**的写法可作对照：
 * `views/monitor/ip-location/index.vue`（`.validate().catch(() => false)` + 注释点名该风险）、
 * `composables/useCrudTable.ts`（回调形式 `validate(cb)`，EP 内部不拒绝）。
 * 统一收敛到本函数后，"校验失败必须安静地返回 false" 只有一处实现。
 *
 * 返回 false 的两种情形都**不得继续提交**：校验未通过、表单实例尚未挂载
 * （后者取自上面两处正确站点的既有约定 `if (!formRef.value) return`——
 * 表单没挂载就没有校验依据，放行等于提交未校验数据）。
 */

/** 视口边缘的安全余量：刚好贴边也算"看不清"，滚动一次比让用户自己找便宜 */
export const VIEWPORT_MARGIN_PX = 16

export interface FocusScope {
  $el?: unknown
}

/**
 * 错误字段是否在视口之外（纯函数，便于双向测试）。
 *
 * 判据取"四边任一越界"，不是只判上下：宽表在窄屏被横向截断时，红字同样在屏幕外。
 * 视口尺寸取不到（`0×0`，如隐藏文档或测试环境无布局）时返回 false——
 * **宁可不滚动，也不要基于一个假尺寸乱滚**（`NaN > 0` 恒 false 的同一条纪律）。
 */
export function isOutOfViewport(
  rect: { top: number; bottom: number; left: number; right: number },
  viewport: { width: number; height: number },
  margin: number = VIEWPORT_MARGIN_PX
): boolean {
  if (!(viewport.width > 0) || !(viewport.height > 0)) return false
  return (
    rect.top < margin ||
    rect.left < margin ||
    rect.bottom > viewport.height - margin ||
    rect.right > viewport.width - margin
  )
}

/**
 * 校验失败后定位到第一个错误字段并聚焦（UX：长表单不必手动找红字）。
 *
 * b132：从 `useCrudTable` 提到这里，成为**唯一实现**。此前只有组合子的弹窗表单享受
 * 这个定位，5 个手写 `validateForm` 页面失败时既不滚动也不聚焦——长表单里红字在屏幕外，
 * 用户看到的只是"点了没反应"。收敛后由 `validateForm` 直接调用，所有站点一次覆盖。
 *
 * 作用域优先取 `formRef.$el`：多个对话框叠着时，按文档顺序找"第一个 is-error"
 * 会跳到另一个表单身上（错误定位比不定位更坏）。
 *
 * 已在视口内的字段**不滚动**（只聚焦）：用户看得见红字时页面跳动纯属干扰。
 * 聚焦用 `preventScroll` 是为了不打断 smooth 滚动，否则浏览器会先"瞬移"一次。
 */
export async function focusFirstError(scope?: FocusScope | null): Promise<HTMLElement | null> {
  await nextTick()
  if (typeof document === 'undefined') return null
  const el = scope?.$el
  const root: ParentNode = el instanceof HTMLElement ? el : document
  const item = root.querySelector<HTMLElement>('.el-form-item.is-error')
  if (!item) return null
  const rect = item.getBoundingClientRect()
  const outOfView = isOutOfViewport(rect, {
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight
  })
  if (outOfView && typeof item.scrollIntoView === 'function') {
    item.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  // 优先真正的可编辑控件；`[tabindex]` 只做兜底（EP 的部分复合控件把焦点放在包装 div 上）。
  // 反例（b132 实测）：把四者写进同一个选择器列表时，`querySelector` 按**文档顺序**取首个命中，
  // 于是一个更靠前的 `div[tabindex]` 会抢走焦点 —— 用户看到的是"定位到了却没有光标"。
  const field =
    item.querySelector<HTMLElement>('input, textarea, select, [contenteditable="true"]') ??
    item.querySelector<HTMLElement>('[tabindex]:not([tabindex="-1"])')
  field?.focus?.({ preventScroll: true })
  return item
}

export async function validateForm(formRef?: FormInstance | null): Promise<boolean> {
  if (!formRef) return false
  try {
    await formRef.validate()
    return true
  } catch {
    // 校验失败：EP 已在各字段下方渲染红字提示，这里负责两件事——
    // ① 不让拒绝逸出（b79 的立案）；② 把第一个错误字段滚进视口并聚焦（b132）。
    await focusFirstError(formRef)
    return false
  }
}
