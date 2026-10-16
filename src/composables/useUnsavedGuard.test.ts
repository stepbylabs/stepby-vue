/**
 * useUnsavedGuard 单元测试（b71 T4 补测：UX-5 表单未保存离开确认守卫）
 *
 * 覆盖：干净表单直通 / 脏表单确认离开与取消 / markSaved 重置基准 /
 * null 归一化 / 嵌套对象与字段顺序敏感性（浅层 JSON 比较的既有语义）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const t = (key: string) => key
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t }) }))
// b71：useUnsavedGuard 依赖 element-plus 的 ElMessageBox（文件整体禁真实加载，confirm 行为用例内控制）
const { elMessageBoxConfirm } = vi.hoisted(() => ({ elMessageBoxConfirm: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: elMessageBoxConfirm } }))

import { useUnsavedGuard } from './useUnsavedGuard'

describe('useUnsavedGuard', () => {
  beforeEach(() => {
    elMessageBoxConfirm.mockReset()
  })

  it('未快照时干净表单 confirmLeave 直通（不弹确认）', async () => {
    const { snapshotForm, confirmLeave } = useUnsavedGuard()
    snapshotForm({ userName: 'a' })
    const ok = await confirmLeave({ userName: 'a' })
    expect(ok).toBe(true)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()
  })

  it('脏表单：确认离开解析 → true', async () => {
    elMessageBoxConfirm.mockResolvedValue('confirm')
    const { snapshotForm, confirmLeave } = useUnsavedGuard()
    snapshotForm({ userName: 'a' })
    const ok = await confirmLeave({ userName: 'changed' })
    expect(ok).toBe(true)
    expect(elMessageBoxConfirm).toHaveBeenCalledTimes(1)
  })

  it('脏表单：取消关闭 reject → false（弹窗保持打开）', async () => {
    elMessageBoxConfirm.mockRejectedValue('cancel')
    const { snapshotForm, confirmLeave } = useUnsavedGuard()
    snapshotForm({ userName: 'a' })
    const ok = await confirmLeave({ userName: 'changed' })
    expect(ok).toBe(false)
  })

  it('markSaved 以当前表单为新基准，后续修改前关闭不再弹确认', async () => {
    const { snapshotForm, markSaved, confirmLeave } = useUnsavedGuard()
    snapshotForm({ userName: 'a' })
    const edited = { userName: 'b' }
    markSaved(edited)
    const ok = await confirmLeave(edited)
    expect(ok).toBe(true)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()
  })

  it('null/undefined 表单归一化为 null 比较', async () => {
    const { snapshotForm, confirmLeave } = useUnsavedGuard()
    snapshotForm(null)
    expect(await confirmLeave(undefined)).toBe(true)
    // {} 与 null 序列化不同 → 脏 → 弹确认；用户取消 → false
    elMessageBoxConfirm.mockRejectedValue('cancel')
    expect(await confirmLeave({})).toBe(false)
  })

  it('浅层 JSON 比较：嵌套对象按序列化结果比较（同结构同序 → 干净）', async () => {
    const { snapshotForm, confirmLeave } = useUnsavedGuard()
    const form = { userName: 'a', dept: { deptId: 1, deptName: 'x' } }
    snapshotForm(form)
    // 新对象、同字段同序 → JSON 相等 → 直通
    expect(await confirmLeave({ userName: 'a', dept: { deptId: 1, deptName: 'x' } })).toBe(true)
    // 嵌套值变化 → 脏 → 弹确认；用户取消 → false
    elMessageBoxConfirm.mockRejectedValue('cancel')
    expect(await confirmLeave({ userName: 'a', dept: { deptId: 2, deptName: 'x' } })).toBe(false)
  })
})
