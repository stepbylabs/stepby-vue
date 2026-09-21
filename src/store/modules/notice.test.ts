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

  it('refreshTopNotices honors explicit unreadCount and empty data fallback', async () => {
    mocked.listNoticeTop.mockResolvedValue({ unreadCount: 7 } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    expect(store.topNotices).toEqual([])
    expect(store.unreadCount).toBe(7)
    expect(store.readIds.size).toBe(0)
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
    mocked.listNoticeTop.mockResolvedValue({ data: [{ noticeId: 1, isRead: false }] } as SysNoticeTopResult)
    const store = useNoticeStore()
    await store.refreshTopNotices()
    store.clearAll()
    expect(store.topNotices).toEqual([])
    expect(store.unreadCount).toBe(0)
    expect(store.readIds.size).toBe(0)
    expect(store.loading).toBe(false)
    expect(store.refreshPromise).toBeNull()
  })
})
