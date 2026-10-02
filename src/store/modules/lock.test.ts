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
})
