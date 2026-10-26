import modal from '@/plugins/modal'

/**
 * 确认框的布尔化出口。
 *
 * Element Plus 的 `confirm` 在用户取消/关闭时返回 **rejected** Promise；
 * 在 `async` 事件处理器里直接 `await` 会逸出成 `unhandledrejection`，被全局
 * errorReporter 写进前端错误监控（b94 实测租户/SCIM 等页面如此）。本函数把
 * "取消"折叠成 `false`，调用方只需判断布尔值，不必为取消写 catch。
 *
 * 真正的接口失败仍由各自调用点的 try/catch 处理（拦截器负责提示）。
 */
export async function confirmAction(content: string): Promise<boolean> {
  try {
    await modal.confirm(content)
    return true
  } catch {
    return false
  }
}
