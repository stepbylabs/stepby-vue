/**
 * 消息偏好页的「读成功前不得写」回归锁（b133）。
 *
 * 立的案（HEAD 实测）：`load()` 的 `.catch(() => {})` 把失败吞掉，表单留在**默认值**上
 * （email=1 / sysmsg=1 / announce=1 / dnd=0），而保存按钮照常可用。于是后端抖一次，
 * 用户点一下"保存"就把自己真实的免打扰时段与通知偏好**覆盖成默认值**——读失败被签成了一次写。
 *
 * 四条判据：
 * 1. 加载失败 ⇒ 失败提示可见、保存按钮禁用、不发 update；
 * 2. 失败后点重试并成功 ⇒ 表单值来自响应、保存按钮恢复可用；
 * 3. 后端 200 但无 data ⇒ 仍视为"没读到"，保存继续禁用（不拿默认值冒充真实偏好）；
 * 4. 读到之后再保存 ⇒ 真的调用 updateMessagePref（防"永远禁用"的假修复）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getMessagePref: vi.fn(),
  updateMessagePref: vi.fn()
}))

vi.mock('@/api/system/pref', () => ({
  getMessagePref: (...a: unknown[]) => hoisted.getMessagePref(...a),
  updateMessagePref: (...a: unknown[]) => hoisted.updateMessagePref(...a)
}))

vi.mock('@/utils/errorHub', () => ({
  errorHub: { report: vi.fn() }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import MsgPref from './msgPref.vue'

const stubs = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-alert': { template: '<div class="alert-stub" v-bind="$attrs"><slot /></div>' },
  'el-form': {
    props: ['disabled'],
    template: '<form class="form-stub" :data-disabled="String(!!disabled)"><slot /></form>'
  },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-divider': { template: '<div><slot /></div>' },
  'el-switch': {
    props: ['modelValue', 'activeValue', 'inactiveValue'],
    template: '<span class="switch-stub" :data-value="String(modelValue)"></span>'
  },
  'el-time-select': { template: '<span />' },
  'el-button': {
    props: ['loading', 'disabled', 'type', 'link'],
    emits: ['click'],
    template:
      '<button class="btn-stub" :data-disabled="String(!!disabled)" :data-loading="String(!!loading)" @click="$emit(\'click\')"><slot /></button>'
  }
}

function mountPage() {
  return mount(MsgPref, {
    global: {
      stubs: { ...stubs, Bell: true, QuestionFilled: true },
      directives: { loading: () => {} }
    }
  })
}

function saveButton(w: ReturnType<typeof mountPage>) {
  return w.findAll('.btn-stub')[w.findAll('.btn-stub').length - 1]
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.updateMessagePref.mockResolvedValue({ code: 200 })
})

describe('消息偏好：读失败不得被保存成默认值（b133）', () => {
  it('加载失败 ⇒ 失败提示可见、保存禁用、不发写请求', async () => {
    hoisted.getMessagePref.mockRejectedValue(new Error('network down'))
    const w = mountPage()
    await flushPromises()

    expect(w.find('[data-test="msg-pref-load-error"]').exists()).toBe(true)
    expect(saveButton(w).attributes('data-disabled')).toBe('true')
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(hoisted.updateMessagePref).not.toHaveBeenCalled()
  })

  it('重试成功后表单被真实值填充，保存恢复可用并真的提交', async () => {
    hoisted.getMessagePref.mockRejectedValueOnce(new Error('boom'))
    hoisted.getMessagePref.mockResolvedValueOnce({
      data: {
        emailNotify: '0',
        sysmsgNotify: '0',
        announceNotify: '1',
        dndEnabled: '1',
        dndStart: '22:00',
        dndEnd: '06:00'
      }
    })
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-test="msg-pref-load-error"]').exists()).toBe(true)

    // 失败提示里的"重试"是第一个按钮
    await w.findAll('.btn-stub')[0].trigger('click')
    await flushPromises()

    expect(hoisted.getMessagePref).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="msg-pref-load-error"]').exists()).toBe(false)
    const switches = w.findAll('.switch-stub')
    expect(switches[0].attributes('data-value')).toBe('0') // emailNotify 来自响应，不是默认值 '1'
    expect(saveButton(w).attributes('data-disabled')).toBe('false')

    await saveButton(w).trigger('click')
    await flushPromises()
    expect(hoisted.updateMessagePref).toHaveBeenCalledTimes(1)
    expect(hoisted.updateMessagePref.mock.calls[0][0]).toMatchObject({ emailNotify: '0', dndStart: '22:00' })
  })

  it('后端 200 但无 data ⇒ 仍算未读到，保存保持禁用', async () => {
    hoisted.getMessagePref.mockResolvedValue({ data: null })
    const w = mountPage()
    await flushPromises()

    expect(saveButton(w).attributes('data-disabled')).toBe('true')
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(hoisted.updateMessagePref).not.toHaveBeenCalled()
  })
})
