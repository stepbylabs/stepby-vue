/**
 * 可见性感知的轮询单一实现（b113）
 *
 * 立的案：轮询纪律此前散在三个地方，**三种写法三种坏法**——
 * ① `useAutoRefresh`：隐藏暂停、可见恢复，但恢复后**只重新排期**，不立即取一次
 *    ⇒ 用户回到标签页看到的是隐藏前那一刻的数据，还要再等满一个周期才刷新；
 * ② `views/monitor/server`：2s 固定 `setInterval`，**完全不看 `document.hidden`**
 *    ⇒ 后台标签页每分钟 30 次请求（一屏 60 点曲线全部采在没人看的时候）；
 * ③ `views/report/view`：`scheduleRefresh()` 只在**排期那一刻**判 `document.hidden`
 *    ⇒ 隐藏期间照样轮询（浪费），而"隐藏时改间隔"会让它**永远不再启动**
 *    （没有任何 `visibilitychange` 监听能把它叫醒）。
 *
 * 统一口径（一条实现，三个消费点）：
 * - **隐藏即停**：标签页不可见时清掉定时器；
 * - **可见即恢复，且立即取一次**：回来后第一件事是把数据刷新到当下，而不是再等一个周期；
 * - **不重叠**：递归 `setTimeout` + 在途闸，慢请求不会堆积成并发；
 * - **间隔为 0 = 关闭**：不排期、恢复时也不取数；
 * - **卸载即停**：组件销毁必须清定时器与可见性回调（否则隐藏页仍会请求）。
 *
 * 刻意不做"恢复时必须离开超过 N 秒才刷新"：这类阈值只会让"刚切走 3 秒回来"的页面
 * 显示三秒前的数据，而它换来的节省只是一次请求。需要节流的场景应当由调用方决定 interval。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useVisibilityPause } from './useVisibilityPause'

export interface VisiblePollingHandle {
  /** 启动（幂等）：生效的 interval 为 0 或页面不可见时不排期 */
  start: () => void
  /** 停止并清定时器（保留已注册的可见性回调，再次 start 可恢复） */
  stop: () => void
  /** 立即执行一次（在途时跳过）；不影响既定排期 */
  runNow: () => void
}

export function useVisiblePolling(
  callback: () => void | Promise<void>,
  intervalMs: () => number
): VisiblePollingHandle {
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let running = false

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule(): void {
    clearTimer()
    const ms = intervalMs()
    if (!active || ms <= 0 || document.hidden) return
    timer = setTimeout(() => {
      timer = null
      void run()
    }, ms)
  }

  async function run(): Promise<void> {
    if (running) return
    running = true
    try {
      await callback()
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useVisiblePolling] callback error:', e)
    } finally {
      running = false
      // 只有"仍在跑且可见"才续排：隐藏时停下，等可见回调重新驱动
      if (active && !document.hidden) schedule()
    }
  }

  function start(): void {
    active = true
    schedule()
  }

  function stop(): void {
    active = false
    clearTimer()
  }

  function runNow(): void {
    void run()
  }

  // 隐藏 → 停；可见 → 立即取一次（此时若恰有请求在途，由它的 finally 续排，不重复发）
  useVisibilityPause().onPauseResume(
    () => clearTimer(),
    () => {
      if (active && intervalMs() > 0) void run()
    }
  )

  onMounted(() => {
    // 组件挂载时若调用方尚未 start，不自动开始（尊重"0 = 关闭"与显式开关）
    if (active) schedule()
  })

  onBeforeUnmount(() => {
    stop()
  })

  return { start, stop, runNow }
}
