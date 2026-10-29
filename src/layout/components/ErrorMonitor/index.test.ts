/**
 * ErrorMonitor 追踪号展示与复制（b124）
 *
 * 判据两条链路都走真实实现：
 * 1. `errorHub.record(..., traceId)` → 订阅 → 弹层里出现该 ID（`data-trace-id` 锚点）；
 * 2. 复制按钮走**真实的 v-copyText 指令 + utils/clipboard**，结局按真实 `ok` 分支提示
 *    ——`copyText` 返回 false 时不得报"复制成功"（b111 立的纪律：返回值必须被真实消费）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  msg: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
  copyText: vi.fn(),
  push: vi.fn(() => Promise.resolve())
}))

vi.mock('element-plus', () => ({ ElMessage: hoisted.msg }))
vi.mock('@/utils/clipboard', () => ({ copyText: hoisted.copyText }))
vi.mock('@/router', () => ({ default: { push: hoisted.push } }))
vi.mock('@/i18n', () => ({ default: { global: { t: (key: string) => key } } }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params?.id ? `${key}(${String(params.id)})` : key)
  })
}))

import ErrorMonitor from './index.vue'
import copyTextDirective from '@/directive/common/copyText'
import { errorHub } from '@/utils/errorHub'

const stubs = {
  ElPopover: {
    name: 'ElPopover',
    template: '<div><slot name="reference" /><div class="popover-body"><slot /></div></div>'
  },
  ElButton: {
    name: 'ElButton',
    template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  ElTag: { name: 'ElTag', template: '<span><slot /></span>' },
  ElEmpty: { name: 'ElEmpty', props: ['description'], template: '<div class="empty">{{ description }}</div>' },
  ElIcon: { name: 'ElIcon', template: '<i><slot /></i>' },
  WarningFilled: true
}

function factory() {
  return mount(ErrorMonitor, {
    global: {
      stubs,
      directives: { copyText: copyTextDirective }
    }
  })
}

beforeEach(() => {
  errorHub.clear()
  hoisted.copyText.mockReset()
  hoisted.msg.mockClear()
  hoisted.msg.success.mockClear()
  hoisted.msg.error.mockClear()
  hoisted.msg.warning.mockClear()
})
afterEach(() => {
  errorHub.clear()
})

describe('追踪号展示', () => {
  it('有 traceId 时渲染 ID 与复制按钮；无 ID 的条目不渲染该行', async () => {
    const wrapper = factory()
    // 先记一条**没有**追踪号的，再记一条有的：若订阅方拿的是同一个数组引用（b124 修掉的
    // "列表冻结在第一条"缺陷），DOM 只会停在第一条、这一行根本不会出现。
    errorHub.record('warning', 'api', '没有追踪号的警告')
    await nextTick()
    errorHub.record('error', 'api', '带追踪号的错误', 'trace-abc')
    await nextTick()

    const rows = wrapper.findAll('.error-monitor-trace')
    expect(rows).toHaveLength(1)
    expect(rows[0].attributes('data-trace-id')).toBe('trace-abc')
    expect(rows[0].text()).toContain('trace-abc')
    expect(rows[0].text()).toContain('error.monitor.traceLabel')
    wrapper.unmount()
  })

  it('copy 按钮的可访问名带上具体 ID（读屏用户能确认复制的是哪一条）', async () => {
    const wrapper = factory()
    errorHub.record('error', 'api', '错误', 'trace-xyz')
    await nextTick()

    const btn = wrapper.find('.error-monitor-copy')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-label')).toContain('trace-xyz')
    wrapper.unmount()
  })
})

describe('复制结局按真实结果提示（b111 口径）', () => {
  it('copyText 成功 ⇒ 提示复制成功，且复制的是该条 ID（不是上一条）', async () => {
    hoisted.copyText.mockResolvedValue(true)
    const wrapper = factory()
    errorHub.record('error', 'api', '错误甲', 'trace-first')
    await nextTick()
    errorHub.record('error', 'api', '错误乙', 'trace-second')
    await nextTick()

    // 列表最新在前 ⇒ 第一个复制按钮对应 trace-second
    await wrapper.findAll('.error-monitor-copy')[0].trigger('click')
    await vi.waitFor(() => expect(hoisted.copyText).toHaveBeenCalledWith('trace-second'))
    await vi.waitFor(() => expect(hoisted.msg.success).toHaveBeenCalledWith('common.copySuccess'))
    expect(hoisted.msg.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('copyText 失败 ⇒ 提示复制失败，绝不报成功（假成功是比缺功能更坏的结局）', async () => {
    hoisted.copyText.mockResolvedValue(false)
    const wrapper = factory()
    errorHub.record('error', 'api', '错误', 'trace-fail')
    await nextTick()

    await wrapper.find('.error-monitor-copy').trigger('click')
    await vi.waitFor(() => expect(hoisted.msg.error).toHaveBeenCalledWith('common.copyFail'))
    expect(hoisted.msg.success).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
