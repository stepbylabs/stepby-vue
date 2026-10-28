/**
 * 浏览器网络状态（b122）。
 *
 * ## 为什么需要它
 *
 * 应用是 PWA（预缓存使离线也能打开骨架），但离线时每个请求各自弹一条错误提示：
 * 用户看到的是"这个按钮坏了、那个按钮也坏了"，而真正的事实是**整机断网**。
 * 一个全局、常驻、可自动收起的横幅把这件事说清楚，并在恢复时给一次确认。
 *
 * ## 口径（不做过度承诺）
 *
 * `navigator.onLine` 只代表**浏览器报告的连通性**（能否找到网络接口），
 * 不代表后端可达：连着 WiFi 但出口断了、内网路由不通时它仍为 `true`。
 * 因此文案只说"网络连接已断开/已恢复"，不承诺"服务可用"；后端不可达仍由
 * 请求层的失败提示与 /network-error 冷加载页负责（permission.ts）。
 *
 * ## 单例
 *
 * 模块级共享状态：横幅、将来的其它消费者共用一份监听与一个计时器。
 * 禁止在组件里各自 `addEventListener('online')`——同一事件会被处理 N 次，
 * 且"恢复提示该显示多久"会随组件数量漂移。
 */
import { readonly, ref, type Ref } from 'vue'

/** 恢复提示的可见时长：够看清，又不至于长期占住顶部 */
export const NETWORK_RECOVERED_VISIBLE_MS = 4000

const online = ref(true)
const recovered = ref(false)

let installed = false
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function handleOffline(): void {
  clearHideTimer()
  // 断开时恢复提示必须立刻收起：先报"已恢复"再挂"已断开"会让用户读反
  recovered.value = false
  online.value = false
}

function handleOnline(): void {
  clearHideTimer()
  online.value = true
  recovered.value = true
  hideTimer = setTimeout(() => {
    recovered.value = false
    hideTimer = null
  }, NETWORK_RECOVERED_VISIBLE_MS)
}

/**
 * 安装全局监听（应用启动一次即可；重复调用无副作用）。
 *
 * 初始值取 `navigator.onLine`：冷启动时就已断网的标签页不能等到第一次 `offline`
 * 事件——那个事件发生在断网那一刻，早就过去了。
 */
export function installNetworkStatus(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  online.value = typeof navigator === 'undefined' || navigator.onLine !== false
  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)
}

export interface NetworkStatus {
  /** 浏览器报告的连通性（初始值来自 navigator.onLine） */
  online: Readonly<Ref<boolean>>
  /** 刚从断开恢复：用于显示几秒"已恢复"确认，超时自动收起 */
  recovered: Readonly<Ref<boolean>>
}

export function useNetworkStatus(): NetworkStatus {
  installNetworkStatus()
  return { online: readonly(online), recovered: readonly(recovered) }
}

/** 仅供测试：移除监听并把状态复位到"在线、未恢复"（生产码不调用） */
export function __resetNetworkStatusForTest(): void {
  if (installed && typeof window !== 'undefined') {
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('online', handleOnline)
  }
  installed = false
  clearHideTimer()
  online.value = true
  recovered.value = false
}
