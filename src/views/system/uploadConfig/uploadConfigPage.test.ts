/**
 * OSS 存储配置页的"加载失败不得可保存"回归锁（b95）。
 *
 * 立的案与 aiConfig 同族：`load()` 吞错后表单保留空默认值
 * （endpoint/region/bucket 全空），保存按钮照样可点 ⇒ 一次加载失败就能把
 * `sys.upload.s3.*` 写成空，上传链路当场失效；而且页面把失败渲染成
 * `el-empty`（"暂无数据"），运维看不出这是失败。
 *
 * 本文件钉四件事：
 * 1. 初次加载失败 ⇒ 错误条可见、**不出现"暂无数据"空态**、表单锁定、保存不发请求；
 * 2. 加载成功 ⇒ 错误条消失、表单可用、保存载荷来自服务端值；
 * 3. 失败后重试成功 ⇒ 错误条消失并恢复可保存；
 * 4. save 的 early-return 覆盖"按钮被绕过 disabled"的情形。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getUploadConfig: vi.fn(),
  updateUploadConfig: vi.fn(),
  testUploadConfig: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('@/api/system/uploadConfig', () => ({
  getUploadConfig: (...a: unknown[]) => hoisted.getUploadConfig(...a),
  updateUploadConfig: (...a: unknown[]) => hoisted.updateUploadConfig(...a),
  testUploadConfig: (...a: unknown[]) => hoisted.testUploadConfig(...a)
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: hoisted.success, error: hoisted.error }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import UploadConfig from './index.vue'

const stubs = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-button': {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button class="btn-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-alert': {
    props: ['title'],
    template: '<div class="alert-stub">{{ title }}<slot name="title" /><slot /></div>'
  },
  'el-empty': { template: '<div class="empty-stub" />' },
  'el-form': {
    props: ['disabled'],
    template: '<div class="form-stub" :data-disabled="String(disabled)"><slot /></div>'
  },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-switch': { template: '<div />' }
}

function mountPage() {
  return mount(UploadConfig, {
    global: {
      stubs,
      directives: { hasPermi: {}, loading: {} }
    }
  })
}

function okVo() {
  return {
    backendMode: 's3',
    endpoint: 'https://s3.example.com',
    region: 'cn-test-1',
    bucket: 'stepby-test',
    pathStyle: true,
    publicEndpoint: 'https://cdn.example.com',
    hasAccessKey: true,
    accessKeyMasked: 'AK***',
    hasSecretKey: true,
    secretKeyMasked: 'SK***'
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.getUploadConfig.mockReset()
  hoisted.updateUploadConfig.mockReset()
  hoisted.testUploadConfig.mockReset()
})

describe('uploadConfig 页面加载失败态', () => {
  it('初次加载失败：错误条 + 无"暂无数据"空态 + 表单锁定 + 保存不发请求', async () => {
    hoisted.getUploadConfig.mockRejectedValue(new Error('network down'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-test="upload-config-load-error"]').exists()).toBe(true)
    // 失败不得被渲染成"暂无数据"——两者对运维的含义完全相反
    expect(wrapper.find('.empty-stub').exists()).toBe(false)
    expect(wrapper.find('.form-stub').attributes('data-disabled')).toBe('true')

    const saveBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.save'))!
    await saveBtn.trigger('click')
    await flushPromises()
    expect(hoisted.updateUploadConfig).not.toHaveBeenCalled()
    expect(hoisted.success).not.toHaveBeenCalled()
  })

  it('加载成功：错误条消失、表单可用、保存载荷来自服务端值', async () => {
    hoisted.getUploadConfig.mockResolvedValue({ data: okVo() })
    hoisted.updateUploadConfig.mockResolvedValue({})
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-test="upload-config-load-error"]').exists()).toBe(false)
    expect(wrapper.find('.empty-stub').exists()).toBe(false)
    expect(wrapper.find('.form-stub').attributes('data-disabled')).toBe('false')

    const saveBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.save'))!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(hoisted.updateUploadConfig).toHaveBeenCalledWith({
      accessKey: '',
      secretKey: '',
      endpoint: 'https://s3.example.com',
      region: 'cn-test-1',
      bucket: 'stepby-test',
      pathStyle: true,
      publicEndpoint: 'https://cdn.example.com'
    })
    expect(hoisted.success).toHaveBeenCalledWith('common.saveSuccess')
  })

  it('失败后重试成功：错误条消失且恢复可保存', async () => {
    hoisted.getUploadConfig.mockRejectedValueOnce(new Error('first failed')).mockResolvedValueOnce({ data: okVo() })
    hoisted.updateUploadConfig.mockResolvedValue({})

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="upload-config-load-error"]').exists()).toBe(true)

    const retryBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))!
    await retryBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="upload-config-load-error"]').exists()).toBe(false)
    expect(wrapper.find('.form-stub').attributes('data-disabled')).toBe('false')
  })
})
