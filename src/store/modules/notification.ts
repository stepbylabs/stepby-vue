import { defineStore } from 'pinia'
import { wsService, type WsMessage } from '@/utils/websocket'
import { getToken } from '@/utils/auth'
import i18n from '@/i18n'
import useNoticeStore from '@/store/modules/notice'

export interface NotificationItem {
  id: string
  type: 'notice' | 'operLog' | 'system'
  title: string
  content: string
  read: boolean
  timestamp: number
}

interface NotificationState {
  list: NotificationItem[]
  unreadCount: number
  connected: boolean
}

let notificationId = 0
// 防止 init() 重复注册事件监听导致回调累积
let listenersRegistered = false

// P1 修复: 监听器使用具名函数，便于 disconnect 时 off 移除，避免回调累积
const onOpen = () => {
  useNotificationStore()._setConnected(true)
  // R12：重连后补全断线期间错过的通知（首次连接也会加载顶部公告，幂等无副作用）
  useNoticeStore()
    .refreshTopNotices()
    .catch(() => {})
}
const onClose = () => {
  useNotificationStore()._setConnected(false)
}
const onNotice = (msg: WsMessage) => {
  // b100：公告推送带 action。只有"新发布"进通知中心；updated/closed/deleted 只刷铃铛。
  // 缺省按 published 处理（旧后端不带 action 时保持原行为）。
  const action = msg.data.action ?? 'published'
  if (action === 'published') {
    useNotificationStore().addNotification({
      type: 'notice',
      title: msg.data.title || i18n.global.t('notification.newNotice'),
      content: msg.data.content || msg.data.message || msg.data.title || JSON.stringify(msg.data),
      timestamp: msg.timestamp
    })
  }
  // 联动 HeaderNotice 铃铛角标：任何可见性变化都要重新取顶部公告与未读数
  useNoticeStore()
    .refreshTopNotices()
    .catch(() => {})
}
const onOperLog = (msg: WsMessage) => {
  useNotificationStore().addNotification({
    type: 'operLog',
    title: i18n.global.t('notification.operLogTitle'),
    content: `${msg.data.title || ''} - ${msg.data.businessType || ''}`,
    timestamp: msg.timestamp
  })
}
const onSystem = (msg: WsMessage) => {
  // b100：按后端下发的稳定 kind 判定，不再比较本地化文案。
  // 旧实现比 "message === t('notification.wsConnected')"：语言/文案一漂移，
  // 每次连接成功都会在通知中心塞一条假"系统消息"。sessionExpired 同理不该入库
  // （连接随后会被服务端关闭，登录态由 401 链路统一收口）。
  const kind = msg.data.kind
  if (kind === 'connected' || kind === 'sessionExpired') return
  useNotificationStore().addNotification({
    type: 'system',
    title: i18n.global.t('notification.systemTitle'),
    content: msg.data.message || JSON.stringify(msg.data),
    timestamp: msg.timestamp
  })
}

const useNotificationStore = defineStore('notification', {
  state: (): NotificationState => ({
    list: [],
    unreadCount: 0,
    connected: false
  }),
  actions: {
    /** 内部使用：更新连接状态（供模块级回调调用） */
    _setConnected(val: boolean) {
      this.connected = val
    },
    /** 初始化 WebSocket 连接并订阅消息 */
    init() {
      if (!getToken()) return
      // 避免重复注册监听器：init() 可能在重连等场景被多次调用
      if (listenersRegistered) {
        wsService.connect()
        return
      }
      listenersRegistered = true

      wsService.connect()

      wsService.on('open', onOpen)
      wsService.on('close', onClose)
      wsService.on('notice', onNotice)
      wsService.on('operLog', onOperLog)
      wsService.on('system', onSystem)
      // forceLogout 事件由 layout/index.vue 统一处理（含跳转登录页逻辑），
      // 此处不再注册，避免重复弹窗与重复登出
    },

    /** 添加通知（最多保留 50 条） */
    addNotification(data: Omit<NotificationItem, 'id' | 'read'>) {
      const item: NotificationItem = {
        id: `n${++notificationId}_${Date.now()}`,
        type: data.type,
        title: data.title,
        content: data.content,
        read: false,
        timestamp: data.timestamp
      }
      this.list.unshift(item)
      if (this.list.length > 50) {
        this.list = this.list.slice(0, 50)
      }
      this.unreadCount = this.list.filter((n: NotificationItem) => !n.read).length

      // 浏览器原生通知（已授权时）
      // b112：构造器本身是**会抛错的通道**——移动端 Chrome 禁止在页面上下文 `new Notification`
      // （须走 ServiceWorkerRegistration.showNotification），部分内核/权限撤销后同样抛。
      // 站内通知列表在上面已经写入，这里失败只留痕，绝不让它打断 WS 消息派发链。
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const native = new Notification(item.title, { body: item.content })
          // 点击系统通知要回到应用——此前 onclick 为空，用户点通知毫无反应
          native.onclick = () => {
            window.focus()
            native.close()
          }
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[notification] native notification unavailable:', e)
        }
      }
    },

    /** 标记单条为已读 */
    markRead(id: string) {
      const item = this.list.find((n: NotificationItem) => n.id === id)
      if (item && !item.read) {
        item.read = true
        this.unreadCount = Math.max(0, this.unreadCount - 1)
      }
    },

    /** 全部标记已读 */
    markAllRead() {
      this.list.forEach((n: NotificationItem) => {
        n.read = true
      })
      this.unreadCount = 0
    },

    /** 清空通知 */
    clearAll() {
      this.list = []
      this.unreadCount = 0
    },

    /** 断开连接 */
    disconnect() {
      wsService.disconnect()
      this.connected = false
      // P1 修复: 移除事件监听器，避免 disconnect→init 循环后回调累积
      if (listenersRegistered) {
        wsService.off('open', onOpen)
        wsService.off('close', onClose)
        wsService.off('notice', onNotice)
        wsService.off('operLog', onOperLog)
        wsService.off('system', onSystem)
        listenersRegistered = false
      }
    },

    /** 按需请求浏览器通知权限（U13 优化：替代加载时自动请求） */
    async requestBrowserPermission(): Promise<boolean> {
      if (!('Notification' in window)) return false
      if (Notification.permission === 'granted') return true
      if (Notification.permission === 'denied') return false
      try {
        const result = await Notification.requestPermission()
        return result === 'granted'
      } catch {
        return false
      }
    }
  }
})

export default useNotificationStore
