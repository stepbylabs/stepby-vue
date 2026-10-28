/**
 * 图表小组件的"失败不丢图"回归锁（b108）。
 *
 * 此前三张图在 `error` 时用 `v-show="!empty && !error"` 把画布藏起来、换成"加载失败"：
 * 一次刷新失败就把已经渲染好的图从屏幕上抹掉，而组件内部的 `lastData` 其实还在。
 * 本文件在组件层钉住：
 * ① 首载失败 ⇒ 失败文案 + 重试（没有旧图可保留）；
 * ② 成功过再失败 ⇒ 画布仍可见 + 陈旧横幅（带 `HH:mm:ss` 截止时刻）+ 重试；
 * ③ 点重试成功后横幅消失、画布仍在；
 * ④ 成功但数据为空 ⇒ 空态（与失败态可区分）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  setOption: vi.fn(),
  autoRefresh: null as null | (() => unknown)
}))

vi.mock('@/utils/request', () => ({
  default: (...a: unknown[]) => hoisted.request(...a)
}))

vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    getChart: async () => ({ setOption: hoisted.setOption }),
    withDark: (_chart: unknown, option: unknown) => option
  }),
  readCssVar: () => '#409eff'
}))

vi.mock('@/composables/useAutoRefresh', () => ({
  useAutoRefresh: (cb: () => unknown) => {
    hoisted.autoRefresh = cb
  }
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => ({ isDark: false })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn() }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k)
    })
  }
})

import LoginTrendWidget from './LoginTrendWidget.vue'
import OperPieWidget from './OperPieWidget.vue'
import UserTrendWidget from './UserTrendWidget.vue'

const stubs = {
  WidgetCard: { template: '<div class="card-stub"><slot name="header-actions" /><slot /></div>' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<span />' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-button': { emits: ['click'], template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}<slot /></div>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' }
}

const globalOptions = { stubs, directives: { loading: {} } }

function chartHidden(w: VueWrapper): boolean {
  return (w.find('.chart-box').attributes('style') || '').includes('display: none')
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.autoRefresh = null
})

describe('图表小组件：失败不得把旧图抹掉', () => {
  it('首载失败 ⇒ 失败文案 + 重试入口，画布不显示', async () => {
    hoisted.request.mockRejectedValueOnce(new Error('down'))
    const w = mount(LoginTrendWidget, { global: globalOptions })
    await flushPromises()
    expect(w.find('.empty-stub').text()).toContain('dashboard.loginTrendLoadFail')
    expect(w.find('.empty-stub .btn-stub').exists()).toBe(true)
    expect(chartHidden(w)).toBe(true)
  })

  it('成功过再刷新失败 ⇒ 画布仍可见 + 陈旧横幅（含 HH:mm:ss 截止时刻）+ 重试后恢复', async () => {
    hoisted.request.mockResolvedValueOnce({ data: [{ date: '2026-10-28', success: 3, fail: 1 }] })
    const w = mount(LoginTrendWidget, { global: globalOptions })
    await flushPromises()
    expect(hoisted.setOption).toHaveBeenCalledTimes(1)
    expect(chartHidden(w)).toBe(false)

    // 自动刷新回调 = 组件真实接线（useAutoRefresh mocked 只捕获回调）
    hoisted.request.mockRejectedValueOnce(new Error('down'))
    await hoisted.autoRefresh!()
    await flushPromises()

    const alert = w.find('.alert-stub')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('common.staleDataHintAt')
    expect(alert.text()).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(chartHidden(w)).toBe(false)
    // 失败没有重画，旧图原样保留
    expect(hoisted.setOption).toHaveBeenCalledTimes(1)

    hoisted.request.mockResolvedValueOnce({ data: [{ date: '2026-10-28', success: 9, fail: 0 }] })
    await alert.find('.btn-stub').trigger('click')
    await flushPromises()
    expect(w.find('.alert-stub').exists()).toBe(false)
    expect(chartHidden(w)).toBe(false)
    expect(hoisted.setOption).toHaveBeenCalledTimes(2)
  })

  it('饼图同样：首载失败给失败态，重试成功后画布出现', async () => {
    hoisted.request.mockRejectedValueOnce(new Error('down'))
    const w = mount(OperPieWidget, { global: globalOptions })
    await flushPromises()
    expect(w.find('.empty-stub').text()).toContain('dashboard.operDistLoadFail')
    expect(chartHidden(w)).toBe(true)

    hoisted.request.mockResolvedValueOnce({ data: { insert: 2, update: 0, delete: 0, other: 0 } })
    await w.find('.empty-stub .btn-stub').trigger('click')
    await flushPromises()
    expect(w.find('.empty-stub').exists()).toBe(false)
    expect(chartHidden(w)).toBe(false)
    expect(hoisted.setOption).toHaveBeenCalledTimes(1)
  })

  it('成功但数据为空 ⇒ 空态而不是失败态（loaded 与 error 分开）', async () => {
    hoisted.request.mockResolvedValueOnce({ data: { newUsersThisWeek: 0, createTrend: [] } })
    const w = mount(UserTrendWidget, { global: globalOptions })
    await flushPromises()
    expect(w.find('.empty-stub').text()).toContain('common.noData')
    expect(w.find('.alert-stub').exists()).toBe(false)
    expect(chartHidden(w)).toBe(true)
  })
})
