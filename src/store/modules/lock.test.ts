import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { SHA256 } from 'crypto-js'

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn(() => 'test-token') }))
vi.mock('@/utils/auth', () => ({ getToken }))

import { useLockStore as lockStoreDefinition } from './lock'

const LOCK_KEY = 'screen-lock'
const LOCK_PATH_KEY = 'screen-lock-path'

describe('store/modules/lock', () => {
  let useLockStore: typeof lockStoreDefinition
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    getToken.mockReturnValue('test-token')
    // Fresh module evaluation each run so state() re-reads current localStorage.
    vi.resetModules()
    useLockStore = (await import('./lock')).useLockStore
  })

  it('defaults to unlocked with /index path when storage is empty', () => {
    const store = useLockStore()
    expect(store.isLock).toBe(false)
    expect(store.lockPath).toBe('/index')
  })

  it('lockScreen sets state and persists a signed (non-plaintext) payload', () => {
    const store = useLockStore()
    store.lockScreen('/dashboard')
    expect(store.isLock).toBe(true)
    expect(store.lockPath).toBe('/dashboard')

    const rawLock = localStorage.getItem(LOCK_KEY)
    expect(rawLock).not.toBeNull()
    const parsed = JSON.parse(rawLock as string)
    expect(parsed.value).toBe('true')
    // signature = SHA256(value + token)
    expect(parsed.signature).toBe(SHA256('true' + 'test-token').toString())
    expect(parsed.signature).not.toBe(undefined)

    const parsedPath = JSON.parse(localStorage.getItem(LOCK_PATH_KEY) as string)
    expect(parsedPath.value).toBe('/dashboard')
  })

  it('lockScreen with empty path falls back to /index', () => {
    const store = useLockStore()
    store.lockScreen('')
    expect(store.lockPath).toBe('/index')
    expect(store.isLock).toBe(true)
  })

  it('state re-reads a valid signed lock on a fresh store instance', () => {
    const first = useLockStore()
    first.lockScreen('/secret')
    setActivePinia(createPinia())
    const second = useLockStore()
    expect(second.isLock).toBe(true)
    expect(second.lockPath).toBe('/secret')
  })

  it('unlockScreen clears state and removes storage keys', () => {
    const store = useLockStore()
    store.lockScreen('/a')
    store.unlockScreen()
    expect(store.isLock).toBe(false)
    expect(store.lockPath).toBe('/index')
    expect(localStorage.getItem(LOCK_KEY)).toBeNull()
    expect(localStorage.getItem(LOCK_PATH_KEY)).toBeNull()
  })

  it('rejects legacy plaintext value and clears dirty data', () => {
    localStorage.setItem(LOCK_KEY, 'true')
    const store = useLockStore()
    expect(store.isLock).toBe(false)
    expect(localStorage.getItem(LOCK_KEY)).toBeNull()
  })

  it('rejects malformed JSON and clears dirty data', () => {
    localStorage.setItem(LOCK_PATH_KEY, '{not-json')
    const store = useLockStore()
    expect(store.lockPath).toBe('/index')
    expect(localStorage.getItem(LOCK_PATH_KEY)).toBeNull()
  })

  it('rejects a tampered signature (bypass attempt) and clears it', () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ value: 'true', signature: 'attacker-controlled-signature' }))
    const store = useLockStore()
    expect(store.isLock).toBe(false)
    expect(localStorage.getItem(LOCK_KEY)).toBeNull()
  })

  it('rejects payload missing signature fields', () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ value: 'true' }))
    const store = useLockStore()
    expect(store.isLock).toBe(false)
  })

  // ==========================================================================
  // storageOk —— "锁上了"与"锁得住"是两件事（b89 项 8）
  // 改造前本文件七处裸调 localStorage：存储被禁时 store **初始化**就抛 = 整个应用白屏，
  // 而配额满时锁屏按钮点了没反应。下面两条分别对着这两个形状。
  // ==========================================================================
  const localDesc = Object.getOwnPropertyDescriptor(window, 'localStorage')

  it('存储可用：lockScreen 返回 true，storageOk 为真（锁屏刷新后仍在）', () => {
    const store = useLockStore()
    expect(store.storageOk).toBe(true)
    expect(store.lockScreen('/dashboard')).toBe(true)
    expect(store.storageOk).toBe(true)
  })

  it('存储属性读取就抛：store 初始化不得崩，锁屏退化为"仅当前页面"', () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
      configurable: true
    })
    try {
      // 这一句在原实现里当场抛（state() 直接读 localStorage.getItem）⇒ 应用白屏
      const store = useLockStore()
      expect(store.isLock).toBe(false)
      expect(store.storageOk).toBe(false)
      // 屏幕仍然要锁上（内存态挡住旁观者是对旁观者的第一道防线），但必须承认记不住
      expect(store.lockScreen('/secret')).toBe(false)
      expect(store.isLock).toBe(true)
      expect(store.lockPath).toBe('/secret')
      expect(store.storageOk).toBe(false)
    } finally {
      if (localDesc) Object.defineProperty(window, 'localStorage', localDesc)
    }
  })

  it('配额满（对象在、写不进）：同样必须报 storageOk=false 而不是假装已持久化', () => {
    const real = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k: string) => real.getItem(k),
        removeItem: (k: string) => real.removeItem(k),
        setItem: () => {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      },
      configurable: true,
      writable: true
    })
    try {
      const store = useLockStore()
      // state() 里的探测真的写了一次 ⇒ 不可用
      expect(store.storageOk).toBe(false)
      expect(store.lockScreen('/a')).toBe(false)
      expect(store.isLock).toBe(true)
    } finally {
      Object.defineProperty(window, 'localStorage', localDesc as PropertyDescriptor)
    }
  })
})
