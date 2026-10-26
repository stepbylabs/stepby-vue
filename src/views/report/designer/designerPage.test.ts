/**
 * 报告设计器失败态与权限回归锁（b94）。
 *
 * 立的案：页面原先让 onMounted/watch 的 API 拒绝直接逸出（unhandledrejection），
 * 加载失败时画布/下拉静默为空；新增/保存/删除按钮全部挂在只读键
 * `report:dashboard:view` 下。本文件钉：
 * 1. 列表/数据集加载失败 ⇒ 两个错误条可见、页面不崩；
 * 2. 保存失败 ⇒ 不弹成功、saving 复位；
 * 3. 删除确认取消 ⇒ 不发请求、removing 复位（取消不得变成未处理拒绝）；
 * 4. 只有 view（无 edit/remove）时写处理器必须 no-op。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  listDashboard: vi.fn(),
  getDashboard: vi.fn(),
  listDataset: vi.fn(),
  saveDashboard: vi.fn(),
  removeDashboard: vi.fn(),
  previewDataset: vi.fn(),
  confirm: vi.fn(),
  msgSuccess: vi.fn(),
  msgWarning: vi.fn(),
  allowed: new Set<string>(['report:dashboard:edit', 'report:dashboard:remove'])
}))

vi.mock('@/api/report', () => ({
  listDashboard: (...a: unknown[]) => hoisted.listDashboard(...a),
  getDashboard: (...a: unknown[]) => hoisted.getDashboard(...a),
  listDataset: (...a: unknown[]) => hoisted.listDataset(...a),
  saveDashboard: (...a: unknown[]) => hoisted.saveDashboard(...a),
  removeDashboard: (...a: unknown[]) => hoisted.removeDashboard(...a),
  previewDataset: (...a: unknown[]) => hoisted.previewDataset(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    confirm: (...a: unknown[]) => hoisted.confirm(...a),
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a),
    msgWarning: (...a: unknown[]) => hoisted.msgWarning(...a)
  }
}))

vi.mock('@/utils/permission', () => ({
  checkPermi: (keys: string[]) => keys.every((k) => hoisted.allowed.has(k))
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import Designer from './index.vue'

const stubs = {
  ChartCard: {
    template: '<div class="chart-card-stub"><slot name="tools" /></div>'
  },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-divider': { template: '<div />' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-empty': { template: '<div class="empty-stub" />' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' },
  'el-drawer': { template: '<div><slot /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' }
}

const globalOptions = {
  stubs,
  directives: { hasPermi: {}, loading: {} }
}

interface DesignerVm {
  dashboardsError: boolean
  datasetsError: boolean
  canEdit: boolean
  canRemove: boolean
  saving: boolean
  removing: boolean
  createOpen: boolean
  selectedId?: number
  charts: unknown[]
  newChartDataset?: number
  loadDashboards: () => Promise<boolean>
  handleCreate: () => Promise<void>
  handleSave: () => Promise<void>
  handleRemove: () => Promise<void>
  handleAddChart: () => void
}

function vmOf(wrapper: ReturnType<typeof mount>): DesignerVm {
  return wrapper.vm as unknown as DesignerVm
}

describe('报告设计器（b94）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.allowed = new Set(['report:dashboard:edit', 'report:dashboard:remove'])
    hoisted.listDashboard.mockResolvedValue({ rows: [] })
    hoisted.listDataset.mockResolvedValue({ rows: [] })
    hoisted.getDashboard.mockResolvedValue({ data: { layoutJson: { schemaVersion: 2, charts: [] } } })
    hoisted.saveDashboard.mockResolvedValue({ data: { dashboardId: 1 } })
    hoisted.removeDashboard.mockResolvedValue({})
    hoisted.previewDataset.mockResolvedValue({ data: { columns: [] } })
    hoisted.confirm.mockResolvedValue('confirm')
  })

  it('列表/数据集加载失败时两个错误条可见，页面不崩', async () => {
    hoisted.listDashboard.mockRejectedValueOnce(new Error('list down'))
    hoisted.listDataset.mockRejectedValueOnce(new Error('datasets down'))
    const wrapper = mount(Designer, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.dashboardsError).toBe(true)
    expect(vm.datasetsError).toBe(true)
    expect(wrapper.findAll('.alert-stub')).toHaveLength(2)
  })

  it('保存失败不弹成功，saving 复位', async () => {
    const wrapper = mount(Designer, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.selectedId = 1
    // 列表为空时 handleSave 会因找不到 current 提前返回；先让列表包含该看板
    hoisted.listDashboard.mockResolvedValueOnce({ rows: [{ dashboardId: 1, dashboardCode: 'b', dashboardName: 'B' }] })
    await vm.loadDashboards()
    vm.selectedId = 1
    hoisted.saveDashboard.mockRejectedValueOnce(new Error('save failed'))
    await vm.handleSave()
    expect(vm.saving).toBe(false)
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('删除确认取消 ⇒ 不发请求、removing 复位', async () => {
    const wrapper = mount(Designer, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.selectedId = 1
    hoisted.confirm.mockRejectedValueOnce('cancel')
    await vm.handleRemove()
    expect(hoisted.removeDashboard).not.toHaveBeenCalled()
    expect(vm.removing).toBe(false)
  })

  it('只有 view 权限时写处理器必须 no-op', async () => {
    hoisted.allowed = new Set(['report:dashboard:view'])
    const wrapper = mount(Designer, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.canEdit).toBe(false)
    expect(vm.canRemove).toBe(false)

    vm.newChartDataset = 1
    vm.handleAddChart()
    expect(vm.charts).toHaveLength(0)

    vm.selectedId = 1
    await vm.handleSave()
    expect(hoisted.saveDashboard).not.toHaveBeenCalled()

    await vm.handleCreate()
    expect(hoisted.saveDashboard).not.toHaveBeenCalled()
    expect(vm.createOpen).toBe(false)
  })
})
