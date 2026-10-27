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
  confirm: vi.fn(),
  msgSuccess: vi.fn(),
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
  selfExportTenantPackage: vi.fn(),
  delBackup: vi.fn(),
  downloadBackup: vi.fn()
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    confirm: (...a: unknown[]) => hoisted.confirm(...a),
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a),
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
