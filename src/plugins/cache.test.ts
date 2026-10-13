import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import cache from '@/plugins/cache'

const originalSession = globalThis.sessionStorage
const originalLocal = globalThis.localStorage

describe('cache.session - 会话级缓存', () => {
  beforeEach(() => {
    sessionStorage.clear()
    // 脏数据解析失败的 console.warn（DEV 分支）属预期行为，测试中静音避免噪音
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('set/get 字符串往返', () => {
    cache.session.set('k1', 'v1')
    expect(cache.session.get('k1')).toBe('v1')
  })

  it('setJSON/getJSON 对象往返', () => {
    cache.session.setJSON('obj', { a: 1, b: [2, 3] })
    expect(cache.session.getJSON('obj')).toEqual({ a: 1, b: [2, 3] })
  })

  it('get 不存在的 key 返回 null', () => {
    expect(cache.session.get('nope')).toBeNull()
  })

  it('get(null) 返回 null（不访问 storage）', () => {
    expect(cache.session.get(null as unknown as string)).toBeNull()
  })

  it('getJSON 不存在的 key 返回 null', () => {
    expect(cache.session.getJSON('nope')).toBeNull()
  })

  it('set 仅跳过 null/undefined，空字符串 value 正常存储', () => {
    cache.session.set('', 'v')
    cache.session.set('k', '')
    cache.session.set('nullKey', null as unknown as string)
    cache.session.set('undefKey', undefined as unknown as string)
    // 空字符串 key/value 均会写入（实现仅判 null/undefined）
    expect(cache.session.get('')).toBe('v')
    expect(cache.session.get('k')).toBe('')
    // null/undefined 不写入
    expect(cache.session.get('nullKey')).toBeNull()
    expect(cache.session.get('undefKey')).toBeNull()
  })

  it('setJSON null 值不写入', () => {
    cache.session.setJSON('nullKey', null)
    expect(cache.session.get('nullKey')).toBeNull()
  })

  it('getJSON 遇脏数据解析失败返回 null 并清理', () => {
    sessionStorage.setItem('dirty', '{not valid json')
    expect(cache.session.getJSON('dirty')).toBeNull()
    expect(sessionStorage.getItem('dirty')).toBeNull()
  })

  it('remove 删除 key', () => {
    cache.session.set('rk', 'v')
    cache.session.remove('rk')
    expect(cache.session.get('rk')).toBeNull()
  })

  it('sessionStorage 缺失时 set 静默跳过', () => {
    vi.stubGlobal('sessionStorage', undefined)
    try {
      expect(() => cache.session.set('k', 'v')).not.toThrow()
      expect(cache.session.get('k')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('sessionStorage 缺失时 get 返回 null', () => {
    vi.stubGlobal('sessionStorage', undefined)
    try {
      expect(cache.session.get('k')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('cache.local - 本地缓存', () => {
  beforeEach(() => {
    localStorage.clear()
    // 脏数据解析失败的 console.warn（DEV 分支）属预期行为，测试中静音避免噪音
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('set/get 字符串往返', () => {
    cache.local.set('k1', 'v1')
    expect(cache.local.get('k1')).toBe('v1')
  })

  it('setJSON/getJSON 对象往返', () => {
    cache.local.setJSON('obj', { x: 1 })
    expect(cache.local.getJSON('obj')).toEqual({ x: 1 })
  })

  it('set 仅跳过 null/undefined（key 为 null 短路第二操作数）', () => {
    cache.local.set(null as unknown as string, 'v')
    cache.local.set('k', '')
    // key 为 null 不写入；空字符串 value 正常存储
    expect(cache.local.get(null as unknown as string)).toBeNull()
    expect(cache.local.get('k')).toBe('')
  })

  it('setJSON null 值不写入（local）', () => {
    cache.local.setJSON('nullKey', null)
    expect(cache.local.get('nullKey')).toBeNull()
  })

  it('getJSON 遇脏数据解析失败返回 null 并清理', () => {
    localStorage.setItem('dirty', '###bad###')
    expect(cache.local.getJSON('dirty')).toBeNull()
    expect(localStorage.getItem('dirty')).toBeNull()
  })

  it('remove 删除 key', () => {
    cache.local.set('rk', 'v')
    cache.local.remove('rk')
    expect(cache.local.get('rk')).toBeNull()
  })

  it('get(null) 返回 null（不访问 storage）', () => {
    expect(cache.local.get(null as unknown as string)).toBeNull()
  })

  it('getJSON 不存在的 key 返回 null', () => {
    expect(cache.local.getJSON('nope')).toBeNull()
  })

  it('localStorage 缺失时 set 静默跳过、get 返回 null', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      expect(() => cache.local.set('k', 'v')).not.toThrow()
      expect(cache.local.get('k')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.unstubAllGlobals()
  Object.defineProperty(globalThis, 'sessionStorage', { value: originalSession, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: originalLocal, writable: true, configurable: true })
})
