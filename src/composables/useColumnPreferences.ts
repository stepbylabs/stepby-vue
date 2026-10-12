/**
 * 列显隐偏好 ⇄ settingsStore.userPrefs.tableColumns 的读写绑定（UX-7 归一）
 *
 * 背景：`useTableColumns` 只负责「可见列集合」的纯逻辑，不碰持久化；
 * 页面需自行「读 userPrefs.tableColumns[pageKey]」+「deep watch 回写」。
 * 该 glue 在 user / role / operlog / logininfor 等页被反复手写，
 * 且手写版容易漏掉 `{ deep: true }` 或忘记合并其它页面的 key（覆盖写丢偏好）。
 *
 * 本 composable 把该 glue 收敛为单点：调用方只需传入 pageKey，
 * 得到 `applyTo(columns)`（回填已保存的可见性）+ `persist(columns)`（自动回写）。
 *
 * 使用方式：
 *   const prefs = useColumnPreferences('system:role')
 *   const columns = ref<Record<string, TableShowColumns>>({ ... })
 *   prefs.applyTo(columns)   // 启动时回填 visible
 *   prefs.watch(columns)     // 变化时自动持久化（deep）
 */
import { watch, type Ref } from 'vue'
import useSettingsStore from '@/store/modules/settings'

/** 与 RightToolbar 面板共用的最小列形状（label 由各页自行维护） */
interface PreferenceColumn {
  visible: boolean
}

export function useColumnPreferences(pageKey: string) {
  const settingsStore = useSettingsStore()

  /** 已保存的可见列（未保存过返回 undefined） */
  function saved(): string[] | undefined {
    return settingsStore.userPrefs.tableColumns?.[pageKey]
  }

  /**
   * 写入本页可见列偏好（合并写，保留其它页面 key）。
   * 供 `useTableColumns({ save })` 等注入式调用方使用。
   */
  function save(visible: string[]): void {
    settingsStore.updateUserPrefs({
      tableColumns: { ...settingsStore.userPrefs.tableColumns, [pageKey]: visible }
    })
  }

  /**
   * 把持久化的可见列回填到页面 columns（仅改 visible，不动 label）。
   * 未保存过时不改动任何列（保持页面默认全显）。
   */
  function applyTo(columns: Ref<Record<string, PreferenceColumn>>): void {
    const savedKeys = saved()
    if (!savedKeys?.length) return
    for (const key of Object.keys(columns.value)) {
      columns.value[key].visible = savedKeys.includes(key)
    }
  }

  /**
   * 监听 columns 深度变化并回写偏好。
   * 关键：合并写 `{ ...tableColumns, [pageKey]: visible }`，
   * 避免覆盖其它页面的偏好（历史手写版的常见缺陷）。
   */
  function watchColumns(columns: Ref<Record<string, PreferenceColumn>>): void {
    watch(
      columns,
      (v: Record<string, PreferenceColumn>) => {
        const visible = Object.keys(v).filter((k) => v[k].visible)
        save(visible)
      },
      { deep: true }
    )
  }

  return { saved, save, applyTo, watchColumns }
}
