/**
 * OSS 存储配置页的"加载失败不得可保存"+"测的就是屏上这份"回归锁（b95 / b146）。
 *
 * 立的案与 aiConfig 同族：`load()` 吞错后表单保留空默认值
 * （endpoint/region/bucket 全空），保存按钮照样可点 ⇒ 一次加载失败就能把
 * `sys.upload.s3.*` 写成空，上传链路当场失效；而且页面把失败渲染成
 * `el-empty`（"暂无数据"），运维看不出这是失败。
 *
 * b146 追加两族（同一个页面的另外两个断面）：
 * - 「测试」按钮原先**不带 body** ⇒ 服务端只能测**已保存**的配置：改完 endpoint 点测试，
 *   拿到的是旧值的结果，"测通了、保存后上传全挂"因此无解。现在测试与保存必须发
 *   **同一份草稿**（同源，两处各写一遍就必然漂）。
 * - 凭据两个输入框的承诺是「留空保留已保存的值」，而旧载荷把空串照发 ⇒ 后端把空串
 *   当"写入空值" ⇒ accessKey 被静默清空（改一次 bucket 就会踩到）。留空必须**不发这个字段**。
 *
 * 本文件钉九件事：
 * 1. 初次加载失败 ⇒ 错误条可见、**不出现"暂无数据"空态**、表单锁定、保存不发请求；
 * 2. 加载成功 ⇒ 错误条消失、表单可用、保存载荷来自服务端值；
 * 3. 失败后重试成功 ⇒ 错误条消失并恢复可保存；
 * 4. save 的 early-return 覆盖"按钮被绕过 disabled"的情形；
 * 5. 凭据留空 ⇒ 载荷里**没有** accessKey/secretKey 这两个键（不是空串）；
 * 6. 凭据填了 ⇒ 载荷带 trim 后的值；
 * 7. 「测试」发出的草稿与「保存」发出的载荷**逐字段相同**，且带屏上改后的 endpoint；
 * 8. 未加载成功 ⇒ 测试按钮同样禁用且点击不出网（与保存同闸，不是只管保存）；
 * 9. 测试失败 ⇒ 不得弹成功提示（失败与成功不得同屏）。
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

// 只桩掉三个"会出网"的函数，`buildCredentialPatch` 必须走**真实实现**：
// 本页要判的正是"留空 ⇒ 不发这个字段"这条由它兑现的承诺，桩掉它等于把判据
// 建在自己造的假件上（AGENTS ㉓：夹具的形状必须等于生产码真实产出的形状）。
vi.mock('@/api/system/uploadConfig', async (orig) => {
  const actual = await orig<typeof import('@/api/system/uploadConfig')>()
  return {
    ...actual,
    getUploadConfig: (...a: unknown[]) => hoisted.getUploadConfig(...a),
    updateUploadConfig: (...a: unknown[]) => hoisted.updateUploadConfig(...a),
    testUploadConfig: (...a: unknown[]) => hoisted.testUploadConfig(...a)
  }
})

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
  // v-model 必须真的通得上：凭据留空/填写是本页的判据主体，桩成静态 <input/> 就改不动值
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input class="input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
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

/** 按可见文案取按钮（页面上有 测试/保存/重试 三枚，索引会随模板漂移，文案是稳定身份） */
function buttonByText(wrapper: ReturnType<typeof mountPage>, text: string) {
  const btn = wrapper.findAll('.btn-stub').find((b) => b.text().includes(text))
  if (!btn) throw new Error(`没有找到文案含 "${text}" 的按钮（采集面坏了，不是"没有该按钮"）`)
  return btn
}

