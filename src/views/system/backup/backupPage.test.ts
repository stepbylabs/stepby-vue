/**
 * 备份页「恢复」链路回归锁（b99）。
 *
 * 立的案：恢复是分钟级同步操作（后端子进程硬超时 300s），而页面此前**没有任何进行中
 * 状态**——用户可以在恢复途中删掉正在被读的备份文件、或再点一次恢复（服务端只会回
 * 「恢复进行中」）；成功后也只弹一句"恢复成功"，可整库已经被替换：当前账号/角色/权限
 * 都来自那份旧快照，前端 store 里仍是旧权限，用户带着**已经不存在的能力**继续操作。
 *
 * 本文件钉三件事：
 * 1. 成功 ⇒ 必须走 `logOut → goLogin`，且 goLogin 必须在 logOut **完成之后**；
 * 2. 失败 ⇒ 不得登出、不得跳登录页（把一次可重试的失败升级成踢下线是最坏的处置）；
 * 3. 取消确认 ⇒ 不发恢复请求。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  listBackup: vi.fn(),
  restoreBackup: vi.fn(),
  selfExportTenantPackage: vi.fn(),
  downloadBackup: vi.fn(),
  confirm: vi.fn(),
  msgSuccess: vi.fn(),
  msgWarning: vi.fn(),
  msgError: vi.fn(),
  loadingService: vi.fn(),
  loadingClose: vi.fn(),
  logOut: vi.fn(),
  goLogin: vi.fn(),
  messageBoxConfirm: vi.fn()
}))

vi.mock('@/api/system/backup', () => ({
  listBackup: (...a: unknown[]) => hoisted.listBackup(...a),
  restoreBackup: (...a: unknown[]) => hoisted.restoreBackup(...a),
  createBackup: vi.fn(),
  selfExportTenantPackage: (...a: unknown[]) => hoisted.selfExportTenantPackage(...a),
  delBackup: vi.fn(),
  downloadBackup: (...a: unknown[]) => hoisted.downloadBackup(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    confirm: (...a: unknown[]) => hoisted.confirm(...a),
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a),
    msgWarning: (...a: unknown[]) => hoisted.msgWarning(...a),
    msgError: (...a: unknown[]) => hoisted.msgError(...a)
  }
}))

vi.mock('element-plus', () => ({
  ElLoading: { service: (...a: unknown[]) => hoisted.loadingService(...a) },
  ElMessageBox: { confirm: (...a: unknown[]) => hoisted.messageBoxConfirm(...a) }
}))

vi.mock('@/store/modules/user', () => ({
  default: () => ({ logOut: (...a: unknown[]) => hoisted.logOut(...a) })
}))

vi.mock('@/utils/navigation', () => ({ goLogin: (...a: unknown[]) => hoisted.goLogin(...a) }))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import BackupPage from './index.vue'

const stubs = {
  SkeletonTable: true,
  'right-toolbar': true,
  pagination: true,
  'list-empty': true,
  Transition: false,
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-date-picker': { template: '<div />' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-button': {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button class="btn-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-tooltip': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' }
}

const ROW = { backupId: 7, fileName: 'stepby-2026.db', status: 'success', backupType: 'manual' }

function mountPage() {
  return mount(BackupPage, {
    global: { stubs, directives: { hasPermi: {}, loading: {} } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.listBackup.mockResolvedValue({ rows: [], total: 0 })
  hoisted.loadingService.mockReturnValue({ close: hoisted.loadingClose })
})

describe('备份页恢复链路', () => {
  it('恢复成功：进行中态覆盖整段请求，成功后全屏提示并 logOut，goLogin 等 logOut 完成才发生', async () => {
    hoisted.confirm.mockResolvedValue('confirm')
    let finishRestore!: (v: unknown) => void
    hoisted.restoreBackup.mockReturnValue(new Promise((resolve) => (finishRestore = resolve)))
    let finishLogout!: () => void
    hoisted.logOut.mockReturnValue(new Promise<void>((resolve) => (finishLogout = resolve)))

    const wrapper = mountPage()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      handleRestore: (row: typeof ROW) => void
      restoring: boolean
    }
    vm.handleRestore(ROW)
    await flushPromises()

    // 进行中：请求未回 ⇒ 恢复态必须为真（据此禁用删除/再次恢复），且尚未提示成功
    expect(hoisted.restoreBackup).toHaveBeenCalledWith(7)
    expect(vm.restoring, '恢复请求在飞时必须处于进行中态').toBe(true)
    expect(hoisted.loadingService).not.toHaveBeenCalled()

    finishRestore({ code: 200 })
    await flushPromises()

    expect(hoisted.msgSuccess).toHaveBeenCalledWith('backup.tip.restoreSuccess')
    expect(hoisted.loadingService).toHaveBeenCalledWith(
      expect.objectContaining({ lock: true, text: 'backup.tip.restoreRelogin' })
    )
    expect(hoisted.logOut).toHaveBeenCalledTimes(1)
    // 关键顺序不变式：本地态没清干净就跳登录页，旧权限/旧令牌会残留到下一次会话
    expect(hoisted.goLogin, 'logOut 完成前不得跳转登录页').not.toHaveBeenCalled()

    finishLogout()
    await flushPromises()

    expect(hoisted.goLogin).toHaveBeenCalledTimes(1)
    expect(hoisted.loadingClose).toHaveBeenCalledTimes(1)
  })

  it('恢复失败：不登出、不跳登录页，恢复态复位（不把可重试失败升级成踢下线）', async () => {
    hoisted.confirm.mockResolvedValue('confirm')
    hoisted.restoreBackup.mockRejectedValue(new Error('restore failed'))

    const wrapper = mountPage()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      handleRestore: (row: typeof ROW) => void
      restoring: boolean
    }
    vm.handleRestore(ROW)
    await flushPromises()

    expect(hoisted.restoreBackup).toHaveBeenCalledWith(7)
    expect(hoisted.logOut).not.toHaveBeenCalled()
    expect(hoisted.goLogin).not.toHaveBeenCalled()
    expect(hoisted.loadingService).not.toHaveBeenCalled()
    expect(vm.restoring, '失败后必须允许再次尝试').toBe(false)
  })

  it('取消确认：不发恢复请求、不登出', async () => {
    hoisted.confirm.mockRejectedValue('cancel')

    const wrapper = mountPage()
    await flushPromises()

    const vm = wrapper.vm as unknown as { handleRestore: (row: typeof ROW) => void }
    vm.handleRestore(ROW)
    await flushPromises()

    expect(hoisted.restoreBackup).not.toHaveBeenCalled()
    expect(hoisted.logOut).not.toHaveBeenCalled()
  })
})

/**
 * 「导出租户数据包」链路（b146）。
 *
 * 立的案：按钮 tooltip 写的是"导出当前登录账号所属租户的数据包"，而旧实现只发
 * `POST /system/backup/self-export`、把响应整个丢掉，然后弹一句"导出成功"并刷新列表——
 * 屏幕上任务结束了，用户手里一个文件都没有（对照平台侧 `views/system/tenant` 的
 * `handleExport`：那条是 create → downloadBackup 两步完整链）。
 * 现在三件事必须同判：① 没有 backupId ⇒ 只说"结果未知"，既不下载也不报成功；
 * ② 记录已经生成 ⇒ 列表刷新（这条与"保存通道认不认账"无关，是两个事实）；
 * ③ 成功话只由 `downloadBackup` 的认账驱动（旧契约在保存失败时同样正常返回）。
 */
