/**
 * 平台「域名管理」页：租户清单读失败不得显示成「暂无数据」（b141）。
 *
 * 立的案（HEAD 实测）：`listTenant()` 的 catch 把 `tenantOptions` 清成 `[]`，模板用
 * `tenantOptions.length === 0` 直接渲染「暂无数据」⇒ 一次网络抖动被读成"系统里一个租户都没有"，
 * 平台操作者无从得知是失败，也没有重试入口（同 b118/b133 的"失败＝空"家族）。
 *
 * 判据：失败 ⇒ 错误提示 + 重试，且**不得**出现空态；重试成功 ⇒ 提示消失、选项恢复；
 * 读取成功且真的没有租户 ⇒ 才显示「暂无数据」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({ listTenant: vi.fn() }))

vi.mock('@/api/system/tenant', () => ({
  listTenant: (...a: unknown[]) => hoisted.listTenant(...a)
}))

vi.mock('@/store/modules/user', () => ({ default: () => ({ tenantId: 0 }) }))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import TenantDomainPage from './index.vue'

const stubs = {
  'el-card': { template: '<div><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="alert-stub">{{ title }}<slot /></div>'
  },
  'el-empty': {
    props: ['description'],
    template: '<div class="empty-stub">{{ description }}</div>'
  },
  'el-button': { template: '<button><slot /></button>' },
  TenantDomainPanel: true
}

const globalOptions = { stubs, directives: { loading: {} } }

type Vm = {
  tenantOptions: { tenantId: number }[]
  tenantOptionsFailed: boolean
  loadTenantOptions: () => Promise<void>
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function mountPage() {
  const w = mount(TenantDomainPage, { global: globalOptions })
  await flushPromises()
  return w
}

const vmOf = (w: Awaited<ReturnType<typeof mountPage>>) => w.vm as unknown as Vm

describe('域名管理：租户清单读失败 ≠ 没有租户（b141）', () => {
  it('读取失败 ⇒ 错误提示 + 重试，且不显示「暂无数据」', async () => {
    hoisted.listTenant.mockRejectedValueOnce(new Error('down'))
    const w = await mountPage()

    expect(w.text()).toContain('tenantDomain.tenantListFailed')
    expect(w.text()).toContain('common.retry')
    expect(w.text()).not.toContain('common.noData')
    expect(vmOf(w).tenantOptionsFailed).toBe(true)
  })

  it('重试成功后恢复选项、提示消失', async () => {
    hoisted.listTenant.mockRejectedValueOnce(new Error('down'))
    const w = await mountPage()

    hoisted.listTenant.mockResolvedValueOnce({ data: [{ tenantId: 7, tenantName: 'T7', tenantCode: 't7' }] })
    await vmOf(w).loadTenantOptions()
    await flushPromises()

    expect(vmOf(w).tenantOptionsFailed).toBe(false)
    expect(vmOf(w).tenantOptions.map((t) => t.tenantId)).toEqual([7])
    expect(w.text()).not.toContain('tenantDomain.tenantListFailed')
    expect(w.text()).not.toContain('common.noData')
  })

  it('读取成功且确实没有租户 ⇒ 才显示「暂无数据」', async () => {
    hoisted.listTenant.mockResolvedValueOnce({ data: [] })
    const w = await mountPage()
    expect(w.text()).toContain('common.noData')
    expect(w.text()).not.toContain('tenantDomain.tenantListFailed')
  })
})
