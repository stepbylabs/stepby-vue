/**
 * HeaderNotice/DetailView 的失败态回归锁（b142）。
 *
 * 立的案：`getNotice` 的 catch 把 `detail` 置 null ⇒ 界面渲染 `el-empty`「暂无数据」。
 * 「读取失败」与「这条公告没有内容」在屏幕上逐像素同形，且没有任何重试入口。
 *
 * 本文件钉三件事：
 * ① 读取失败显示「公告详情加载失败 + 重试」，不得显示成「暂无数据」；
 * ② 重试按**最近一次请求的 ID** 重发，成功后失败态消失、正文渲染；
 * ③ 从列表带入完整对象（preset）时不再发请求——对照组，证明①不是在"永远报错"。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({ getNotice: vi.fn() }))

vi.mock('@/api/system/notice', () => ({
  getNotice: (...a: unknown[]) => hoisted.getNotice(...a)
}))
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})
vi.mock('@element-plus/icons-vue', () => {
  const stub = { name: 'IconStub', render: () => null }
  return { Bell: stub, Message: stub, Document: stub, User: stub, Clock: stub }
})

import DetailView from './DetailView.vue'

const stubs = {
  transition: true,
  Bell: { template: '<i />' },
  Message: { template: '<i />' },
  Document: { template: '<i />' },
  User: { template: '<i />' },
  Clock: { template: '<i />' },
  'el-drawer': { props: ['modelValue'], template: '<div class="drawer-stub"><slot /></div>' },
  'el-empty': {
    props: ['description'],
    template: '<div class="empty-stub">{{ description }}<slot /></div>'
  },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' }
}

function mountView() {
  return mount(DetailView, {
    global: { stubs, directives: { loading: {} } }
  })
}

type ViewApi = { open: (payload: unknown) => void }

beforeEach(() => {
  hoisted.getNotice.mockReset()
})

describe('HeaderNotice/DetailView 失败态', () => {
  it('读取失败：显示失败文案 + 重试入口，不得显示成「暂无数据」', async () => {
    hoisted.getNotice.mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    ;(w.vm as unknown as ViewApi).open(5)
    await flushPromises()

    expect(w.text()).toContain('layout.headerNotice.detailLoadFailed')
    expect(w.text()).not.toContain('common.noData')
    expect(w.findAll('button').some((b) => b.text() === 'common.retry')).toBe(true)
  })

  it('重试按最近一次的 ID 重发；成功后失败态消失且正文渲染', async () => {
    hoisted.getNotice.mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    ;(w.vm as unknown as ViewApi).open(5)
    await flushPromises()

    hoisted.getNotice.mockResolvedValueOnce({
      data: { noticeId: 5, noticeTitle: '维护通知', noticeContent: '<p>今晚维护</p>' }
    })
    const retry = w.findAll('button').find((b) => b.text() === 'common.retry')
    await retry!.trigger('click')
    await flushPromises()

    expect(hoisted.getNotice).toHaveBeenCalledTimes(2)
    expect(hoisted.getNotice.mock.calls[1][0]).toBe(5)
    expect(w.text()).toContain('维护通知')
    expect(w.text()).not.toContain('layout.headerNotice.detailLoadFailed')
  })

  it('对照组：列表带入完整对象时不发请求，直接渲染正文', async () => {
    const w = mountView()
    ;(w.vm as unknown as ViewApi).open({
      noticeId: 9,
      noticeTitle: '预设公告',
      noticeContent: '<p>来自列表</p>'
    })
    await flushPromises()

    expect(hoisted.getNotice).not.toHaveBeenCalled()
    expect(w.text()).toContain('预设公告')
    expect(w.text()).not.toContain('layout.headerNotice.detailLoadFailed')
  })
})
