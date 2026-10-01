/**
 * 最近访问页面 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：记录用户最近访问的 10 个页面，提供快速跳转入口
 * 存储：localStorage，按用户 ID 隔离
 * 触发：在路由 afterEach 钩子中调用 recordVisit()
 */
import cache from '@/plugins/cache'
import useUserStore from '@/store/modules/user'

const STORAGE_KEY_PREFIX = 'recent-views-'
const MAX_RECENT = 10

export interface RecentView {
  path: string
  fullPath: string
  title: string
  icon?: string
  /** i18n 翻译 key（可选）：前端按此 key 翻译标题，留空则回退到 title */
  i18nKey?: string
  visitedAt: number
}

function getStorageKey(): string {
  const userStore = useUserStore()
  const userId = userStore.id || 0
  return `${STORAGE_KEY_PREFIX}${userId}`
}

function loadRecentViews(): RecentView[] {
  const key = getStorageKey()
  return (cache.local.getJSON(key) as RecentView[] | null) || []
}

function saveRecentViews(list: RecentView[]): void {
  const key = getStorageKey()
  cache.local.setJSON(key, list)
}

export function useRecentViews() {
  const recentViews = ref<RecentView[]>(loadRecentViews())

  watch(
    () => useUserStore().id,
    () => {
      recentViews.value = loadRecentViews()
    }
  )

  /** 记录一次访问（在路由 afterEach 调用） */
  function recordVisit(view: Omit<RecentView, 'visitedAt'>): void {
    if (!view.path || view.path.startsWith('/redirect') || view.path === '/login' || view.path === '/lock') {
      return
    }
    const list = recentViews.value.filter((v: RecentView) => v.path !== view.path)
    list.unshift({ ...view, visitedAt: Date.now() })
    if (list.length > MAX_RECENT) list.length = MAX_RECENT
    recentViews.value = list
    saveRecentViews(list)
  }

  /** 清空最近访问记录 */
  function clearRecentViews(): void {
    recentViews.value = []
    saveRecentViews([])
  }

  /** 移除单条记录 */
  function removeRecentView(path: string): void {
    recentViews.value = recentViews.value.filter((v: RecentView) => v.path !== path)
    saveRecentViews(recentViews.value)
  }

  return {
    recentViews,
    recordVisit,
    clearRecentViews,
    removeRecentView
  }
}
