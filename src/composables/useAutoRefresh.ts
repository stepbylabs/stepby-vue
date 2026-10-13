/**
 * TierS-7: 自动刷新 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：读取用户偏好 userPrefs.autoRefreshInterval（秒），定时调用回调
 *   - 0 表示禁用自动刷新
 *   - 间隔变化时自动重置定时器
 *   - 组件卸载时清理定时器，避免内存泄漏
 *   - TierA-3: 标签页隐藏时自动暂停轮询，可见时恢复（节省后台资源）
 *
 * 用法：
 *   import { useAutoRefresh } from '@/composables/useAutoRefresh'
 *   useAutoRefresh(() => loadList(), true)  // 立即执行一次 + 自动刷新
 *
 * 注意：本 composable 必须在 setup 顶层调用（内部使用 onMounted/onBeforeUnmount）
 */
import { onMounted, onBeforeUnmount, watch } from 'vue'
import useSettingsStore from '@/store/modules/settings'
import { useVisibilityPause } from '@/composables/useVisibilityPause'

export function useAutoRefresh(callback: () => void | Promise<void>, immediate = false): void {
  const settingsStore = useSettingsStore()
  let timer: ReturnType<typeof setTimeout> | null = null
  // P2 修复: 标记是否已停止，防止递归 setTimeout 在清理后继续调度
  let stopped = true

  function clearTimer(): void {
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function setup(): void {
    clearTimer()
    stopped = false
    const interval = settingsStore.userPrefs.autoRefreshInterval
    // 标签页隐藏时不启动定时器，避免与 useVisibilityPause 的 onPause 清理产生竞态
    if (interval > 0 && !document.hidden) {
      // P2 修复: 使用递归 setTimeout 替代 setInterval，确保前一次回调完成后
      // 才调度下一次，避免慢回调堆积导致并发执行与状态竞争
      const scheduleNext = (): void => {
        timer = setTimeout(async () => {
          timer = null
          try {
            await callback()
          } catch (e) {
            if (import.meta.env.DEV) console.error('[useAutoRefresh] callback error:', e)
          }
          // 仅当未被清理时才继续调度，避免卸载后重新触发
          if (timer === null && !stopped) {
            scheduleNext()
          }
        }, interval * 1000)
      }
      scheduleNext()
    }
  }

  onMounted(() => {
    if (immediate) {
      try {
        Promise.resolve(callback()).catch((e) => {
          if (import.meta.env.DEV) console.error('[useAutoRefresh] immediate error:', e)
        })
      } catch (e) {
        if (import.meta.env.DEV) console.error('[useAutoRefresh] immediate sync error:', e)
      }
    }
    setup()
  })

  // 间隔变化时重新设置定时器
  watch(
    () => settingsStore.userPrefs.autoRefreshInterval,
    () => setup()
  )

  // TierA-3: 失焦暂停 - 标签页隐藏时暂停轮询，可见时恢复
  const { onPauseResume } = useVisibilityPause()
  onPauseResume(
    () => clearTimer(), // 隐藏时清理定时器
    () => setup() // 可见时重新启动定时器
  )

  onBeforeUnmount(() => {
    clearTimer()
  })
}
