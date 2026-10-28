/**
 * 看板/工作台小组件的取数状态（批一百零七）——单一实现。
 *
 * 这一族组件的失败形态此前各不相同，且多数把"取数失败"伪装成"就是 0 / 就是空"
 * （统计卡显示 0、最近日志空表、待办卡整块隐藏）；用户无法区分"服务抖动"与"真的没有"。
 *
 * 本组合子把三件事收敛到一处：
 * - `loaded`：**至少成功过一次**（模板据此决定"从未有过数据 ⇒ 显示失败态"）；
 * - `loadError`：**最近一次失败**（已成功过再失败时保留旧值，模板标注"显示上次数据"）；
 * - `lastSuccessAt`：最近一次成功取数的时刻（模板用它把"陈旧"说成"显示 10:05:12 的数据"）；
 * - 后发请求先回时丢弃旧响应（自动刷新与手动重试可能重叠）。
 *
 * `load` 自己不抛：组件的取数发生在 mounted / 自动刷新回调里，拒绝逸出只会变成
 * 全局未处理拒绝，而不是用户可见的结局。
 */
import { ref, type Ref } from 'vue'

export interface WidgetLoad<T> {
  data: Ref<T>
  loading: Ref<boolean>
  loaded: Ref<boolean>
  loadError: Ref<boolean>
  /** 最近一次成功取数的时刻（ms）；失败不清空——"陈旧"必须能说出是几点几分的数据 */
  lastSuccessAt: Ref<number | null>
  load: () => Promise<void>
}

export function useWidgetLoad<T>(fetcher: () => Promise<T>, initialValue: T): WidgetLoad<T> {
  const data = ref(initialValue) as Ref<T>
  const loading = ref(false)
  const loaded = ref(false)
  const loadError = ref(false)
  const lastSuccessAt = ref<number | null>(null)
  let seq = 0

  async function load(): Promise<void> {
    const my = ++seq
    loading.value = true
    try {
      const next = await fetcher()
      if (my !== seq) return
      data.value = next
      loaded.value = true
      loadError.value = false
      lastSuccessAt.value = Date.now()
    } catch (e) {
      if (my !== seq) return
      loadError.value = true
      if (import.meta.env.DEV) console.warn('[useWidgetLoad] 取数失败（界面标注并给重试）:', e)
    } finally {
      if (my === seq) loading.value = false
    }
  }

  return { data, loading, loaded, loadError, lastSuccessAt, load }
}
