/**
 * 告警表单「参考数据下拉」的行为锁（b133-D）。
 *
 * 立的案（HEAD 实测）：两个下拉一次拉 100 条，超出部分**静默截断**——用户看到的是一个
 * 少了几项的"完整"下拉，选不到自己刚建的渠道/模板就只能保存成"仅记录不通知"，而唯一
 * 提示是 `import.meta.env.DEV` 里的 `console.warn`（生产构建里根本不存在）。同时两个
 * 下拉不可搜索，渠道数超过 100 之后新渠道永远选不到。
 *
 * 五条判据：
 * 1. 初始加载：渠道按 `pageSize=100 / status='0' / 无关键字` 拉取；模板不在页面加载时拉（只随弹窗）；
 * 2. 远程搜索：`remote-method` 收到的关键字被 trim 后作为 `channelName` 下发，选项来自响应；
 * 3. 截断可见且判定正确（b134 收口）：按服务端 `total` 判——`total>行数` 才提示，
 *    恰好 100/100 是完整一页、不得误报（旧判据拿"请求的 pageSize"当尺会误报）；
 * 4. 后发先回：先发的慢响应不得覆盖后发的搜索结果（`createLatestGuard` 的落地判票）；
 * 5. 失败可见：任一失败 ⇒ 对话框顶部的失败告警出现，重试一次同时补两路。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref, type SetupContext } from 'vue'

const hoisted = vi.hoisted(() => ({
  listChannel: vi.fn(),
  listTemplate: vi.fn(),
  listAlert: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('@/api/system/msg', () => ({
  listChannel: (...a: unknown[]) => hoisted.listChannel(...a),
  listTemplate: (...a: unknown[]) => hoisted.listTemplate(...a)
}))

vi.mock('@/api/monitor/alert', () => ({
  listAlert: (...a: unknown[]) => hoisted.listAlert(...a),
  getAlert: vi.fn(),
  addAlert: vi.fn(),
  updateAlert: vi.fn(),
  delAlert: vi.fn(),
  changeAlertEnabled: vi.fn(),
  evaluateAlert: vi.fn()
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    msgError: (...a: unknown[]) => hoisted.msgError(...a),
    msgSuccess: vi.fn(),
    confirm: vi.fn()
  }
}))

vi.mock('@/composables/useMobileFilter', () => ({
  useMobileFilter: () => ({ isMobile: ref(false) })
}))

// 页面只把组合子接在列表 CRUD 上；本用例只判下拉行为，故以最小契约替身挂载（不是替身产品逻辑）
vi.mock('@/composables/useCrudTable', () => ({
  useCrudTable: () => ({
    dataList: ref([]),
    open: ref(true),
    loading: ref(false),
    submitLoading: ref(false),
    showSearch: ref(true),
    single: ref(true),
    multiple: ref(true),
    total: ref(0),
    title: ref('alert.title'),
    getList: vi.fn(),
    loadError: ref(false),
    retryLoad: vi.fn(),
    beforeDialogClose: vi.fn(),
    cancel: vi.fn(),
    handleQuery: vi.fn(),
    resetQuery: vi.fn(),
    handleSelectionChange: vi.fn(),
    handleAdd: vi.fn(),
    handleUpdate: vi.fn(),
    submitForm: vi.fn(),
    handleDelete: vi.fn(),
    handleExport: vi.fn(),
    handleSortChange: vi.fn()
  })
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import AlertPage from './index.vue'

const ElSelectStub = defineComponent({
  name: 'ElSelectStub',
  inheritAttrs: false,
  props: {
    remoteMethod: { type: Function, default: null },
    loading: { type: Boolean, default: false }
  },
  setup(_p: Record<string, unknown>, { slots, attrs }: SetupContext) {
    return () => h('div', { class: 'select-stub', ...attrs }, slots.default?.())
  }
})

const stubs = {
  'el-alert': {
    props: ['title'],
    template: '<div class="alert-stub"><span class="alert-title">{{ title }}</span><slot /></div>'
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div class="form-item"><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-select': ElSelectStub,
  'el-option': { props: ['label'], template: '<div class="opt">{{ label }}</div>' },
  'el-switch': { template: '<span />' },
  'el-dialog': { template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-button': {
    props: ['loading', 'disabled'],
    emits: ['click'],
    template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>'
  },
  'list-empty': { template: '<div />' },
  pagination: { template: '<div />' },
  'right-toolbar': { template: '<div />' }
}

function mountPage() {
  return mount(AlertPage, {
    global: { stubs, directives: { hasPermi: () => {}, loading: () => {} } }
  })
}

/** 按 aria-label 找到渠道/模板下拉（生产码里两者都带 i18n 标签，t 在本用例里返回键名） */
function remoteMethodOf(w: ReturnType<typeof mountPage>, ariaLabel: string): (kw: string) => Promise<void> {
  const sel = w.findAllComponents(ElSelectStub).find((c) => c.attributes('aria-label') === ariaLabel)
  if (!sel) throw new Error(`找不到下拉：${ariaLabel}`)
  return sel.props('remoteMethod') as (kw: string) => Promise<void>
}

