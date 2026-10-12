import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/i18n，避免加载真实 i18n 与语言包
const { t, te } = vi.hoisted(() => ({
  t: vi.fn((key: string) => `T:${key}`),
  te: vi.fn((key: string) => key.startsWith('ok.'))
}))
vi.mock('@/i18n', () => ({
  default: { global: { t, te } }
}))

import { safeT } from './safeI18n'

describe('utils/safeI18n safeT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('key 存在 → 正常返回翻译结果', () => {
    expect(safeT('ok.hello')).toBe('T:ok.hello')
    expect(te).toHaveBeenCalledWith('ok.hello')
    expect(t).toHaveBeenCalledWith('ok.hello')
  })

  it('key 存在且带命名参数 → t(key, named)', () => {
    const named = { count: 3 }
    expect(safeT('ok.count', named)).toBe('T:ok.count')
    expect(t).toHaveBeenCalledWith('ok.count', named)
  })

  it('key 存在且同时带 fallback 与命名参数 → fallback 不参与，走 t(key, named)', () => {
    const named = { n: 1 }
    expect(safeT('ok.withNamed', '兜底文案', named)).toBe('T:ok.withNamed')
    expect(t).toHaveBeenCalledWith('ok.withNamed', named)
  })

  it('key 不存在 → 返回显式 fallback', () => {
    expect(safeT('missing.key', '兜底文案')).toBe('兜底文案')
    expect(t).not.toHaveBeenCalled()
  })

  it('key 不存在且无 fallback → 返回 key 本身', () => {
    expect(safeT('missing.key')).toBe('missing.key')
  })

  it('第二参数为字符串时视为 fallback（重载 1）', () => {
    te.mockImplementationOnce(() => false)
    expect(safeT('missing.key', '字符串兜底')).toBe('字符串兜底')
  })

  it('te 为 true 但 t() 抛出异常（编译/插值错误）→ 捕获后返回 fallback ?? key', () => {
    te.mockReturnValueOnce(true)
    t.mockImplementationOnce(() => {
      throw new Error('compile error')
    })
    expect(safeT('ok.boom', '异常兜底')).toBe('异常兜底')
  })

  it('t() 抛出异常且无 fallback → 返回 key 本身', () => {
    te.mockReturnValueOnce(true)
    t.mockImplementationOnce(() => {
      throw new Error('compile error')
    })
    expect(safeT('ok.boom')).toBe('ok.boom')
  })
})
