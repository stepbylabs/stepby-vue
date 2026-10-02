/**
 * 通知公告共享状态 Store
 *
 * 设计目标：
 * 1. 解决 HeaderNotice 与 notice-center / notice CRUD 之间的状态联动问题
 *    （公告 CRUD 后 HeaderNotice 不刷新、通知中心已读后 HeaderNotice 不联动）
 * 2. 统一管理"顶部公告列表 + 未读数 + 当前用户已读 ID 集合"共享状态
 * 3. 提供跨组件的"标记已读"操作，自动更新本地状态，避免各组件重复维护
 *
 * 状态流向：
 * - HeaderNotice.vue: 订阅 topNotices + unreadCount，渲染铃铛气泡 + 弹层列表
 * - notice-center/index.vue: 使用 listNotice 分页查询，readIds / unreadCount 订阅本 store
 * - notice/index.vue（CRUD）: onAfterSubmit / onAfterDelete 调用 refreshTopNotices()
 *    触发 HeaderNotice 重新拉取最新公告列表
 *
 * 登出清理：user.ts logOut() 调用 noticeStore.clearAll() 重置状态
 */
import { defineStore } from 'pinia'
import { listNoticeTop, markNoticeRead, markNoticeReadAll, markAllUnreadNoticeRead } from '@/api/system/notice'
import type { SysNotice } from '@/types/api/system/notice'

interface NoticeState {
  /** 顶部公告列表（HeaderNotice 铃铛用，最多 10 条） */
  topNotices: SysNotice[]
  /** 当前用户未读公告数（全量，不限 top 10） */
  unreadCount: number
  /** 当前用户已读公告 ID 集合（用于跨组件判断 isRead） */
  readIds: Set<number>
  /** 是否正在加载顶部公告 */
  loading: boolean
  /** P1 修复: 进行中的刷新 Promise，用于消除竞态条件 */
  refreshPromise: Promise<void> | null
}

const useNoticeStore = defineStore('notice', {
  state: (): NoticeState => ({
    topNotices: [],
    unreadCount: 0,
    readIds: new Set<number>(),
    loading: false,
    refreshPromise: null
  }),
  getters: {
    /** 判断指定公告是否已读 */
    isRead:
      (state) =>
      (noticeId: number): boolean =>
        state.readIds.has(noticeId)
  },
  actions: {
    /**
     * 刷新顶部公告列表 + 未读数 + 已读 ID 集合
     *
     * 调用时机：
     * - HeaderNotice 组件挂载时
     * - 公告 CRUD（notice/index.vue onAfterSubmit / onAfterDelete）后
     * - 通知中心（notice-center）列表加载后同步已读状态
     * - 登录后（由 HeaderNotice 触发）
     *
     * P1 修复: 使用 promise reuse 模式消除竞态条件。
     * 当多个调用者并发触发 refreshTopNotices 时，它们共享同一个 Promise，
     * 避免旧请求返回后覆盖新请求的结果，同时保证所有调用者都能拿到最新数据。
     */
    async refreshTopNotices(): Promise<void> {
      // P1 修复: 复用进行中的 Promise，避免竞态条件
      if (this.refreshPromise) return this.refreshPromise
      this.loading = true
      this.refreshPromise = (async () => {
        try {
          const res = await listNoticeTop()
          this.topNotices = res.data || []
          this.unreadCount =
            res.unreadCount !== undefined ? res.unreadCount : this.topNotices.filter((n: SysNotice) => !n.isRead).length
          // 同步 readIds：listTop 返回的每条公告带 isRead 字段
          this.readIds = new Set(
            this.topNotices.filter((n: SysNotice) => n.isRead).map((n: SysNotice) => n.noticeId as number)
          )
        } finally {
          this.loading = false
          this.refreshPromise = null
        }
      })()
      return this.refreshPromise
    },

    /**
     * 标记单条公告已读
     *
     * 乐观更新本地状态（readIds + unreadCount + topNotices 对应项 isRead），
     * API 失败时回滚。调用方无需重复维护本地状态。
     */
    async markRead(noticeId: number): Promise<void> {
      // 已读则跳过
      if (this.readIds.has(noticeId)) return
      // 乐观更新
      const wasInTop = this.topNotices.findIndex((n: SysNotice) => n.noticeId === noticeId)
      const oldItem = wasInTop !== -1 ? { ...this.topNotices[wasInTop] } : null
      this.readIds.add(noticeId)
      this.unreadCount = Math.max(0, this.unreadCount - 1)
      if (wasInTop !== -1 && oldItem) {
        this.topNotices[wasInTop] = { ...oldItem, isRead: true }
      }
      try {
        await markNoticeRead(noticeId)
      } catch (e) {
        // 回滚
        this.readIds.delete(noticeId)
        this.unreadCount += 1
        if (wasInTop !== -1 && oldItem) {
          this.topNotices[wasInTop] = oldItem
        }
        throw e
      }
    },

    /**
     * 批量标记公告已读（指定 IDs）
     *
     * 用于通知中心"批量已读"功能（用户选中若干条后标记）。
     * 乐观更新本地状态，API 失败时回滚。
     */
    async markBatchRead(noticeIds: number[]): Promise<void> {
      if (noticeIds.length === 0) return
      const unreadIds = noticeIds.filter((id) => !this.readIds.has(id))
      if (unreadIds.length === 0) return
      // 乐观更新
      const oldTopNotices = this.topNotices.map((n: SysNotice) => ({ ...n }))
      unreadIds.forEach((id) => this.readIds.add(id))
      this.unreadCount = Math.max(0, this.unreadCount - unreadIds.length)
      this.topNotices = this.topNotices.map((n: SysNotice) =>
        unreadIds.includes(n.noticeId as number) ? { ...n, isRead: true } : n
      )
      try {
        await markNoticeReadAll(unreadIds.join(','))
      } catch (e) {
        // 回滚
        this.topNotices = oldTopNotices
        unreadIds.forEach((id) => this.readIds.delete(id))
        this.unreadCount += unreadIds.length
        throw e
      }
    },

    /**
     * 标记当前用户所有未读公告为已读（跨页"全部已读"）
     *
     * 使用服务端 markAllUnreadNoticeRead 接口，确保跨页未读也被清除。
     * 成功后刷新顶部公告列表以同步状态。
     *
     * @returns 实际标记的条数
     */
    async markAllUnreadRead(): Promise<number> {
      const res = await markAllUnreadNoticeRead()
      const count = (res.data as number) || 0
      // 刷新顶部公告列表 + readIds + unreadCount
      await this.refreshTopNotices()
      return count
    },

    /**
     * 清空所有状态（登出时调用）
     */
    clearAll(): void {
      this.topNotices = []
      this.unreadCount = 0
      this.readIds = new Set<number>()
      this.loading = false
      this.refreshPromise = null
    }
  }
})

export default useNoticeStore
