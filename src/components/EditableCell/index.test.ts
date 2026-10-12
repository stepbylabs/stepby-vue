import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// 真实加载 element-plus 会让 vitest worker 超时（项目既有测试一致做法：mock 重依赖）。
// 文本编辑仅用到 el-input / el-icon，用轻量桩替换：桩根为原生 <input>，
// 组件里的 @keyup.enter / @blur 作为透传属性落到该 input 上，从而可被 trigger 驱动 commit。
const modal = vi.hoisted(() => ({ msgError: vi.fn(), msgSuccess: vi.fn(), msgWarning: vi.fn() }))
vi.mock('@/plugins/modal', () => ({ default: modal }))

import EditableCell from './index.vue'

const i18n = createI18n({ legacy: false, locale: 'en', global: { messages: {} } })

function factory(props: Record<string, unknown>) {
  return mount(EditableCell, {
    props: { modelValue: 'foo', ...props },
    global: {
      plugins: [i18n],
      stubs: {
        'el-input': {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
        },
        'el-icon': { template: '<i><slot /></i>' },
        // type='text' 下这些分支从不渲染，登记为桩以消除组件解析告警噪声
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        'el-date-picker': true,
        'el-switch': true
      }
    },
    attachTo: document.body
  })
}

async function enterEdit(w: ReturnType<typeof factory>) {
  await w.find('.editable-cell').trigger('dblclick')
  await w.vm.$nextTick()
}

describe('components/EditableCell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('校验失败：弹出错误、不提交、不修改 modelValue', async () => {
    const w = factory({ validate: (v: string) => (v === 'bad' ? 'not-allowed' : true) })
    await enterEdit(w)
    const input = w.find('input')
    expect(input.exists()).toBe(true)
    await input.setValue('bad')
    await input.trigger('keyup.enter')
    expect(modal.msgError).toHaveBeenCalledWith('not-allowed')
    expect(w.emitted('commit')).toBeUndefined()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('值变化：回车提交并 emit update:modelValue + commit(new,old)', async () => {
    const w = factory({})
    await enterEdit(w)
    const input = w.find('input')
    await input.setValue('bar')
    await input.trigger('keyup.enter')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['bar'])
    expect(w.emitted('commit')?.at(-1)).toEqual(['bar', 'foo'])
    w.unmount()
  })

  it('值未变化：失焦不产生任何提交事件', async () => {
    const w = factory({})
    await enterEdit(w)
    const input = w.find('input')
    // 不改动，直接失焦
    await input.trigger('blur')
    expect(w.emitted('commit')).toBeUndefined()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('readonly：双击不进入编辑态（不渲染输入框）', async () => {
    const w = factory({ readonly: true })
    await w.find('.editable-cell').trigger('dblclick')
    await w.vm.$nextTick()
    expect(w.find('input').exists()).toBe(false)
    w.unmount()
  })
})
