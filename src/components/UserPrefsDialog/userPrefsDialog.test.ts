/**
 * 用户偏好保存的「持久化结局」回归锁（b141）。
 *
 * 立的案：`updateUserPrefs` 原先忽略 `cache.local.setJSON` 的布尔结果，而对话框无条件
 * 弹「偏好设置已保存」。存储不可用（Safari 隐私模式 / 配额满）时本次会话确实生效了，
 * 但下次启动会退回旧值——界面说"已保存"属于假成功（b89/b121「switched-not-persisted」同族）。
 *
 * 三条判据：
 * 1. 落盘成功 ⇒ 成功提示，且不得出现"未保存"警告；
 * 2. 落盘失败 ⇒ 警告文案（本次会话生效、下次启动恢复原值），且不得报成功；
 * 3. 两条路径都把整份表单交给 store（不是丢字段的部分更新），并关闭对话框。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const hoisted = vi.hoisted(() => ({
  msgSuccess: vi.fn(),
  msgWarning: vi.fn(),
  msgError: vi.fn(),
  updateUserPrefs: vi.fn(),
  store: {
    userPrefs: {
      defaultPageSize: 10,
      defaultSortOrder: 'desc',
      tableDensity: 'default',
      autoRefreshInterval: 0,
      mobileTableCards: false,
      followSystemDark: false,
      watermarkEnabled: false,
      sessionTimeout: 0,
      timezone: 'Asia/Shanghai',
      tableColumns: {}
    }
  }
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => ({ ...hoisted.store, updateUserPrefs: hoisted.updateUserPrefs })
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a),
    msgWarning: (...a: unknown[]) => hoisted.msgWarning(...a),
    msgError: (...a: unknown[]) => hoisted.msgError(...a)
  }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

vi.mock('@/composables/useDialogDirtyGuard', () => ({
  useDialogDirtyGuard: () => ({ beforeClose: () => {}, cancel: () => {} })
}))

import UserPrefsDialog from './index.vue'

const stubs = {
  'el-dialog': {
    name: 'ElDialogStub',
    props: ['modelValue'],
    template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>'
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-divider': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio': { template: '<label><slot /></label>' },
  'el-switch': { template: '<span />' },
  'el-input-number': { template: '<input />' },
  'el-button': {
    props: ['loading', 'type'],
    emits: ['click'],
    template: '<button class="btn-stub" :data-type="type" @click="$emit(\'click\')"><slot /></button>'
  }
}

async function mountOpen() {
  const w = mount(UserPrefsDialog, { global: { stubs } })
  ;(w.vm as unknown as { open: () => void }).open()
  await nextTick()
  return w
}

function saveButton(w: Awaited<ReturnType<typeof mountOpen>>) {
  return w.findAll('.btn-stub').find((b) => b.text().includes('userPrefs.save'))!
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('用户偏好保存：持久化结局必须可见（b141）', () => {
  it('落盘成功 ⇒ 成功提示且无"未保存"警告', async () => {
    hoisted.updateUserPrefs.mockReturnValue(true)
    const w = await mountOpen()

    await saveButton(w).trigger('click')
    await flushPromises()

    expect(hoisted.updateUserPrefs).toHaveBeenCalledTimes(1)
    expect(hoisted.msgSuccess).toHaveBeenCalledTimes(1)
    expect(hoisted.msgWarning).not.toHaveBeenCalled()
    expect(w.findComponent({ name: 'ElDialogStub' }).props('modelValue')).toBe(false)
  })

  it('落盘失败 ⇒ 警告"本次会话生效、下次启动恢复原值"，不得报成功', async () => {
    hoisted.updateUserPrefs.mockReturnValue(false)
    const w = await mountOpen()

    await saveButton(w).trigger('click')
    await flushPromises()

    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
    expect(hoisted.msgWarning).toHaveBeenCalledTimes(1)
    expect(hoisted.msgWarning.mock.calls[0][0]).toBe('userPrefs.saveNotPersisted')
  })

  it('提交的是整份表单偏好（不是丢字段的部分更新），并关闭对话框', async () => {
    hoisted.updateUserPrefs.mockReturnValue(true)
    const w = await mountOpen()

    await saveButton(w).trigger('click')
    await flushPromises()

    const payload = hoisted.updateUserPrefs.mock.calls[0][0] as Record<string, unknown>
    expect(payload.defaultPageSize).toBe(10)
    expect(payload.timezone).toBe('Asia/Shanghai')
    expect(w.findComponent({ name: 'ElDialogStub' }).props('modelValue')).toBe(false)
  })
})
