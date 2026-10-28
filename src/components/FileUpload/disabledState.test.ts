/**
 * FileUpload 禁用态回归锁（b110）。
 *
 * 立的案：模板写的是 `v-if="!disable"`，而组件声明的 prop 叫 `disabled`——
 * `disable` 永远是 `undefined`，`!undefined` 恒为真 ⇒ **禁用态下上传入口照常显示**。
 * 这类"模板引用了不存在的名字"在 `vue-tsc` 下没有诊断（strictTemplates 只报未注册组件/
 * 未知 prop），是 `vue/no-undef-properties` 抓出来的；本文件钉住行为侧：
 * 禁用必须真的收起上传入口，未禁用必须照常给。
 *
 * 只 mock 外部依赖（token / store / 上传 API / modal / 导航）；组件自身逻辑真实执行。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getToken: vi.fn(() => 'tkn'),
  msgError: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('@/utils/auth', () => ({ getToken: () => hoisted.getToken() }))
vi.mock('@/store/modules/user', () => ({ default: () => ({}) }))
vi.mock('@/plugins/modal', () => ({
  default: {
    msgError: (...a: unknown[]) => hoisted.msgError(...a),
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a)
  }
}))
vi.mock('@/utils/navigation', () => ({ goLogin: vi.fn() }))
vi.mock('@/api/upload', () => ({
  shouldChunk: () => false,
  uploadFileChunked: vi.fn()
}))
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import FileUpload from './index.vue'

const stubs = {
  'el-upload': {
    props: ['action', 'limit', 'showFileList', 'headers'],
    template: '<div class="upload-stub"><slot /></div>'
  },
  'el-button': { template: '<button><slot /></button>' },
  'el-link': { template: '<a><slot /></a>' },
  'el-icon': { template: '<i><slot /></i>' },
  // el-upload 的 ref（fileUploadRef）在禁用态下不存在，测的就是这条分支
  'transition-group': { template: '<div><slot /></div>' }
}

function mountUpload(props: Record<string, unknown>) {
  return mount(FileUpload, {
    props: { modelValue: '', drag: false, ...props },
    global: { stubs }
  })
}

describe('FileUpload 禁用态', () => {
  it('disabled=true：上传入口必须收起（不得因为模板写错名字而一直显示）', async () => {
    const w = mountUpload({ disabled: true })
    await flushPromises()
    expect(w.find('.upload-stub').exists()).toBe(false)
  })

  it('disabled=false：上传入口照常给出（对照组，证明判据不是"永远不渲染"）', async () => {
    const w = mountUpload({ disabled: false })
    await flushPromises()
    expect(w.find('.upload-stub').exists()).toBe(true)
  })
})
