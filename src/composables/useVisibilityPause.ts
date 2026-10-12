/**
 * TierA-3: 失焦暂停 composable
 *
 * 功能：标签页隐藏（document.hidden）时暂停轮询/动画，可见时恢复
 *
 * 使用场景：
 * - 定时轮询列表数据（避免后台标签页持续请求浪费资源）
 * - 动画暂停（节省 CPU）
 * - WebSocket 心跳降频
 *
 * 使用方式：
 *   import { useVisibilityPause } from '@/composables/useVisibilityPause'
 *   const { isVisible, onPause, onResume } = useVisibilityPause()
 *   onPause(() => { clearInterval(timer) })
 *   onResume(() => { timer = setInterval(fetch, 5000) })
 *
 * 设计说明：
 * - 不自动管理定时器（避免侵入现有逻辑），仅提供可见性状态和回调
 * - isVisible 是 ref，可在模板或 watch 中使用
 * - 多次调用 onPause/onResume 会累积回调，按注册顺序执行
 * - 组件卸载时自动清理回调，避免内存泄漏
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const isVisibleGlobal = ref(true)
let listenerCount = 0
let visibilityHandler: (() => void) | null = null

function ensureListener(): void {
  if (listenerCount === 0) {
    visibilityHandler = () => {
      isVisibleGlobal.value = !document.hidden
    }
    document.addEventListener('visibilitychange', visibilityHandler)
    // 初始状态
    isVisibleGlobal.value = !document.hidden
  }
  listenerCount++
}

function maybeRemoveListener(): void {
  listenerCount--
  if (listenerCount <= 0 && visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
    listenerCount = 0
  }
}

interface PauseCallbacks {
  pause: () => void
  resume: () => void
}

export function useVisibilityPause() {
  const isVisible = ref(isVisibleGlobal.value)
  const localCallbacks: PauseCallbacks[] = []

  let lastVisible = isVisibleGlobal.value

  const handleVisibility = () => {
    const nowVisible = isVisibleGlobal.value
    if (nowVisible && !lastVisible) {
      // 从隐藏切到可见：触发 resume
      localCallbacks.forEach((cb) => {
        try {
          cb.resume()
        } catch (e) {
          if (import.meta.env.DEV) console.error('[useVisibilityPause] resume error:', e)
        }
      })
    } else if (!nowVisible && lastVisible) {
      // 从可见切到隐藏：触发 pause
      localCallbacks.forEach((cb) => {
        try {
          cb.pause()
        } catch (e) {
          if (import.meta.env.DEV) console.error('[useVisibilityPause] pause error:', e)
        }
      })
    }
    lastVisible = nowVisible
  }

  onMounted(() => {
    ensureListener()
    lastVisible = isVisibleGlobal.value
    isVisible.value = isVisibleGlobal.value
  })

  onBeforeUnmount(() => {
    // 清理本组件注册的所有回调
    localCallbacks.length = 0
    maybeRemoveListener()
  })

  // 同步全局 isVisible 到本地响应式 ref，并在可见性变化时触发 pause/resume 回调
  watch(isVisibleGlobal, () => {
    isVisible.value = isVisibleGlobal.value
    handleVisibility()
  })

  /** 注册暂停回调 */
  function onPause(cb: () => void): void {
    localCallbacks.push({ pause: cb, resume: () => {} })
  }

  /** 注册恢复回调 */
  function onResume(cb: () => void): void {
    localCallbacks.push({ pause: () => {}, resume: cb })
  }

  /** 注册暂停和恢复回调（语法糖） */
  function onPauseResume(onPauseCb: () => void, onResumeCb: () => void): void {
    localCallbacks.push({ pause: onPauseCb, resume: onResumeCb })
  }

  return {
    isVisible,
    onPause,
    onResume,
    onPauseResume
  }
}
