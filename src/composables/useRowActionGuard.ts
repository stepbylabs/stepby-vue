import { ref, type Ref } from 'vue'

/**
 * 行内动作的互斥与 loading（"立即推送"这类会向收件人真实投递的动作必须防连点）。
 *
 * 两条状态各有分工：
 * - `busy` 是**同步** Set：第一次点击即占位，连点时第二次直接返回 —— 只靠响应式
 *   `runningIds` 不行，它在 `await confirm()` 之后才置位，连点会弹出两个确认框，
 *   用户依次确认就会真的投递两次；
 * - `runningIds` 是响应式列表：确认通过、请求在途时按钮显示 loading 并禁用。
 *
 * 取消确认 = 不执行动作（`confirmed` 拒绝时直接释放）；动作失败默认只记录不再抛
 * （提示由请求拦截器统一负责），可通过 `onError` 换口径。
 */
export function useRowActionGuard<K extends number | string>(
  onError?: (key: K, error: unknown) => void
): {
  runningIds: Ref<K[]>
  guarded: (key: K, confirmed: () => Promise<unknown>, action: () => Promise<void>) => Promise<void>
} {
  const runningIds = ref<K[]>([]) as Ref<K[]>
  const busy = new Set<K>()

  async function guarded(key: K, confirmed: () => Promise<unknown>, action: () => Promise<void>): Promise<void> {
    if (busy.has(key)) return
    busy.add(key)
    try {
      try {
        await confirmed()
      } catch {
        return
      }
      runningIds.value = [...runningIds.value, key]
      try {
        await action()
      } catch (e) {
        if (onError) onError(key, e)
        else if (import.meta.env.DEV) console.error('[useRowActionGuard] action failed:', key, e)
      }
    } finally {
      runningIds.value = runningIds.value.filter((x: K) => x !== key)
      busy.delete(key)
    }
  }

  return { runningIds, guarded }
}
