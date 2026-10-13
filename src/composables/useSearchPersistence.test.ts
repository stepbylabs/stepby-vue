import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import cache from '@/plugins/cache'
import { useSearchPersistence } from './useSearchPersistence'

const HOUR = 60 * 60 * 1000

describe('composables/useSearchPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null savedQuery when nothing is stored', () => {
    const { savedQuery } = useSearchPersistence('user-list')
    expect(savedQuery.value).toBeNull()
  })

  it('restores valid, unexpired data on setup', () => {
    localStorage.setItem(
      'search-persist:user-list',
      JSON.stringify({ data: { userName: 'admin', status: '0' }, timestamp: Date.now() - HOUR })
    )
    const { savedQuery } = useSearchPersistence('user-list')
    expect(savedQuery.value).toEqual({ userName: 'admin', status: '0' })
  })

  it('clears and returns null when the entry has expired', () => {
    localStorage.setItem(
      'search-persist:expired',
      JSON.stringify({ data: { a: 1 }, timestamp: Date.now() - 25 * HOUR })
    )
    const { savedQuery } = useSearchPersistence('expired')
    expect(savedQuery.value).toBeNull()
    expect(localStorage.getItem('search-persist:expired')).toBeNull()
  })

  it('honours a custom expireHours window', () => {
    localStorage.setItem('search-persist:short', JSON.stringify({ data: { a: 1 }, timestamp: Date.now() - 3 * HOUR }))
    const { savedQuery } = useSearchPersistence('short', 2)
    expect(savedQuery.value).toBeNull()
    expect(localStorage.getItem('search-persist:short')).toBeNull()
  })

  it('returns null for corrupted (non-JSON) data', () => {
    localStorage.setItem('search-persist:bad', '{ this is not json')
    const { savedQuery } = useSearchPersistence('bad')
    expect(savedQuery.value).toBeNull()
  })

  it('returns null when the payload is a non-object (number)', () => {
    localStorage.setItem('search-persist:num', JSON.stringify(42))
    const { savedQuery } = useSearchPersistence('num')
    expect(savedQuery.value).toBeNull()
  })

  it('persists data + timestamp and updates savedQuery on saveQuery', () => {
    const { savedQuery, saveQuery } = useSearchPersistence('list')
    saveQuery({ kw: 'abc' })
    expect(savedQuery.value).toEqual({ kw: 'abc' })
    const raw = JSON.parse(localStorage.getItem('search-persist:list')!)
    expect(raw.data).toEqual({ kw: 'abc' })
    expect(typeof raw.timestamp).toBe('number')
  })

  it('removes the entry and resets savedQuery on clearQuery', () => {
    const { saveQuery, clearQuery, savedQuery } = useSearchPersistence('list')
    saveQuery({ a: 1 })
    clearQuery()
    expect(savedQuery.value).toBeNull()
    expect(localStorage.getItem('search-persist:list')).toBeNull()
  })

  it('merges a single field with existing data via updateQueryField', () => {
    const { saveQuery, updateQueryField, savedQuery } = useSearchPersistence('list')
    saveQuery({ page: 1 })
    updateQueryField('size', 20)
    expect(savedQuery.value).toEqual({ page: 1, size: 20 })
    // persisted too
    const raw = JSON.parse(localStorage.getItem('search-persist:list')!)
    expect(raw.data).toEqual({ page: 1, size: 20 })
  })

  it('creates fresh data when updateQueryField is called with no baseline', () => {
    const { updateQueryField, savedQuery } = useSearchPersistence('fresh')
    updateQueryField('only', 'x')
    expect(savedQuery.value).toEqual({ only: 'x' })
  })

  it('swallows storage write failures (saveQuery)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { savedQuery, saveQuery } = useSearchPersistence('fail')
    vi.spyOn(cache.local, 'setJSON').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveQuery({ a: 1 })).not.toThrow()
    // failure happens before savedQuery.value is assigned
    expect(savedQuery.value).toBeNull()
    if (import.meta.env.DEV) expect(warn).toHaveBeenCalled()
  })

  it('swallows removal failures (clearQuery) without throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { saveQuery, clearQuery } = useSearchPersistence('list')
    saveQuery({ a: 1 })
    vi.spyOn(cache.local, 'remove').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => clearQuery()).not.toThrow()
  })

  it('loadQuery can be called directly to re-read storage', () => {
    const { saveQuery, loadQuery } = useSearchPersistence('list')
    saveQuery({ z: 9 })
    expect(loadQuery()).toEqual({ z: 9 })
  })
})
