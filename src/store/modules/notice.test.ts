import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/system/notice', () => ({
  listNoticeTop: vi.fn(),
  markNoticeRead: vi.fn(),
  markNoticeReadAll: vi.fn(),
  markAllUnreadNoticeRead: vi.fn()
}))

import { listNoticeTop, markNoticeRead, markNoticeReadAll, markAllUnreadNoticeRead } from '@/api/system/notice'
import type { SysNoticeTopResult, AjaxResult } from '@/types'
import useNoticeStore from './notice'

const mocked = {
  listNoticeTop: vi.mocked(listNoticeTop),
  markNoticeRead: vi.mocked(markNoticeRead),
  markNoticeReadAll: vi.mocked(markNoticeReadAll),
  markAllUnreadNoticeRead: vi.mocked(markAllUnreadNoticeRead)
}

describe('store/modules/notice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('refreshTopNotices loads list, derives unreadCount and syncs readIds', async () => {
    mocked.listNoticeTop.mockResolvedValue({
      data: [
        { noticeId: 1, isRead: true },
        { noticeId: 2, isRead: false },
        { noticeId: 3, isRead: false }
      ]
    } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    expect(store.topNotices).toHaveLength(3)
    // no explicit unreadCount -> derived from top list (2 unread)
    expect(store.unreadCount).toBe(2)
    expect(store.isRead(1)).toBe(true)
    expect(store.isRead(2)).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.refreshPromise).toBeNull()
  })

  it('totalCount drives readCount; missing totalCount fails safe to 0', async () => {
    // 卡片三个数必须自洽：全部=listTop.totalCount（可见面），未读=listTop.unreadCount，
    // 已读=两者之差。列表 total 会随筛选变化（'未读' 档下它就是未读数），拿它当分母会算出"已读 0"
    mocked.listNoticeTop.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [],
      unreadCount: 3,
      totalCount: 10
    } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    expect(store.totalCount).toBe(10)
    expect(store.unreadCount).toBe(3)
    expect(store.readCount).toBe(7)

    // 字段缺失 ⇒ 0（宁可不显示，也不显示一个来路不明的分母）
    mocked.listNoticeTop.mockResolvedValue({ data: [], unreadCount: 2 } as unknown as SysNoticeTopResult)
    const s2 = useNoticeStore()
    await s2.refreshTopNotices()
    expect(s2.totalCount).toBe(0)
    expect(s2.readCount).toBe(0)

    // 反向分家（未读 > 全部）不得显示负数——钳 0 是最后防线，同源等式由后端集成测试钉
    mocked.listNoticeTop.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [],
      unreadCount: 9,
      totalCount: 4
    } as SysNoticeTopResult)
    const s3 = useNoticeStore()
    await s3.refreshTopNotices()
    expect(s3.readCount).toBe(0)
  })

  it('markAllUnreadRead zeroes unread but keeps the visible total', async () => {
    mocked.markAllUnreadNoticeRead.mockResolvedValue({ data: 5 } as unknown as Awaited<
      ReturnType<typeof markAllUnreadNoticeRead>
    >)
    mocked.listNoticeTop
      .mockResolvedValueOnce({ code: 200, msg: 'ok', data: [], unreadCount: 5, totalCount: 12 } as SysNoticeTopResult)
      .mockResolvedValueOnce({ code: 200, msg: 'ok', data: [], unreadCount: 0, totalCount: 12 } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    expect(store.readCount).toBe(7)
    const marked = await store.markAllUnreadRead()
    expect(marked).toBe(5)
    // 标记条数必须等于调用前的未读数（后端同源判据的前端镜像）
    expect(store.unreadCount).toBe(0)
    expect(store.totalCount).toBe(12)
    expect(store.readCount).toBe(12)
  })

  it('refreshTopNotices honors explicit unreadCount and empty data fallback', async () => {
    mocked.listNoticeTop.mockResolvedValue({ unreadCount: 7 } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    expect(store.topNotices).toEqual([])
    expect(store.unreadCount).toBe(7)
    expect(store.readIds.size).toBe(0)
  })

  it('刷新失败必须留痕 loadFailed 且保留旧数据；成功一次即清除', async () => {
    mocked.listNoticeTop.mockResolvedValueOnce({
      data: [{ noticeId: 1, isRead: false }]
    } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    expect(store.loadFailed).toBe(false)
    expect(store.topNotices).toHaveLength(1)

    mocked.listNoticeTop.mockRejectedValueOnce(new Error('network down'))
    await expect(store.refreshTopNotices()).rejects.toThrow('network down')
    expect(store.loadFailed).toBe(true)
    // 结算字段必须归位，否则重试入口会一直转圈
    expect(store.loading).toBe(false)
    expect(store.refreshPromise).toBeNull()
    // 旧数据不得被清空："有旧数据 + 非最新提示"优于空白
    expect(store.topNotices).toHaveLength(1)

    mocked.listNoticeTop.mockResolvedValueOnce({
      code: 200,
      msg: 'ok',
      data: [],
      unreadCount: 0,
      totalCount: 0
    } as SysNoticeTopResult)
    await store.refreshTopNotices()
    expect(store.loadFailed).toBe(false)
    store.clearAll()
    expect(store.loadFailed).toBe(false)
  })

  it('refreshTopNotices reuses the in-flight promise (dedupe)', async () => {
    let resolveFn: (v: SysNoticeTopResult) => void
    mocked.listNoticeTop.mockImplementation(() => new Promise<SysNoticeTopResult>((r) => (resolveFn = r)))
    const store = useNoticeStore()
    const first = store.refreshTopNotices()
    const second = store.refreshTopNotices()
    resolveFn!({ data: [] } as unknown as SysNoticeTopResult)
    await Promise.all([first, second])
    // Dedupe proven by the API being hit exactly once for both concurrent callers.
    expect(mocked.listNoticeTop).toHaveBeenCalledTimes(1)
  })

  it('refreshTopNotices(trailing)：在途期间到达的新事件必须补取一轮，不得被 promise 复用吞掉', async () => {
    const resolvers: Array<(v: SysNoticeTopResult) => void> = []
    mocked.listNoticeTop.mockImplementation(() => new Promise<SysNoticeTopResult>((r) => resolvers.push(r)))
    const store = useNoticeStore()
    const first = store.refreshTopNotices()
    // 第一条公告的刷新还没回来时，第二条公告的 WS 帧到达（服务端已经写入，帧晚于写入）
    const second = store.refreshTopNotices(true)
    expect(resolvers).toHaveLength(1) // 在途期间不并发打请求
    resolvers[0]({ data: [{ noticeId: 1, isRead: false }], unreadCount: 1, totalCount: 1 } as SysNoticeTopResult)
    await new Promise((r) => setTimeout(r, 0))
    // 补取必须真的发出去：否则在途响应（读的是第二条公告落库之前的数据集）会把这次变更洗掉
    expect(resolvers).toHaveLength(2)
    resolvers[1]({
      data: [
        { noticeId: 1, isRead: false },
        { noticeId: 2, isRead: false }
      ],
      unreadCount: 2,
      totalCount: 2
    } as SysNoticeTopResult)
    await first
    await second
    expect(store.unreadCount).toBe(2)
    expect(store.topNotices).toHaveLength(2)
    expect(store.refreshPromise).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('markRead optimistically updates and calls the API', async () => {
    mocked.listNoticeTop.mockResolvedValue({ data: [{ noticeId: 5, isRead: false }] } as SysNoticeTopResult)
    mocked.markNoticeRead.mockResolvedValue({} as AjaxResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    await store.markRead(5)
    expect(mocked.markNoticeRead).toHaveBeenCalledWith(5)
    expect(store.isRead(5)).toBe(true)
    expect(store.unreadCount).toBe(0)
    expect(store.topNotices[0].isRead).toBe(true)
  })

  it('markRead skips when notice already read', async () => {
    mocked.listNoticeTop.mockResolvedValue({ data: [{ noticeId: 5, isRead: true }] } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    await store.markRead(5)
    expect(mocked.markNoticeRead).not.toHaveBeenCalled()
  })

  it('markRead rolls back optimistic state on API failure', async () => {
    mocked.listNoticeTop.mockResolvedValue({ data: [{ noticeId: 5, isRead: false }] } as SysNoticeTopResult)
    mocked.markNoticeRead.mockRejectedValue(new Error('boom'))
    const store = useNoticeStore()
    await store.refreshTopNotices()
    await expect(store.markRead(5)).rejects.toThrow('boom')
    expect(store.isRead(5)).toBe(false)
    expect(store.unreadCount).toBe(1)
    expect(store.topNotices[0].isRead).toBe(false)
  })

  it('markBatchRead marks multiple ids and skips already-read ones', async () => {
    mocked.listNoticeTop.mockResolvedValue({
      data: [
        { noticeId: 1, isRead: false },
        { noticeId: 2, isRead: false },
        { noticeId: 3, isRead: true }
      ]
    } as SysNoticeTopResult)
    mocked.markNoticeReadAll.mockResolvedValue({} as AjaxResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    // unreadCount derived = 2 (ids 1,2). Passing id 3 (already read) should be filtered out.
    await store.markBatchRead([1, 2, 3])
    expect(mocked.markNoticeReadAll).toHaveBeenCalledWith('1,2')
    expect(store.isRead(1)).toBe(true)
    expect(store.isRead(2)).toBe(true)
    expect(store.unreadCount).toBe(0)
    expect(store.topNotices[0].isRead).toBe(true)
    expect(store.topNotices[1].isRead).toBe(true)
  })

  it('markBatchRead no-ops for empty list or all-read list', async () => {
    const store = useNoticeStore()
    await store.markBatchRead([])
    expect(mocked.markNoticeReadAll).not.toHaveBeenCalled()

    store.readIds = new Set([9])
    await store.markBatchRead([9])
    expect(mocked.markNoticeReadAll).not.toHaveBeenCalled()
  })

  it('markBatchRead rolls back on API failure', async () => {
    mocked.listNoticeTop.mockResolvedValue({
      data: [{ noticeId: 1, isRead: false, noticeTitle: 'A' }]
    } as SysNoticeTopResult)
    mocked.markNoticeReadAll.mockRejectedValue(new Error('net down'))
    const store = useNoticeStore()
    await store.refreshTopNotices()
    await expect(store.markBatchRead([1])).rejects.toThrow('net down')
    expect(store.isRead(1)).toBe(false)
    expect(store.unreadCount).toBe(1)
    expect(store.topNotices[0]).toMatchObject({ isRead: false, noticeTitle: 'A' })
  })

  it('markAllUnreadRead returns server count and refreshes state', async () => {
    mocked.markAllUnreadNoticeRead.mockResolvedValue({ data: 4 } as AjaxResult<number>)
    mocked.listNoticeTop.mockResolvedValue({ data: [] } as unknown as SysNoticeTopResult)
    const store = useNoticeStore()
    const count = await store.markAllUnreadRead()
    expect(count).toBe(4)
    expect(mocked.listNoticeTop).toHaveBeenCalledTimes(1)
  })

  it('markAllUnreadRead defaults count to 0 when server returns no data', async () => {
    mocked.markAllUnreadNoticeRead.mockResolvedValue({} as AjaxResult<number>)
    mocked.listNoticeTop.mockResolvedValue({ data: [] } as unknown as SysNoticeTopResult)
    const store = useNoticeStore()
    expect(await store.markAllUnreadRead()).toBe(0)
  })

  it('clearAll resets every slice of state', async () => {
    mocked.listNoticeTop.mockResolvedValue({
      data: [{ noticeId: 1, isRead: false }],
      unreadCount: 1,
      totalCount: 8
    } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    expect(store.totalCount).toBe(8)
    store.clearAll()
    expect(store.topNotices).toEqual([])
    expect(store.unreadCount).toBe(0)
    // 登出后"可见总数"必须跟着归零，否则下一个账号的卡片减法会拿到上一任的分母
    expect(store.totalCount).toBe(0)
    expect(store.readCount).toBe(0)
    expect(store.readIds.size).toBe(0)
    expect(store.loading).toBe(false)
    expect(store.refreshPromise).toBeNull()
  })
})
