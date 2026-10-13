/**
 * TierA-1: 顶部进度条管理器
 *
 * 设计说明：
 * - 使用计数器管理并发请求/路由切换，避免提前 done() 导致进度条闪烁
 * - 路由切换 beforeEach + axios 请求都会 startProgress()，counter 递增
 * - 路由切换 afterEach + axios 响应都会 doneProgress()，counter 递减
 * - 仅当 counter 归零时才真正调用 NProgress.done()
 * - 防御性编程：超时保险（35s 后强制 done），避免任何漏调 done 导致进度条卡死
 *
 * 使用场景：
 *   - 路由守卫（permission.ts）：beforeEach startProgress()，afterEach doneProgress()
 *   - axios 请求（request.ts）：request 拦截器 startProgress()，response 拦截器 doneProgress()
 */
import NProgress from 'nprogress'

NProgress.configure({ showSpinner: false, trickleSpeed: 200 })

// P2 修复：保险时间 35s（原 10s），须大于 axios 请求超时（30s，见 request.ts）。
// 否则长请求仍在进行时进度条已强制归零，用户看到进度条提前"完成"。
const PROGRESS_SAFETY_TIMEOUT_MS = 35000

let counter = 0
let safetyTimer: ReturnType<typeof setTimeout> | null = null

/** 启动进度条（计数器 +1，首次 +1 时真正 start） */
export function startProgress(): void {
  counter++
  if (counter === 1) {
    NProgress.start()
    // 安全保险：35s 后强制归零，避免任何漏调 done 导致进度条卡死
    if (safetyTimer) clearTimeout(safetyTimer)
    safetyTimer = setTimeout(() => {
      counter = 0
      NProgress.done()
      safetyTimer = null
    }, PROGRESS_SAFETY_TIMEOUT_MS)
  }
}

/** 完成进度条（计数器 -1，归零时真正 done） */
export function doneProgress(): void {
  if (counter > 0) counter--
  if (counter <= 0) {
    counter = 0
    if (safetyTimer) {
      clearTimeout(safetyTimer)
      safetyTimer = null
    }
    NProgress.done()
  }
}

/** 是否还有 pending 进度（用于路由 afterEach 判断） */
export function hasPendingProgress(): boolean {
  return counter > 0
}
