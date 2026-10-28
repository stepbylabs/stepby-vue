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
  /**
   * 可见公告总数（`status='0'`，与 `list?status=0` 的 total 同源）
   *
   * 通知中心顶部三张卡片需要"全部 / 未读 / 已读"三个自洽的数。列表的 `total` 会随筛选
   * 变化（'未读' 档下它就是未读数），拿它减 unreadCount 会算出"已读 0"——所以分母由
   * `listTop.totalCount` 在同一次往返里下发（b80）。
   */
  totalCount: number
  /** 当前用户已读公告 ID 集合（用于跨组件判断 isRead） */
  readIds: Set<number>
  /** 是否正在加载顶部公告 */
  loading: boolean
  /**
   * 最近一次刷新是否失败（b96）。
   *
   * 与 `topNotices.length === 0` 分开存：接口失败时列表同样是空的，但"加载失败"与
   * "真的没有公告"对用户是两件事（b90 §2：失败态不得伪装成空态）。失败时**不清空**
   * 已有列表（旧数据比空白更有用），但页面必须显示"刷新失败 + 重试"。
   */
  loadFailed: boolean
  /** P1 修复: 进行中的刷新 Promise，用于消除竞态条件 */
  refreshPromise: Promise<void> | null
  /** 在途期间又来了"代表新事件"的刷新请求（WS 公告帧），当前轮结束后必须补一轮 */
  refreshQueued: boolean
}

const useNoticeStore = defineStore('notice', {
  state: (): NoticeState => ({
    topNotices: [],
    unreadCount: 0,
    totalCount: 0,
    readIds: new Set<number>(),
    loading: false,
    loadFailed: false,
    refreshPromise: null,
    refreshQueued: false
  }),
  getters: {
    /** 判断指定公告是否已读 */
    isRead:
      (state) =>
      (noticeId: number): boolean =>
        state.readIds.has(noticeId),
    /**
     * 已读数 = 可见总数 − 未读数（两个数都由 `listTop` 同一次往返下发，同一谓词产出）。
     *
     * 减法放在 store 而不是页面模板里：卡片要显示的不是"当前筛选结果的总数减角标"
     * （'未读' 档下列表 total 就是未读数，减出来恒为 0）。钳到 0 只是最后一道防线——
     * 真出现负数说明两个计数分家了，那属于后端判据要抓的事（集成测试里有同源等式）。
     */
    readCount: (state): number => Math.max(0, state.totalCount - state.unreadCount)
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
     *
     * @param trailing 本次调用是否代表一次**新事件**（WS 公告帧）而不是"我也要一份当前数据"。
     *   WS 推送可能在刷新在途时到达，而在途请求读的是事件之前的数据集 —— 直接复用它的
     *   promise 会把这次变更静默吞掉（铃铛少 1 直到下次交互）。trailing=true 时在当前轮
     *   结束后补取一轮，把"事件到达"这件事真正落到状态上；默认 false 保住并发去重
     *   （挂载期多个组件同时请求只打一次，request-storm 的密度也不会因补刷而漂）。
     */
    async refreshTopNotices(trailing = false): Promise<void> {
      // P1 修复: 复用进行中的 Promise，避免竞态条件
      if (this.refreshPromise) {
        if (trailing) this.refreshQueued = true
        return this.refreshPromise
      }
      this.refreshPromise = (async () => {
        try {
          do {
            this.refreshQueued = false
            this.loading = true
            const res = await listNoticeTop()
            this.topNotices = res.data || []
            this.unreadCount =
              res.unreadCount !== undefined
                ? res.unreadCount
                : this.topNotices.filter((n: SysNotice) => !n.isRead).length
            // 缺字段按 0 fail-safe（与 unreadCount 同口径：宁可不显示数字，也不显示来路不明的数）
            this.totalCount = res.totalCount !== undefined ? res.totalCount : 0
            // 同步 readIds：listTop 返回的每条公告带 isRead 字段
            this.readIds = new Set(
              this.topNotices.filter((n: SysNotice) => n.isRead).map((n: SysNotice) => n.noticeId as number)
            )
            this.loadFailed = false
          } while (this.refreshQueued)
        } catch (e) {
          // 失败留痕并保留旧列表：调用方（HeaderNotice）据此渲染失败态与重试入口。
          // 拒绝继续上抛——调用方仍要能感知失败（不允许把错误吞成"刷新完成"）。
          this.loadFailed = true
          throw e
        } finally {
          this.loading = false
          this.refreshPromise = null
          this.refreshQueued = false
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
      this.totalCount = 0
      this.readIds = new Set<number>()
      this.loading = false
      this.loadFailed = false
      this.refreshPromise = null
      this.refreshQueued = false
    }
  }
})

export default useNoticeStore
