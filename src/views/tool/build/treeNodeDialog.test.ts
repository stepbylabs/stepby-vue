/**
 * 表单构建器「添加选项」对话框的残留态与静默失败回归锁（b136）。
 *
 * 立的案（两条，都在生成配置这条链上）：
 * ① `dataType` 跨开窗残留：上一次选了「数字」，下一次输入 "001" 会被 `parseFloat`
 *    静默改成 1——用户以为存的是自己写的字符串，生成出来的选项值却是另一个数；
 * ② 非法数字静默 return：`parseFloat("abc")` 得 NaN 时直接 `return`，点「确定」
 *    什么都没发生，用户以为按钮坏了（b90 ① 同族：失败必须可见）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, type SetupContext } from 'vue'
import { mount } from '@vue/test-utils'

const h_ = vi.hoisted(() => ({ msgError: vi.fn() }))

vi.mock('@/plugins/modal', () => ({
  default: { msgError: (...a: unknown[]) => h_.msgError(...a), msgSuccess: vi.fn(), confirm: vi.fn() }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import TreeNodeDialog from './TreeNodeDialog.vue'

const DialogStub = defineComponent({
  name: 'ElDialogStub',
  props: { modelValue: Boolean },
  emits: ['open', 'close'],
  setup(_p: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'dialog-stub' }, [slots.default?.(), slots.footer?.()])
  }
})

const InputStub = defineComponent({
  name: 'ElInputStub',
  props: { modelValue: [String, Number] },
  emits: ['update:modelValue'],
  setup(_p: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'input-stub' }, [slots.default?.(), slots.append?.()])
  }
})

const SelectStub = defineComponent({
  name: 'ElSelectStub',
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(_p: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'select-stub' }, slots.default?.())
  }
})

/** 表单替身：校验恒通过（本文件的被测对象是"提交载荷"，不是 EP 的校验实现） */
const FormStub = defineComponent({
  name: 'ElFormStub',
  setup(_p: Record<string, unknown>, { slots, expose }: SetupContext) {
    expose({ validate: (cb: (valid: boolean) => void) => cb(true) })
    return () => h('div', { class: 'form-stub' }, slots.default?.())
  }
})

const ButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: { loading: Boolean, disabled: Boolean },
  emits: ['click'],
  setup(_p: Record<string, unknown>, { slots, emit }: SetupContext) {
    return () => h('button', { class: 'btn-stub', onClick: () => emit('click') }, slots.default?.())
  }
})

const stubs = {
  'el-dialog': DialogStub,
  'el-form': FormStub,
  'el-form-item': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-input': InputStub,
  'el-select': SelectStub,
  'el-option': { template: '<div />' },
  'el-button': ButtonStub
}

function mountDialog() {
  const wrapper = mount(TreeNodeDialog, { props: { modelValue: false }, global: { stubs } })
  const dialog = wrapper.findComponent(DialogStub)
  const setOpen = async () => {
    dialog.vm.$emit('open')
    await wrapper.vm.$nextTick()
  }
  const inputs = () => wrapper.findAllComponents(InputStub)
  const confirm = () => wrapper.findAllComponents(ButtonStub).find((b) => b.text().includes('common.confirm'))!
  return { wrapper, setOpen, inputs, confirm, dialog }
}

describe('build/TreeNodeDialog：选项类型不得跨开窗残留，非法数字必须可见', () => {
  beforeEach(() => {
    h_.msgError.mockReset()
  })

  it('类型随开窗复位：上一次选「数字」后，下一次输入 "001" 必须原样作为字符串提交', async () => {
    const { wrapper, setOpen, inputs, confirm } = mountDialog()
    await setOpen()
    // 第一次：选数字并提交一个数值
    wrapper.findComponent(SelectStub).vm.$emit('update:modelValue', 'number')
    await wrapper.vm.$nextTick()
    await inputs()[1].vm.$emit('update:modelValue', '42')
    await confirm().trigger('click')
    expect(wrapper.emitted('commit')![0][0]).toMatchObject({ value: 42 })

    // 第二次开窗：类型必须回到默认的 string
    await setOpen()
    await inputs()[1].vm.$emit('update:modelValue', '001')
    await confirm().trigger('click')
    expect(wrapper.emitted('commit')![1][0]).toMatchObject({ value: '001' })
    wrapper.unmount()
  })

  it('类型为数字时填了非数字 ⇒ 必须提示且不提交（原实现静默 return）', async () => {
    const { wrapper, setOpen, inputs, confirm } = mountDialog()
    await setOpen()
    wrapper.findComponent(SelectStub).vm.$emit('update:modelValue', 'number')
    await wrapper.vm.$nextTick()
    await inputs()[1].vm.$emit('update:modelValue', 'abc')

    await confirm().trigger('click')

    expect(h_.msgError).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('commit')).toBeUndefined()
    wrapper.unmount()
  })

  it('数字校验是严格十进制："12abc" / "0x10" 不得被 parseFloat 悄悄接受', async () => {
    const { wrapper, setOpen, inputs, confirm } = mountDialog()
    for (const bad of ['12abc', '0x10', '1e3', '  ']) {
      h_.msgError.mockReset()
      await setOpen()
      wrapper.findComponent(SelectStub).vm.$emit('update:modelValue', 'number')
      await wrapper.vm.$nextTick()
      await inputs()[1].vm.$emit('update:modelValue', bad)
      await confirm().trigger('click')
      expect(h_.msgError, `输入 ${JSON.stringify(bad)} 必须被拒`).toHaveBeenCalledTimes(1)
    }
    expect(wrapper.emitted('commit')).toBeUndefined()
    wrapper.unmount()
  })
})
