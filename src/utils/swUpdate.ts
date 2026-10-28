/**
 * Service Worker 更新通道（b117）
 *
 * 立案（改造前 HEAD 实测）：`main.ts` 只有 `registerSW({ immediate: true })`，而
 * `registerType: 'autoUpdate'` 在 `vite-plugin-pwa/dist/client/build/register.js` 里的口径是
 * `activated` 事件（`isUpdate`）到达时**直接 `window.location.reload()`**（未传 `onNeedReload`
 * 就走这个兜底）。于是后台发一次版，正在填表/跑查询的浏览器会被**静默整页刷新**：
 * 未保存输入、弹窗、筛选与在途请求一起消失，且屏幕上没有任何"为什么刷新"的解释。
 * 同一个实现还只在页面加载时检查一次更新——长驻 SPA 没有导航，浏览器的软更新检查不会触发，
 * 标签页可能连续几天跑旧包（b117 实测 `frontend-dist/static/js` 只有一个入口 chunk，
 * 旧页在内存里"看起来能用"，恰恰让这种陈旧最难被发现）。
 *
 * 口径：
 * - **刷新时机归用户**：`onNeedReload` 只置信号（`ready`/`seq`），界面给可见入口，
 *   用户点「立即刷新」才 `applySwUpdate()`；
 * - **检查归界面**：本模块只提供 `checkSwUpdate()`（一次 `registration.update()`），
 *   周期调度由组件经 `useVisiblePolling` 驱动（隐藏即停、可见补一次、在途不叠加）；
 * - `installSwUpdate` 是装配的**单一出口**：形状锁 `swUpdateWiring.guard.test.ts` 钉住
 *   `main.ts` 不得回退到裸 `registerSW({...})`，否则静默刷新会在下一次重构里复发。
 */
import { readonly, ref } from 'vue'

/** `virtual:pwa-register` 的 `registerSW` 结构类型（不直接依赖虚拟模块，单测可注入假实现） */
export interface SwUpdateRegisterOptions {
  immediate?: boolean
  onNeedReload?: () => void
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

export type RegisterSw = (options?: SwUpdateRegisterOptions) => (reloadPage?: boolean) => Promise<void>

/** 更新检查间隔：30 分钟（浏览器只在导航时做软更新检查，长驻 SPA 必须自己问） */
export const SW_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

const ready = ref(false)
const seq = ref(0)
let registration: ServiceWorkerRegistration | null = null
let installed = false

/** 新版本是否已就绪（只读） */
export const swUpdateReady = readonly(ready)
/** 新版本就绪次数：每激活一次 +1，界面据此让"稍后"只对本次生效 */
export const swUpdateSeq = readonly(seq)

/**
 * 装配更新通道（`main.ts` 调用一次）。
 *
 * 必须传 `onNeedReload`：autoUpdate 档不传它，插件自己 `window.location.reload()`
 * （见文件头立案），这是本模块存在的全部理由。
 */
export function installSwUpdate(register: RegisterSw): void {
  if (installed) return
  installed = true
  register({
    immediate: true,
    onNeedReload: markReady,
    onRegisteredSW: (_swUrl, reg) => {
      registration = reg ?? null
    }
  })
}

function markReady(): void {
  seq.value += 1
  ready.value = true
}

/**
 * 主动检查一次更新（`registration.update()`）。
 *
 * - 注册尚未完成（首屏、SW 不可用）⇒ `false`，不发请求；
 * - 检查失败（离线 / 服务端 5xx）⇒ `false` 且不抛错：这是尽力而为的后台检查，
 *   失败不该冒泡成页面级错误；DEV 保留一条 warn 便于定位；
 * - 真的发现新版本时，激活流程会经 `onNeedReload` 走到 `markReady`。
 */
export async function checkSwUpdate(): Promise<boolean> {
  if (!registration) return false
  try {
    await registration.update()
    return true
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[swUpdate] 检查新版本失败:', e)
    return false
  }
}

/** 用户确认后整页刷新（拿到新的入口与预缓存；白名单见 fullPageReload.guard.test.ts） */
export function applySwUpdate(): void {
  window.location.reload()
}

/** 仅单测使用：复位模块级状态（生产代码不得调用） */
export function __resetSwUpdateForTest(): void {
  installed = false
  registration = null
  ready.value = false
  seq.value = 0
}
