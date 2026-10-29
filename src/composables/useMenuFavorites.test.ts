import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The composable watches useUserStore().id, so the mocked store must be reactive
// and stable across calls (a single shared instance the test can mutate).
vi.mock('@/store/modules/user', async () => {
  const { reactive } = await import('vue')
  const store = reactive({ id: 1 })
  return { default: () => store }
})

import cache from '@/plugins/cache'
import useUserStore from '@/store/modules/user'
import { __resetStorageWarnDedupeForTest } from '@/utils/webStorage'
import { useMenuFavorites, type FavoriteMenu } from './useMenuFavorites'

function readStore(id: string | number = useUserStore().id): FavoriteMenu[] {
  return (cache.local.getJSON(`menu-favorites-${id}`) as FavoriteMenu[] | null) || []
}

describe('composables/useMenuFavorites', () => {
  beforeEach(() => {
    localStorage.clear()
    useUserStore().id = 1
  })

  it('starts empty when no favorites exist', () => {
    const { favorites } = useMenuFavorites()
    expect(favorites.value).toEqual([])
  })

  it('adds a favorite with a timestamp and persists it', () => {
    const { addFavorite, favorites } = useMenuFavorites()
    const ok = addFavorite({ path: '/sys/user', title: 'Users', icon: 'user' })
    expect(ok).toBe(true)
    expect(favorites.value).toHaveLength(1)
    const saved = readStore()[0]
    expect(saved.path).toBe('/sys/user')
    expect(saved.title).toBe('Users')
    expect(typeof saved.addedAt).toBe('number')
  })

  it('rejects duplicate paths (dedupe)', () => {
    const { addFavorite, favorites } = useMenuFavorites()
    addFavorite({ path: '/a', title: 'A' })
    const again = addFavorite({ path: '/a', title: 'A2' })
    expect(again).toBe(false)
    expect(favorites.value).toHaveLength(1)
    expect(favorites.value[0].title).toBe('A')
  })

  it('reports favorite status with isFavorite', () => {
    const { addFavorite, isFavorite } = useMenuFavorites()
    addFavorite({ path: '/a', title: 'A' })
    expect(isFavorite('/a')).toBe(true)
    expect(isFavorite('/missing')).toBe(false)
  })

  it('removes a favorite and persists the change', () => {
    const { addFavorite, removeFavorite, favorites } = useMenuFavorites()
    addFavorite({ path: '/a', title: 'A' })
    addFavorite({ path: '/b', title: 'B' })
    removeFavorite('/a')
    expect(favorites.value.map((f: FavoriteMenu) => f.path)).toEqual(['/b'])
    expect(readStore().map((f) => f.path)).toEqual(['/b'])
  })

  it('toggles favorite state both ways', () => {
    const { toggleFavorite, isFavorite } = useMenuFavorites()
    toggleFavorite({ path: '/x', title: 'X' })
    expect(isFavorite('/x')).toBe(true)
    toggleFavorite({ path: '/x', title: 'X' })
    expect(isFavorite('/x')).toBe(false)
  })

  it('clears all favorites and persists the empty list', () => {
    const { addFavorite, clearFavorites, favorites } = useMenuFavorites()
    addFavorite({ path: '/a', title: 'A' })
    clearFavorites()
    expect(favorites.value).toEqual([])
    expect(readStore()).toEqual([])
  })

  it('preserves insertion order', () => {
    const { addFavorite, favorites } = useMenuFavorites()
    addFavorite({ path: '/c', title: 'C' })
    addFavorite({ path: '/a', title: 'A' })
    addFavorite({ path: '/b', title: 'B' })
    expect(favorites.value.map((f: FavoriteMenu) => f.path)).toEqual(['/c', '/a', '/b'])
  })

  it('restores favorites from localStorage on a fresh instance', () => {
    const first = useMenuFavorites()
    first.addFavorite({ path: '/p', title: 'P', i18nKey: 'menu.p' })

    const second = useMenuFavorites()
    expect(second.favorites.value).toHaveLength(1)
    expect(second.favorites.value[0].path).toBe('/p')
    expect(second.favorites.value[0].i18nKey).toBe('menu.p')
  })

  it('returns empty list and tolerates corrupted stored JSON', () => {
    localStorage.setItem('menu-favorites-1', 'not-valid-json')
    const { favorites } = useMenuFavorites()
    expect(favorites.value).toEqual([])
  })

  it('reloads favorites for the new user when the id changes', async () => {
    const { addFavorite, favorites } = useMenuFavorites()
    addFavorite({ path: '/u1', title: 'User1 fav' })
    expect(favorites.value).toHaveLength(1)

    // Simulate a different user's store contents
    cache.local.setJSON('menu-favorites-2', [{ path: '/u2', title: 'User2 fav', addedAt: 0 }] as FavoriteMenu[])
    useUserStore().id = 2
    await nextTick()

    expect(favorites.value.map((f: FavoriteMenu) => f.path)).toEqual(['/u2'])
  })

  it('treats a missing user id as 0 for the storage key', () => {
    useUserStore().id = 0
    const { addFavorite } = useMenuFavorites()
    addFavorite({ path: '/zero', title: 'Zero' })
    expect(readStore(0).map((f) => f.path)).toEqual(['/zero'])
  })

  // b126：存储写失败时，界面不得显示"已收藏 / 已清空"（刷新即丢 = 假成功）。
  // 失败注入走真实通道（Storage.prototype.setItem 抛 QuotaExceededError），
  // 不是 mock 模块——mock 模块测的是桩，不是 webStorage 的降级语义。
  describe('persistence failures', () => {
    function failWrites<T>(run: () => T): T {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      __resetStorageWarnDedupeForTest()
      try {
        return run()
      } finally {
        spy.mockRestore()
        __resetStorageWarnDedupeForTest()
      }
    }

    it('does not show a cleared list when the write fails', () => {
      const { addFavorite, clearFavorites, favorites } = useMenuFavorites()
      addFavorite({ path: '/a', title: 'A' })
      const ok = failWrites(() => clearFavorites())
      expect(ok).toBe(false)
      expect(favorites.value.map((f: FavoriteMenu) => f.path)).toEqual(['/a'])
    })

    it('does not add an entry that cannot be persisted', () => {
      const { addFavorite, favorites } = useMenuFavorites()
      expect(failWrites(() => addFavorite({ path: '/b', title: 'B' }))).toBe(false)
      expect(favorites.value).toEqual([])
    })

    it('does not remove an entry when the write fails', () => {
      const { addFavorite, removeFavorite, favorites } = useMenuFavorites()
      addFavorite({ path: '/c', title: 'C' })
      expect(failWrites(() => removeFavorite('/c'))).toBe(false)
      expect(favorites.value.map((f: FavoriteMenu) => f.path)).toEqual(['/c'])
    })
  })

  it('both clear entry points report the persistence outcome (wiring)', () => {
    const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const workbench = readFileSync(resolve(srcRoot, 'views/workbench/index.vue'), 'utf8')
    expect(workbench).toContain('if (recent.clearRecentViews())')
    expect(workbench).toContain('if (fav.clearFavorites())')
    expect(workbench).toContain("t('common.clearFailed')")
    // 不得再有"调用完无条件提示清空成功"的旧形状
    expect(workbench).not.toMatch(/clear(?:RecentViews|Favorites)\(\)\s*\n\s*ElMessage\.success/)

    const navbar = readFileSync(resolve(srcRoot, 'layout/components/Navbar.vue'), 'utf8')
    expect(navbar).toContain('if (!fav.clearFavorites())')
    expect(navbar).toContain("safeT('common.clearFailed')")
  })
})
