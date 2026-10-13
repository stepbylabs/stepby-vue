/**
 * 错误上报工具
 *
 * 设计目标：
 * - 统一全局错误处理入口（Vue errorHandler / window error / unhandledrejection）
 * - 保留 console.error 输出，确保开发者控制台可见
 * - 预留 transport hook，未来可接入 Sentry / 自建上报服务而不改动调用方
 * - 零依赖，不强制引入 Sentry（按需动态 import）
 *
 * 使用方式：
 *   import { errorReporter } from '@/utils/errorReporter'
 *   errorReporter.report(err, { component: 'UserList', info: 'fetch failed' })
 *
 * 接入 Sentry（可选，仅生产环境）：
 *   // main.ts 顶部
 *   if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
 *     const Sentry = await import('@sentry/vue')
 *     Sentry.init({ app, dsn: import.meta.env.VITE_SENTRY_DSN })
 *     errorReporter.configure((err, context) => Sentry.captureException(err, { extra: context }))
 *   }
 */

import { errorHub } from '@/utils/errorHub'

type ErrorTransport = (err: unknown, context?: Record<string, unknown>) => void

class ErrorReporter {
  private transport: ErrorTransport | null = null

  /**
   * 配置上报通道（如 Sentry captureException）
   * 重复调用以最新一次配置为准
   */
  configure(transport: ErrorTransport): void {
    this.transport = transport
  }

  /**
   * 上报错误
   * - 始终输出到 console.error（保证开发者可见）
   * - 若配置了 transport，额外转发到上报服务
   * - 接收上下文信息（组件名、生命周期钩子、自定义 metadata）
   */
  report(err: unknown, context?: Record<string, unknown>): void {
    const tag = context?.type ?? 'Error'
    console.error(`[${tag}]`, err, context ?? {})
    this.transport?.(err, context)
    // 写入前端错误监控中心（仅记录，不额外弹窗，避免与页面已有提示重复打扰；
    // 汇总展示由导航栏"问题监控"角标/抽屉承载）
    errorHub.record(
      (context?.level as 'info' | 'warning' | 'error') ?? 'error',
      (context?.source as 'vue' | 'global' | 'unhandledrejection' | 'resource' | 'other') ?? 'global',
      typeof context?.message === 'string'
        ? context.message
        : err instanceof Error
          ? err.message
          : String(err ?? 'Unknown error')
    )
  }
}

export const errorReporter = new ErrorReporter()
