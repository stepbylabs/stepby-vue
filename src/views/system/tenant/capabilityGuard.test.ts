/**
 * 租户页「能力位 / 导出」的失败结局回归锁（b141）。
 *
 * 立的案（HEAD 实测）：
 * ① `loadCapabilities` 的 `try/finally` 没有 catch —— `getPackageFeatures` 失败时拒绝逸出
 *    事件处理器（ErrorBoundary 接管整页），且上一次打开的套餐 items/form 仍留在屏上，
 *    此时保存会把**另一个套餐**的能力位写进当前套餐；
 * ② `saveCapabilities` 同样无 catch，失败时对话框卡在 saving=false 但无结局、拒绝逸出；
 * ③ `handleExport` 在 `created?.backupId` 缺失时**照报导出成功**（假成功），且无 catch。
 *
 * 判据：读失败 ⇒ 清空 items/form + 失败标记 + 保存闸（按钮 disabled 与函数首行双闸）；
 * 保存失败 ⇒ 对话框保持打开、loading 复位、拒绝不逸出；导出无 backupId ⇒ 警告"结果未知"。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  listTenant: vi.fn(),
  listTenantPackageOptions: vi.fn(),
  getPackageFeatures: vi.fn(),
  updatePackageFeatures: vi.fn(),
  exportTenantPackage: vi.fn(),
  downloadBackup: vi.fn(),
  msgSuccess: vi.fn(),
  msgWarning: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('@/api/system/tenant', () => ({
  listTenant: (...a: unknown[]) => hoisted.listTenant(...a),
  getTenant: vi.fn(),
  addTenant: vi.fn(),
  updateTenant: vi.fn(),
  changeTenantStatus: vi.fn(),
  delTenant: vi.fn(),
  restoreTenant: vi.fn(),
  listTenantPackageOptions: (...a: unknown[]) => hoisted.listTenantPackageOptions(...a),
  exportTenantPackage: (...a: unknown[]) => hoisted.exportTenantPackage(...a),
  getPackageFeatures: (...a: unknown[]) => hoisted.getPackageFeatures(...a),
  updatePackageFeatures: (...a: unknown[]) => hoisted.updatePackageFeatures(...a)
}))

vi.mock('@/api/system/backup', () => ({
  downloadBackup: (...a: unknown[]) => hoisted.downloadBackup(...a)
}))

vi.mock('@/store/modules/user', () => ({ default: () => ({ tenantId: 0 }) }))
vi.mock('@/utils/permission', () => ({ checkPermi: () => true }))
vi.mock('@/utils/confirm', () => ({ confirmAction: async () => true }))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import TenantPage from './index.vue'

const EP_TAGS = [
  'el-alert',
  'el-button',
  'el-card',
  'el-col',
  'el-date-picker',
  'el-dialog',
  'el-divider',
  'el-form',
  'el-form-item',
  'el-input',
  'el-input-number',
  'el-option',
  'el-progress',
  'el-radio',
  'el-radio-button',
  'el-radio-group',
  'el-row',
  'el-select',
  'el-switch',
  'el-table',
  'el-table-column',
  'el-tag',
  'el-tooltip',
  'tenant-domain-drawer',
  'right-toolbar',
  'list-empty'
]
const stubs = Object.fromEntries(EP_TAGS.map((tag) => [tag, true]))

const globalOptions = {
  shallow: true,
  stubs,
  directives: { loading: {}, hasPermi: {} },
  config: {
    globalProperties: {
      $modal: {
        msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a),
        msgWarning: (...a: unknown[]) => hoisted.msgWarning(...a),
        msgError: (...a: unknown[]) => hoisted.msgError(...a)
      }
    }
  }
}

type Vm = {
  capabilityVisible: boolean
  capabilityLoadFailed: boolean
  capabilityItems: { key: string }[]
  capabilityForm: Record<string, string>
  capabilitySaving: boolean
  exportingId: number | null
  openCapabilities: (row: Record<string, unknown>) => Promise<void>
  loadCapabilities: () => Promise<void>
  saveCapabilities: () => Promise<void>
  handleExport: (row: Record<string, unknown>) => Promise<void>
}

const row = { tenantId: 7, tenantName: 'T7', packageId: 3, packageName: 'P3' }

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.listTenant.mockResolvedValue({ data: [] })
  hoisted.listTenantPackageOptions.mockResolvedValue({ data: [] })
  hoisted.getPackageFeatures.mockResolvedValue({
    data: { items: [{ key: 'ai.chat', modes: ['off', 'full'], mode: 'off' }], platformEnabled: ['ai.chat'] }
  })
  hoisted.updatePackageFeatures.mockResolvedValue({ data: null })
  hoisted.exportTenantPackage.mockResolvedValue({ data: { backupId: 9, fileName: 't7.json' } })
  hoisted.downloadBackup.mockResolvedValue(new Blob(['x']))
})

async function mountPage() {
  const w = mount(TenantPage, { global: globalOptions })
  await flushPromises()
  return w
}

const vmOf = (w: Awaited<ReturnType<typeof mountPage>>) => w.vm as unknown as Vm

describe('租户能力位：读失败不得冒充"没有能力位"（b141）', () => {
  it('读取失败 ⇒ 清空表单 + 失败标记，且保存函数首行拒绝执行', async () => {
    hoisted.getPackageFeatures.mockRejectedValueOnce(new Error('down'))
    const w = await mountPage()
    const vm = vmOf(w)

    await vm.openCapabilities(row)

    expect(vm.capabilityVisible).toBe(true)
    expect(vm.capabilityLoadFailed).toBe(true)
    expect(vm.capabilityItems).toEqual([])
    expect(vm.capabilityForm).toEqual({})
    // 纵深防御：即便绕开按钮 disabled，函数本身也不得把空表写回去
    await vm.saveCapabilities()
    expect(hoisted.updatePackageFeatures).not.toHaveBeenCalled()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('重试成功后恢复真实注册表；保存失败 ⇒ 不逸出、对话框保持打开、loading 复位', async () => {
    hoisted.getPackageFeatures.mockRejectedValueOnce(new Error('down'))
    const w = await mountPage()
    const vm = vmOf(w)
    await vm.openCapabilities(row)

    await vm.loadCapabilities()
    expect(vm.capabilityLoadFailed).toBe(false)
    expect(vm.capabilityItems.map((i) => i.key)).toEqual(['ai.chat'])
    expect(vm.capabilityForm['ai.chat']).toBe('off')

    hoisted.updatePackageFeatures.mockRejectedValueOnce(new Error('reject'))
    await expect(vm.saveCapabilities()).resolves.toBeUndefined()
    expect(hoisted.updatePackageFeatures).toHaveBeenCalledTimes(1)
    expect(vm.capabilitySaving).toBe(false)
    expect(vm.capabilityVisible).toBe(true)
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('保存成功 ⇒ 提示、关闭对话框', async () => {
    const w = await mountPage()
    const vm = vmOf(w)
    await vm.openCapabilities(row)
    vm.capabilityForm['ai.chat'] = 'full'
    await vm.saveCapabilities()
    expect(hoisted.updatePackageFeatures).toHaveBeenCalledWith({
      packageId: 3,
      features: { 'ai.chat': 'full' }
    })
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('tenant.capabilitySaved')
    expect(vm.capabilityVisible).toBe(false)
  })
})

describe('租户导出：没有备份记录不得报"已导出"（b141）', () => {
  it('200 但无 backupId ⇒ 警告"结果未知"，不下载、不报成功', async () => {
    hoisted.exportTenantPackage.mockResolvedValueOnce({ data: undefined })
    const w = await mountPage()
    await vmOf(w).handleExport(row)

    expect(hoisted.downloadBackup).not.toHaveBeenCalled()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
    expect(hoisted.msgWarning).toHaveBeenCalledWith('tenant.exportUnknown')
    expect(vmOf(w).exportingId).toBeNull()
  })

  it('导出请求失败 ⇒ 拒绝不逸出、loading 复位、无成功提示', async () => {
    hoisted.exportTenantPackage.mockRejectedValueOnce(new Error('down'))
    const w = await mountPage()
    await expect(vmOf(w).handleExport(row)).resolves.toBeUndefined()

    expect(vmOf(w).exportingId).toBeNull()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('正常路径 ⇒ 用返回的 backupId 下载并提示', async () => {
    const w = await mountPage()
    await vmOf(w).handleExport(row)
    expect(hoisted.downloadBackup).toHaveBeenCalledWith(9, 't7.json')
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('tenant.exportSuccess')
  })
})
