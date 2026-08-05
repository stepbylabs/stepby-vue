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
  useNotificationStore().addNotification({
    type: 'notice',
    title: msg.data.title || i18n.global.t('notification.newNotice'),
    content: msg.data.content || msg.data.message || JSON.stringify(msg.data),
    timestamp: msg.timestamp
  })
  // 联动 HeaderNotice 铃铛角标：收到新通知后刷新顶部公告列表与未读数
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
  // 连接成功消息不入库
  const connMsg = i18n.global.t('notification.wsConnected')
  if (msg.data.message === connMsg) return
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
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(item.title, { body: item.content })
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
