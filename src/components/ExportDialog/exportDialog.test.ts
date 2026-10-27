/**
 * ExportDialog（b102）：字段选择对话框的 loading 由调用方持有。
 *
 * 立的案：`handleConfirm` 里把内部 `exporting` 置真后从未复位（除重新打开），
 * 而 operlog 的 catch 写明"导出失败时保留对话框以便用户重试"——实际上按钮
 * 永久停在 loading，用户既看不到结局也无法重试。
 *
 * 本文件钉：loading 由 prop 驱动、loading 期间不重复派发 export、
 * 调用方复位 loading 后同一对话框可再次导出（失败重试路径）。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

vi.mock('@/utils/errorHub', () => ({ errorHub: { report: vi.fn() } }))
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import ExportDialog from './index.vue'

const stubs = {
  'el-dialog': { props: ['modelValue'], template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<div><slot /></div>' },
  'el-checkbox-group': { template: '<div><slot /></div>' },
  'el-checkbox': { template: '<div><slot /></div>' },
  'el-alert': { props: ['title'], template: '<div>{{ title }}</div>' },
  'el-button': {
    props: ['loading', 'disabled'],
    emits: ['click'],
    template:
      '<button class="btn" :data-loading="String(!!loading)" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  transition: { template: '<div><slot /></div>' }
}

function mountDialog(loading = false) {
  return mount(ExportDialog, {
    props: {
      modelValue: true,
      loading,
      columns: [
        { field: 'a', label: 'A' },
        { field: 'b', label: 'B' }
      ]
    },
    global: { stubs }
  })
}

function confirmButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAll('.btn').find((b) => b.text().includes('exportDialog.confirmExport'))!
}

describe('ExportDialog（loading 由调用方持有）', () => {
  it('空闲态：确认按钮不处于 loading，点击派发全字段导出', async () => {
    const wrapper = mountDialog(false)
    expect(confirmButton(wrapper).attributes('data-loading')).toBe('false')
    await confirmButton(wrapper).trigger('click')
    expect(wrapper.emitted('export')).toEqual([[null]])
  })

  it('loading 期间：点击不再派发（同一份导出不得重复提交）', async () => {
    const wrapper = mountDialog(true)
    expect(confirmButton(wrapper).attributes('data-loading')).toBe('true')
    await confirmButton(wrapper).trigger('click')
    await confirmButton(wrapper).trigger('click')
    expect(wrapper.emitted('export')).toBeUndefined()
  })

  it('失败后调用方复位 loading ⇒ 同一对话框可再次导出（此前永久转圈、无法重试）', async () => {
    const wrapper = mountDialog(true)
    await confirmButton(wrapper).trigger('click')
    expect(wrapper.emitted('export')).toBeUndefined()

    await wrapper.setProps({ loading: false })
    expect(confirmButton(wrapper).attributes('data-loading')).toBe('false')
    await confirmButton(wrapper).trigger('click')
    expect(wrapper.emitted('export')).toEqual([[null]])
  })

  it('接线反查：operlog 的 loading 必须在 finally 复位，且真实传给对话框', () => {
    const src = readFileSync(resolve(VUE_ROOT, 'src/views/monitor/operlog/index.vue'), 'utf8')
    expect(src).toContain(':loading="exportLoading"')
    expect(src).toMatch(/\.finally\(\(\) => \{\s*exportLoading\.value = false/)
  })
})
