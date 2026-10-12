import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DictOption } from '@/types'

import useDictStore from './dict'

describe('store/modules/dict', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('getDict returns null for empty or null key', () => {
    const store = useDictStore()
    expect(store.getDict('')).toBeNull()
    expect(store.getDict(null as unknown as string)).toBeNull()
  })

  it('getDict returns null when key not found', () => {
    const store = useDictStore()
    expect(store.getDict('missing')).toBeNull()
  })

  it('setDict stores options and getDict retrieves them', () => {
    const store = useDictStore()
    const options = [{ label: 'A', value: 'a' }]
    store.setDict('sex', options)
    expect(store.getDict('sex')).toEqual(options)
  })

  it('setDict replaces existing key instead of stacking duplicates', () => {
    const store = useDictStore()
    store.setDict('sex', [{ label: 'Old', value: '0' }])
    store.setDict('sex', [{ label: 'New', value: '1' }])
    expect(store.dict.filter((d: { key: string; value: DictOption[] }) => d.key === 'sex')).toHaveLength(1)
    expect(store.getDict('sex')).toEqual([{ label: 'New', value: '1' }])
  })

  it('setDict ignores empty key', () => {
    const store = useDictStore()
    store.setDict('', [{ label: 'X', value: 'x' }])
    expect(store.dict).toHaveLength(0)
  })

  it('removeDict deletes the matching entry and returns true', () => {
    const store = useDictStore()
    store.setDict('status', [{ label: 'On', value: '1' }])
    expect(store.removeDict('status')).toBe(true)
    expect(store.getDict('status')).toBeNull()
  })

  it('removeDict returns false for unknown key', () => {
    const store = useDictStore()
    expect(store.removeDict('nope')).toBe(false)
  })

  it('cleanDict empties the dictionary', () => {
    const store = useDictStore()
    store.setDict('a', [])
    store.setDict('b', [])
    store.cleanDict()
    expect(store.dict).toHaveLength(0)
  })

  it('initDict is a no-op that leaves state intact', () => {
    const store = useDictStore()
    store.setDict('a', [{ label: 'x', value: '1' }])
    store.initDict()
    expect(store.dict).toHaveLength(1)
  })
})
