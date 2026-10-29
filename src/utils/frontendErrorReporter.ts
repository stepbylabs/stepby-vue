/**
 * 前端异常与性能监控持久化上报（Tier-S #1）
 *
 * 职责：
 * - 复用 errorReporter 的单一 transport hook，将 Vue / 全局 / 资源 / unhandledrejection 错误
 *   连同原生 Web Vitals（LCP/CLS/INP/FCP/TTFB）批量、静默地上报到后端 sys_frontend_error。
 * - 使用裸 fetch（非 axios）上报，避免上报请求自身失败再次进入 errorHub / errorReporter 造成递归。
 * - 仅在已登录时上报（getToken() 为空则丢弃），并在页面隐藏 / 卸载时冲刷缓冲区，
 *   配合 keepalive:true 保证离开页面时的最后一批数据可达。
 *
 * 设计约束：不引入 web-vitals 依赖，使用原生 PerformanceObserver，零新增第三方包。
 */

import { errorReporter } from '@/utils/errorReporter'
import type { ErrorLevel, ErrorSource } from '@/utils/errorHub'
import { getToken } from '@/utils/auth'
import { sanitizePageUrl, redactTelemetryText } from '@/utils/telemetrySanitize'

/** 与后端 FrontendErrorItem(camelCase) 对齐的上报项 */
interface FrontendErrorPayload {
  level: ErrorLevel
  source: ErrorSource | 'vital'
  name?: string
  message?: string
  stack?: string
  pageUrl?: string
  userAgent?: string
  deviceType?: 'mobile' | 'tablet' | 'desktop'
  viewWidth?: number
  viewHeight?: number
  value?: number
}

const BASE_API = import.meta.env.VITE_APP_BASE_API || ''
const REPORT_URL = `${BASE_API}/monitor/frontendError/report`
const FLUSH_DEBOUNCE_MS = 2000
const MAX_BUFFER = 50
/** keepalive 请求体上限 64 KiB，留 4 KiB 余量（头/编码差异）；超限改用普通请求，见 flush() */
const KEEPALIVE_BODY_LIMIT_BYTES = 60 * 1024

/**
 * 已知良性错误名单：命中则不持久化上报（批五十四）。
 *
 * - ResizeObserver loop：浏览器渲染循环警告——观察者回调内的尺寸变更未能在本帧
 *   投递时浏览器自动延迟处理，无用户影响、无功能缺陷（WHATWG 规范行为）。
 *   e2e 实测 10 天 35 条（33 条集中在 http-debugger 页图表容器 resize），
 *   全部落在 error 级污染错误信号，故在 transport 层过滤（errorHub 本地
 *   console/角标展示不受影响——本处仅决定是否持久化）。
 */
const BENIGN_ERROR_PATTERNS: RegExp[] = [/^ResizeObserver loop( completed with undelivered notifications)?\.?$/]

function isBenignError(message: string): boolean {
  return BENIGN_ERROR_PATTERNS.some((p) => p.test(message.trim()))
}

/** 单条 Web Vitals 指标的计算结果（value 单位：CLS 为分数，其余为毫秒） */
interface VitalMetric {
  name: string
  value: number
}

let buffer: FrontendErrorPayload[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let installed = false

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 设备类型分桶（FCP-011：移动端独立指标采集）。
 * 以视口宽为主判据（业务上"移动端体验"即小屏体验），UA 移动标识为辅：
 * 宽度 < 768 → mobile；< 1024 → tablet；否则 desktop（平板横屏视口 ≥1024 归 desktop，
 * 与 Element Plus 的 xs/sm 断点口径一致）。
 */
function detectDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

/** 页面级公共上下文（每次入队时采集） */
function pageContext(): Pick<
  FrontendErrorPayload,
  'pageUrl' | 'userAgent' | 'deviceType' | 'viewWidth' | 'viewHeight'
> {
  return {
    // b132：只上报 origin + path + 参数名（值遮蔽、凭据键丢弃）——筛选值会含 PII，
    // 详见 telemetrySanitize 模块头部的取证。
    pageUrl: sanitizePageUrl(location.href),
    userAgent: navigator.userAgent,
    deviceType: detectDeviceType(),
    viewWidth: window.innerWidth,
    viewHeight: window.innerHeight
  }
}

function enqueue(item: FrontendErrorPayload): void {
  buffer.push(item)
  if (buffer.length >= MAX_BUFFER) {
    flush()
    return
  }
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_DEBOUNCE_MS)
}

