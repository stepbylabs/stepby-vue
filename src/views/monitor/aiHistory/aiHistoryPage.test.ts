/**
 * AI 问数历史页的三件事（b97）：
 *
 * 1. 租户筛选输入归一——`abc` / 负数是用户输入问题，必须当场提示且**不发请求**，
 *    而不是拼成 `tenantFilter=NaN` 让后端 400（原实现 `Number(tid)` 的直接后果）；
 * 2. 列表加载失败必须与「暂无数据」区分（ListEmpty 的 loadError 分支 + 重试）；
 * 3. 后端修复配套：`tenantId` / `userId` 两列来自真实列名（后端侧
 *    `admin_history_maps_tenant_and_user_from_snake_case_columns` 钉住），
 *    本页只负责把字段渲染出来。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn()
}))

vi.mock('@/utils/request', () => ({
  default: (...a: unknown[]) => hoisted.request(...a)
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: hoisted.warning,
    error: hoisted.error,
    success: hoisted.success
  }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import AiHistory from './index.vue'

const stubs = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input class="tenant-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  'el-button': {
    props: ['loading'],
    emits: ['click'],
    template: '<button class="btn" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-table': { template: '<div><slot /><slot name="empty" /></div>' },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  pagination: { template: '<div />' },
  // ListEmpty 的真实实现是 el-empty + 重试按钮；这里只暴露判据需要的两个信号
  'list-empty': {
    props: ['loadError'],
    emits: ['retry'],
    template:
      '<div class="list-empty" :data-error="String(!!loadError)"><button class="retry" @click="$emit(\'retry\')">retry</button></div>'
  }
}

function mountPage() {
  return mount(AiHistory, {
    global: {
      stubs,
      directives: { loading: {} }
    }
  })
}

function ok(items: Record<string, unknown>[] = []) {
  return { code: 200, data: { items, total: items.length } }
}

beforeEach(() => {
  hoisted.request.mockReset()
  hoisted.warning.mockReset()
  hoisted.error.mockReset()
  hoisted.success.mockReset()
})

describe('aiHistory page', () => {
  it('非法租户输入当场提示且不发请求', async () => {
    hoisted.request.mockResolvedValue(ok())
    const wrapper = mountPage()
    await flushPromises()
    const callsAfterMount = hoisted.request.mock.calls.length

    await wrapper.find('.tenant-input').setValue('abc')
    // 第一个按钮是「搜索」（模板顺序：搜索 / 刷新 / 导出）
    await wrapper.findAll('.btn')[0].trigger('click')
    await flushPromises()

    expect(hoisted.warning).toHaveBeenCalledWith('aiHistory.tenantInvalid')
    expect(hoisted.request.mock.calls.length).toBe(callsAfterMount)
  })

  it('合法租户输入按数值下发（不是字符串，也不带 NaN）', async () => {
    hoisted.request.mockResolvedValue(ok())
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.tenant-input').setValue('7')
    await wrapper.findAll('.btn')[0].trigger('click')
    await flushPromises()

    const last = hoisted.request.mock.calls.at(-1)?.[0] as {
      params: Record<string, unknown>
    }
    expect(last.params.tenantFilter, '数字 7').toBe(7)
    expect(last.params.page).toBe(1)
  })

  it('加载失败显示 ListEmpty 的失败分支，重试成功后回到正常空态', async () => {
    hoisted.request.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.list-empty').attributes('data-error')).toBe('true')

    hoisted.request.mockResolvedValueOnce(ok())
    await wrapper.find('.list-empty .retry').trigger('click')
    await flushPromises()

    expect(wrapper.find('.list-empty').attributes('data-error')).toBe('false')
    expect(hoisted.request.mock.calls.length).toBe(2)
  })
})
