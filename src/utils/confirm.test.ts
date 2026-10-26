/**
 * b94：确认框取消不得产生未处理拒绝。
 *
 * 立的案：`const ok = await proxy?.$modal.confirm(...)` 在租户/SCIM 页面上，
 * 用户点"取消"时 Element Plus 抛 `'cancel'`，页面没有 catch ⇒ unhandledrejection
 * 被写进前端错误监控（把真实故障信号埋进噪声）。confirmAction 把取消折叠为 false。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  confirm: vi.fn()
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    confirm: (...args: unknown[]) => hoisted.confirm(...args)
  }
}))

import { confirmAction } from './confirm'

describe('confirmAction（b94）', () => {
  beforeEach(() => {
    hoisted.confirm.mockReset()
  })

  it('确认返回 true', async () => {
    hoisted.confirm.mockResolvedValueOnce('confirm')
    await expect(confirmAction('继续吗')).resolves.toBe(true)
    expect(hoisted.confirm).toHaveBeenCalledWith('继续吗')
  })

  it('取消/关闭返回 false，且不抛拒绝', async () => {
    hoisted.confirm.mockRejectedValueOnce('cancel')
    await expect(confirmAction('继续吗')).resolves.toBe(false)
    hoisted.confirm.mockRejectedValueOnce('close')
    await expect(confirmAction('继续吗')).resolves.toBe(false)
  })

  it('确认框自身的意外异常同样折叠为 false（不让拒绝逸出）', async () => {
    hoisted.confirm.mockRejectedValueOnce(new Error('dialog broken'))
    await expect(confirmAction('继续吗')).resolves.toBe(false)
  })
})
