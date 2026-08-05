import { describe, it, expect } from 'vitest'
import { isChunkLoadError } from '@/utils/routerError'

describe('isChunkLoadError', () => {
  it('识别 "Failed to fetch dynamically imported module"', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module ./src/views/x.js'))
    ).toBe(true)
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
