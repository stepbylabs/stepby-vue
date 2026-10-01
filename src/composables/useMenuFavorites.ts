/**
 * 菜单收藏夹 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：在侧边栏右键收藏常用菜单，顶栏快速跳转
 * 存储：localStorage，按用户 ID 隔离
 */
import cache from '@/plugins/cache'
import useUserStore from '@/store/modules/user'

const STORAGE_KEY_PREFIX = 'menu-favorites-'

export interface FavoriteMenu {
  path: string
  title: string
  icon?: string
  /** i18n 翻译 key（可选）：前端按此 key 翻译标题，留空则回退到 title */
  i18nKey?: string
  addedAt: number
}

function getStorageKey(): string {
  const userStore = useUserStore()
  const userId = userStore.id || 0
  return `${STORAGE_KEY_PREFIX}${userId}`
}

/** 读取当前用户的收藏菜单列表 */
function loadFavorites(): FavoriteMenu[] {
  const key = getStorageKey()
  return (cache.local.getJSON(key) as FavoriteMenu[] | null) || []
}

/** 保存收藏菜单列表 */
function saveFavorites(list: FavoriteMenu[]): void {
  const key = getStorageKey()
  cache.local.setJSON(key, list)
}

export function useMenuFavorites() {
  const favorites = ref<FavoriteMenu[]>(loadFavorites())

  // 监听用户切换，重新加载
  watch(
    () => useUserStore().id,
    () => {
      favorites.value = loadFavorites()
    }
  )

  /** 添加收藏 */
  function addFavorite(menu: Omit<FavoriteMenu, 'addedAt'>): boolean {
    if (favorites.value.some((f: FavoriteMenu) => f.path === menu.path)) {
      return false
    }
    favorites.value.push({ ...menu, addedAt: Date.now() })
    saveFavorites(favorites.value)
    return true
  }

  /** 移除收藏 */
  function removeFavorite(path: string): void {
    favorites.value = favorites.value.filter((f: FavoriteMenu) => f.path !== path)
    saveFavorites(favorites.value)
  }

  /** 判断是否已收藏 */
  function isFavorite(path: string): boolean {
    return favorites.value.some((f: FavoriteMenu) => f.path === path)
  }

  /** 切换收藏状态 */
  function toggleFavorite(menu: Omit<FavoriteMenu, 'addedAt'>): void {
    if (isFavorite(menu.path)) {
      removeFavorite(menu.path)
    } else {
      addFavorite(menu)
    }
  }

  /** 清空收藏 */
  function clearFavorites(): void {
    favorites.value = []
    saveFavorites(favorites.value)
  }

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    clearFavorites
  }
}
