/**
 * 数据权限对话框的「树未就绪不得提交」回归锁（b133）。
 *
 * 立的案（HEAD 实测）：父级 `getDeptTree()` 的 `catch` 会把 `deptOptions` 清成 `[]` 并照常
 * 打开对话框；用户在空树上点"确定"，`getDeptAllCheckedKeys()` 返回 `[]`，请求把该角色的
 * `deptIds` 覆盖成空——**读失败被签成了一次破坏性写入**（角色的自定义数据范围被静默清空）。
 *
 * 三条判据：
 * 1. `treeLoaded=false` ⇒ 确定按钮禁用，且即便点击也不发 `dataScope`（纵深防御在组件内，不只在按钮属性上）；
 * 2. `treeLoaded=true` ⇒ 勾选键真的进 `deptIds`（父级 + 半选一起），并发出一次请求；
 * 3. 提交失败时对话框不关闭（用户可改后重试），loading 复位。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, reactive, type SetupContext } from 'vue'

const hoisted = vi.hoisted(() => ({
  dataScope: vi.fn(),
  msgError: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('@/api/system/role', () => ({
  dataScope: (...a: unknown[]) => hoisted.dataScope(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    msgError: (...a: unknown[]) => hoisted.msgError(...a),
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a)
  }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import DataScopeDialog from './DataScopeDialog.vue'

const ElTreeStub = defineComponent({
  name: 'ElTree',
  props: { data: { type: Array, default: () => [] }, emptyText: { type: String, default: '' } },
  setup(_props: Record<string, unknown>, { expose }: SetupContext) {
    expose({
      getCheckedKeys: () => [11],
      getHalfCheckedKeys: () => [10],
      setCheckedKeys: () => {},
      setCheckedNodes: () => {},
      getNode: () => undefined
    })
    return () => h('div', { class: 'tree-stub' })
  }
})

const stubs = {
  'el-dialog': { template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-checkbox': { template: '<label><slot /></label>' },
  'el-tree': ElTreeStub,
  'el-button': {
    props: ['loading', 'disabled', 'type'],
    emits: ['click'],
    template:
      '<button class="btn-stub" :data-disabled="String(!!disabled)" :data-loading="String(!!loading)" @click="$emit(\'click\')"><slot /></button>'
  }
}

function mountDialog(treeLoaded: boolean) {
  const form = reactive({
    roleId: 5,
    roleName: 'r',
    roleKey: 'rk',
    dataScope: '2',
    deptCheckStrictly: true,
    deptIds: [] as number[]
  })
  const w = mount(DataScopeDialog, {
    props: { title: 't', deptOptions: [{ id: 10, label: 'A' }], treeLoaded, open: true, form },
    global: { stubs }
  })
  return { w, form }
}

function confirmButton(w: ReturnType<typeof mountDialog>['w']) {
  return w.findAll('.btn-stub')[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.dataScope.mockResolvedValue({ code: 200 })
})

describe('数据权限：树未就绪不得提交（b133）', () => {
  it('treeLoaded=false ⇒ 确定禁用且点击也不发请求', async () => {
    const { w } = mountDialog(false)
    await flushPromises()

    expect(confirmButton(w).attributes('data-disabled')).toBe('true')
    await confirmButton(w).trigger('click')
    await flushPromises()

    expect(hoisted.dataScope).not.toHaveBeenCalled()
    expect(hoisted.msgError).toHaveBeenCalledTimes(1)
  })

  it('treeLoaded=true ⇒ 勾选键进 deptIds 并发出一次请求', async () => {
    const { w, form } = mountDialog(true)
    await flushPromises()

    expect(confirmButton(w).attributes('data-disabled')).toBe('false')
    await confirmButton(w).trigger('click')
    await flushPromises()

    expect(hoisted.dataScope).toHaveBeenCalledTimes(1)
    const payload = hoisted.dataScope.mock.calls[0][0] as { roleId: number; deptIds: number[] }
    expect(payload.roleId).toBe(5)
    // 半选键被 unshift 到已选键之前（与拆分前实现等价）
    expect(payload.deptIds).toEqual([10, 11])
    expect(form.deptIds).toEqual([10, 11])
    expect(hoisted.msgSuccess).toHaveBeenCalledTimes(1)
  })

  it('提交失败 ⇒ 对话框不关闭、loading 复位（可改后重试）', async () => {
    hoisted.dataScope.mockRejectedValueOnce(new Error('boom'))
    const { w } = mountDialog(true)
    await flushPromises()

    await confirmButton(w).trigger('click')
    await flushPromises()

    expect(hoisted.dataScope).toHaveBeenCalledTimes(1)
    expect(confirmButton(w).attributes('data-loading')).toBe('false')
    expect(w.emitted('success')).toBeUndefined()
  })
})
