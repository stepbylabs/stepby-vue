/**
 * 参数治理页「锁定清单」的可得性回归锁（b146）。
 *
 * 立的案（HEAD 实测 `views/system/config/index.vue:355-362`）：清单请求写的是
 * `.then(赋值).catch(() => {})` ⇒ 一次网络抖动后 `lockedKeys` 恒空，而
 * `:disabled="isLockedKey"` 的判据是"这个键在清单里"——于是"没查到"被渲染成
 * "这个键没被锁"，平台专属键的治理三控件呈现成**可编辑**，屏上没有任何一句话说明不知道。
 * 这是 AGENTS 65（读失败 ≠ 空数据）在**禁用态**上的断面：清空数据必须同时标记"未就绪"。
 *
 * 四条判据各自挡一种退化：
 * ① 失败 ⇒ 告警可见 + 重试入口（不得沉默；也不得改成"全部禁用"——那是把一种误导换成
 *    另一种，管理员会被锁在全部参数之外，而注册表里真正锁定的只有那几条）；
 * ② 重试成功且该键在册 ⇒ 告警消失且控件**真的禁用**（对照组，证明禁用通道没被改坏）；
 * ③ 成功且该键不在册 ⇒ 无告警、可编辑（防"永远显示告警"的假修复）；
 * ④ 非平台管理员 ⇒ 一次都不请求该端点（这一段根本不渲染，不该产生出网流量）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  getConfig: vi.fn(),
  listConfig: vi.fn()
}))

vi.mock('@/utils/request', () => ({ default: (...a: unknown[]) => hoisted.request(...a) }))
vi.mock('@/api/system/config', () => ({
  listConfig: (...a: unknown[]) => hoisted.listConfig(...a),
  getConfig: (...a: unknown[]) => hoisted.getConfig(...a),
  delConfig: vi.fn(),
  addConfig: vi.fn(),
  updateConfig: vi.fn(),
  refreshCache: vi.fn(),
  invalidateConfigCache: vi.fn()
}))
vi.mock('@/utils/permission', () => ({ checkPermi: () => true }))
vi.mock('@/utils/dict', () => ({ useDict: () => ({ sys_yes_no: { value: [] } }) }))
vi.mock('@/plugins/modal', () => ({
  default: {
    msgSuccess: vi.fn(),
    msgWarning: vi.fn(),
    msgError: vi.fn(),
    confirm: vi.fn(),
    loading: () => undefined,
    closeLoading: () => undefined
  }
}))
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

// 平台身份由 store 给；租户身份在④里单独改
const userStore = vi.hoisted(() => ({ tenantId: 0 }))
vi.mock('@/store/modules/user', () => ({ default: () => userStore }))

import ConfigPage from './index.vue'

const stubs = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-button': {
    props: ['disabled'],
    emits: ['click'],
    template: '<button class="btn-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="alert-stub" :data-type="type">{{ title }}<slot /></div>'
  },
  'el-table': { props: ['data'], template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-dialog': { template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-select': {
    props: ['disabled'],
    template: '<div class="select-stub" :data-disabled="String(disabled)"><slot /></div>'
  },
  'el-option': { template: '<div />' },
  'el-switch': { props: ['disabled'], template: '<div class="switch-stub" :data-disabled="String(disabled)" />' },
  'el-divider': { template: '<div />' },
  'el-tooltip': { template: '<div><slot /><slot name="content" /></div>' },
  'el-checkbox': { template: '<div />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio': { template: '<div><slot /></div>' },
  'el-date-picker': { template: '<div />' },
  'el-icon': { template: '<div />' },
  SkeletonTable: { template: '<div />' },
  EditableCell: { template: '<div />' }
}

/** 清单端点的响应由每个用例自己给；列表恒空（本文件不判列表） */
function withLockedList(impl: (cfg: { url: string }) => Promise<unknown>) {
  hoisted.listConfig.mockResolvedValue({ rows: [], total: 0 })
  hoisted.getConfig.mockResolvedValue({ data: {} })
  hoisted.request.mockImplementation((cfg: { url: string }) => {
    if (cfg.url === '/system/config/governance-locked') return impl(cfg)
    return Promise.resolve({ rows: [], total: 0 })
  })
}

function mountPage() {
  return mount(ConfigPage, { global: { stubs, directives: { hasPermi: {}, loading: {} } } })
}

/** 打开编辑并把 form 落到"某个已存在的键"上：告警的判据里有 configKey 这一维 */
async function openWithKey(wrapper: ReturnType<typeof mountPage>, configKey: string) {
  // scope 取 platform_default 而不是 platform_only：后者会让两个开关**因 scope 本身**禁用，
  // 于是"禁用是不是由锁定清单决定"这一维就被另一个条件顶掉了（断言要落在被测通道上）
  ;(wrapper.vm as unknown as { form: Record<string, unknown> }).form = {
    configId: 1,
    configKey,
    configName: 'k',
    configValue: 'v',
    scope: 'platform_default',
    tenantEditable: '1',
    visibleToTenant: '1'
  }
  await flushPromises()
}

