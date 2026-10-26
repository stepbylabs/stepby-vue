/**
 * AI 助手配置页的"加载失败不得可保存"回归锁（b95）。
 *
 * 立的案：`load()` 原先把失败吞成一条 DEV 日志，表单保留默认值
 * （`enabled=false`、`baseUrl/model` 空），保存按钮照样可点 ⇒ 一次加载失败
 * 就能把 `sys.ai.*` 整段写空并关闭 AI。后端 `config_service` 对空串是**无条件写**，
 * 所以这一页的失败态是真实的破坏面，不是"看起来不好看"。
 *
 * 本文件钉四件事：
 * 1. 初次加载失败 ⇒ 错误条可见、表单锁定、点保存不发请求；
 * 2. 加载成功 ⇒ 错误条消失、表单可用、保存载荷来自服务端值；
 * 3. 失败后重试成功 ⇒ 错误条消失并恢复可保存（不是永久锁死）；
 * 4. 加载失败时页面不得进入 `loaded` 态（save 的 early-return 与按钮 disabled 双保险）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getAiConfig: vi.fn(),
  updateAiConfig: vi.fn(),
  testAiConfig: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('@/api/system/aiConfig', () => ({
  getAiConfig: (...a: unknown[]) => hoisted.getAiConfig(...a),
  updateAiConfig: (...a: unknown[]) => hoisted.updateAiConfig(...a),
  testAiConfig: (...a: unknown[]) => hoisted.testAiConfig(...a)
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: hoisted.success, error: hoisted.error }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import AiConfig from './index.vue'

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
  'el-form': {
    props: ['disabled'],
    template: '<div class="form-stub" :data-disabled="String(disabled)"><slot /></div>'
  },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-switch': { template: '<div />' }
}

function mountPage() {
  return mount(AiConfig, {
    global: {
      stubs,
      directives: { hasPermi: {}, loading: {} }
    }
  })
}

function okVo(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    provider: 'openai',
    baseUrl: 'https://llm.example/v1',
    model: 'gpt-test',
    allowedTables: ['sys_user'],
    hasApiKey: true,
    apiKeyMasked: 'sk-***',
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.getAiConfig.mockReset()
  hoisted.updateAiConfig.mockReset()
  hoisted.testAiConfig.mockReset()
})

describe('aiConfig 页面加载失败态', () => {
  it('初次加载失败：错误条 + 表单锁定 + 保存不发请求', async () => {
    hoisted.getAiConfig.mockRejectedValue(new Error('network down'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-test="ai-config-load-error"]').exists()).toBe(true)
    expect(wrapper.find('.form-stub').attributes('data-disabled')).toBe('true')

    const saveBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.save'))
    expect(saveBtn).toBeTruthy()
    expect(saveBtn!.attributes('disabled')).toBeDefined()

    // 即使绕过 disabled（脚本触发/辅助技术），处理器 early-return 也不得写库
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(hoisted.updateAiConfig).not.toHaveBeenCalled()
    expect(hoisted.success).not.toHaveBeenCalled()
  })

  it('加载成功：错误条消失、表单可用、保存载荷来自服务端值', async () => {
    hoisted.getAiConfig.mockResolvedValue({ data: okVo() })
    hoisted.updateAiConfig.mockResolvedValue({})
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-test="ai-config-load-error"]').exists()).toBe(false)
    expect(wrapper.find('.form-stub').attributes('data-disabled')).toBe('false')

    const saveBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.save'))!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(hoisted.updateAiConfig).toHaveBeenCalledTimes(1)
    expect(hoisted.updateAiConfig).toHaveBeenCalledWith({
      enabled: true,
      provider: 'openai',
      baseUrl: 'https://llm.example/v1',
      apiKey: '',
      model: 'gpt-test',
      allowedTables: ['sys_user']
    })
    expect(hoisted.success).toHaveBeenCalledWith('common.saveSuccess')
  })

  it('失败后重试成功：错误条消失且恢复可保存', async () => {
    hoisted.getAiConfig
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ data: okVo({ enabled: false }) })
    hoisted.updateAiConfig.mockResolvedValue({})

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="ai-config-load-error"]').exists()).toBe(true)

    const retryBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))!
    await retryBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="ai-config-load-error"]').exists()).toBe(false)
    expect(wrapper.find('.form-stub').attributes('data-disabled')).toBe('false')
  })

  it('保存后重新加载失败：页面回到锁定态（屏幕上不是已被确认的服务端值）', async () => {
    hoisted.getAiConfig.mockResolvedValueOnce({ data: okVo() }).mockRejectedValueOnce(new Error('reload failed'))
    hoisted.updateAiConfig.mockResolvedValue({})

    const wrapper = mountPage()
    await flushPromises()
    const saveBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.save'))!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(hoisted.updateAiConfig).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="ai-config-load-error"]').exists()).toBe(true)
    expect(wrapper.find('.form-stub').attributes('data-disabled')).toBe('true')
  })
})
