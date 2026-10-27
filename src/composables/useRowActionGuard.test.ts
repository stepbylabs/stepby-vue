/**
 * useRowActionGuard（b102）：会向收件人真实投递的行内动作（报表"立即推送"）
 * 必须防连点——连点两次确认 = 投递两份。
 *
 * 覆盖：请求在途置 loading、连点时确认框只弹一次、动作只执行一次、
 * 取消确认不执行、动作失败后状态复位可重试；另含两处页面接线反查
 * （写了组合子但页面不接 = 等于没写）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { useRowActionGuard } from './useRowActionGuard'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('useRowActionGuard（行内动作互斥 + loading）', () => {
  it('请求在途：runningIds 含该行；结束后清空', async () => {
    const gate = useRowActionGuard<number>()
    const action = deferred()
    const run = gate.guarded(
      1,
      () => Promise.resolve(true),
      () => action.promise
    )
    await flush()
    expect(gate.runningIds.value).toEqual([1])
    action.resolve()
    await run
    expect(gate.runningIds.value).toEqual([])
  })

  it('连点：确认框只弹一次、动作只执行一次（投递不得重复）', async () => {
    const gate = useRowActionGuard<number>()
    const confirm = deferred<unknown>()
    const action = vi.fn(async () => {})
    const first = gate.guarded(1, () => confirm.promise, action)
    // 第二次点击发生在确认框还开着的时候
    const second = gate.guarded(1, () => confirm.promise, action)
    await second
    expect(action).not.toHaveBeenCalled()
    confirm.resolve(true)
    await first
    expect(action).toHaveBeenCalledTimes(1)
    expect(gate.runningIds.value).toEqual([])
  })

  it('取消确认：动作不执行，且锁已释放（再次点击可正常走完）', async () => {
    const gate = useRowActionGuard<number>()
    const action = vi.fn(async () => {})
    await gate.guarded(1, () => Promise.reject(new Error('cancel')), action)
    expect(action).not.toHaveBeenCalled()
    expect(gate.runningIds.value).toEqual([])
    await gate.guarded(1, () => Promise.resolve(true), action)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('动作失败：onError 收到原因、状态复位、可重试（不得永久锁死）', async () => {
    const onError = vi.fn()
    const gate = useRowActionGuard<number>(onError)
    const boom = new Error('network down')
    await gate.guarded(
      7,
      () => Promise.resolve(true),
      () => Promise.reject(boom)
    )
    expect(onError).toHaveBeenCalledWith(7, boom)
    expect(gate.runningIds.value).toEqual([])
    const ok = vi.fn(async () => {})
    await gate.guarded(7, () => Promise.resolve(true), ok)
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('不同行互不影响：A 在途时 B 仍可执行', async () => {
    const gate = useRowActionGuard<number>()
    const a = deferred()
    const done = vi.fn(async () => {})
    const first = gate.guarded(
      1,
      () => Promise.resolve(true),
      () => a.promise
    )
    await gate.guarded(2, () => Promise.resolve(true), done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(gate.runningIds.value).toEqual([1])
    a.resolve()
    await first
    expect(gate.runningIds.value).toEqual([])
  })

  it('接线反查：两处"立即推送"页面都必须走同一份组合子并绑按钮 loading', () => {
    for (const rel of ['src/views/system/report/SubReportSection.vue', 'src/views/system/report/sub/index.vue']) {
      const src = readFileSync(resolve(VUE_ROOT, rel), 'utf8')
      expect(src, `${rel} 必须 import useRowActionGuard`).toContain("from '@/composables/useRowActionGuard'")
      expect(src, `${rel} 必须调用 guarded(`).toContain('await guarded(')
      expect(src, `${rel} 的推送按钮必须绑 runningIds`).toContain(':loading="runningIds.includes(scope.row.subId)"')
      expect(src, `${rel} 的推送按钮必须禁用重复点击`).toContain(':disabled="runningIds.includes(scope.row.subId)"')
    }
  })
})