const UNKNOWN_ALERT = 'config.governance.lockedListUnknown'
const LOCKED_ALERT = 'config.governance.lockedTip'

/**
 * 治理段的控件：对话框内的第一个 el-select（scope）与两个 el-switch。
 *
 * 必须**限定在 `.dialog-stub` 里取**——查询表单也有一个不带 `disabled` 的 el-select，
 * 全局 `find('.select-stub')` 会先命中它，于是三条断言读的是"搜索框的下拉"而不是治理段，
 * 结论恒为 undefined（本文件第一次真跑就红在这里；判据读错对象与产品缺陷无关，
 * 但若不红就会被当成"禁用通道坏了"去改产品）。counts 一起断言，防止选择器空跑。
 */
function governanceControls(wrapper: ReturnType<typeof mountPage>) {
  const dialog = wrapper.find('.dialog-stub')
  expect(dialog.exists(), '编辑对话框（stub 恒渲染插槽）必须在场').toBe(true)
  const selects = dialog.findAll('.select-stub')
  const switches = dialog.findAll('.switch-stub')
  expect(selects, '治理段应恰好有一个 scope 下拉').toHaveLength(1)
  expect(switches, '治理段应恰好有两个开关（租户可改 / 对租户可见）').toHaveLength(2)
  return {
    scopeDisabled: selects[0].attributes('data-disabled'),
    switchDisabled: switches.map((s) => s.attributes('data-disabled'))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  userStore.tenantId = 0
})

describe('参数治理锁定清单的三态结局（b146）', () => {
  it('① 清单读失败：告警可见且带重试；控件不得被"全部禁用"', async () => {
    withLockedList(() => Promise.reject(new Error('network')))
    const wrapper = mountPage()
    await openWithKey(wrapper, 'sys.platform.only')
    await flushPromises()

    const alerts = wrapper.findAll('.alert-stub').map((a) => a.text())
    expect(
      alerts.some((x) => x.includes(UNKNOWN_ALERT)),
      `失败必须可见：${JSON.stringify(alerts)}`
    ).toBe(true)
    // 选择"如实说不知道"而不是"故障时一律禁用"：禁用通道此时必须是开着的
    const c = governanceControls(wrapper)
    expect(c.scopeDisabled, '未知态不得把 scope 下拉锁死').toBe('false')
    expect(c.switchDisabled, '未知态不得把两个开关锁死').toEqual(['false', 'false'])
    const retry = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))
    expect(retry, '失败态必须带可点击的重试入口').toBeTruthy()
  })

  it('② 重试成功且该键在册：告警消失，且控件真的禁用（对照组）', async () => {
    let calls = 0
    withLockedList(() => {
      calls += 1
      if (calls === 1) return Promise.reject(new Error('network'))
      return Promise.resolve({ data: ['sys.platform.only'] })
    })
    const wrapper = mountPage()
    await openWithKey(wrapper, 'sys.platform.only')
    await flushPromises()
    expect(wrapper.text()).toContain(UNKNOWN_ALERT)

    const retry = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))!
    await retry.trigger('click')
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain(UNKNOWN_ALERT)
    expect(text).toContain(LOCKED_ALERT)
    const c = governanceControls(wrapper)
    expect(c.scopeDisabled, '在册键必须禁用治理控件').toBe('true')
    expect(c.switchDisabled, '在册键必须同时禁用两个开关').toEqual(['true', 'true'])
    expect(calls, '重试必须真的重新出网').toBe(2)
  })

  it('③ 成功且该键不在册：既无"锁定"也无"未知"告警（防永远报警的假修复）', async () => {
    withLockedList(() => Promise.resolve({ data: ['some.other.key'] }))
    const wrapper = mountPage()
    await openWithKey(wrapper, 'sys.platform.only')
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain(UNKNOWN_ALERT)
    expect(text).not.toContain(LOCKED_ALERT)
    expect(governanceControls(wrapper).scopeDisabled).toBe('false')
  })

  it('④ 非平台管理员：一次都不请求锁定清单（这一段根本不渲染）', async () => {
    userStore.tenantId = 7
    withLockedList(() => Promise.resolve({ data: [] }))
    const wrapper = mountPage()
    await openWithKey(wrapper, 'sys.platform.only')
    await flushPromises()

    const lockedCalls = hoisted.request.mock.calls.filter(
      (c) => (c[0] as { url: string }).url === '/system/config/governance-locked'
    )
    expect(lockedCalls, '租户管理员不该产生这份清单的出网请求').toHaveLength(0)
    expect(wrapper.text()).not.toContain(UNKNOWN_ALERT)
    expect(wrapper.text()).not.toContain(LOCKED_ALERT)
  })

  it('⑤ 200 但清单为空数组 ⇒ 视为读到且"确无锁定"（不得把空清单读成失败）', async () => {
    withLockedList(() => Promise.resolve({ data: [] }))
    const wrapper = mountPage()
    await openWithKey(wrapper, 'sys.platform.only')
    await flushPromises()
    expect(wrapper.text()).not.toContain(UNKNOWN_ALERT)
  })
})
