/**
 * WebSocket 通知服务
 *
 * 设计要点：
 * - 单例模式：整个应用只维护一个 WS 连接
 * - 自动重连：连接断开后按指数退避重连（1s, 2s, 4s, 8s...最大 30s）
 * - 心跳：客户端每 30s 发送 ping 字符串，服务端回复 pong；同时响应服务端 ping
 * - 消息分发：通过 mitt 事件总线将消息派发给订阅者
 * - 鉴权：通过 `Sec-WebSocket-Protocol` 子协议头传递 JWT token（避免 URL/日志泄露）
 *
 * 使用示例：
 *   import { wsService } from '@/utils/websocket'
 *   wsService.connect()
 *   wsService.on('notice', (data) => { console.log('Received notice:', data) })
 */
import { getToken } from '@/utils/auth'
import mitt from 'mitt'

export type WsMessageType =
  'notice' | 'operLog' | 'system' | 'ping' | 'pong' | 'forceLogout' | 'taskProgress' | 'flowTodo' | 'flowFinished'

/** WebSocket 消息数据载荷（由后端推送，字段因消息类型而异） */
export interface WsMessageData {
  title?: string
  content?: string
  message?: string
  businessType?: string
  /** system 消息的稳定子类型（b100：connected / sessionExpired），不得按文案判定 */
  kind?: string
  /** notice 消息的动作：published / updated / closed / deleted（缺省按 published 兼容旧后端） */
  action?: string
  noticeId?: number
  [key: string]: unknown
}

export interface WsMessage {
  type: WsMessageType
  data: WsMessageData
  timestamp: number
}

