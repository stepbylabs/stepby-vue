/**
 * AnnouncementBanner 覆盖测试（b116）。
 *
 * 覆盖真实行为：挂载取"最新 1 条公告"的请求形状（noticeType=2 / status=0 / pageSize=1 /
 * createTime desc）/ 有公告即渲染且紧急类标题走 warning 样式 / 公告数据变更信号（WS notice
 * 帧或重连）后重取并更新 / 最新公告被删后收回横幅并清空文案（旧实现 `rows.length===0` 直接
 * return，屏幕上留着一条已不存在的公告）/ 回落到已被用户关闭的公告时同样收回（否则留着上一条
 * 的旧文案）/ 后发先回（旧响应不得覆盖新响应）/ 卸载后不再取数。
 *
 * 只 mock 外部依赖（公告 API / 本地缓存 / 导航 / i18n / EP 图标与组件）；组件逻辑全真实执行，
 * 公告数据变更信号用**真实的 notification store**（真实 pinia）驱动。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const hoisted = vi.hoisted(() => ({
  listNotice: vi.fn(),
  getJSON: vi.fn((): unknown => null),
  setJSON: vi.fn(),
  navigate: vi.fn()
}))

vi.mock('@/api/system/notice', () => ({ listNotice: hoisted.listNotice }))
vi.mock('@/plugins/cache', () => ({
  default: {
    local: { get: () => '', getJSON: hoisted.getJSON, setJSON: hoisted.setJSON, set: () => {} }
  }
}))
vi.mock('@/utils/navigation', () => ({ navigate: hoisted.navigate }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
// 真实的 notification store 会 import 全局 i18n 实例；这里不需要翻译，直接给最小桩
vi.mock('@/i18n', () => ({ default: { global: { t: (k: string) => `T:${k}` } } }))
vi.mock('@element-plus/icons-vue', () => {
  const s = { name: 'IconStub', render: () => null }
  return { WarningFilled: s, InfoFilled: s, SuccessFilled: s, Close: s }
})

import AnnouncementBanner from './index.vue'
import useNotificationStore from '@/store/modules/notification'

const mkNotice = (over: Record<string, unknown> = {}) => ({
  noticeId: 7,
  noticeTitle: '系统维护公告',
  noticeType: '2',
  status: '0',
  ...over
})

function factory() {
  return mount(AnnouncementBanner, {
    global: {
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-button': { template: '<button><slot /></button>' },
        transition: false
      }
    }
  })
}

const bannerText = (w: ReturnType<typeof factory>) =>
  w.find('.announcement-banner').exists() ? w.find('.banner-text').text() : ''

describe('components/AnnouncementBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    hoisted.listNotice.mockReset()
    hoisted.getJSON.mockReset().mockReturnValue(null)
    hoisted.setJSON.mockReset()
    hoisted.navigate.mockReset()
  })

  it('挂载即按"最新 1 条公告"的形状取数，并渲染标题', async () => {
    hoisted.listNotice.mockResolvedValue({ rows: [mkNotice()] })
    const w = factory()
    await flushPromises()
    expect(hoisted.listNotice).toHaveBeenCalledTimes(1)
    expect(hoisted.listNotice).toHaveBeenCalledWith({
      noticeType: '2',
      status: '0',
      pageNum: 1,
      pageSize: 1,
      orderByColumn: 'createTime',
      isAsc: 'desc'
    })
    expect(bannerText(w)).toBe('系统维护公告')
    expect(w.find('.announcement-banner').classes()).toContain('banner-info')
  })

  it('紧急类标题走 warning 样式', async () => {
    hoisted.listNotice.mockResolvedValue({ rows: [mkNotice({ noticeTitle: '紧急维护通知' })] })
    const w = factory()
    await flushPromises()
    expect(w.find('.announcement-banner').classes()).toContain('banner-warning')
  })

  it('公告数据变更信号到达后重取并更新文案（无需刷新页面）', async () => {
    hoisted.listNotice.mockResolvedValueOnce({ rows: [mkNotice({ noticeId: 1, noticeTitle: '旧公告' })] })
    const w = factory()
    await flushPromises()
    expect(bannerText(w)).toBe('旧公告')

    hoisted.listNotice.mockResolvedValueOnce({ rows: [mkNotice({ noticeId: 2, noticeTitle: '新公告' })] })
    useNotificationStore()._markNoticeDataChanged()
    await nextTick()
    await flushPromises()
    expect(hoisted.listNotice).toHaveBeenCalledTimes(2)
    expect(bannerText(w)).toBe('新公告')
  })

  it('最新公告被删除后收回横幅并清空文案（不得留下已不存在的公告）', async () => {
    hoisted.listNotice.mockResolvedValueOnce({ rows: [mkNotice({ noticeId: 9, noticeTitle: '将被删除' })] })
    const w = factory()
    await flushPromises()
    expect(w.find('.announcement-banner').exists()).toBe(true)

    hoisted.listNotice.mockResolvedValueOnce({ rows: [] })
    useNotificationStore()._markNoticeDataChanged()
    await nextTick()
    await flushPromises()
    expect(w.find('.announcement-banner').exists()).toBe(false)
    expect((w.vm as unknown as { message: string }).message).toBe('')
  })

  it('回落到一条已被用户关闭过的公告时也要收回（否则留着上一条的旧文案）', async () => {
    // 用户此前关闭过 5 号公告，时效内
    hoisted.getJSON.mockReturnValue({ noticeId: 5, at: Date.now() })
    hoisted.listNotice.mockResolvedValueOnce({ rows: [mkNotice({ noticeId: 6, noticeTitle: '新公告' })] })
    const w = factory()
    await flushPromises()
    expect(bannerText(w)).toBe('新公告')

    // 6 号被删，最新回落到已被关闭的 5 号
    hoisted.listNotice.mockResolvedValueOnce({ rows: [mkNotice({ noticeId: 5, noticeTitle: '已关闭的公告' })] })
    useNotificationStore()._markNoticeDataChanged()
    await nextTick()
    await flushPromises()
    expect(w.find('.announcement-banner').exists()).toBe(false)
    expect(bannerText(w)).toBe('')
  })

  it('后发先回：先发的旧响应不得覆盖后发的新响应', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    hoisted.listNotice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        })
    )
    const w = factory()
    await nextTick()
    expect(resolvers).toHaveLength(1)

    useNotificationStore()._markNoticeDataChanged()
    await nextTick()
    expect(resolvers).toHaveLength(2)

    // 后发的先回（新公告）
    resolvers[1]({ rows: [mkNotice({ noticeId: 2, noticeTitle: '新公告' })] })
    await flushPromises()
    // 先发的后回（旧公告）——必须被丢弃
    resolvers[0]({ rows: [mkNotice({ noticeId: 1, noticeTitle: '旧公告' })] })
    await flushPromises()
    expect(bannerText(w)).toBe('新公告')
  })

  it('卸载后不再跟随数据变更信号取数', async () => {
    hoisted.listNotice.mockResolvedValue({ rows: [mkNotice()] })
    const w = factory()
    await flushPromises()
    w.unmount()
    hoisted.listNotice.mockClear()
    useNotificationStore()._markNoticeDataChanged()
    await nextTick()
    await flushPromises()
    expect(hoisted.listNotice).not.toHaveBeenCalled()
  })
})
