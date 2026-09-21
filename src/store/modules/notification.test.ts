import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { NotificationItem } from './notification'

// --- mock collaborators so no real websocket / api / i18n / notice store loads ---
const h = vi.hoisted(() => {
  const handlers = new Map<string, (msg?: unknown) => void>()
  const wsService = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((type: string, handler: (msg: never) => void) => {
      handlers.set(type, handler as unknown as (msg?: unknown) => void)
    }),
    off: vi.fn((type: string) => {
      handlers.delete(type)
    })
  }
  const getToken = vi.fn(() => 'test-token')
  const refreshTopNotices = vi.fn(() => Promise.resolve())
  const i18n = { global: { t: (key: string) => `T:${key}` } }
  return { handlers, wsService, getToken, refreshTopNotices, i18n }
})

vi.mock('@/utils/websocket', () => ({ wsService: h.wsService }))
vi.mock('@/utils/auth', () => ({ getToken: h.getToken }))
vi.mock('@/i18n', () => ({ default: h.i18n }))
vi.mock('@/store/modules/notice', () => ({
  default: () => ({ refreshTopNotices: h.refreshTopNotices })
}))

const { default: useNotificationStore } = await import('./notification')

describe('store/modules/notification', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    h.handlers.clear()
    h.wsService.connect.mockClear()
    h.wsService.disconnect.mockClear()
    h.wsService.on.mockClear()
    h.wsService.off.mockClear()
    h.refreshTopNotices.mockClear()
    h.getToken.mockReturnValue('test-token')
    // ensure module-level listenersRegistered resets between tests
    useNotificationStore().disconnect()
  })

  it('init early-returns without a token', () => {
    h.getToken.mockReturnValue('')
    const store = useNotificationStore()
    store.init()
    expect(h.wsService.connect).not.toHaveBeenCalled()
    expect(h.wsService.on).not.toHaveBeenCalled()
  })

  it('init connects and registers the five listeners once', () => {
    const store = useNotificationStore()
    store.init()
    expect(h.wsService.connect).toHaveBeenCalledTimes(1)
    expect(h.wsService.on).toHaveBeenCalledTimes(5)
    expect(h.handlers.has('open')).toBe(true)
    expect(h.handlers.has('close')).toBe(true)
    expect(h.handlers.has('notice')).toBe(true)
    expect(h.handlers.has('operLog')).toBe(true)
    expect(h.handlers.has('system')).toBe(true)
  })

  it('init skips re-registering listeners but reconnects on second call', () => {
    const store = useNotificationStore()
    store.init()
    h.wsService.on.mockClear()
    h.wsService.connect.mockClear()
    store.init()
    expect(h.wsService.on).not.toHaveBeenCalled()
    expect(h.wsService.connect).toHaveBeenCalledTimes(1)
    // cleanup so subsequent tests start from listenersRegistered=false
    store.disconnect()
  })

  it('open callback flips connected and refreshes top notices', async () => {
    const store = useNotificationStore()
    store.init()
    expect(store.connected).toBe(false)
    h.handlers.get('open')!()
    expect(store.connected).toBe(true)
    await Promise.resolve()
    expect(h.refreshTopNotices).toHaveBeenCalled()
    store.disconnect()
  })

  it('close callback flips connected off', () => {
    const store = useNotificationStore()
    store.init()
    h.handlers.get('open')!()
    h.handlers.get('close')!()
    expect(store.connected).toBe(false)
    store.disconnect()
  })

  it('notice callback ingests a notification with title/content', async () => {
    const store = useNotificationStore()
    store.init()
    h.handlers.get('notice')!({ data: { title: 'Hi', content: 'Body' }, timestamp: 123 })
    expect(store.list).toHaveLength(1)
    expect(store.list[0]).toMatchObject({ type: 'notice', title: 'Hi', content: 'Body', read: false, timestamp: 123 })
    expect(store.unreadCount).toBe(1)
    await Promise.resolve()
    expect(h.refreshTopNotices).toHaveBeenCalled()
    store.disconnect()
  })

  it('notice callback falls back to i18n title and message/JSON content', () => {
    const store = useNotificationStore()
    store.init()
    h.handlers.get('notice')!({ data: { message: 'fromMessage' }, timestamp: 1 })
    expect(store.list[0].title).toBe('T:notification.newNotice')
    expect(store.list[0].content).toBe('fromMessage')
    h.handlers.get('notice')!({ data: { foo: 'bar' }, timestamp: 2 })
    expect(store.list[0].content).toBe(JSON.stringify({ foo: 'bar' }))
    store.disconnect()
  })

  it('operLog callback builds a composite content string', () => {
    const store = useNotificationStore()
    store.init()
    h.handlers.get('operLog')!({ data: { title: 'Export', businessType: 'export' }, timestamp: 5 })
    expect(store.list[0].type).toBe('operLog')
    expect(store.list[0].title).toBe('T:notification.operLogTitle')
    expect(store.list[0].content).toBe('Export - export')
    store.disconnect()
  })

  it('system callback stores messages but skips the connection-success message', () => {
    const store = useNotificationStore()
    store.init()
    h.handlers.get('system')!({ data: { message: 'T:notification.wsConnected' }, timestamp: 1 })
    expect(store.list).toHaveLength(0)
    h.handlers.get('system')!({ data: { message: 'Deploy finished' }, timestamp: 2 })
    expect(store.list[0]).toMatchObject({ type: 'system', content: 'Deploy finished' })
    h.handlers.get('system')!({ data: { detail: 'x' }, timestamp: 3 })
    expect(store.list[0].content).toBe(JSON.stringify({ detail: 'x' }))
    store.disconnect()
  })

  it('addNotification caps the list at 50 and recomputes unread count', () => {
    const store = useNotificationStore()
    for (let i = 0; i < 55; i++) {
      store.addNotification({ type: 'system', title: `t${i}`, content: `c${i}`, timestamp: i })
    }
    expect(store.list).toHaveLength(50)
    expect(store.unreadCount).toBe(50)
    // newest first
    expect(store.list[0].title).toBe('t54')
  })

  it('markRead decrements unread once and ignores unknown/already-read', () => {
    const store = useNotificationStore()
    store.addNotification({ type: 'system', title: 'a', content: 'a', timestamp: 1 })
    store.addNotification({ type: 'system', title: 'b', content: 'b', timestamp: 2 })
    expect(store.unreadCount).toBe(2)
    const idA = store.list[1].id
    store.markRead(idA)
    expect(store.unreadCount).toBe(1)
    store.markRead(idA) // already read -> no double decrement
    expect(store.unreadCount).toBe(1)
    store.markRead('does-not-exist')
    expect(store.unreadCount).toBe(1)
  })

  it('markAllRead clears unread and read flags the whole list', () => {
    const store = useNotificationStore()
    store.addNotification({ type: 'system', title: 'a', content: 'a', timestamp: 1 })
    store.addNotification({ type: 'system', title: 'b', content: 'b', timestamp: 2 })
    store.markAllRead()
    expect(store.unreadCount).toBe(0)
    expect(store.list.every((n: NotificationItem) => n.read)).toBe(true)
  })

  it('clearAll empties list and unread', () => {
    const store = useNotificationStore()
    store.addNotification({ type: 'system', title: 'a', content: 'a', timestamp: 1 })
    store.clearAll()
    expect(store.list).toEqual([])
    expect(store.unreadCount).toBe(0)
  })

  it('disconnect tears down socket, resets connected and unregisters listeners', () => {
    const store = useNotificationStore()
    store.init()
    h.handlers.get('open')!()
    h.wsService.disconnect.mockClear()
    h.wsService.off.mockClear()
    store.disconnect()
    expect(h.wsService.disconnect).toHaveBeenCalledTimes(1)
    expect(store.connected).toBe(false)
    expect(h.wsService.off).toHaveBeenCalledTimes(5)
  })

  describe('requestBrowserPermission', () => {
    const restoreDescriptor = () => {
      // @ts-expect-error delete for test isolation
      delete window.Notification
    }

    function installMockNotification(permission: string, requestPermission?: () => Promise<string>) {
      const Ctor = function (this: unknown) {
        /* mock */
      } as unknown as { permission: string; requestPermission?: () => Promise<string> }
      Ctor.permission = permission
      if (requestPermission) Ctor.requestPermission = requestPermission
      // @ts-expect-error assign to global for test
      window.Notification = Ctor
      return Ctor
    }

    it('returns false when Notification is unsupported', async () => {
      restoreDescriptor()
      const store = useNotificationStore()
      await expect(store.requestBrowserPermission()).resolves.toBe(false)
    })

    it('returns true when already granted', async () => {
      installMockNotification('granted')
      const store = useNotificationStore()
      await expect(store.requestBrowserPermission()).resolves.toBe(true)
      restoreDescriptor()
    })

    it('returns false when denied', async () => {
      installMockNotification('denied')
      const store = useNotificationStore()
      await expect(store.requestBrowserPermission()).resolves.toBe(false)
      restoreDescriptor()
    })

    it('prompts and reflects the granted result', async () => {
      installMockNotification('default', async () => 'granted')
      const store = useNotificationStore()
      await expect(store.requestBrowserPermission()).resolves.toBe(true)
      restoreDescriptor()
    })

    it('prompts and returns false when the result is not granted', async () => {
      installMockNotification('default', async () => 'denied')
      const store = useNotificationStore()
      await expect(store.requestBrowserPermission()).resolves.toBe(false)
      restoreDescriptor()
    })

    it('returns false when requestPermission throws', async () => {
      installMockNotification('default', async () => {
        throw new Error('blocked')
      })
      const store = useNotificationStore()
      await expect(store.requestBrowserPermission()).resolves.toBe(false)
      restoreDescriptor()
    })
  })
})
