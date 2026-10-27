/**
 * 数据权限规则页的失败态与删除链回归锁（b98）。
 *
 * 立的案：
 * 1. `load()` 把失败吞成 DEV 日志 ⇒ 表格空态把"没读到"渲染成"没有规则"；
 * 2. `removeRule` 直接 `ElMessageBox.confirm` + 单条 catch ⇒ 用户点"取消"也会
 *    走进"删除失败"的日志分支，且删掉末页最后一条后停在空页（前几页还有数据）。
 *
 * 本文件钉：失败错误条 + 重试、取消不发删除请求、末页删空回退一页。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  confirmAction: vi.fn(),
  success: vi.fn()
}))

vi.mock('@/utils/request', () => ({ default: (...a: unknown[]) => hoisted.request(...a) }))
vi.mock('@/utils/confirm', () => ({ confirmAction: (...a: unknown[]) => hoisted.confirmAction(...a) }))
vi.mock('element-plus', () => ({ ElMessage: { success: hoisted.success } }))
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import DataRule from './index.vue'

const stubs = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-button': {
    props: ['disabled'],
    emits: ['click'],
    template: '<button class="btn-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-alert': {
    props: ['title'],
    template: '<div class="alert-stub">{{ title }}<slot /></div>'
  },
  'el-table': {
    props: ['data'],
    template: '<div class="table-stub"><slot /></div>'
  },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div class="pagination-stub" />' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>', props: ['modelValue'] },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-switch': { template: '<div />' }
}

function mountPage() {
  return mount(DataRule, {
    global: { stubs, directives: { hasPermi: {}, loading: {} } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.request.mockReset()
  hoisted.confirmAction.mockReset()
})

describe('dataRule 页面失败态与删除链', () => {
  it('列表加载失败：错误条可见；重试成功后错误条消失', async () => {
    let listCalls = 0
    hoisted.request.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/system/role/optionselect') return Promise.resolve({ data: [] })
      listCalls += 1
      if (listCalls === 1) return Promise.reject(new Error('list failed'))
      return Promise.resolve({ rows: [{ ruleId: 1, ruleName: 'r1' }], total: 1 })
    })

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="data-rule-load-error"]').exists()).toBe(true)

    const retry = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))!
    await retry.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="data-rule-load-error"]').exists()).toBe(false)
  })

  it('取消确认：不发 DELETE、不弹成功', async () => {
    hoisted.request.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/system/role/optionselect') return Promise.resolve({ data: [] })
      return Promise.resolve({ rows: [], total: 0 })
    })
    hoisted.confirmAction.mockResolvedValue(false)
    const wrapper = mountPage()
    await flushPromises()

    // 直接调用暴露在组件实例上的处理器（表格列 stub 不渲染行内按钮）
    await (wrapper.vm as unknown as { removeRule: (id: number) => Promise<void> }).removeRule(9)
    await flushPromises()

    expect(hoisted.confirmAction).toHaveBeenCalledTimes(1)
    const deleteCalls = hoisted.request.mock.calls.filter((c) => c[0]?.method === 'delete')
    expect(deleteCalls).toHaveLength(0)
    expect(hoisted.success).not.toHaveBeenCalled()
  })

  it('删掉末页最后一条：自动回退一页再请求', async () => {
    hoisted.request.mockImplementation((cfg: { url: string; params?: { page?: number } }) => {
      if (cfg.url === '/system/role/optionselect') return Promise.resolve({ data: [] })
      // 第 2 页已被删空（total 20 ⇒ 前页有数据）；回退后的第 1 页仍有 20 条
      if (cfg.params?.page === 2) return Promise.resolve({ rows: [], total: 20 })
      return Promise.resolve({
        rows: Array.from({ length: 20 }, (_, i) => ({ ruleId: i + 1 })),
        total: cfg.params?.page === 1 ? 21 : 20
      })
    })

    const wrapper = mountPage()
    await flushPromises()

    const vm = wrapper.vm as unknown as { load: (p?: number) => Promise<void> }
    await vm.load(2)
    await flushPromises()

    const listCalls = hoisted.request.mock.calls.filter((c) => c[0]?.url === '/system/dataRule/list')
    expect(listCalls).toHaveLength(3)
    expect(listCalls[2][0].params.page).toBe(1)
  })
})
