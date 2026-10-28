/**
 * 看板小组件的"取数失败不骗人"回归锁（b107）。
 *
 * 立的案：StatCards / RecentOperLog / FlowTodo 三个组件此前在请求失败时分别表现为
 * "全是 0" / "一张空表" / "整块隐藏"，三者都与"真的没有数据"同形。
 * 本文件在组件层钉住三件事：
 * ① 首载失败 ⇒ 出现失败文案 + 重试入口（不是 0 / 不是空表 / 不是隐藏）；
 * ② 点重试且请求成功 ⇒ 恢复真实内容；
 * ③ 失败不会把页面炸掉（load 自己不抛）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  flowPendingCount: vi.fn()
}))

vi.mock('@/utils/request', () => ({
  default: (...a: unknown[]) => hoisted.request(...a)
}))

vi.mock('@/api/flow', () => ({
  flowPendingCount: (...a: unknown[]) => hoisted.flowPendingCount(...a)
}))

vi.mock('@/composables/useAutoRefresh', () => ({ useAutoRefresh: () => {} }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k, te: () => true }) }
})

import StatCardsWidget from './StatCardsWidget.vue'
import RecentOperLogWidget from './RecentOperLogWidget.vue'
import FlowTodoWidget from './FlowTodoWidget.vue'

const stubs = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-button': { emits: ['click'], template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}<slot /></div>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' },
  'el-table': {
    props: ['data'],
    template: '<div class="table-stub"><slot /></div>'
  },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
  SkeletonTable: { template: '<div class="skeleton-stub" />' },
  StatCards: { props: ['stats'], template: '<div class="stat-cards-stub">{{ JSON.stringify(stats) }}</div>' }
}

const globalOptions = {
  stubs,
  directives: { loading: {} }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StatCardsWidget：失败不得显示成 0', () => {
  it('首载失败 ⇒ 失败文案 + 重试；重试成功后显示真实数据', async () => {
    hoisted.request.mockRejectedValueOnce(new Error('down'))
    const w = mount(StatCardsWidget, { global: globalOptions })
    await flushPromises()
    expect(w.find('.empty-stub').text()).toContain('dashboard.statsLoadFail')
    expect(w.find('.stat-cards-stub').exists()).toBe(false)
    const retry = w.find('.empty-stub .btn-stub')
    expect(retry.exists()).toBe(true)

    hoisted.request.mockResolvedValueOnce({ data: { totalUsers: 5, totalRoles: 2 } })
    await retry.trigger('click')
    await flushPromises()
    expect(w.find('.empty-stub').exists()).toBe(false)
    expect(w.find('.stat-cards-stub').text()).toContain('"totalUsers":5')
  })
})

describe('RecentOperLogWidget：失败不得显示成空表', () => {
  it('首载失败 ⇒ 失败文案 + 重试；重试成功后渲染表格', async () => {
    hoisted.request.mockRejectedValueOnce(new Error('down'))
    const w = mount(RecentOperLogWidget, { global: globalOptions })
    await flushPromises()
    expect(w.find('.empty-stub').text()).toContain('dashboard.recentOperLogLoadFail')
    expect(w.find('.table-stub').exists()).toBe(false)

    hoisted.request.mockResolvedValueOnce({
      data: { recentOperLogs: [{ title: 'x', operName: 'admin', status: 0, costTime: 12 }] }
    })
    await w.find('.empty-stub .btn-stub').trigger('click')
    await flushPromises()
    expect(w.find('.empty-stub').exists()).toBe(false)
    expect(w.find('.table-stub').exists()).toBe(true)
  })
})

describe('FlowTodoWidget：失败不得整块消失', () => {
  it('首载失败 ⇒ 组件仍在、给出失败文案 + 重试；重试成功后显示数量', async () => {
    hoisted.flowPendingCount.mockRejectedValueOnce(new Error('down'))
    const w = mount(FlowTodoWidget, { global: globalOptions })
    await flushPromises()
    expect(w.find('.empty-stub').text()).toContain('dashboard.flowTodoLoadFail')
    expect(w.find('.flow-todo').exists()).toBe(false)

    hoisted.flowPendingCount.mockResolvedValueOnce({ data: 4 })
    await w.find('.empty-stub .btn-stub').trigger('click')
    await flushPromises()
    expect(w.find('.empty-stub').exists()).toBe(false)
    expect(w.find('.flow-todo__count').text()).toBe('4')
  })
})