const endpointInput = (wrapper: ReturnType<typeof mountPage>) => wrapper.find('[aria-label="uploadConfig.ph.endpoint"]')

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

    // b146 订正：这条原先把 **缺陷形状**（accessKey/secretKey 发空串）写成了期望。
    // 空串在后端是"写入空值" ⇒ 已存 accessKey 被清掉 ⇒ 改一次 bucket 就把上传链路打瘫，
    // 而页面对这两个框的承诺是「留空保留已保存的值」。留空必须连键都不发。
    const payload = hoisted.updateUploadConfig.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toEqual({
      endpoint: 'https://s3.example.com',
      region: 'cn-test-1',
      bucket: 'stepby-test',
      pathStyle: true,
      publicEndpoint: 'https://cdn.example.com'
    })
    expect('accessKey' in payload).toBe(false)
    expect('secretKey' in payload).toBe(false)
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

describe('uploadConfig 草稿：测试与保存同源（b146）', () => {
  it('填了 accessKey、留空 secretKey ⇒ 只带填的那个，且已 trim', async () => {
    hoisted.getUploadConfig.mockResolvedValue({ data: okVo() })
    hoisted.updateUploadConfig.mockResolvedValue({})
    const wrapper = mountPage()
    await flushPromises()

    const inputs = wrapper.findAll('.input-stub')
    // 模板顺序：accessKey / secretKey / endpoint / region / bucket / publicEndpoint
    await inputs[0].setValue('  new-ak  ')
    await buttonByText(wrapper, 'common.save').trigger('click')
    await flushPromises()

    const payload = hoisted.updateUploadConfig.mock.calls[0][0] as Record<string, unknown>
    expect(payload.accessKey).toBe('new-ak')
    expect('secretKey' in payload).toBe(false)
  })

  it('点「测试」发出的就是屏上这份草稿，且与「保存」的载荷逐字段相同', async () => {
    hoisted.getUploadConfig.mockResolvedValue({ data: okVo() })
    hoisted.updateUploadConfig.mockResolvedValue({})
    hoisted.testUploadConfig.mockResolvedValue({ data: '连通正常（bucket stepby-test，12ms）' })
    const wrapper = mountPage()
    await flushPromises()

    // 改 endpoint（改造前这一步之后点测试，拿到的仍然是旧 endpoint 的结论）
    await endpointInput(wrapper).setValue('https://changed.example.com')
    await buttonByText(wrapper, 'uploadConfig.btn.test').trigger('click')
    await flushPromises()
    expect(hoisted.testUploadConfig).toHaveBeenCalledTimes(1)
    const tested = hoisted.testUploadConfig.mock.calls[0][0] as Record<string, unknown>
    expect(tested.endpoint).toBe('https://changed.example.com')

    await buttonByText(wrapper, 'common.save').trigger('click')
    await flushPromises()
    const saved = hoisted.updateUploadConfig.mock.calls[0][0] as Record<string, unknown>
    // 两处必须同源：不同源时"测通了"与"保存了"可以是两个答案
    expect(saved).toEqual(tested)
  })

  it('未读到服务端配置 ⇒ 测试按钮禁用且点击不出网（与保存同闸）', async () => {
    hoisted.getUploadConfig.mockRejectedValue(new Error('network down'))
    const wrapper = mountPage()
    await flushPromises()

    const testBtn = buttonByText(wrapper, 'uploadConfig.btn.test')
    expect(testBtn.attributes('disabled')).toBeDefined()
    await testBtn.trigger('click')
    await flushPromises()
    expect(hoisted.testUploadConfig).not.toHaveBeenCalled()
  })

  it('测试失败 ⇒ 不得弹成功提示，且页面不被卸载', async () => {
    hoisted.getUploadConfig.mockResolvedValue({ data: okVo() })
    hoisted.testUploadConfig.mockRejectedValue(new Error('连通失败'))
    const wrapper = mountPage()
    await flushPromises()

    await buttonByText(wrapper, 'uploadConfig.btn.test').trigger('click')
    await flushPromises()
    expect(hoisted.success).not.toHaveBeenCalled()
    expect(wrapper.find('.form-stub').exists()).toBe(true)
  })
})
