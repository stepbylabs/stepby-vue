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

/** 保存收藏菜单列表（返回是否真的落进存储） */
function saveFavorites(list: FavoriteMenu[]): boolean {
  const key = getStorageKey()
  return cache.local.setJSON(key, list)
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

  /** 添加收藏（`false` = 已存在或存储写入失败；两种都不改内存态） */
  function addFavorite(menu: Omit<FavoriteMenu, 'addedAt'>): boolean {
    if (favorites.value.some((f: FavoriteMenu) => f.path === menu.path)) {
      return false
    }
    const next = [...favorites.value, { ...menu, addedAt: Date.now() }]
    // b126：写不进存储就不得让界面显示"已收藏"（刷新即丢 = 假成功）
    if (!saveFavorites(next)) {
      return false
    }
    favorites.value = next
    return true
  }

  /** 移除收藏（`false` = 存储写入失败，内存态保持不变） */
  function removeFavorite(path: string): boolean {
    const next = favorites.value.filter((f: FavoriteMenu) => f.path !== path)
    if (!saveFavorites(next)) {
      return false
    }
    favorites.value = next
    return true
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

  /** 清空收藏（`false` = 存储写入失败，界面不得显示已清空） */
  function clearFavorites(): boolean {
    if (!saveFavorites([])) {
      return false
    }
    favorites.value = []
    return true
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