function defer<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.listChannel.mockResolvedValue({ rows: [{ channelId: 1, channelName: '邮件渠道' }] })
  hoisted.listTemplate.mockResolvedValue({ rows: [{ templateId: 2, templateName: '告警模板' }] })
})

describe('告警表单参考数据下拉（b133-D）', () => {
  it('初始加载按上限拉渠道、模板不随页面加载', async () => {
    mountPage()
    await flushPromises()
    expect(hoisted.listChannel).toHaveBeenCalledTimes(1)
    expect(hoisted.listChannel.mock.calls[0][0]).toMatchObject({
      pageNum: 1,
      pageSize: 100,
      status: '0',
      channelName: undefined
    })
    expect(hoisted.listTemplate).not.toHaveBeenCalled()
  })

  it('远程搜索把 trim 后的关键字下发给 channelName，选项来自响应', async () => {
    const w = mountPage()
    await flushPromises()
    await remoteMethodOf(w, 'alert.form.notifyChannelId')('  生产  ')
    await flushPromises()
    expect(hoisted.listChannel).toHaveBeenCalledTimes(2)
    expect(hoisted.listChannel.mock.calls[1][0]).toMatchObject({ pageNum: 1, pageSize: 100, channelName: '生产' })
    expect(w.text()).toContain('邮件渠道')
    expect(w.findAllComponents(ElSelectStub).length).toBeGreaterThan(0)
  })

  it('截断按服务端 total 判定：total>行数才提示，total 恰好等于行数不提示', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ channelId: i + 1, channelName: `渠道${i + 1}` }))
    hoisted.listChannel.mockResolvedValueOnce({ rows: many, total: 120 })
    hoisted.listTemplate.mockResolvedValue({ rows: [{ templateId: 9, templateName: '模板' }] })

    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-test="channel-truncated"]').exists()).toBe(true)
    expect(w.find('[data-test="template-truncated"]').exists()).toBe(false)

    // 反例：恰好 100/100 是完整的一页——旧判据（rows.length >= 请求的 pageSize）会误报
    hoisted.listChannel.mockResolvedValueOnce({ rows: many, total: 100 })
    await remoteMethodOf(w, 'alert.form.notifyChannelId')('x')
    await flushPromises()
    expect(w.find('[data-test="channel-truncated"]').exists()).toBe(false)

    await remoteMethodOf(w, 'alert.form.notifyTemplateId')('x')
    await flushPromises()
    expect(w.find('[data-test="template-truncated"]').exists()).toBe(false)
  })

  it('后发先回：慢的旧搜索不得覆盖新搜索结果', async () => {
    const w = mountPage()
    await flushPromises() // 先让初始加载吃掉默认桩，再排队两次搜索的响应
    const slow = defer<{ rows: { channelId: number; channelName: string }[] }>()
    const fast = defer<{ rows: { channelId: number; channelName: string }[] }>()
    hoisted.listChannel.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)

    const search = remoteMethodOf(w, 'alert.form.notifyChannelId')
    const first = search('旧')
    const second = search('新')

    fast.resolve({ rows: [{ channelId: 2, channelName: '新渠道' }] })
    await second
    slow.resolve({ rows: [{ channelId: 1, channelName: '旧渠道' }] })
    await first
    await flushPromises()

    expect(w.text()).toContain('新渠道')
    expect(w.text()).not.toContain('旧渠道')
  })

  it('失败可见：任一失败 ⇒ 顶部告警出现，重试同时补两路', async () => {
    hoisted.listChannel.mockRejectedValueOnce(new Error('boom'))
    const w = mountPage()
    await flushPromises()

    expect(w.find('.alert-stub').exists()).toBe(true)
    expect(w.find('.alert-title').text()).toBe('alert.form.optionsLoadFailed')

    hoisted.listChannel.mockResolvedValue({ rows: [] })
    hoisted.listTemplate.mockResolvedValue({ rows: [] })
    await w.find('.alert-stub .btn-stub').trigger('click')
    await flushPromises()
    expect(hoisted.listChannel).toHaveBeenCalledTimes(2)
    expect(hoisted.listTemplate).toHaveBeenCalledTimes(1)
    expect(w.find('.alert-stub').exists()).toBe(false)
  })
})