type Events = {
  [key: string]: WsMessage | void
  open: void
  close: void
  error: void
  reconnectFailed: void
}

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectCount = 0
  private maxReconnectCount = 10
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private isManualClose = false
  private emitter = mitt<Events>()

  /** 连接 WebSocket */
  connect(): void {
    // b100：CONNECTING 也必须挡——旧实现只挡 OPEN，重连窗口里再调 connect()
    // 会开出第二条 socket（两条都进通知总线 ⇒ 同一公告收两遍、计数虚增）。
    const current = this.ws?.readyState
    if (current === WebSocket.OPEN || current === WebSocket.CONNECTING) return

    const token = getToken()
    if (!token) {
      if (import.meta.env.DEV) console.warn('[WS] Not logged in, skip WebSocket connection')
      return
    }

    // 构建 WS URL：根据当前页面协议选择 ws/wss
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws`

    this.isManualClose = false
    try {
      // 通过 Sec-WebSocket-Protocol 子协议头传递 token（格式：bearer.<jwt>）
      // 浏览器会在握手请求中带上该头，服务端回显相同协议，避免 token 出现在 URL/日志中
      const socket = new WebSocket(wsUrl, [`bearer.${token}`])
      this.ws = socket
      this.bindEvents(socket)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[WS] Connection failed:', err)
      this.scheduleReconnect()
    }
  }

  /** 主动断开连接 */
  disconnect(): void {
    this.isManualClose = true
    this.clearTimers()
    const socket = this.ws
    this.ws = null
    if (socket) {
      socket.close(1000, 'client_disconnect')
    }
    this.reconnectCount = 0
    // 主动断开不会走 onclose（身份校验会丢弃陈旧连接的事件），连接态必须在这里收口，
    // 否则 notification.connected 会永远停在 true。
    this.emitter.emit('close')
  }

  /** 订阅消息 */
  on(type: string, handler: (msg: WsMessage) => void): void {
    // mitt 期望 Handler<WsMessage | void>（index signature），而我们的 handler 只接收 WsMessage。
    // 这是 index signature 与具体 key 类型不兼容的类型系统限制，用精确断言替代 any。
    this.emitter.on(type, handler as (event: WsMessage | void) => void)
  }

  /** 取消订阅 */
  off(type: string, handler: (msg: WsMessage) => void): void {
    this.emitter.off(type, handler as (event: WsMessage | void) => void)
  }

  /** 获取连接状态 */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private bindEvents(socket: WebSocket): void {
    // b100：事件回调绑定到**具体 socket 实例**。forceReconnect/重连会换 socket，
    // 旧 socket 的 onclose 是异步派发的；没有身份校验时它会把"旧连接已关闭"
    // 当成"当前连接断了"再排一次重连（且在 CONNECTING 窗口会真的开出第三条连接）。
    socket.onopen = () => {
      if (this.ws !== socket) return
      if (import.meta.env.DEV) console.warn('[WS] Connection established')
      this.reconnectCount = 0
      this.startHeartbeat()
      this.emitter.emit('open')
    }

    socket.onmessage = (event: MessageEvent) => {
      if (this.ws !== socket) return
      try {
        const msg: WsMessage = JSON.parse(event.data)
        // 响应服务端 ping，回复 pong（心跳对称化）
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
          return
        }
        // b100：服务端已判定会话到期（随后会关闭连接）⇒ 禁止自动重连。
        // 拿过期令牌重连只会连续 401（握手校验/黑名单），把"该重新登录"变成重连风暴。
        if (msg.type === 'system' && msg.data?.kind === 'sessionExpired') {
          this.isManualClose = true
        }
        // 派发给对应类型的订阅者
        this.emitter.emit(msg.type, msg)
        // 通用消息事件
        this.emitter.emit('message', msg)
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[WS] Message parse failed:', err, event.data)
      }
    }

    socket.onerror = (err: Event) => {
      if (this.ws !== socket) return
      if (import.meta.env.DEV) console.error('[WS] Connection error:', err)
      this.emitter.emit('error')
    }

    socket.onclose = (event: CloseEvent) => {
      if (this.ws !== socket) return
      if (import.meta.env.DEV) console.warn(`[WS] Connection closed code=${event.code} reason=${event.reason}`)
      this.stopHeartbeat()
      this.ws = null
      this.emitter.emit('close')
      if (!this.isManualClose) {
        this.scheduleReconnect()
      }
    }
  }

  /** 心跳：每 30 秒发送一次 ping 字符串（与后端心跳周期对齐） */
  private startHeartbeat(): void {
    // 重复 open（例如换 socket）不得叠出第二条定时器：旧实现直接覆盖句柄，
    // 前一条 interval 永远清不掉，30s 后会对当前连接重复发 ping。
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping')
      }
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 指数退避重连：1s, 2s, 4s, 8s, 16s, 30s, 30s... */
  private scheduleReconnect(): void {
    if (this.reconnectCount >= this.maxReconnectCount) {
      if (import.meta.env.DEV) {
        console.warn(
          `[WS] Reached max reconnect attempts ${this.maxReconnectCount}, stopped. Call forceReconnect() to retry manually`
        )
      }
      // P1 修复: 不再静默失败，通知订阅者（UI 可展示提示并允许手动重连）
      this.emitter.emit('reconnectFailed')
      return
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectCount), 30000)
    this.reconnectCount++
    if (import.meta.env.DEV) console.warn(`[WS] Reconnecting #${this.reconnectCount} in ${delay}ms...`)
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  /**
   * 手动重连：重置重连计数后立即重连
   * 用户在 UI 上点击"重新连接"按钮时调用
   */
  forceReconnect(): void {
    this.clearTimers()
    this.reconnectCount = 0
    // 批六十五：关闭旧 socket **前**先置手动关闭标记——否则旧连接 onclose（真实环境下为
    // 异步触发）会因 isManualClose=false 走 scheduleReconnect()，与紧随其后的 connect()
    // 竞争产生一次多余的指数退避重连（重复连接/计数虚增）。关闭完成后再复位为可自动重连。
    this.isManualClose = true
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.isManualClose = false
    this.connect()
  }

  /** 获取重连状态信息（供 UI 显示） */
  getReconnectInfo(): { count: number; max: number; isExhausted: boolean } {
    return {
      count: this.reconnectCount,
      max: this.maxReconnectCount,
      isExhausted: this.reconnectCount >= this.maxReconnectCount
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

/** 全局单例 */
export const wsService = new WebSocketService()
