/**
 * Service Worker 缓存边界（b115）单测
 *
 * 钉三件事：
 * 1. 档位归一：值域外（拼错/大小写/空串/非字符串）一律回落 `off`（关闭态即安全态）；
 * 2. 回收语义：只删**点名的**缓存，删不掉/不存在/抛错都不外溢，且逐个尝试（一个失败不连坐）；
 * 3. 三个缓存名互不重叠——名字一旦复用，启动回收就会把新档的数据一起删掉（或继承旧档内容）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  API_CACHE,
  API_CACHE_MODES,
  DEFAULT_API_CACHE_MODE,
  LEGACY_SW_CACHES,
  PUBLIC_STATIC_CACHE,
  isApiCacheEnabled,
  normalizeApiCacheMode,
  purgeCaches,
  purgeLegacySwCaches,
  purgeSessionSwCaches
} from './swCache'

interface CachesStub {
  delete: (name: string) => Promise<boolean>
}

const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
let restored = false

function installCaches(stub: CachesStub | undefined): void {
  restored = false
  if (stub === undefined) {
    delete (globalThis as unknown as { caches?: CachesStub }).caches
    return
  }
  Object.defineProperty(globalThis, 'caches', { value: stub, configurable: true, writable: true })
}

afterEach(() => {
  if (originalCaches) {
    Object.defineProperty(globalThis, 'caches', originalCaches)
  } else {
    delete (globalThis as unknown as { caches?: CachesStub }).caches
  }
  // 还原本身也要判：后续文件继承一个"能删缓存"的假环境，会让别的用例永远绿（㊺(c)）
  const now = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  restored = originalCaches ? !!now && now.value === originalCaches.value : now === undefined
  expect(restored, 'globalThis.caches 必须还原到用例开始前的状态').toBe(true)
})

describe('utils/swCache（b115）', () => {
  it('档位归一：合法值原样，值域外一律回落 off', () => {
    expect(API_CACHE_MODES).toEqual(['off', 'network-first'])
    expect(DEFAULT_API_CACHE_MODE).toBe('off')
    expect(normalizeApiCacheMode('network-first')).toBe('network-first')
    expect(normalizeApiCacheMode('  NETWORK-FIRST  ')).toBe('network-first')
    expect(normalizeApiCacheMode('off')).toBe('off')
    for (const bad of ['', ' ', 'networkfirst', 'network_first', 'true', '1', undefined, null, 0, {}, []]) {
      expect(normalizeApiCacheMode(bad), `非法值 ${JSON.stringify(bad)} 必须回落 off`).toBe('off')
    }
    expect(isApiCacheEnabled('network-first')).toBe(true)
    expect(isApiCacheEnabled('')).toBe(false)
    expect(isApiCacheEnabled(undefined)).toBe(false)
  })

  it('三个缓存名互不重叠（复用名字会让启动回收误删新档，或让新档继承旧数据）', () => {
    const all = [...LEGACY_SW_CACHES, PUBLIC_STATIC_CACHE, API_CACHE]
    expect(new Set(all).size).toBe(all.length)
    expect(LEGACY_SW_CACHES).toEqual(['stepby-api', 'stepby-static'])
  })

  it('回收只删点名的缓存，并回报实际删掉的名字', async () => {
    const deleted: string[] = []
    installCaches({
      delete: async (name: string) => {
        deleted.push(name)
        return name !== 'missing'
      }
    })
    const purged = await purgeCaches(['a', 'missing', 'b'])
    expect(deleted).toEqual(['a', 'missing', 'b'])
    expect(purged).toEqual(['a', 'b'])
  })

  it('单个名字抛错不连坐：后面的照删、整体不 reject', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installCaches({
      delete: async (name: string) => {
        if (name === 'boom') throw new Error('SecurityError')
        return true
      }
    })
    await expect(purgeCaches(['boom', 'ok'])).resolves.toEqual(['ok'])
    warn.mockRestore()
  })

  it('没有 Cache API（SSR / jsdom / 老浏览器）时返回空数组且不抛', async () => {
    installCaches(undefined)
    await expect(purgeCaches(['stepby-api'])).resolves.toEqual([])
    await expect(purgeLegacySwCaches()).resolves.toEqual([])
    await expect(purgeSessionSwCaches()).resolves.toEqual([])
  })

  it('启动回收只动历史档，不动 opt-in 的 API 档与公共静态档', async () => {
    const deleted: string[] = []
    installCaches({
      delete: async (name: string) => {
        deleted.push(name)
        return true
      }
    })
    await purgeLegacySwCaches()
    expect(deleted).toEqual(['stepby-api', 'stepby-static'])
    expect(deleted).not.toContain(API_CACHE)
    expect(deleted).not.toContain(PUBLIC_STATIC_CACHE)
  })

  it('会话切换回收：历史档 + API 档，公共静态档保留（它与身份无关）', async () => {
    const deleted: string[] = []
    installCaches({
      delete: async (name: string) => {
        deleted.push(name)
        return true
      }
    })
    await purgeSessionSwCaches()
    expect(deleted).toEqual(['stepby-api', 'stepby-static', API_CACHE])
    expect(deleted).not.toContain(PUBLIC_STATIC_CACHE)
  })
})
