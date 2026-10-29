import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Pinia from 'pinia'

const h = vi.hoisted(() => {
  const Layout = { name: 'Layout' }
  const ParentView = { name: 'ParentView' }
  const InnerLink = { name: 'InnerLink' }

  const constantRoutes = [
    { path: '/login', name: 'Login' },
    { path: '', name: 'Root' }
  ]
  const extraConstantRoutes = [{ path: '/index', name: 'Index' }]
  const dynamicRoutes: Record<string, unknown>[] = []

  const router = {
    addRoute: vi.fn(),
    removeRoute: vi.fn(),
    getRoutes: vi.fn(() => [
      { name: 'Login' },
      { name: 'Index' },
      { name: 'DynamicOne' },
      { name: 'DynamicTwo' },
      { path: '/no-name' }
    ])
  }

  const getRouters = vi.fn()
  const i18n = { global: { t: (k: string) => `T:${k}` } }
  const errorHub = { report: vi.fn() }

  return {
    Layout,
    ParentView,
    InnerLink,
    constantRoutes,
    extraConstantRoutes,
    dynamicRoutes,
    router,
    getRouters,
    i18n,
    errorHub
  }
})

vi.mock('@/router', () => ({
  default: h.router,
  constantRoutes: h.constantRoutes,
  extraConstantRoutes: h.extraConstantRoutes,
  dynamicRoutes: h.dynamicRoutes,
  Layout: () => Promise.resolve(h.Layout)
}))
vi.mock('@/api/router', () => ({ getRouters: h.getRouters }))
vi.mock('@/components/ParentView/index.vue', () => ({ default: h.ParentView }))
vi.mock('@/layout/components/InnerLink/index.vue', () => ({ default: h.InnerLink }))
vi.mock('@/i18n', () => ({ default: h.i18n }))
vi.mock('@/utils/errorHub', () => ({ errorHub: h.errorHub }))
vi.mock('element-plus', () => ({ default: {}, ElMessage: { warning: vi.fn() } }))

import usePermissionStore, { filterDynamicRoutes, loadView } from './permission'
import type { AppRouteRecord } from '@/types'

