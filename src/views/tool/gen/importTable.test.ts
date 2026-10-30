/**
 * 导入表对话框的「屏幕状态 = 数据事实」回归锁（b136）。
 *
 * 立的案（实测 3 条，全部是"用户看到的状态与真正提交的东西不是同一件事"）：
 * ① 选择集跨开窗残留：`tables` 由 `selection-change` 写入，而 `destroy-on-close`
 *    重建表格时 Element Plus 不会补发一次 `[]` ⇒ 上次勾选的表名留着，屏幕上一个
 *    都没勾，点「确定」却把上次的表再导一遍；
 * ② 无防重入：`确定` 按钮没有 busy 状态，双击发两次导入请求；
 * ③ 失败重复提示：请求拦截器已弹错，`.catch` 里再弹一条 ⇒ 同一次失败两条 toast。
 *
 * 三条各自配"必须成立"的正控（有勾选 ⇒ 真发请求 / 只发一次 / 成功只提示一次），
 * 否则"永远不发请求"也能满足前两条。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, type SetupContext } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const h_ = vi.hoisted(() => ({
  listDbTable: vi.fn(),
  importTable: vi.fn(),
  msgError: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('@/api/tool/gen', () => ({
  listDbTable: (...a: unknown[]) => h_.listDbTable(...a),
  importTable: (...a: unknown[]) => h_.importTable(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    msgError: (...a: unknown[]) => h_.msgError(...a),
    msgSuccess: (...a: unknown[]) => h_.msgSuccess(...a),
    confirm: vi.fn()
  }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import ImportTable from './importTable.vue'

/** 表格替身：把 selection-change 交还给测试，用来模拟"用户勾了一行" */
const TableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  emits: ['selection-change', 'row-click'],
  setup(_p: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'table-stub' }, [slots.default?.(), slots.empty?.()])
  }
})

const ButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: { loading: [Boolean, String], disabled: Boolean },
  emits: ['click'],
  setup(props: { loading?: boolean | string; disabled?: boolean }, { slots, emit }: SetupContext) {
    return () =>
      h(
        'button',
        { class: 'btn-stub', 'data-loading': String(!!props.loading), onClick: () => emit('click') },
        slots.default?.()
      )
  }
})

const stubs = {
  'el-dialog': { props: ['modelValue'], template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-input': { props: ['modelValue'], template: '<div><slot /></div>' },
  'el-table': TableStub,
  'el-table-column': { template: '<div><slot /></div>' },
  'el-button': ButtonStub,
  pagination: { template: '<div />' },
  'list-empty': { template: '<div class="list-empty-stub" />' }
}

function mountDialog() {
  // v-loading 是全局指令，单测里没有注册：补一个空实现，免得每条用例刷 "Failed to resolve directive"
  return mount(ImportTable, { global: { stubs, directives: { loading: {} } } })
}

function confirmButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAllComponents(ButtonStub).find((b) => b.text().includes('common.confirm'))!
}

describe('gen/importTable：选择集与提交结局必须同源', () => {
  beforeEach(() => {
    h_.listDbTable.mockReset().mockResolvedValue({ rows: [{ tableName: 'sys_user' }], total: 1 })
    h_.importTable.mockReset()
    h_.msgError.mockReset()
    h_.msgSuccess.mockReset()
  })

  it('正控：勾选后点确定 ⇒ 真的按勾选的表发请求，成功后关闭并通知父级', async () => {
    h_.importTable.mockResolvedValue({ code: 200, msg: 'ok' })
    const wrapper = mountDialog()
    ;(wrapper.vm as unknown as { show: () => void }).show()
    await flushPromises()

    wrapper.findComponent(TableStub).vm.$emit('selection-change', [{ tableName: 'sys_user' }])
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(h_.importTable).toHaveBeenCalledTimes(1)
    expect(h_.importTable.mock.calls[0][0]).toMatchObject({ tables: 'sys_user' })
    expect(h_.msgSuccess).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('ok')).toHaveLength(1)
    wrapper.unmount()
  })

  it('重开不带旧选择：上次勾过、这次一个都没勾 ⇒ 不得导入（屏幕与提交必须同源）', async () => {
    const wrapper = mountDialog()
    ;(wrapper.vm as unknown as { show: () => void }).show()
    await flushPromises()
    wrapper.findComponent(TableStub).vm.$emit('selection-change', [{ tableName: 'sys_user' }])
    // 关闭并重开：Element Plus 的表格被 destroy-on-close 重建，**不会**补发一次 []
    ;(wrapper.vm as unknown as { show: () => void }).show()
    await flushPromises()

    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(h_.importTable).not.toHaveBeenCalled()
    expect(h_.msgError).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('双击只发一次请求（同步闸，不依赖按钮 loading 的下一个 tick）', async () => {
    let release!: (v: unknown) => void
    h_.importTable.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const wrapper = mountDialog()
    ;(wrapper.vm as unknown as { show: () => void }).show()
    await flushPromises()
    wrapper.findComponent(TableStub).vm.$emit('selection-change', [{ tableName: 'sys_user' }])

    const btn = confirmButton(wrapper)
    await btn.trigger('click')
    await btn.trigger('click')
    await flushPromises()

    expect(h_.importTable).toHaveBeenCalledTimes(1)
    release({ code: 200, msg: 'ok' })
    await flushPromises()
    wrapper.unmount()
  })

  it('失败只留一条提示：拦截器已弹错，对话框不得再弹一条', async () => {
    h_.importTable.mockRejectedValue(new Error('backend said no'))
    const wrapper = mountDialog()
    ;(wrapper.vm as unknown as { show: () => void }).show()
    await flushPromises()
    wrapper.findComponent(TableStub).vm.$emit('selection-change', [{ tableName: 'sys_user' }])

    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(h_.msgError).not.toHaveBeenCalled()
    expect(h_.msgSuccess).not.toHaveBeenCalled()
    // 失败后闸必须释放：同一对话框仍可重试
    h_.importTable.mockResolvedValue({ code: 200, msg: 'ok' })
    await confirmButton(wrapper).trigger('click')
    await flushPromises()
    expect(h_.importTable).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
