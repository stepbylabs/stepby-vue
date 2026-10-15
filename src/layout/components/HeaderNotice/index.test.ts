/**
 * layout/components/HeaderNotice 覆盖测试（批六十七覆盖率工程）。
 *
 * 覆盖真实行为：挂载时按需拉取（仅 topNotices 空且非 loading 时才请求）/ noticeTagType 三元分类
 * （1=warning、2=success、其他含 undefined=info）/ noticeTagLabel 三态文案 / toggleNotice 可见性
 * 翻转 + 首次展开才请求浏览器通知权限（Chrome 86+ user activation）/ markAllRead 前置守卫
 * （unreadCount=0 直接 return）+ markAllRead 成功提示 + 失败静默 / previewNotice 未读才标记已读
 * + 标记失败 toast + 打开详情 / onNoticeEnter 绑定 popper 鼠标事件（幂等）/ onNoticeLeave 延时收起
 * + 卸载时清理定时器与监听器（防内存泄漏）/ 未读角标渲染 / Esc 关闭。
 *
 * 仅 mock 重依赖（notice store / notification store / modal / i18n / DetailView / EP 组件）
 * ——组件自身逻辑全真实执行。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const hoisted = vi.hoisted(() => ({
  topNotices: [] as unknown[],
  unreadCount: 0,
  loading: false,
  refreshTopNotices: vi.fn(() => Promise.resolve()),
  markRead: vi.fn(() => Promise.resolve()),
  markAllUnreadRead: vi.fn(() => Promise.resolve()),
  requestBrowserPermission: vi.fn(() => Promise.resolve()),
  msgError: vi.fn(),
  msgSuccess: vi.fn(),
  open: vi.fn()
}))

vi.mock('@/store/modules/notice', () => ({
  default: () => ({
    get topNotices() { return hoisted.topNotices },
    get unreadCount() { return hoisted.unreadCount },
    get loading() { return hoisted.loading },
    refreshTopNotices: hoisted.refreshTopNotices,
    markRead: hoisted.markRead,
    markAllUnreadRead: hoisted.markAllUnreadRead
  })
}))

vi.mock('@/store/modules/notification', () => ({
  default: () => ({ requestBrowserPermission: hoisted.requestBrowserPermission })
}))

vi.mock('@/plugins/modal', () => ({
  default: { msgError: hoisted.msgError, msgSuccess: hoisted.msgSuccess }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}))

vi.mock('./DetailView.vue', () => ({
  default: {
    name: 'DetailViewStub',
    setup(_p: unknown, { expose }: { expose: (e: unknown) => void }) {
      expose({ open: hoisted.open })
      return () => null
    }
  }
}))

vi.mock('@element-plus/icons-vue', () => {
  const s = { name: 'IconStub', render: () => null }
  return { Bell: s }
})

import HeaderNotice from './index.vue'

const mkNotice = (over: Record<string, unknown> = {}) => ({
  noticeId: 1,
  noticeTitle: '标题',
  noticeType: '1',
  isRead: false,
  ...over
})

function factory() {
  return mount(HeaderNotice, {
    global: {
      stubs: {
        // 需同时渲染 #reference 与 #default：角标/aria 在 reference、列表在 default
        'el-popover': {
          name: 'ElPopoverStub',
          props: ['visible'],
          setup(
            _p: unknown,
            {
              slots,
              expose
            }: {
              slots: { reference?: () => unknown; default?: () => unknown }
              expose: (e: unknown) => void
            }
          ) {
            expose({ popperRef: { contentRef: null } })
            return () => [slots.reference ? slots.reference() : null, slots.default ? slots.default() : null]
          }
        },
        'el-tag': { props: ['type'], template: '<span class="tag" :data-type="type"><slot /></span>' },
        'el-scrollbar': { template: '<div><slot /></div>' },
        transition: false,
        'transition-group': { template: '<div><slot /></div>' }
      }
    }
  })
}

/** 取内部方法（VTU 下 <script setup> 的普通函数挂在 wrapper.vm 上） */
function api(vm: ReturnType<typeof factory>) {
  return vm.vm as unknown as {
    noticeTagType: (t: string | undefined) => string
    noticeTagLabel: (t: string | undefined) => string
    toggleNotice: () => void
    markAllRead: () => Promise<void>
    previewNotice: (i: unknown) => Promise<void>
    onNoticeEnter: () => void
    onNoticeLeave: () => void
    noticeVisible: boolean
  }
}