describe('store/modules/permission', () => {
  beforeEach(() => {
    Pinia.setActivePinia(Pinia.createPinia())
    h.router.addRoute.mockClear()
    h.router.removeRoute.mockClear()
    h.getRouters.mockReset()
    h.dynamicRoutes.length = 0
  })

  describe('simple setters', () => {
    it('setRoutes stores addRoutes and prepends constant routes', () => {
      const store = usePermissionStore()
      const routes = [{ path: '/dyn' }] as never
      store.setRoutes(routes)
      expect(store.addRoutes).toEqual(routes)
      expect(store.routes.slice(0, 2)).toEqual(h.constantRoutes)
      expect(store.routes[2]).toEqual({ path: '/dyn' })
    })
    it('setDefaultRoutes / setTopbarRoutes / setSidebarRouters assign state', () => {
      const store = usePermissionStore()
      store.setDefaultRoutes([{ path: '/x' }] as never)
      expect(store.defaultRoutes).toEqual([...h.constantRoutes, { path: '/x' }])
      store.setTopbarRoutes([{ path: '/top' }] as never)
      expect(store.topbarRouters).toEqual([{ path: '/top' }])
      store.setSidebarRouters([{ path: '/side' }] as never)
      expect(store.sidebarRouters).toEqual([{ path: '/side' }])
    })
  })

  describe('filterDynamicRoutes', () => {
    it('includes routes whose permission matches', () => {
      const out = filterDynamicRoutes(
        [
          { path: '/a', permissions: ['system:user:edit'] },
          { path: '/b', permissions: ['system:user:delete'] }
        ] as never,
        { permissions: ['system:user:edit'], roles: [] }
      )
      expect(out.map((r) => r.path)).toEqual(['/a'])
    })
    it('super-permission "*" grants every permission route', () => {
      const out = filterDynamicRoutes([{ path: '/a', permissions: ['whatever:x:y'] }] as never, {
        permissions: ['*:*:*'],
        roles: []
      })
      expect(out).toHaveLength(1)
    })
    it('includes role routes for admin / matching role and drops others', () => {
      const out = filterDynamicRoutes(
        [
          { path: '/admin', roles: ['admin'] },
          { path: '/common', roles: ['common'] },
          { path: '/other', roles: ['nobody'] },
          { path: '/plain' }
        ] as never,
        { permissions: [], roles: ['common'] }
      )
      expect(out.map((r) => r.path)).toEqual(['/common'])
    })
    it('no permission check needed when admin role present', () => {
      const out = filterDynamicRoutes([{ path: '/r', roles: ['anything'] }] as never, {
        permissions: [],
        roles: ['admin']
      })
      expect(out).toHaveLength(1)
    })
  })

  describe('loadView', () => {
    it('returns a cached loader and falls back to 404 for unknown components', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const loader = loadView('this/view/does/not/exist')
      expect(typeof loader).toBe('function')
      // cached: second call returns the same reference
      expect(loadView('this/view/does/not/exist')).toBe(loader)
      // the fallback import triggers errorHub.report asynchronously
      await Promise.resolve()
      await Promise.resolve()
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe('resetRoutes', () => {
    it('removes non-constant named routes and clears state + calls loadView cache reset', () => {
      const store = usePermissionStore()
      store.setRoutes([{ path: '/x' }] as never)
      store.resetRoutes()
      // dynamic names removed, constant names kept
      expect(h.router.removeRoute).toHaveBeenCalledWith('DynamicOne')
      expect(h.router.removeRoute).toHaveBeenCalledWith('DynamicTwo')
      expect(h.router.removeRoute).not.toHaveBeenCalledWith('Login')
      expect(h.router.removeRoute).not.toHaveBeenCalledWith('Index')
      expect(store.routes).toEqual([])
      expect(store.sidebarRouters).toEqual([])
      expect(store.topbarRouters).toEqual([])
    })
  })

  describe('generateRoutes', () => {
    it('builds sidebar/rewrite/default routes, registers dynamic + extra routes', async () => {
      h.dynamicRoutes.push({ path: '/dyn-user', permissions: ['system:user:edit'] } as never)
      h.getRouters.mockResolvedValue({
        data: [
          {
            path: '/system',
            component: 'Layout',
            redirect: 'noRedirect',
            meta: { title: 'System' },
            children: [
              { path: 'user', component: 'system/user/index', name: 'User', meta: { title: 'User' } },
              {
                path: 'nested',
                component: 'ParentView',
                children: [{ path: 'deep', component: 'monitor/x/index', name: 'Deep', meta: { title: 'Deep' } }]
              }
            ]
          },
          { path: '/link', component: 'InnerLink', meta: { title: 'Link' } },
          { path: '/about', component: 'About', redirect: '/home', children: [] }
        ]
      })
      const store = usePermissionStore()
      const rewrite = await store.generateRoutes({ permissions: ['system:user:edit'], roles: [] })

      expect(Array.isArray(rewrite)).toBe(true)
      // extra constant routes registered at least once
      expect(h.router.addRoute).toHaveBeenCalled()
      // routes prepended with constants
      expect(store.routes.slice(0, 2)).toEqual(h.constantRoutes)
      expect(store.sidebarRouters.slice(0, 2)).toEqual(h.constantRoutes)

      // b123：Layout 是**异步 loader**（布局树不进首屏）。这里按真实契约断言
      // "loader 解析出来的组件名是 Layout"，而不是断言一个静态对象——后者会让
      // "有人把 Layout 改回静态导入"在单测里照样绿（契约方向写反了）。
      const sysRoute = store.sidebarRouters.find((r: AppRouteRecord) => r.path === '/system') as Record<string, unknown>
      const rawComponent = sysRoute.component as unknown
      const resolved =
        typeof rawComponent === 'function' ? await (rawComponent as () => Promise<{ name?: string }>)() : rawComponent
      expect((resolved as { name?: string } | null)?.name).toBe('Layout')
      // noRedirect replaced by redirect to first visible child (/system/user)
      expect(sysRoute.redirect).toBe('/system/user')

      // '/about' had empty children -> children + redirect stripped by filterAsyncRouter
      const about = store.sidebarRouters.find((r: AppRouteRecord) => r.path === '/about') as Record<string, unknown>
      expect(about.children).toBeUndefined()
      expect(about.redirect).toBeUndefined()

      // dynamic route with permission got registered via addRoute
      const addedPaths = h.router.addRoute.mock.calls.map((c) => (c[0] as { path?: string }).path)
      expect(addedPaths).toContain('/dyn-user')
      expect(addedPaths).toContain('/index')
    })

    it('resolves component strings to loader functions in rewrite routes', async () => {
      h.getRouters.mockResolvedValue({
        data: [{ path: '/page', component: 'some/real/view', name: 'Page', meta: {} }]
      })
      const store = usePermissionStore()
      const rewrite = await store.generateRoutes({ permissions: [], roles: [] })
      const page = rewrite.find((r: AppRouteRecord) => r.path === '/page') as Record<string, unknown>
      expect(typeof page.component).toBe('function')
    })

    it('re-throws when getRouters rejects (guard classifies by status, §5.35)', async () => {
      h.getRouters.mockRejectedValue(new Error('boom'))
      const store = usePermissionStore()
      await expect(store.generateRoutes({ permissions: [], roles: [] })).rejects.toThrow('boom')
    })

    it('handles an empty menu payload (no-permission branch)', async () => {
      h.getRouters.mockResolvedValue({ data: [] })
      const store = usePermissionStore()
      const rewrite = await store.generateRoutes({ permissions: [], roles: [] })
      expect(rewrite).toEqual([])
      // only the constant routes remain in sidebar/routes
      expect(store.sidebarRouters).toEqual(h.constantRoutes)
      expect(store.routes).toEqual(h.constantRoutes)
    })
  })
})
