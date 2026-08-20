import { describe, it, expect } from 'vitest'
import { isChunkLoadError, reloadOnChunkError } from '@/utils/routerError'

describe('isChunkLoadError', () => {
  it('识别 "Failed to fetch dynamically imported module"', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module ./src/views/x.js'))).toBe(true)
  })

  it('识别 "Loading chunk ... failed"', () => {
    expect(isChunkLoadError(new Error('Loading chunk 123 failed'))).toBe(true)
  })

  it('识别 "Importing a module script failed"', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed'))).toBe(true)
  })

  it('非 chunk 错误的消息返回 false', () => {
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false)
    expect(isChunkLoadError(new Error(''))).toBe(false)
  })

  it('非 Error 类型（string / null / undefined）返回 false', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({ message: 'Loading chunk 1 failed' })).toBe(false)
  })
})

// ============================================================================
// reloadOnChunkError 整页刷新兜底
// ============================================================================
describe('reloadOnChunkError', () => {
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    reloadSpy = vi.fn()
    // 替换 location.reload（jsdom 默认 not implemented）
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('首次调用设置标记并触发整页刷新', () => {
    reloadOnChunkError()
    expect(sessionStorage.getItem('__router_chunk_reload__')).toBe('1')
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('标记已存在时不重复刷新（防循环刷新）', () => {
    reloadOnChunkError()
    reloadOnChunkError()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })
})