/** 冲刷缓冲：仅在已登录时真正发送；未登录直接丢弃（不发匿名上报，不打扰用户） */
function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (buffer.length === 0) return
  const items = buffer
  buffer = []
  const token = getToken()
  if (!token) return
  const body = JSON.stringify({ items })
  // keepalive 的请求体在各浏览器实现里上限是 64 KiB：**超限时 fetch 直接 reject**
  // （不是"退化成普通请求"），于是整批观测数据被上面的 catch 静默丢掉。
  // MAX_BUFFER=50 条含 stack 的错误完全可能超（50 × ~1.5 KB）。
  // ⇒ 超限的那一批改用普通请求：页面仍在时照常送达，只有"发完前就离开页面"才丢，
  //    比"永远发不出去"好。阈值留 4 KB 余量给请求头与编码差异。
  const bytes = new TextEncoder().encode(body).length
  const canKeepAlive = bytes <= KEEPALIVE_BODY_LIMIT_BYTES
  try {
    fetch(REPORT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body,
      keepalive: canKeepAlive
    }).catch(() => {
      /* 静默：上报失败不影响业务，也不再次进入 errorHub（避免反馈环） */
    })
  } catch {
    /* fetch 同步抛错（极端环境）同样静默降级 */
  }
}

/** errorReporter transport：把错误项标准化后入队（此处 console/角标已由 errorHub 负责，本处只做持久化） */
function transport(err: unknown, context?: Record<string, unknown>): void {
  const level = (context?.level as ErrorLevel) ?? 'error'
  const source = (context?.source as ErrorSource) ?? 'other'
  const isErr = err instanceof Error
  const message =
    typeof context?.message === 'string' ? context.message : isErr ? err.message : String(err ?? 'Unknown error')
  // 良性错误过滤：不持久化（本地 errorHub 展示行为不变）
  if (isBenignError(message)) return
  enqueue({
    level,
    source,
    name: isErr ? err.name : typeof context?.type === 'string' ? String(context.type) : undefined,
    // b132：message/stack 里的请求 URL 会把查询值（筛选词/PII）一并带进遥测表
    message: redactTelemetryText(message),
    stack: isErr ? redactTelemetryText(err.stack) : undefined,
    ...pageContext()
  })
}

/**
 * 原生 Web Vitals 采集。
 * 每项在计算完成后作为 source='vital' 的 info 记录上报，前端列表页据此展示性能体检数据。
 */
function observeVitals(): void {
  if (typeof PerformanceObserver === 'undefined') return

  const send = (m: VitalMetric): void => {
    if (!Number.isFinite(m.value) || m.value <= 0) return
    enqueue({
      level: 'info',
      source: 'vital',
      name: m.name,
      message: `${m.name}=${Math.round(m.value * 1000) / 1000}@${nowIso()}`,
      value: m.value,
      ...pageContext()
    })
  }

  const safeObserve = (
    type: string,
    init: Record<string, unknown>,
    cb: (entries: PerformanceEntry[]) => void
  ): void => {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()))
      po.observe({ type, buffered: true, ...init } as PerformanceObserverInit)
    } catch {
      /* 该 entryType 不被当前浏览器支持：忽略 */
    }
  }

  // LCP：取最后一个候选（largest 语义）
  let lcp = 0
  safeObserve('largest-contentful-paint', {}, (entries) => {
    const last = entries[entries.length - 1] as PerformanceEntry & { startTime?: number }
    if (last?.startTime != null) lcp = last.startTime
  })

  // FCP
  safeObserve('paint', {}, (entries) => {
    const fcp = entries.find((e) => e.name === 'first-contentful-paint')
    if (fcp) send({ name: 'FCP', value: fcp.startTime })
  })

  // CLS：累加未被近期输入影响的偏移
  let cls = 0
  safeObserve('layout-shift', {}, (entries) => {
    for (const e of entries) {
      const shift = e as PerformanceEntry & { value?: number; hadRecentInput?: boolean }
      if (!shift.hadRecentInput) cls += shift.value ?? 0
    }
  })

  // INP：记录交互延迟最大值
  let inp = 0
  safeObserve('event', { durationThreshold: 40 }, (entries) => {
    for (const e of entries) {
      if (e.duration > inp) inp = e.duration
    }
  })

  // TTFB：导航计时一次性读取
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav && nav.responseStart > 0) {
      send({ name: 'TTFB', value: nav.responseStart - nav.requestStart })
    }
  } catch {
    /* 忽略 */
  }

  // 页面隐藏时汇总一次性指标（LCP/CLS/INP 需在生命周期结束后才有确定值）
  const flushVitals = (): void => {
    if (lcp > 0) send({ name: 'LCP', value: lcp })
    if (cls > 0) send({ name: 'CLS', value: cls })
    if (inp > 0) send({ name: 'INP', value: inp })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushVitals()
      flush()
    }
  })
  window.addEventListener('pagehide', () => {
    flushVitals()
    flush()
  })
}

/**
 * 安装前端异常上报（在 app.mount 之后调用一次）。
 * 幂等：重复调用不会重复注册 transport / PerformanceObserver。
 */
export function setupFrontendErrorReporter(): void {
  if (installed) return
  installed = true
  errorReporter.configure(transport)
  observeVitals()
}

// 导出内部函数供单测注入/校验（不作为运行期公共 API）
export const __testables = {
  transport,
  enqueue,
  flush,
  isBenignError,
  reset: (): void => {
    buffer = []
  }
}

// 保持类型可被外部引用
export type { ErrorLevel, ErrorSource }
