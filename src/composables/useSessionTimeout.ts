/**
 * TierB-2: 会话超时 composable
 *
 * 功能：监听用户无操作时间，超过阈值自动登出并提示
 *
 * 监听事件：
 * - mousemove（鼠标移动）
 * - mousedown（鼠标按下）
 * - keydown（键盘按下）
 * - scroll（滚动）
 * - touchstart（触摸开始）
 * - click（点击）
 *
 * 阈值：
 * - 默认 30 分钟无操作自动登出
 * - 可通过 userPrefs.sessionTimeout 自定义（分钟）
 * - 0 表示禁用
 *
 * 提示：
 * - 登出前 60 秒弹出警告对话框，用户可选择继续
 * - 登出后跳转到登录页，并带回跳参数
 *
 * 使用方式：
 *   import { useSessionTimeout } from '@/composables/useSessionTimeout'
 *   useSessionTimeout()  // 在 layout/index.vue 或 App.vue 调用一次即可
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import i18n from '@/i18n'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'
import useSettingsStore from '@/store/modules/settings'

const DEFAULT_TIMEOUT_MINUTES = 30
const WARNING_BEFORE_SECONDS = 60 // 提前 60 秒警告

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

export function useSessionTimeout(): void {
  const router = useRouter()
  const userStore = useUserStore()
  const settingsStore = useSettingsStore()

  // P1 修复: lastActivity 改为普通变量，避免每次 mousemove 触发响应式更新（高频事件）
  let lastActivity = Date.now()
  const warningShown = ref<boolean>(false)
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  // P2 修复: 跟踪登出重定向定时器，组件卸载时清理，避免卸载后强制跳转
  let logoutRedirectTimer: ReturnType<typeof setTimeout> | null = null

  /** 获取当前超时阈值（毫秒），0 表示禁用 */
  function getTimeoutMs(): number {
    const minutes = settingsStore.userPrefs.sessionTimeout
    if (minutes === undefined || minutes === null) {
      return DEFAULT_TIMEOUT_MINUTES * 60 * 1000
    }
    return minutes * 60 * 1000
  }

  /** 用户活动事件处理 */
  function handleUserActivity(): void {
    lastActivity = Date.now()
    // 用户有操作时重置警告状态
    if (warningShown.value) {
      warningShown.value = false
    }
  }

  /** 检查是否超时 */
  function checkTimeout(): void {
    // 未登录则跳过
    if (!userStore.token) return

    const timeoutMs = getTimeoutMs()
    if (timeoutMs <= 0) return // 禁用

    const elapsed = Date.now() - lastActivity
    const warningMs = timeoutMs - WARNING_BEFORE_SECONDS * 1000

    // 已超时，直接登出
    if (elapsed >= timeoutMs) {
      handleLogout()
      return
    }

    // 接近超时，弹出警告（仅一次）。
    // 当超时阈值 <= 警告提前量（60s）时 warningMs<=0，此时不做中途警告，直接到点登出，
    // 避免极短超时下第一次检查（elapsed≈0）立即误弹警告框。
    if (warningMs > 0 && elapsed >= warningMs && !warningShown.value) {
      handleWarning(timeoutMs - elapsed)
    }
  }

  /** 弹出超时警告 */
  async function handleWarning(remainingMs: number): Promise<void> {
    warningShown.value = true
    const remainingSeconds = Math.ceil(remainingMs / 1000)
    try {
      await ElMessageBox.confirm(
        i18n.global.t('session.timeoutWarning', { seconds: remainingSeconds }),
        i18n.global.t('session.timeoutWarningTitle'),
        {
          confirmButtonText: i18n.global.t('session.continueOperation'),
          cancelButtonText: i18n.global.t('session.logoutNow'),
          type: 'warning',
          duration: 0 // 不自动关闭
        }
      )
      // 用户选择继续，重置活动时间
      lastActivity = Date.now()
      warningShown.value = false
    } catch {
      // 用户选择登出或关闭对话框
      handleLogout()
    }
  }

  /** 执行登出 */
  async function handleLogout(): Promise<void> {
    if (intervalTimer) {
      clearInterval(intervalTimer)
      intervalTimer = null
    }
    try {
      await userStore.logOut()
    } catch {
      // ignore
    }
    // 跳转到登录页，带回跳参数
    if (logoutRedirectTimer) clearTimeout(logoutRedirectTimer)
    logoutRedirectTimer = setTimeout(() => {
      goLogin({ redirect: router.currentRoute.value.fullPath, reason: 'session-timeout' })
      logoutRedirectTimer = null
    }, 300)
  }

  onMounted(() => {
    // 注册活动事件监听
    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true })
    })
    // 启动定时检查（每 10 秒检查一次）
    intervalTimer = setInterval(checkTimeout, 10 * 1000)
  })

  onBeforeUnmount(() => {
    // 清理事件监听
    ACTIVITY_EVENTS.forEach((evt) => {
      window.removeEventListener(evt, handleUserActivity)
    })
    if (intervalTimer) {
      clearInterval(intervalTimer)
      intervalTimer = null
    }
    if (logoutRedirectTimer) {
      clearTimeout(logoutRedirectTimer)
      logoutRedirectTimer = null
    }
  })
}
