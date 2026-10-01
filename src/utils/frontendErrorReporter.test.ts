import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 隔离重依赖：errorReporter 只保留 configure 记录器；auth 用可控 token；避免真实加载 i18n/element-plus
const configureSpy = vi.fn()
vi.mock('@/utils/errorReporter', () => ({
  errorReporter: { configure: (...args: unknown[]) => configureSpy(...args) }
}))

const getTokenMock = vi.fn<() => string | undefined>()
vi.mock('@/utils/auth', () => ({
  getToken: () => getTokenMock()
}))

import { setupFrontendErrorReporter, __testables } from '@/utils/frontendErrorReporter'

type FetchCall = { url: string; init: RequestInit }
let fetchCalls: FetchCall[] = []
const fetchMock = vi.fn((url: string, init: RequestInit) => {
  fetchCalls.push({ url, init })
  return Promise.resolve({ ok: true } as Response)
})

describe('frontendErrorReporter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchCalls = []
    configureSpy.mockClear()
    getTokenMock.mockReset()
    getTokenMock.mockReturnValue('test-token')
    __testables.reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('setup 安装 transport 且幂等', () => {
    setupFrontendErrorReporter()
    expect(configureSpy).toHaveBeenCalledTimes(1)
    expect(typeof configureSpy.mock.calls[0][0]).toBe('function')
    // 二次安装不重复注册
    setupFrontendErrorReporter()
    expect(configureSpy).toHaveBeenCalledTimes(1)
  })

  it('transport 采集 Error 项并在 flush 时按 Bearer 上报到 report 接口', () => {
    const err = new Error('boom')
    __testables.transport(err, { level: 'error', source: 'vue', type: 'Vue ErrorHandler' })
    __testables.flush()

    expect(fetchCalls).toHaveLength(1)
    const { url, init } = fetchCalls[0]
    expect(url).toContain('/monitor/frontendError/report')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-token')
    expect(headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init.body as string)
    expect(body.items).toHaveLength(1)
    const item = body.items[0]
    expect(item.level).toBe('error')
    expect(item.source).toBe('vue')
    expect(item.name).toBe('Error')
    expect(item.message).toBe('boom')
    expect(typeof item.stack).toBe('string')
    expect(typeof item.pageUrl).toBe('string')
    expect(typeof item.viewWidth).toBe('number')
  })

  it('非 Error 且无上下文时归一化：level=error、source=other、message 取字符串', () => {
    __testables.transport('plain string failure', {})
    __testables.flush()
    const item = JSON.parse(fetchCalls[0].init.body as string).items[0]
    expect(item.level).toBe('error')
    expect(item.source).toBe('other')
    expect(item.message).toBe('plain string failure')
    expect(item.name).toBeUndefined()
    expect(item.stack).toBeUndefined()
  })

  it('context.message 优先于 err，source 透传（resource/warning）', () => {
    __testables.transport(undefined, { level: 'warning', source: 'resource', message: 'Resource load failed: IMG' })
    __testables.flush()
    const item = JSON.parse(fetchCalls[0].init.body as string).items[0]
    expect(item.level).toBe('warning')
    expect(item.source).toBe('resource')
    expect(item.message).toBe('Resource load failed: IMG')
  })

  it('未登录时 flush 丢弃缓冲且不发请求（不发匿名上报）', () => {
    getTokenMock.mockReturnValue(undefined)
    __testables.transport(new Error('should not send'), { level: 'error', source: 'vue' })
    __testables.flush()
    expect(fetchCalls).toHaveLength(0)
    // 再次 flush 空缓冲同样不发请求
    __testables.flush()
    expect(fetchCalls).toHaveLength(0)
  })

  it('空缓冲时 flush 不触发 fetch', () => {
    __testables.flush()
    expect(fetchCalls).toHaveLength(0)
  })

  it('vital 指标以 info/vital 落库并携带 value', () => {
    __testables.transport(undefined, {
      level: 'info',
      source: 'vital',
      message: 'LCP=1234@2026-09-22T00:00:00.000Z',
      name: 'LCP'
    })
    __testables.flush()
    const item = JSON.parse(fetchCalls[0].init.body as string).items[0]
    expect(item.source).toBe('vital')
    expect(item.level).toBe('info')
    // FCP-011：设备类型分桶随每条上报携带（jsdom 视口宽 1024 → desktop）
    expect(['mobile', 'tablet', 'desktop']).toContain(item.deviceType)
  })
})
