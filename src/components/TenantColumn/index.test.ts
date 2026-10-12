import { describe, it, expect, vi, beforeEach } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// 真实加载 element-plus 会让 vitest worker 超时（与项目既有测试一致：mock 重依赖）。
// 本组件只用到 el-table-column / el-tag，用轻量 render-function 桩替换：
// 列桩把默认插槽渲染出来（把 prop / label 透出为 data-*，行数据由 rowBox 提供），
// tag 桩渲染 span 便于断言文本与类型。
const state = vi.hoisted(() => ({ show: false, rowTenantId: 5 as unknown }))

vi.mock('@/store/modules/user', () => ({
  default: () => ({ showTenantColumn: state.show })
}))

import TenantColumn from './index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { common: { tenantColumn: 'Tenant', platformTenant: 'Platform' } } }
})

function factory() {
  return mount(TenantColumn, {
    global: {
      plugins: [i18n],
      stubs: {
        'el-table-column': {
          props: ['prop', 'label', 'width'],
          setup: (props: Record<string, unknown>, { slots }: { slots: Record<string, (...a: unknown[]) => unknown> }) =>
            () =>
              h(
                'div',
                { class: 'tc', 'data-prop': props.prop, 'data-label': props.label },
                slots.default?.({ row: { tenantId: state.rowTenantId } })
              )
        },
        'el-tag': {
          props: ['type'],
          setup: (props: Record<string, unknown>, { slots }: { slots: Record<string, (...a: unknown[]) => unknown> }) =>
            () => h('span', { class: 'tag', 'data-type': props.type }, slots.default?.())
        }
      }
    }
  })
}

describe('components/TenantColumn', () => {
  beforeEach(() => {
    state.show = false
    state.rowTenantId = 5
  })

  // 可证伪性：若组件不消费后端决策（例如误改成"恒渲染"），本用例立即变红。
  // 默认 [ui].show_tenant_column = auto ⇒ 租户操作者下 store 为 false ⇒ 整列不得渲染。
  it('renders nothing when the server-side decision is false', () => {
    state.show = false
    expect(factory().find('.tc').exists()).toBe(false)
  })

  it('renders the tenant column with camelCase prop and i18n label when enabled', () => {
    state.show = true
    const col = factory().find('.tc')
    expect(col.exists()).toBe(true)
    expect(col.attributes('data-prop')).toBe('tenantId')
    expect(col.attributes('data-label')).toBe('Tenant')
  })

  // tenant_id = 0 是平台租户（common::tenant::tenant_scope）⇒ 显示"平台"info 标签
  it('shows the platform tag for tenant_id 0', () => {
    state.show = true
    state.rowTenantId = 0
    const tag = factory().find('.tag')
    expect(tag.exists()).toBe(true)
    expect(tag.attributes('data-type')).toBe('info')
    expect(tag.text()).toBe('Platform')
  })

  it('shows a #<id> warning tag for a non-platform tenant', () => {
    state.show = true
    state.rowTenantId = 5
    const tag = factory().find('.tag')
    expect(tag.attributes('data-type')).toBe('warning')
    expect(tag.text()).toBe('#5')
  })
})
