/**
 * 列表列显隐偏好（UX-7）
 *
 * 纯逻辑 + 依赖注入：不直接 import Pinia store（避免单测触发 useDark/localStorage 等浏览器副作用），
 * 由调用方传入「读取偏好 / 写入偏好」两个函数；列解析规则复用 `@/utils/userPrefs` 的纯函数。
 */
import { computed, ref, watch, type Ref } from 'vue'
import { resolveTableColumns, type TableColumnDef } from '@/utils/userPrefs'

export interface UseTableColumnsOptions {
  /** 页面唯一标识（偏好按页面隔离，如 'system:user'） */
  pageKey: string
  /** 列定义（按显示顺序） */
  columns: TableColumnDef[]
  /** 读取当前偏好（页面传入 settingsStore.userPrefs.tableColumns[pageKey]） */
  getSaved: () => string[] | undefined
  /** 写入偏好（页面传入 settingsStore.updateUserPrefs） */
  save: (visible: string[]) => void
}

export function useTableColumns(options: UseTableColumnsOptions) {
  const { pageKey, columns, getSaved, save } = options
  const visibleKeys = ref<string[]>(resolveTableColumns(getSaved(), columns))

  /** 某列是否可见 */
  function isVisible(key: string): boolean {
    return visibleKeys.value.includes(key)
  }

  /** 切换某列（至少保留一列可见） */
  function toggle(key: string, on?: boolean): void {
    const next = new Set(visibleKeys.value)
    const want = on ?? !next.has(key)
    if (want) next.add(key)
    else if (next.size > 1) next.delete(key) // 不允许隐藏所有列
    visibleKeys.value = columns.map((c) => c.key).filter((k) => next.has(k))
  }

  /** 恢复默认可见列 */
  function resetToDefault(): void {
    visibleKeys.value = resolveTableColumns(undefined, columns)
  }

  // 变化时持久化（防抖由调用方 store 承担；此处仅在值真正变化时写）
  watch(
    visibleKeys,
    (v: string[]) => {
      if (pageKey) save(v)
    },
    { deep: true }
  )

  /** 列设置面板的选项（供 el-checkbox-group 使用） */
  const columnOptions: Ref<TableColumnDef[]> = computed(() => columns)

  return { visibleKeys, isVisible, toggle, resetToDefault, columnOptions }
}
