/**
 * 列表列显隐偏好（UX-7）
 *
 * 纯逻辑 + 依赖注入：不直接 import Pinia store（避免单测触发 useDark/localStorage 等浏览器副作用），
 * 由调用方传入「读取偏好 / 写入偏好」两个函数；列解析规则复用 `@/utils/userPrefs` 的纯函数。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
  /**
   * 可选：列 label 工厂（key → i18n 文案，内部调用 t()）。P2a 修复：
   * 页面 columns ref 的 label 若为 setup 时 t() 快照，切语言后不更新；
   * 传入本工厂后 labelMap 随 locale 自动重算，配合返回的 bindLabels()
   * 将最新文案应用到页面 columns ref（仅更新 label，visible 显隐偏好保留）。
   */
  labels?: () => Record<string, string>
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

  // ===== P2a：label 语言切换响应 =====
  const { locale } = useI18n()
  /** key → 最新 i18n 文案；依赖 locale（及工厂内 t() 对 messages 的响应），
   * locale 切换时自动重算。未传 labels 工厂时为空对象。 */
  const labelMap: ComputedRef<Record<string, string>> = computed(() => {
    void locale.value // 显式建立 locale 依赖，语言切换触发重算
    return options.labels ? options.labels() : {}
  })

  /**
   * 将 labelMap 绑定到页面 columns ref（如 `Record<string, TableShowColumns>`）：
   * locale 变化时仅更新各列 label，visible 保持不动（用户显隐偏好不丢失）。
   * immediate：setup 时同步应用一次，保证初始文案与工厂一致。
   */
  function bindLabels(target: Ref<Record<string, { label: string }>>): void {
    watch(
      labelMap,
      (map: Record<string, string>) => {
        for (const [key, label] of Object.entries(map)) {
          const col = target.value[key]
          if (col) col.label = label
        }
      },
      { immediate: true }
    )
  }

  return { visibleKeys, isVisible, toggle, resetToDefault, columnOptions, labelMap, bindLabels }
}
