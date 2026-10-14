/**
 * utils/websocket 覆盖测试（批六十五覆盖率工程）。
 *
 * 覆盖真实行为：token 缺失短路 / 正常连接（子协议传 token）/ onopen 启动心跳 +
 * open 事件 / onmessage 对服务端 ping 回 pong、普通消息按 type 与 message 双派发、
 * 非法 JSON 容错 / onerror 派发 / onclose 手动与自动分支（自动走指数退避重连）/
 * 重连耗尽 → reconnectFailed / disconnect / forceReconnect / getReconnectInfo /
 * isConnected / on-off 订阅。
 *
 * 不 mock 任何业务逻辑——仅替换全局 WebSocket 为可控假实现 + 固定 getToken，
 * 断言均针对真实代码路径。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 需访问私有成员/注入假 WebSocket，测试便利（限定本文件） */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const hoisted = vi.hoisted(() => ({ token: 'tok-abc' as string | undefined }))

vi.mock('@/utils/auth', () => ({
  getToken: () => hoisted.token
}))

/** 可控假 WebSocket：记录构造参数与 send，暴露触发 onopen/onmessage/onerror/onclose 的入口 */
class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  url: string
  protocols: string | string[]
  sent: unknown[] = []
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols ?? []
    FakeWebSocket.instances.push(this)
  }

  send(data: unknown): void {
    this.sent.push(data)
  }

  close(code = 1000, reason = ''): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }

  /** 测试驱动：模拟握手成功 */
  fireOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({})
  }

  fireMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent)
  }

  fireError(): void {
    this.onerror?.({})
  }

  fireClose(code = 1006, reason = 'abnormal'): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

describe('utils/websocket（WebSocketService）', () => {
  let wsService: typeof import('@/utils/websocket').wsService
  let wsPlugin: typeof import('@/utils/websocket').wsPlugin

  beforeEach(async () => {
    vi.resetModules()
    FakeWebSocket.instances = []
    hoisted.token = 'tok-abc'
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    vi.useFakeTimers()
    const mod = await import('@/utils/websocket')
    wsService = mod.wsService
    wsPlugin = mod.wsPlugin
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('无 token 时 connect 短路（不建立连接）', () => {
    hoisted.token = undefined
    wsService.connect()
    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(wsService.isConnected).toBe(false)
  })

  it('有 token 时连接：URL 用当前 host + 子协议 bearer.<token>', () => {
    wsService.connect()
    expect(FakeWebSocket.instances).toHaveLength(1)
    const ws = FakeWebSocket.instances[0]
    expect(ws.url).toMatch(/^ws:\/\/[^/]+\/ws$/)
    expect(ws.protocols).toEqual(['bearer.tok-abc'])
  })

  it('已 OPEN 时重复 connect 不新建连接', () => {
    wsService.connect()
    FakeWebSocket.instances[0].fireOpen()
    wsService.connect()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(wsService.isConnected).toBe(true)
  })

  it('onopen → 启动心跳（30s 发 ping）+ 派发 open 事件', () => {
    const onOpen = vi.fn()
    wsService.on('open', onOpen)
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen()
    expect(onOpen).toHaveBeenCalledTimes(1)

    // 心跳：推进 30s 应发送 'ping'
    vi.advanceTimersByTime(30000)
    expect(ws.sent).toContain('ping')
  })

  it('onmessage：服务端 ping → 回 pong 且不派发', () => {
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen()
    const onPing = vi.fn()
    wsService.on('ping', onPing)
    ws.fireMessage(JSON.stringify({ type: 'ping', data: {}, timestamp: 1 }))
    expect(ws.sent).toContain(JSON.stringify({ type: 'pong' }))
    expect(onPing).not.toHaveBeenCalled()
  })

  it('onmessage：普通消息按 type 与 message 双派发', () => {
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen()
    const onNotice = vi.fn()
    const onMessage = vi.fn()
    wsService.on('notice', onNotice)
    wsService.on('message', onMessage)
    const payload = { type: 'notice', data: { title: 't' }, timestamp: 2 }
    ws.fireMessage(JSON.stringify(payload))
    expect(onNotice).toHaveBeenCalledWith(payload)
    expect(onMessage).toHaveBeenCalledWith(payload)
  })

  it('onmessage：非法 JSON 容错（不抛出、不派发）', () => {
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen()
    const onMessage = vi.fn()
    wsService.on('message', onMessage)
    expect(() => ws.fireMessage('{not json')).not.toThrow()
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('onerror → 派发 error 事件', () => {
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    const onError = vi.fn()
    wsService.on('error', onError)
    ws.fireError()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('off 取消订阅后不再收到事件', () => {
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen()
    const onNotice = vi.fn()
    wsService.on('notice', onNotice)
    wsService.off('notice', onNotice)
    ws.fireMessage(JSON.stringify({ type: 'notice', data: {}, timestamp: 3 }))
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('非手动关闭 → 指数退避重连（1s 后新建连接，计数 +1）', () => {
    wsService.connect()
    FakeWebSocket.instances[0].fireOpen()
    FakeWebSocket.instances[0].fireClose()
    expect(wsService.getReconnectInfo().count).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('重连耗尽 → 派发 reconnectFailed 且不再新建连接', () => {
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen()
    const onFailed = vi.fn()
    wsService.on('reconnectFailed', onFailed)
    // 直接置满计数（等价于连续断连 10 次）
    ;(wsService as any).reconnectCount = (wsService as any).maxReconnectCount
    ws.fireClose()
    expect(onFailed).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('disconnect：手动关闭不再重连，计数归零', () => {
    wsService.connect()
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen()
    wsService.disconnect()
    expect(wsService.isConnected).toBe(false)
    expect(wsService.getReconnectInfo().count).toBe(0)
    vi.advanceTimersByTime(60000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('forceReconnect：清理后立即重连（计数归零 → 新连接）', () => {
    wsService.connect()
    FakeWebSocket.instances[0].fireOpen()
    ;(wsService as any).reconnectCount = 5
    wsService.forceReconnect()
    expect(wsService.getReconnectInfo().count).toBe(0)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('getReconnectInfo：isExhausted 与 max 一致', () => {
    const info = wsService.getReconnectInfo()
    expect(info.max).toBe(10)
    expect(info.count).toBe(0)
    expect(info.isExhausted).toBe(false)
  })

  it('wsPlugin.install：token 存在时自动连接', () => {
    wsPlugin.install()
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
