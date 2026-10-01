import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, reactive } from 'vue'

// vi.mock factories are hoisted, so share state through vi.hoisted.
const { store, localMock, holder } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const localMock = {
    getJSON: vi.fn((key: string) => {
      const raw = store.get(key)
      if (raw == null) return null
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    }),
    setJSON: vi.fn((key: string, value: unknown) => {
      store.set(key, JSON.stringify(value))
    })
  }
  // reactive user id (created after imports below); the composable's
  // watch(() => useUserStore().id) only re-fires when this is reactive.
  const holder: { state: { id: number } } = { state: { id: 1 } }
  return { store, localMock, holder }
})

vi.mock('@/plugins/cache', () => ({
  default: { local: localMock }
}))

// Controllable user store (id drives the per-user storage key)
vi.mock('@/store/modules/user', () => ({
  default: () => holder.state
}))

// Make the shared id reactive so the composable's watcher can track it.
holder.state = reactive(holder.state)

import { useRecentViews, type RecentView } from './useRecentViews'

describe('composables/useRecentViews', () => {
  beforeEach(() => {
    store.clear()
    holder.state.id = 1
    vi.clearAllMocks()
    localMock.getJSON.mockClear()
    localMock.setJSON.mockClear()
  })

  it('starts empty when no stored data for the user', () => {
    const { recentViews } = useRecentViews()
    expect(recentViews.value).toEqual([])
  })

  it('loads pre-existing records from storage on init', () => {
    localMock.setJSON('recent-views-1', [{ path: '/a', fullPath: '/a', title: 'A', visitedAt: 5 }])
    const { recentViews } = useRecentViews()
    expect(recentViews.value).toHaveLength(1)
    expect(recentViews.value[0].title).toBe('A')
  })

  it('records a visit with a timestamp and prepends it', () => {
    const { recentViews, recordVisit } = useRecentViews()
    recordVisit({ path: '/dash', fullPath: '/dash', title: 'Dashboard' })
    expect(recentViews.value).toHaveLength(1)
    expect(recentViews.value[0].path).toBe('/dash')
    expect(typeof recentViews.value[0].visitedAt).toBe('number')
    expect(localMock.setJSON).toHaveBeenCalledWith('recent-views-1', expect.any(Array))
  })

  it('dedupes by path and moves the revisited entry to the front', () => {
    const { recentViews, recordVisit } = useRecentViews()
    recordVisit({ path: '/a', fullPath: '/a', title: 'A' })
    recordVisit({ path: '/b', fullPath: '/b', title: 'B' })
    recordVisit({ path: '/a', fullPath: '/a?a=1', title: 'A2' })
    expect(recentViews.value.map((v: RecentView) => v.path)).toEqual(['/a', '/b'])
    expect(recentViews.value[0].title).toBe('A2')
  })

  it('caps the list at 10 most-recent entries', () => {
    const { recentViews, recordVisit } = useRecentViews()
    for (let i = 0; i < 13; i++) {
      recordVisit({ path: `/p${i}`, fullPath: `/p${i}`, title: `P${i}` })
    }
    expect(recentViews.value).toHaveLength(10)
    expect(recentViews.value[0].path).toBe('/p12')
    expect(recentViews.value[9].path).toBe('/p3')
  })

  it('ignores redirect/login/lock and empty paths', () => {
    const { recentViews, recordVisit } = useRecentViews()
    recordVisit({ path: '/redirect/x', fullPath: '/redirect/x', title: 'r' })
    recordVisit({ path: '/login', fullPath: '/login', title: 'l' })
    recordVisit({ path: '/lock', fullPath: '/lock', title: 'k' })
    recordVisit({ path: '', fullPath: '', title: 'e' })
    expect(recentViews.value).toEqual([])
    expect(localMock.setJSON).not.toHaveBeenCalled()
  })

  it('removeRecentView drops only the matching path and persists', () => {
    const { recentViews, recordVisit, removeRecentView } = useRecentViews()
    recordVisit({ path: '/a', fullPath: '/a', title: 'A' })
    recordVisit({ path: '/b', fullPath: '/b', title: 'B' })
    removeRecentView('/a')
    expect(recentViews.value.map((v: RecentView) => v.path)).toEqual(['/b'])
    expect(localMock.setJSON).toHaveBeenLastCalledWith('recent-views-1', [expect.objectContaining({ path: '/b' })])
  })

  it('clearRecentViews empties and persists an empty list', () => {
    const { recentViews, recordVisit, clearRecentViews } = useRecentViews()
    recordVisit({ path: '/a', fullPath: '/a', title: 'A' })
    clearRecentViews()
    expect(recentViews.value).toEqual([])
    expect(localMock.setJSON).toHaveBeenLastCalledWith('recent-views-1', [])
  })

  it('reloads records for a different user when id changes (watch)', async () => {
    localMock.setJSON('recent-views-1', [{ path: '/u1', fullPath: '/u1', title: 'U1', visitedAt: 1 }])
    const { recentViews } = useRecentViews()
    expect(recentViews.value[0].path).toBe('/u1')
    // prepare data for the next user, then flip the id to trigger the watcher
    localMock.setJSON('recent-views-2', [{ path: '/u2', fullPath: '/u2', title: 'U2', visitedAt: 2 }])
    holder.state.id = 2
    await nextTick()
    expect(recentViews.value[0].path).toBe('/u2')
  })
})
