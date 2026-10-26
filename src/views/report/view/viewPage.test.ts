/**
 * 报告运行态页面失败态与权限回归锁（b94）。
 *
 * 立的案：页面原先在列表/布局请求失败时静默显示空画布（用户以为"这块大屏没有图表"），
 * 且无编辑权限的人也能把模式切到设计态。本文件钉：
 * 1. 列表失败 ⇒ 错误条可见、页面不崩；
 * 2. 布局失败 ⇒ 清空上一块看板的旧卡片并置错误态（不得让旧数据冒充新看板）；
 * 3. 只有 view 时切 design 必须被强制回 view；
 * 4. 重试成功后错误态清除。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const hoisted = vi.hoisted(() => ({
  listDashboard: vi.fn(),
  getDashboard: vi.fn(),
  msgWarning: vi.fn(),
  allowed: new Set<string>(['report:dashboard:view'])
}))

vi.mock('@/api/report', () => ({
  listDashboard: (...a: unknown[]) => hoisted.listDashboard(...a),
  getDashboard: (...a: unknown[]) => hoisted.getDashboard(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: { msgWarning: (...a: unknown[]) => hoisted.msgWarning(...a) }
}))

vi.mock('@/utils/permission', () => ({
  checkPermi: (keys: string[]) => keys.every((k) => hoisted.allowed.has(k))
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import ViewPage from './index.vue'

const stubs = {
  Designer: { template: '<div class="designer-stub" />' },
  ChartCard: { template: '<div class="chart-card-stub" />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<div><slot /></div>' },
  'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-empty': { template: '<div class="empty-stub" />' }
}

const globalOptions = {
  stubs,
  directives: { loading: {} }
}

interface ViewVm {
  dashboards: { dashboardId: number; dashboardName: string }[]
  selectedId?: number
  charts: unknown[]
  mode: 'view' | 'design'
  loadError: boolean
  loading: boolean
  canEdit: boolean
  refreshAll: () => Promise<boolean>
  loadSelected: (id: number) => Promise<boolean>
}

function vmOf(wrapper: ReturnType<typeof mount>): ViewVm {
  return wrapper.vm as unknown as ViewVm
}

function dashboardFixture(): { rows: { dashboardId: number; dashboardName: string }[] } {
  return { rows: [{ dashboardId: 7, dashboardName: '销售看板' }] }
}

describe('报告运行态（b94）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.allowed = new Set(['report:dashboard:view'])
    hoisted.listDashboard.mockResolvedValue(dashboardFixture())
    hoisted.getDashboard.mockResolvedValue({ data: { layoutJson: { schemaVersion: 2, charts: [] } } })
  })

  it('列表加载失败时错误条可见，页面不崩', async () => {
    hoisted.listDashboard.mockRejectedValueOnce(new Error('list down'))
    const wrapper = mount(ViewPage, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.loadError).toBe(true)
    expect(vm.loading).toBe(false)
    expect(wrapper.findAll('.alert-stub')).toHaveLength(1)
  })

  it('布局加载失败时清空上一块看板的旧卡片并置错误态', async () => {
    const wrapper = mount(ViewPage, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.charts = [{ chartId: 'stale', chartType: 'bar', datasetId: 1, title: '旧卡片', span: 12 }]
    hoisted.getDashboard.mockRejectedValueOnce(new Error('layout down'))
    const ok = await vm.loadSelected(7)
    expect(ok).toBe(false)
    expect(vm.charts).toEqual([])
    expect(vm.loadError).toBe(true)
  })

  it('只有 view 权限时把 mode 切成 design 会被强制回 view', async () => {
    const wrapper = mount(ViewPage, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.canEdit).toBe(false)
    vm.mode = 'design'
    await nextTick()
    expect(vm.mode).toBe('view')
    expect(wrapper.find('.designer-stub').exists()).toBe(false)
  })

  it('重试成功后错误态清除并拿到看板列表', async () => {
    hoisted.listDashboard.mockRejectedValueOnce(new Error('list down'))
    const wrapper = mount(ViewPage, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.loadError).toBe(true)
    hoisted.listDashboard.mockResolvedValueOnce(dashboardFixture())
    const ok = await vm.refreshAll()
    expect(ok).toBe(true)
    expect(vm.loadError).toBe(false)
    expect(vm.selectedId).toBe(7)
    expect(vm.dashboards).toHaveLength(1)
  })

  it('快速切换看板时，先发后到的过期响应不得覆盖当前画布', async () => {
    hoisted.listDashboard.mockResolvedValueOnce({ rows: [] })
    const pending = new Map<number, (v: unknown) => void>()
    hoisted.getDashboard.mockImplementation(
      (id: number) =>
        new Promise((resolve) => {
          pending.set(id, resolve)
        })
    )
    const wrapper = mount(ViewPage, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)

    vm.selectedId = 7
    await nextTick()
    vm.selectedId = 8
    await nextTick()

    const layoutOf = (datasetId: number) => ({
      data: {
        layoutJson: {
          schemaVersion: 2,
          charts: [{ chartId: `c${datasetId}`, chartType: 'bar', datasetId, title: `看板${datasetId}`, span: 12 }]
        }
      }
    })
    // 后选的先回、先选的后回：只有 8 的布局可以落到画布上
    pending.get(8)?.(layoutOf(8))
    await flushPromises()
    pending.get(7)?.(layoutOf(7))
    await flushPromises()

    expect(vm.charts).toHaveLength(1)
    expect((vm.charts[0] as { datasetId: number }).datasetId).toBe(8)
  })
})
