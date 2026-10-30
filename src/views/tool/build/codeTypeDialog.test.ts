/**
 * 表单构建器「生成代码类型」对话框的残留态回归锁（b136）。
 *
 * 立的案：`formData.type` 从不复位——上一次选了「弹窗(dialog)」后，下一次点
 * 「复制代码 / 下载文件」仍按 dialog 生成，用户拿到的产物与本次意图不符，
 * 而对话框里只有一个小单选提示、极易漏看。文件名同样跨开窗残留。
 */
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, type SetupContext } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import CodeTypeDialog from './CodeTypeDialog.vue'

const DialogStub = defineComponent({
  name: 'ElDialogStub',
  props: { modelValue: Boolean },
  emits: ['open', 'close'],
  setup(_p: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'dialog-stub' }, [slots.default?.(), slots.footer?.()])
  }
})

const RadioGroupStub = defineComponent({
  name: 'ElRadioGroupStub',
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(_p: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'radio-group-stub' }, slots.default?.())
  }
})

const InputStub = defineComponent({
  name: 'ElInputStub',
  props: { modelValue: [String, Number] },
  emits: ['update:modelValue'],
  setup(_p: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'input-stub' }, slots.default?.())
  }
})

const FormStub = defineComponent({
  name: 'ElFormStub',
  setup(_p: Record<string, unknown>, { slots, expose }: SetupContext) {
    expose({ validate: (cb: (valid: boolean) => void) => cb(true) })
    return () => h('div', { class: 'form-stub' }, slots.default?.())
  }
})

const ButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: { loading: Boolean },
  emits: ['click'],
  setup(_p: Record<string, unknown>, { slots, emit }: SetupContext) {
    return () => h('button', { class: 'btn-stub', onClick: () => emit('click') }, slots.default?.())
  }
})

const stubs = {
  'el-dialog': DialogStub,
  'el-form': FormStub,
  'el-form-item': FormStub,
  'el-radio-group': RadioGroupStub,
  'el-radio-button': { template: '<div><slot /></div>' },
  'el-input': InputStub,
  'el-button': ButtonStub,
  transition: { template: '<div><slot /></div>' }
}

function mountDialog(showFileName = false) {
  const wrapper = mount(CodeTypeDialog, { props: { modelValue: false, showFileName }, global: { stubs } })
  const dialog = wrapper.findComponent(DialogStub)
  const open = async () => {
    dialog.vm.$emit('open')
    await wrapper.vm.$nextTick()
  }
  const confirm = () => wrapper.findAllComponents(ButtonStub).find((b) => b.text().includes('common.confirm'))!
  const pickType = async (t: string) => {
    wrapper.findComponent(RadioGroupStub).vm.$emit('update:modelValue', t)
    await wrapper.vm.$nextTick()
  }
  return { wrapper, open, confirm, pickType }
}

describe('build/CodeTypeDialog：生成形态不得跨开窗残留', () => {
  it('上次选了 dialog，下次开窗必须回到默认的 file（复制代码不该产出弹窗形态）', async () => {
    const { wrapper, open, confirm, pickType } = mountDialog()
    await open()
    await pickType('dialog')
    await confirm().trigger('click')
    expect(wrapper.emitted('confirm')![0][0]).toMatchObject({ type: 'dialog' })

    await open()
    await confirm().trigger('click')
    expect(wrapper.emitted('confirm')![1][0]).toMatchObject({ type: 'file' })
    wrapper.unmount()
  })

  it('要文件名时每次开窗都重新生成，不带上一次的文件名', async () => {
    const { wrapper, open, confirm, pickType } = mountDialog(true)
    await open()
    const first = (wrapper.findComponent(InputStub).props('modelValue') as string) ?? ''
    expect(first.endsWith('.vue')).toBe(true)
    wrapper.findComponent(InputStub).vm.$emit('update:modelValue', 'stale-name.vue')
    await pickType('dialog')
    await confirm().trigger('click')

    await open()
    const second = (wrapper.findComponent(InputStub).props('modelValue') as string) ?? ''
    expect(second).not.toBe('stale-name.vue')
    expect(second.endsWith('.vue')).toBe(true)
    expect(wrapper.findComponent(RadioGroupStub).props('modelValue')).toBe('file')
    wrapper.unmount()
  })
})