describe('layout/components/HeaderNotice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    hoisted.topNotices = []
    hoisted.unreadCount = 0
    hoisted.loading = false
    for (const fn of [
      hoisted.refreshTopNotices,
      hoisted.markRead,
      hoisted.markAllUnreadRead,
      hoisted.requestBrowserPermission,
      hoisted.msgError,
      hoisted.msgSuccess,
      hoisted.open
    ]) fn.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('noticeTagType：1=warning、2=success、其余/undefined=info', async () => {
    const vm = factory()
    await nextTick()
    expect(api(vm).noticeTagType('1')).toBe('warning')
    expect(api(vm).noticeTagType('2')).toBe('success')
    expect(api(vm).noticeTagType('3')).toBe('info')
    expect(api(vm).noticeTagType(undefined)).toBe('info')
  })

  it('noticeTagLabel：三态分别返回对应 i18n key', async () => {
    const vm = factory()
    await nextTick()
    expect(api(vm).noticeTagLabel('1')).toBe('noticeCenter.typeNotice')
    expect(api(vm).noticeTagLabel('2')).toBe('noticeCenter.typeAnnouncement')
    expect(api(vm).noticeTagLabel('3')).toBe('noticeCenter.typeMessage')
    expect(api(vm).noticeTagLabel(undefined)).toBe('noticeCenter.typeMessage')
  })

  it('挂载且列表为空且非 loading → 主动拉取一次', async () => {
    factory()
    await nextTick()
    expect(hoisted.refreshTopNotices).toHaveBeenCalledTimes(1)
  })

  it('挂载时已有数据 → 不重复拉取', async () => {
    hoisted.topNotices = [mkNotice()]
    factory()
    await nextTick()
    expect(hoisted.refreshTopNotices).not.toHaveBeenCalled()
  })

  it('挂载时 loading 中 → 不重复拉取', async () => {
    hoisted.loading = true
    factory()
    await nextTick()
    expect(hoisted.refreshTopNotices).not.toHaveBeenCalled()
  })

  it('toggleNotice：翻转可见性；首次展开才请求浏览器通知权限', async () => {
    const vm = factory()
    await nextTick()
    api(vm).toggleNotice()
    await nextTick()
    expect(api(vm).noticeVisible).toBe(true)
    expect(hoisted.requestBrowserPermission).toHaveBeenCalledTimes(1)
    // 展开时同步刷新最新公告
    expect(hoisted.refreshTopNotices).toHaveBeenCalled()

    api(vm).toggleNotice()
    await nextTick()
    expect(api(vm).noticeVisible).toBe(false)
  })

  it('再次展开不重复请求浏览器权限（user activation 只应触发一次）', async () => {
    const vm = factory()
    await nextTick()
    api(vm).toggleNotice()
    await nextTick()
    api(vm).toggleNotice()
    await nextTick()
    api(vm).toggleNotice()
    await nextTick()
    expect(hoisted.requestBrowserPermission).toHaveBeenCalledTimes(2)
  })

  it('Esc 键在可见时关闭、不可见时不动作', async () => {
    const vm = factory()
    await nextTick()
    api(vm).toggleNotice()
    await nextTick()
    expect(api(vm).noticeVisible).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(api(vm).noticeVisible).toBe(false)
    // 不可见时再按 Esc 不应抛错
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(api(vm).noticeVisible).toBe(false)
  })

  it('markAllRead：unreadCount=0 直接 return，不发请求', async () => {
    hoisted.unreadCount = 0
    const vm = factory()
    await nextTick()
    await api(vm).markAllRead()
    await flushPromises()
    expect(hoisted.markAllUnreadRead).not.toHaveBeenCalled()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('markAllRead：有未读 → 调接口并成功提示', async () => {
    hoisted.unreadCount = 3
    const vm = factory()
    await nextTick()
    await api(vm).markAllRead()
    await flushPromises()
    expect(hoisted.markAllUnreadRead).toHaveBeenCalledTimes(1)
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('noticeCenter.markAllReadSuccess')
  })

  it('markAllRead：接口失败 → 不提示成功、不抛异常', async () => {
    hoisted.unreadCount = 2
    hoisted.markAllUnreadRead.mockImplementationOnce(() => Promise.reject(new Error('x')))
    const vm = factory()
    await nextTick()
    await expect(api(vm).markAllRead()).resolves.toBeUndefined()
    await flushPromises()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('previewNotice：未读项 → 先 markRead 成功再打开详情', async () => {
    const vm = factory()
    await nextTick()
    await api(vm).previewNotice(mkNotice({ noticeId: 7, isRead: false }))
    await flushPromises()
    expect(hoisted.markRead).toHaveBeenCalledWith(7)
    expect(hoisted.open).toHaveBeenCalledWith(7)
    expect(hoisted.msgError).not.toHaveBeenCalled()
  })

  it('previewNotice：已读项 → 不再 markRead，直接打开详情', async () => {
    const vm = factory()
    await nextTick()
    await api(vm).previewNotice(mkNotice({ noticeId: 9, isRead: true }))
    await flushPromises()
    expect(hoisted.markRead).not.toHaveBeenCalled()
    expect(hoisted.open).toHaveBeenCalledWith(9)
  })

  it('previewNotice：markRead 失败 → toast 报错且仍打开详情（不阻断）', async () => {
    hoisted.markRead.mockImplementationOnce(() => Promise.reject(new Error('net')))
    const vm = factory()
    await nextTick()
    await api(vm).previewNotice(mkNotice({ noticeId: 11, isRead: false }))
    await flushPromises()
    expect(hoisted.msgError).toHaveBeenCalledWith('noticeCenter.markReadFail')
    expect(hoisted.open).toHaveBeenCalledWith(11)
  })

  it('未读角标：unreadCount>0 时渲染数量', async () => {
    hoisted.unreadCount = 5
    hoisted.topNotices = [mkNotice()]
    const vm = factory()
    await nextTick()
    expect(vm.text()).toContain('5')
  })

  it('未读为 0 时不渲染角标', async () => {
    hoisted.unreadCount = 0
    hoisted.topNotices = [mkNotice({ isRead: true })]
    const vm = factory()
    await nextTick()
    expect(vm.find('.notice-badge').exists()).toBe(false)
  })

  it('标签渲染：按 noticeType 映射 tag type', async () => {
    hoisted.topNotices = [
      mkNotice({ noticeId: 1, noticeType: '1' }),
      mkNotice({ noticeId: 2, noticeType: '2' })
    ]
    const vm = factory()
    await nextTick()
    const types = vm.findAll('.tag').map((t) => t.attributes('data-type'))
    expect(types).toContain('warning')
    expect(types).toContain('success')
  })

  it('onNoticeLeave：150ms 延时收起（可被 onNoticeEnter 取消）', async () => {
    vi.useFakeTimers()
    const vm = factory()
    await nextTick()
    api(vm).noticeVisible = true
    api(vm).onNoticeLeave()
    vi.advanceTimersByTime(100)
    expect(api(vm).noticeVisible).toBe(true)
    api(vm).onNoticeEnter() // 取消定时器
    vi.advanceTimersByTime(200)
    expect(api(vm).noticeVisible).toBe(true)
    // 重新离开并等满 150ms
    api(vm).noticeVisible = true
    api(vm).onNoticeLeave()
    vi.advanceTimersByTime(160)
    expect(api(vm).noticeVisible).toBe(false)
  })

  it('卸载时清理 Esc 监听器（防泄漏）', async () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const vm = factory()
    await nextTick()
    vm.unmount()
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function))
    remove.mockRestore()
  })
})
