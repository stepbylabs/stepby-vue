import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Pinia from 'pinia'

// --- mocks for the store's collaborators ---
const hoisted = vi.hoisted(() => {
  const settings = { tagsViewPersist: true }
  const cacheBacking: { value: unknown } = { value: null }
  const cache = {
    local: {
      setJSON: vi.fn((_k: string, v: unknown) => {
        cacheBacking.value = v
      }),
      getJSON: vi.fn(() => cacheBacking.value),
      remove: vi.fn(() => {
        cacheBacking.value = null
      }),
      set: vi.fn(),
      get: vi.fn()
    },
    session: {
      setJSON: vi.fn(),
      getJSON: vi.fn(),
      remove: vi.fn(),
      set: vi.fn(),
      get: vi.fn()
    }
  }
  return { settings, cache, cacheBacking }
})

vi.mock('@/store/modules/settings', () => ({
  default: () => hoisted.settings
}))
vi.mock('@/plugins/cache', () => ({
  default: hoisted.cache
}))

import useTagsViewStore from './tagsView'
import type { View } from './tagsView'

function makeView(overrides: Partial<View> & { path: string }): View {
  return {
    meta: {},
    ...overrides
  } as View
}

describe('store/modules/tagsView', () => {
  beforeEach(() => {
    hoisted.settings.tagsViewPersist = true
    hoisted.cache.local.setJSON.mockClear()
    hoisted.cache.local.getJSON.mockClear()
    hoisted.cache.local.remove.mockClear()
    hoisted.cacheBacking.value = null
    Pinia.setActivePinia(Pinia.createPinia())
  })

  it('addView pushes a visited view (deduped by fullPath) and caches it', () => {
    const store = useTagsViewStore()
    const v = makeView({ path: '/a', name: 'A', fullPath: '/a', meta: { title: 'Alpha' } })
    store.addView(v)
    expect(store.visitedViews).toHaveLength(1)
    expect(store.visitedViews[0].title).toBe('Alpha')
    expect(store.cachedViews).toEqual(['A'])

    // same fullPath -> deduped
    store.addView(makeView({ path: '/a', name: 'A', fullPath: '/a', meta: { title: 'Alpha' } }))
    expect(store.visitedViews).toHaveLength(1)
  })

  it('addVisitedView uses "no-name" title fallback and persists via cache', () => {
    const store = useTagsViewStore()
    store.addVisitedView(makeView({ path: '/x', name: 'X', fullPath: '/x' }))
    expect(store.visitedViews[0].title).toBe('no-name')
    expect(hoisted.cache.local.setJSON).toHaveBeenCalledWith('tags-view-visited', expect.any(Array))
  })

  it('viewKey falls back to path (+JSON query) when no fullPath and dedups by it', () => {
    const store = useTagsViewStore()
    store.addVisitedView(makeView({ path: '/q', query: { id: 1 }, meta: {} }))
    store.addVisitedView(makeView({ path: '/q', query: { id: 1 }, meta: {} }))
    expect(store.visitedViews).toHaveLength(1)
    // different query -> different key
    store.addVisitedView(makeView({ path: '/q', query: { id: 2 }, meta: {} }))
    expect(store.visitedViews).toHaveLength(2)
  })

  it('viewKey tolerates circular query (JSON.stringify throws -> ignored)', () => {
    const store = useTagsViewStore()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => store.addVisitedView(makeView({ path: '/c', query: circular as never, meta: {} }))).not.toThrow()
    expect(store.visitedViews).toHaveLength(1)
  })

  it('addCachedView skips unnamed, dedupes and honours noCache', () => {
    const store = useTagsViewStore()
    store.addCachedView(makeView({ path: '/n', fullPath: '/n' })) // no name -> skipped
    expect(store.cachedViews).toEqual([])
    store.addCachedView(makeView({ path: '/y', name: 'Y', fullPath: '/y', meta: { noCache: true } }))
    expect(store.cachedViews).toEqual([])
    store.addCachedView(makeView({ path: '/z', name: 'Z', fullPath: '/z' }))
    store.addCachedView(makeView({ path: '/z2', name: 'Z', fullPath: '/z2' }))
    expect(store.cachedViews).toEqual(['Z'])
  })

  it('addIframeView dedupes by key and sets title fallback', () => {
    const store = useTagsViewStore()
    store.addIframeView(makeView({ path: '/iframe', fullPath: '/iframe', meta: { link: 'http://x' } }))
    expect(store.iframeViews).toHaveLength(1)
    expect(store.iframeViews[0].title).toBe('no-name')
    store.addIframeView(makeView({ path: '/iframe', fullPath: '/iframe', meta: { title: 'I', link: 'http://x' } }))
    expect(store.iframeViews).toHaveLength(1)
  })

  it('addAffixView unshifts to the front and dedupes', () => {
    const store = useTagsViewStore()
    store.addVisitedView(makeView({ path: '/b', name: 'B', fullPath: '/b' }))
    store.addAffixView(
      makeView({ path: '/home', name: 'Home', fullPath: '/home', meta: { affix: true, title: 'Home' } })
    )
    expect(store.visitedViews[0].path).toBe('/home')
    store.addAffixView(makeView({ path: '/home', fullPath: '/home', meta: {} }))
    expect(store.visitedViews).toHaveLength(2)
  })

  it('delView removes visited + cached and returns copies', () => {
    const store = useTagsViewStore()
    store.addView(makeView({ path: '/a', name: 'A', fullPath: '/a' }))
    store.addView(makeView({ path: '/b', name: 'B', fullPath: '/b' }))
    const res = store.delView(makeView({ path: '/a', name: 'A', fullPath: '/a' }))
    expect(res.visitedViews.map((v: View) => v.path)).toEqual(['/b'])
    expect(res.cachedViews).toEqual(['B'])
    // returned arrays are copies, mutating them does not affect state
    res.visitedViews.push(makeView({ path: '/ghost' }))
    expect(store.visitedViews).toHaveLength(1)
  })

  it('delVisitedView also drops matching iframe views', () => {
    const store = useTagsViewStore()
    store.addVisitedView(makeView({ path: '/i', name: 'I', fullPath: '/i', meta: { link: 'l' } }))
    store.addIframeView(makeView({ path: '/i', fullPath: '/i', meta: { link: 'l' } }))
    const remaining = store.delVisitedView(makeView({ path: '/i', fullPath: '/i' }))
    expect(remaining).toHaveLength(0)
    expect(store.iframeViews).toHaveLength(0)
  })

  it('delCachedView keeps cache while another visited view shares the name', () => {
    const store = useTagsViewStore()
    // two visited views share name C (different fullPath/query)
    const v1 = makeView({ path: '/c', name: 'C', fullPath: '/c?x=1' })
    const v2 = makeView({ path: '/c', name: 'C', fullPath: '/c?x=2' })
    store.addVisitedView(v1)
    store.addVisitedView(v2)
    store.addCachedView(v1)
    expect(store.cachedViews).toEqual(['C'])
    // delView removes visited first, then cached: sibling still uses the name -> kept
    store.delView(v1)
    expect(store.cachedViews).toEqual(['C'])
    // after the last sibling is gone, the cache entry is dropped
    store.delView(v2)
    expect(store.cachedViews).toEqual([])
  })

  it('delIframeView filters by key', () => {
    const store = useTagsViewStore()
    store.addIframeView(makeView({ path: '/f1', fullPath: '/f1', meta: { link: 'a' } }))
    store.addIframeView(makeView({ path: '/f2', fullPath: '/f2', meta: { link: 'b' } }))
    const res = store.delIframeView(makeView({ path: '/f1', fullPath: '/f1' }))
    expect(res.map((v: View) => v.path)).toEqual(['/f2'])
  })

  it('delOthersViews keeps current view and affix tags, prunes caches', () => {
    const store = useTagsViewStore()
    const home = makeView({ path: '/home', name: 'Home', fullPath: '/home', meta: { affix: true } })
    const cur = makeView({ path: '/cur', name: 'Cur', fullPath: '/cur' })
    store.addView(home)
    store.addView(cur)
    store.addView(makeView({ path: '/gone', name: 'Gone', fullPath: '/gone' }))
    const res = store.delOthersViews(cur)
    expect(res.visitedViews.map((v: View) => v.path).sort()).toEqual(['/cur', '/home'])
    expect(res.cachedViews.sort()).toEqual(['Cur', 'Home'])
  })

  it('delAllViews keeps only affix tags and clears cache entry', () => {
    const store = useTagsViewStore()
    const home = makeView({ path: '/home', name: 'Home', fullPath: '/home', meta: { affix: true } })
    store.addView(home)
    store.addView(makeView({ path: '/tmp', name: 'Tmp', fullPath: '/tmp' }))
    store.addIframeView(makeView({ path: '/web', fullPath: '/web', meta: { link: 'l' } }))
    const res = store.delAllViews()
    expect(res.visitedViews.map((v: View) => v.path)).toEqual(['/home'])
    expect(res.cachedViews).toEqual(['Home'])
    expect(store.iframeViews).toEqual([])
    expect(hoisted.cache.local.remove).toHaveBeenCalledWith('tags-view-visited')
  })

  it('updateVisitedView merges new fields into the matching view', () => {
    const store = useTagsViewStore()
    store.addVisitedView(makeView({ path: '/u', name: 'U', fullPath: '/u', meta: { title: 'Old' } }))
    store.updateVisitedView(makeView({ path: '/u', name: 'U', fullPath: '/u', meta: { title: 'New' } }))
    expect(store.visitedViews[0].meta.title).toBe('New')
    // non-matching key -> no change, no throw
    store.updateVisitedView(makeView({ path: '/other', fullPath: '/other' }))
    expect(store.visitedViews).toHaveLength(1)
  })

  it('delRightTags removes right-side views, keeps affix, prunes cache/iframe', () => {
    const store = useTagsViewStore()
    store.addView(makeView({ path: '/a', name: 'A', fullPath: '/a' }))
    const anchor = makeView({ path: '/b', name: 'B', fullPath: '/b' })
    store.addView(anchor)
    store.addView(makeView({ path: '/c', name: 'C', fullPath: '/c', meta: { link: 'l' } }))
    store.addView(makeView({ path: '/lock', name: 'Lock', fullPath: '/lock', meta: { affix: true } }))
    store.addIframeView(makeView({ path: '/c', fullPath: '/c', meta: { link: 'l' } }))
    const res = store.delRightTags(anchor)
    expect(res.map((v: View) => v.path)).toEqual(['/a', '/b', '/lock'])
    expect(store.cachedViews).toContain('A')
    expect(store.cachedViews).not.toContain('C')
    expect(store.iframeViews).toHaveLength(0)
  })

  it('delLeftTags removes left-side views but keeps affix and current', () => {
    const store = useTagsViewStore()
    store.addView(makeView({ path: '/lock', name: 'Lock', fullPath: '/lock', meta: { affix: true } }))
    store.addView(makeView({ path: '/a', name: 'A', fullPath: '/a' }))
    const anchor = makeView({ path: '/b', name: 'B', fullPath: '/b' })
    store.addView(anchor)
    const res = store.delLeftTags(anchor)
    expect(res.map((v: View) => v.path)).toEqual(['/lock', '/b'])
    expect(store.cachedViews).not.toContain('A')
  })

  it('delRightTags/delLeftTags return current list when view not found', () => {
    const store = useTagsViewStore()
    store.addView(makeView({ path: '/a', name: 'A', fullPath: '/a' }))
    expect(store.delRightTags(makeView({ path: '/zzz', fullPath: '/zzz' }))).toHaveLength(1)
    expect(store.delLeftTags(makeView({ path: '/zzz', fullPath: '/zzz' }))).toHaveLength(1)
  })

  it('loadPersistedViews restores views from cache', () => {
    hoisted.cacheBacking.value = [
      makeView({ path: '/p1', name: 'P1', fullPath: '/p1', meta: { title: 'P1' } }),
      makeView({ path: '/p2', name: 'P2', fullPath: '/p2', meta: { title: 'P2' } })
    ]
    const store = useTagsViewStore()
    store.loadPersistedViews()
    expect(store.visitedViews.map((v: View) => v.path)).toEqual(['/p1', '/p2'])
  })

  it('persistence is skipped when tagsViewPersist is disabled', () => {
    hoisted.settings.tagsViewPersist = false
    const store = useTagsViewStore()
    store.addVisitedView(makeView({ path: '/np', name: 'NP', fullPath: '/np' }))
    expect(hoisted.cache.local.setJSON).not.toHaveBeenCalled()
  })

  it('sortViews moves tags and guards invalid/affix cases', () => {
    const store = useTagsViewStore()
    store.addView(makeView({ path: '/1', name: 'T1', fullPath: '/1' }))
    store.addView(makeView({ path: '/2', name: 'T2', fullPath: '/2' }))
    store.addView(makeView({ path: '/3', name: 'T3', fullPath: '/3' }))
    // from === to -> no-op
    store.sortViews(0, 0)
    expect(store.visitedViews.map((v: View) => v.path)).toEqual(['/1', '/2', '/3'])
    // out of bounds -> no-op
    store.sortViews(0, 99)
    expect(store.visitedViews.map((v: View) => v.path)).toEqual(['/1', '/2', '/3'])
    // valid move
    store.sortViews(0, 2)
    expect(store.visitedViews.map((v: View) => v.path)).toEqual(['/2', '/3', '/1'])
    // affix source blocked
    store.addAffixView(makeView({ path: '/0', name: 'T0', fullPath: '/0', meta: { affix: true } }))
    // affix tag is now at index 0; moving it away must be blocked
    expect(store.visitedViews[0].path).toBe('/0')
    store.sortViews(0, 1)
    expect(store.visitedViews[0].path).toBe('/0')
    // move target to affix blocked
    const before = store.visitedViews.map((v: View) => v.path)
    store.sortViews(1, 0)
    expect(store.visitedViews.map((v: View) => v.path)).toEqual(before)
  })
})
