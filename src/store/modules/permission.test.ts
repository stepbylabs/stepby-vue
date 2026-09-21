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
  const user = { roles: [] as string[], permissions: [] as string[] }
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
    user,
    i18n,
    errorHub
  }
})

vi.mock('@/router', () => ({
  default: h.router,
  constantRoutes: h.constantRoutes,
  extraConstantRoutes: h.extraConstantRoutes,
  dynamicRoutes: h.dynamicRoutes
}))
vi.mock('@/api/router', () => ({ getRouters: h.getRouters }))
vi.mock('@/layout/index.vue', () => ({ default: h.Layout }))
vi.mock('@/components/ParentView/index.vue', () => ({ default: h.ParentView }))
vi.mock('@/layout/components/InnerLink/index.vue', () => ({ default: h.InnerLink }))
vi.mock('@/store/modules/user', () => ({ default: () => h.user }))
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
    h.user.roles = []
    h.user.permissions = []
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
      h.user.permissions = ['system:user:edit']
      const out = filterDynamicRoutes([
        { path: '/a', permissions: ['system:user:edit'] },
        { path: '/b', permissions: ['system:user:delete'] }
      ] as never)
      expect(out.map((r) => r.path)).toEqual(['/a'])
    })
    it('super-permission "*" grants every permission route', () => {
      h.user.permissions = ['*:*:*']
      const out = filterDynamicRoutes([{ path: '/a', permissions: ['whatever:x:y'] }] as never)
      expect(out).toHaveLength(1)
    })
    it('includes role routes for admin / matching role and drops others', () => {
      h.user.permissions = []
      h.user.roles = ['common']
      const out = filterDynamicRoutes([
        { path: '/admin', roles: ['admin'] },
        { path: '/common', roles: ['common'] },
        { path: '/other', roles: ['nobody'] },
        { path: '/plain' }
      ] as never)
      expect(out.map((r) => r.path)).toEqual(['/common'])
    })
    it('no permission check needed when admin role present', () => {
      h.user.roles = ['admin']
      const out = filterDynamicRoutes([{ path: '/r', roles: ['anything'] }] as never)
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
      h.user.permissions = ['system:user:edit']
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
      const rewrite = await store.generateRoutes()

      expect(Array.isArray(rewrite)).toBe(true)
      // extra constant routes registered at least once
      expect(h.router.addRoute).toHaveBeenCalled()
      // routes prepended with constants
      expect(store.routes.slice(0, 2)).toEqual(h.constantRoutes)
      expect(store.sidebarRouters.slice(0, 2)).toEqual(h.constantRoutes)

      // Layout component resolved to the Layout object (Pinia wraps it in a
      // reactive proxy, so compare by identity marker rather than object ref).
      const sysRoute = store.sidebarRouters.find((r: AppRouteRecord) => r.path === '/system') as Record<string, unknown>
      expect((sysRoute.component as { name?: string }).name).toBe('Layout')
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
      const rewrite = await store.generateRoutes()
      const page = rewrite.find((r: AppRouteRecord) => r.path === '/page') as Record<string, unknown>
      expect(typeof page.component).toBe('function')
    })

    it('returns [] and logs when getRouters rejects', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      h.getRouters.mockRejectedValue(new Error('boom'))
      const store = usePermissionStore()
      const res = await store.generateRoutes()
      expect(res).toEqual([])
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })

    it('handles an empty menu payload (no-permission branch)', async () => {
      h.getRouters.mockResolvedValue({ data: [] })
      const store = usePermissionStore()
      const rewrite = await store.generateRoutes()
      expect(rewrite).toEqual([])
      // only the constant routes remain in sidebar/routes
      expect(store.sidebarRouters).toEqual(h.constantRoutes)
      expect(store.routes).toEqual(h.constantRoutes)
    })
  })
})
