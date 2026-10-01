/**
 * TierB-3: 搜索保存 composable
 *
 * 功能：将列表搜索条件保存到 localStorage，下次访问时自动恢复
 *
 * 设计：
 * - 按页面路由 path 作为唯一 key
 * - 保存查询参数对象（支持任意结构）
 * - 保存时间戳，可设置过期时间（默认 24 小时）
 * - 提供清除接口
 *
 * 使用方式：
 *   import { useSearchPersistence } from '@/composables/useSearchPersistence'
 *   const { savedQuery, saveQuery, clearQuery } = useSearchPersistence('user-list')
 *   // 保存查询条件
 *   saveQuery({ userName: 'admin', status: '0' })
 *   // 读取保存的查询条件
 *   if (savedQuery.value) {
 *     queryParams.value = { ...queryParams.value, ...savedQuery.value }
 *   }
 */
import { ref } from 'vue'
import cache from '@/plugins/cache'

const STORAGE_PREFIX = 'search-persist:'
const DEFAULT_EXPIRE_HOURS = 24

interface SavedQueryData {
  data: Record<string, unknown>
  timestamp: number
}

export function useSearchPersistence(key: string, expireHours: number = DEFAULT_EXPIRE_HOURS) {
  const storageKey = `${STORAGE_PREFIX}${key}`
  // 在 setup 顶层同步加载，确保调用方在 setup 阶段即可读取 savedQuery.value
  // （原 onMounted 中加载会导致 setup 顶层读取到 null）
  const savedQuery = ref<Record<string, unknown> | null>(loadQuery())

  /** 从 localStorage 加载保存的查询条件 */
  function loadQuery(): Record<string, unknown> | null {
    try {
      const saved = cache.local.getJSON(storageKey) as SavedQueryData | null
      if (!saved || typeof saved !== 'object') return null
      // 检查过期时间
      const elapsed = Date.now() - saved.timestamp
      if (elapsed > expireHours * 60 * 60 * 1000) {
        // 已过期，清除
        cache.local.remove(storageKey)
        return null
      }
      return saved.data
    } catch {
      return null
    }
  }

  /** 保存查询条件到 localStorage */
  function saveQuery(data: Record<string, unknown>): void {
    try {
      const payload: SavedQueryData = {
        data,
        timestamp: Date.now()
      }
      cache.local.setJSON(storageKey, payload)
      savedQuery.value = data
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[useSearchPersistence] save failed:', e)
    }
  }

  /** 清除保存的查询条件 */
  function clearQuery(): void {
    try {
      cache.local.remove(storageKey)
      savedQuery.value = null
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[useSearchPersistence] clear failed:', e)
    }
  }

  /** 更新单个字段（合并保存） */
  function updateQueryField(field: string, value: unknown): void {
    const current = savedQuery.value || {}
    current[field] = value
    saveQuery(current)
  }

  return {
    savedQuery,
    saveQuery,
    clearQuery,
    updateQueryField,
    loadQuery
  }
}
