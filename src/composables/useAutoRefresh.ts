/**
 * TierS-7: 自动刷新 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：读取用户偏好 userPrefs.autoRefreshInterval（秒），定时调用回调
 *   - 0 表示禁用自动刷新
 *   - 间隔变化时自动重置定时器
 *   - 组件卸载时清理定时器，避免内存泄漏
 *   - 标签页隐藏时暂停、可见时恢复
 *
 * b113：调度本身收敛到 `useVisiblePolling`（与 monitor/server、report/view 共用一条实现）。
 * 此前"可见时恢复"只重新排期、不立即取数 ⇒ 回到标签页看到的是离开前的数据，还要再等
 * 一个完整周期；现在恢复即刷新一次。其余语义（immediate / 间隔变更 / 卸载清理）保持不变。
 *
 * 用法：
 *   import { useAutoRefresh } from '@/composables/useAutoRefresh'
 *   useAutoRefresh(() => loadList(), true)  // 立即执行一次 + 自动刷新
 *
 * 注意：本 composable 必须在 setup 顶层调用（内部使用 onMounted/onBeforeUnmount）
 */
import { onMounted, onBeforeUnmount, watch } from 'vue'
import useSettingsStore from '@/store/modules/settings'
import { useVisiblePolling } from '@/composables/useVisiblePolling'

export function useAutoRefresh(callback: () => void | Promise<void>, immediate = false): void {
  const settingsStore = useSettingsStore()
  const poller = useVisiblePolling(callback, () => settingsStore.userPrefs.autoRefreshInterval * 1000)

  onMounted(() => {
    // immediate 与 interval 无关：即使关闭自动刷新，"进页面先取一次"仍成立
    if (immediate) poller.runNow()
    poller.start()
  })

  // 间隔变化时重新排期（0 = 关闭；从 0 改回 >0 也会重新启动）
  watch(
    () => settingsStore.userPrefs.autoRefreshInterval,
    () => poller.start()
  )

  onBeforeUnmount(() => {
    poller.stop()
  })
}
