/**
 * 全屏切换——全仓唯一实现（b112）。
 *
 * ## 为什么需要单一通道
 *
 * `requestFullscreen()` / `exitFullscreen()` 返回的是 **Promise**，在下列情况下会 reject：
 * 不是用户手势、被 iframe 的 `allow="fullscreen"` 策略拒绝、浏览器禁止（Kiosk/移动端部分机型）、
 * 元素不可见。改造前 4 处调用点全都只写了 `?.()`（可选项链只挡"方法不存在"）或裸 `await`，
 * 拒绝无人接管 ⇒ `unhandledrejection`，而用户看到的是"按了快捷键/点了按钮，什么都没发生"。
 *
 * 同一族另外两种形态也在这里收口：
 * - `document.exitFullscreen` 在非全屏状态下调用会 reject（有的浏览器抛错），调用方不该各自判断；
 * - 目标是 `<iframe>` 内嵌部署时 `requestFullscreen` 可能根本不存在（可选链静默跳过）。
 *
 * 语义与 `utils/clipboard` / `webStorage` 一致：**返回布尔结局，绝不抛错**；
 * 由调用方决定提示文案（全屏失败必须可见——静默无反应正是本通道要消灭的形态）。
 */

/** 当前是否处于全屏（含 `document.fullscreenElement` 不存在的运行环境） */
export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement
}

/**
 * 切换全屏，返回是否真的切换成功。
 *
 * @param target 进入全屏的目标元素，默认 `document.documentElement`
 */
export async function toggleFullscreen(target?: Element): Promise<boolean> {
  if (typeof document === 'undefined') return false
  try {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen !== 'function') return false
      await document.exitFullscreen()
      return true
    }
    const el = (target ?? document.documentElement) as Element & {
      requestFullscreen?: () => Promise<void>
    }
    if (typeof el.requestFullscreen !== 'function') return false
    await el.requestFullscreen()
    return true
  } catch {
    // 拒绝原因（策略/手势/不可见）对用户没有可操作差异，统一由调用方提示"无法切换全屏"
    return false
  }
}
