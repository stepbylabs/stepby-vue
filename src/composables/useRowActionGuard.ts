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
 *
 * `guarded` 返回**本次是否真的执行了动作**：`false` = 被同步闸挡掉（同键在飞）或用户取消。
 * 乐观更新的页面（先改 v-model 再发请求）必须用它决定是否回滚——否则"被挡掉的第二次点击"
 * 会把开关停在用户以为生效、实际没发请求的位置（b105 告警页实测形态）。
 */
export function useRowActionGuard<K extends number | string>(
  onError?: (key: K, error: unknown) => void
): {
  runningIds: Ref<K[]>
  guarded: (key: K, confirmed: () => Promise<unknown>, action: () => Promise<void>) => Promise<boolean>
} {
  const runningIds = ref<K[]>([]) as Ref<K[]>
  const busy = new Set<K>()

  async function guarded(key: K, confirmed: () => Promise<unknown>, action: () => Promise<void>): Promise<boolean> {
    if (busy.has(key)) return false
    busy.add(key)
    try {
      try {
        await confirmed()
      } catch {
        return false
      }
      runningIds.value = [...runningIds.value, key]
      try {
        await action()
      } catch (e) {
        if (onError) onError(key, e)
        else if (import.meta.env.DEV) console.error('[useRowActionGuard] action failed:', key, e)
      }
      return true
    } finally {
      runningIds.value = runningIds.value.filter((x: K) => x !== key)
      busy.delete(key)
    }
  }

  return { runningIds, guarded }
}
