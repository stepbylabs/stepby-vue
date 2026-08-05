/**
 * 安全 i18n 翻译兜底
 *
 * 背景：布局区组件位于 ErrorBoundary 之外，若 `t()` 遇到缺失 key 或
 * 报文编译异常（如翻译值含非法占位符）会直接抛出，导致 App.vue 崩溃 /500。
 *
 * `safeT` 在以下情况返回兜底值而非抛出：
 *  1. key 不存在（te 校验失败）→ 返回 fallback ?? key
 *  2. 翻译过程抛出异常（编译/插值错误）→ 捕获后返回 fallback ?? key
 *
 * 注意：本函数直接调用全局 i18n 实例，与布局区 `useI18n()` 取到的全局
 * Composer 等价，且会随 `locale` 变化保持响应式（在模板/computed/watch
 * 中调用即建立依赖）。
 */
import i18n from '@/i18n'

// 重载 1：带显式 fallback（可选命名参数）
export function safeT(key: string, fallback?: string, named?: Record<string, unknown>): string
// 重载 2：仅命名参数（与 vue-i18n 的 t(key, named) 用法一致）
export function safeT(key: string, named?: Record<string, unknown>): string
// 实现签名
export function safeT(key: string, ...args: unknown[]): string {
  let fallback: string | undefined
  let named: Record<string, unknown> | undefined

  if (args.length === 1) {
    if (typeof args[0] === 'string') {
      fallback = args[0]
    } else if (args[0] && typeof args[0] === 'object') {
      named = args[0] as Record<string, unknown>
    }
  } else if (args.length >= 2) {
    if (typeof args[0] === 'string') fallback = args[0]
    if (args[1] && typeof args[1] === 'object') named = args[1] as Record<string, unknown>
  }

  try {
    if (i18n.global.te(key)) {
      // vue-i18n 的 t() 重载第二参数不接受 undefined，named 存在时才传入
      return named ? i18n.global.t(key, named) : i18n.global.t(key)
    }
    return fallback ?? key
  } catch {
    return fallback ?? key
  }
}
