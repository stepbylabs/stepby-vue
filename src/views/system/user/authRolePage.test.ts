/**
 * 用户授权角色页的回归锁（b110）。
 *
 * 立的案：`vue/no-undef-properties` 一上线就在本页抓到 `:loading="submitLoading"`——
 * 该变量**根本不存在**，于是按钮永远不转，`submitForm()` 也没有任何在途闸：
 * 双击/连点会把同一份授权重复提交（服务端每次都会重新写一遍角色关系）。
 * 同一轮还查出两个同族状态缺陷：加载失败被 `catch(() => {})` 吞成"该用户没有角色"，
 * 以及深链参数非法时 `loading` 初值 true 永不落地（页面停在永久骨架）。
 *
 * 本文件钉四件事：
 * 1. 提交在途：只发一次请求、按钮 loading 为真、结束后复位；
 * 2. 提交失败：不弹成功、不关页、按钮复位（可重试）；
 * 3. 加载失败：`loadError` 置真且旧行清空（与"没有角色"分形），重试成功后恢复；
 * 4. 参数非法：不发请求、不停在骨架。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getAuthRole: vi.fn(),
  updateAuthRole: vi.fn(),
  msgSuccess: vi.fn(),
  closeOpenPage: vi.fn(),
  routeParams: { userId: '5' } as Record<string, string>
}))

vi.mock('@/api/system/user', () => ({
  getAuthRole: (...a: unknown[]) => hoisted.getAuthRole(...a),
  updateAuthRole: (...a: unknown[]) => hoisted.updateAuthRole(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: { msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a) }
}))

vi.mock('@/plugins/tab', () => ({
  default: { closeOpenPage: (...a: unknown[]) => hoisted.closeOpenPage(...a) }
}))

vi.mock('vue-router', async (orig) => {
  const actual = await orig<typeof import('vue-router')>()
  return { ...actual, useRoute: () => ({ params: hoisted.routeParams }) }
})

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import AuthRolePage from './authRole.vue'

const stubs = {
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-input': { props: ['modelValue'], template: '<input />' },
  'el-button': {
    props: ['loading', 'type'],
    emits: ['click'],
    template: '<button class="btn-stub" :data-loading="String(!!loading)" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-table': {
    props: ['data'],
    methods: { toggleRowSelection: () => {} },
    template: '<div class="table-stub"><slot /><slot v-if="!data || data.length === 0" name="empty" /></div>'
  },
  'el-table-column': { template: '<div />' },
  'list-empty': {
    props: ['loadError'],
    emits: ['retry'],
    template:
      '<div class="list-empty-stub" :data-error="String(loadError)"><button class="retry-stub" @click="$emit(\'retry\')">r</button></div>'
  },
  pagination: { template: '<div />' }
}

const ROLES = [
  { roleId: 1, roleName: 'admin', roleKey: 'admin', status: '0', flag: true },
  { roleId: 2, roleName: 'common', roleKey: 'common', status: '0', flag: false }
]

function mountPage() {
  return mount(AuthRolePage, {
    global: { stubs, directives: { hasPermi: {}, loading: {} } }
  })
}

interface AuthRoleVm {
  loading: boolean
  loadError: boolean
  submitLoading: boolean
  submitForm: () => void
  roles: Array<{ roleId: number }>
  pageNum: number
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.routeParams = { userId: '5' }
  hoisted.getAuthRole.mockResolvedValue({ user: { userId: 5, userName: 'u', nickName: 'n' }, roles: ROLES })
  hoisted.updateAuthRole.mockResolvedValue({ code: 200 })
})

describe('用户授权角色页', () => {
  it('提交在途：重复点击只发一次请求，按钮 loading 全程为真，结束后复位', async () => {
    let finish!: (v: unknown) => void
    hoisted.updateAuthRole.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as unknown as AuthRoleVm

    vm.submitForm()
    vm.submitForm()
    await flushPromises()

    expect(hoisted.updateAuthRole, '在途期第二次点击必须被丢弃').toHaveBeenCalledTimes(1)
    expect(vm.submitLoading).toBe(true)
    expect(w.find('.btn-stub[data-loading="true"]').exists(), '按钮必须显示在途态').toBe(true)

    finish({ code: 200 })
    await flushPromises()
    expect(vm.submitLoading).toBe(false)
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('userAuthRole.authSuccess')
    expect(hoisted.closeOpenPage).toHaveBeenCalledTimes(1)
  })

  it('提交失败：不弹成功、不关页、在途态复位（可再次提交）', async () => {
    hoisted.updateAuthRole.mockRejectedValue(new Error('net down'))
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as unknown as AuthRoleVm

    vm.submitForm()
    await flushPromises()

    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
    expect(hoisted.closeOpenPage).not.toHaveBeenCalled()
    expect(vm.submitLoading).toBe(false)
  })

  it('加载失败：落"加载失败 + 重试"（与"没有角色"分形），重试成功后恢复', async () => {
    hoisted.getAuthRole.mockRejectedValueOnce(new Error('net down'))
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as unknown as AuthRoleVm

    expect(vm.loading).toBe(false)
    expect(vm.loadError).toBe(true)
    expect(vm.roles).toEqual([])
    const empty = w.find('.list-empty-stub')
    expect(empty.exists()).toBe(true)
    expect(empty.attributes('data-error')).toBe('true')

    await empty.find('.retry-stub').trigger('click')
    await flushPromises()
    expect(vm.loadError).toBe(false)
    expect(vm.roles).toHaveLength(2)
    expect(w.find('.list-empty-stub').exists()).toBe(false)
  })

  it('深链参数非法：不发请求，也不停在永久骨架', async () => {
    hoisted.routeParams = { userId: '1e99' }
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as unknown as AuthRoleVm

    expect(hoisted.getAuthRole).not.toHaveBeenCalled()
    expect(vm.loading).toBe(false)
    expect(vm.loadError).toBe(false)
  })
})
