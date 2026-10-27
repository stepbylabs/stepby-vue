/**
 * MyLoginPanel（b102）：登录历史"失败不得冒充暂无数据 / 不得冒充刷新成功"。
 *
 * 立的案（改造前）：
 * 1. `getList` 的 catch 是空的 ⇒ 失败后列表落回"暂无数据"，用户无法与真的没有记录区分；
 * 2. `refreshAnalysis` 先弹"重新分析成功"再发请求 ⇒ 失败也报成功，且旧数据冒充最新。
 *
 * 本文件钉：空列表失败 → `ListEmpty` 收到 loadError；有旧数据刷新失败 → 顶部告警条
 * 出现且旧数据保留；"重新分析"只在请求成功时提示。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ListEmpty from '@/components/ListEmpty/index.vue'

const hoisted = vi.hoisted(() => ({
  list: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('@/api/monitor/logininfor', () => ({ list: (...a: unknown[]) => hoisted.list(...a) }))
vi.mock('@/utils/dict', () => ({ useDict: () => ({ sys_common_status: [] }) }))
vi.mock('@/store/modules/user', () => ({ default: () => ({ name: 'tester' }) }))
vi.mock('@/plugins/modal', () => ({
  default: { msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a), msgError: vi.fn() }
}))
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import MyLoginPanel from './MyLoginPanel.vue'

const stubs = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-alert': {
    props: ['title'],
    template: '<div class="alert-stub" :data-test="$attrs[\'data-test\']">{{ title }}<slot /></div>'
  },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-date-picker': { template: '<div />' },
  'el-button': { emits: ['click'], template: '<button class="btn" @click="$emit(\'click\')"><slot /></button>' },
  'el-table': {
    props: ['data'],
    template:
      '<div class="table-stub" :data-rows="(data || []).length"><slot /><slot v-if="!data || data.length === 0" name="empty" /></div>'
  },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}</div>' },
  pagination: { template: '<div />' },
  'right-toolbar': { template: '<div />' },
  'svg-icon': { template: '<i />' }
}

const row = { infoId: 1, userName: 'tester', ipaddr: '10.0.0.1', status: '0', loginTime: '2026-10-27 10:00:00' }

function mountPanel() {
  return mount(MyLoginPanel, {
    global: { stubs, components: { ListEmpty }, directives: { hasPermi: {}, loading: {} } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.list.mockReset()
  hoisted.msgSuccess.mockReset()
})

describe('MyLoginPanel 失败态与刷新提示', () => {
  it('空列表加载失败：ListEmpty 收到 loadError（不再冒充"暂无数据"）', async () => {
    hoisted.list.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.findComponent(ListEmpty).props('loadError')).toBe(true)
    // 列表为空时顶部告警条不出现（没有旧数据可提示"是旧数据"），由空态承担失败展示
    expect(wrapper.find('[data-test="my-login-load-error"]').exists()).toBe(false)
  })

  it('有旧数据刷新失败：告警条可见且旧数据保留（不得清空成暂无数据）', async () => {
    hoisted.list.mockResolvedValueOnce({ rows: [row], total: 1 })
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('.table-stub').attributes('data-rows')).toBe('1')

    hoisted.list.mockRejectedValueOnce(new Error('offline'))
    await (wrapper.vm as unknown as { getList: () => Promise<boolean> }).getList()
    await flushPromises()

    expect(wrapper.find('[data-test="my-login-load-error"]').exists()).toBe(true)
    expect(wrapper.find('.table-stub').attributes('data-rows'), '失败不得清空旧数据').toBe('1')
  })

  it('重新分析：只在请求成功时提示成功（失败不报成功）', async () => {
    hoisted.list.mockResolvedValueOnce({ rows: [row], total: 1 })
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as { refreshAnalysis: () => Promise<void> }

    hoisted.list.mockResolvedValueOnce({ rows: [row], total: 1 })
    await vm.refreshAnalysis()
    expect(hoisted.msgSuccess).toHaveBeenCalledTimes(1)

    hoisted.list.mockRejectedValueOnce(new Error('offline'))
    await vm.refreshAnalysis()
    expect(hoisted.msgSuccess, '失败回合不得再弹成功').toHaveBeenCalledTimes(1)
  })
})