describe('自助导出链：没有把文件交出去就不得说导出成功', () => {
  beforeEach(() => {
    hoisted.selfExportTenantPackage.mockResolvedValue({
      data: { backupId: 9, fileName: 'tenant-9.zip' }
    })
    hoisted.downloadBackup.mockResolvedValue(true)
  })

  it('完整链：create → 用返回的 backupId 下载 → 才说已开始下载，并刷新列表', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const before = hoisted.listBackup.mock.calls.length

    const vm = wrapper.vm as unknown as { handleSelfExport: () => Promise<void>; selfExporting: boolean }
    await vm.handleSelfExport()

    expect(hoisted.downloadBackup).toHaveBeenCalledWith(9, 'tenant-9.zip')
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('backup.tip.selfExportSuccess')
    expect(hoisted.msgWarning).not.toHaveBeenCalled()
    expect(hoisted.listBackup.mock.calls.length, '备份记录已生成 ⇒ 列表必须刷新').toBeGreaterThan(before)
    expect(vm.selfExporting, '结束后按钮不得停在 loading').toBe(false)
  })

  it('200 但没有备份记录 ⇒ 只说"结果未知"：不下载、不说成功', async () => {
    hoisted.selfExportTenantPackage.mockResolvedValueOnce({ data: undefined })

    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as { handleSelfExport: () => Promise<void>; selfExporting: boolean }
    await vm.handleSelfExport()

    expect(hoisted.downloadBackup).not.toHaveBeenCalled()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
    expect(hoisted.msgWarning).toHaveBeenCalledWith('backup.tip.selfExportUnknown')
    expect(vm.selfExporting).toBe(false)
  })

  it('保存通道不认账 ⇒ 仍刷新列表（记录确实生成了），但不得说"已开始下载"', async () => {
    hoisted.downloadBackup.mockResolvedValueOnce(false)

    const wrapper = mountPage()
    await flushPromises()
    const before = hoisted.listBackup.mock.calls.length
    const vm = wrapper.vm as unknown as { handleSelfExport: () => Promise<void> }
    await vm.handleSelfExport()

    expect(hoisted.downloadBackup).toHaveBeenCalledTimes(1)
    expect(hoisted.msgSuccess, '失败理由由 errorHub 单通道给，页面只负责收回成功话').not.toHaveBeenCalled()
    expect(hoisted.listBackup.mock.calls.length).toBeGreaterThan(before)
  })

  it('导出请求失败 ⇒ 拒绝不逸出、状态复位、无任何成功提示', async () => {
    hoisted.selfExportTenantPackage.mockRejectedValueOnce(new Error('self export failed'))

    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as { handleSelfExport: () => Promise<void>; selfExporting: boolean }
    await expect(vm.handleSelfExport()).resolves.toBeUndefined()

    expect(hoisted.downloadBackup).not.toHaveBeenCalled()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
    expect(vm.selfExporting, '失败后必须允许再点一次').toBe(false)
  })
})
