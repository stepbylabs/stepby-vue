import router, { constantRoutes, dynamicRoutes, extraConstantRoutes } from '@/router'
import { getRouters } from '@/api/router'
import Layout from '@/layout/index.vue'
import ParentView from '@/components/ParentView/index.vue'
import InnerLink from '@/layout/components/InnerLink/index.vue'
import useUserStore from '@/store/modules/user'
import i18n from '@/i18n'
import { errorHub } from '@/utils/errorHub'
import type { AppRouteRecord } from '@/types'
import type { RouteRecordRaw } from 'vue-router'

// 权限/角色校验：原先由 @/plugins/auth 提供，因仅本文件使用，已内联以消除冗余插件文件
const SUPER_ADMIN_ROLE = 'admin'
const ALL_PERMISSION = '*:*:*'

function hasPermiOr(permissions: string[]): boolean {
  const userPermissions: string[] = useUserStore().permissions
  return permissions.some((p) => userPermissions.some((up: string) => up === ALL_PERMISSION || up === p))
}

function hasRoleOr(roles: string[]): boolean {
  const userRoles: string[] = useUserStore().roles
  return roles.some((r) => userRoles.some((ur: string) => ur === SUPER_ADMIN_ROLE || ur === r))
}

// 匹配views里面所有的.vue文件
const modules = import.meta.glob('./../../views/**/*.vue')

const usePermissionStore = defineStore('permission', {
  state: () => ({
    routes: [] as AppRouteRecord[],
    addRoutes: [] as AppRouteRecord[],
    defaultRoutes: [] as AppRouteRecord[],
    topbarRouters: [] as AppRouteRecord[],
    sidebarRouters: [] as AppRouteRecord[]
  }),
  actions: {
    setRoutes(routes: AppRouteRecord[]) {
      this.addRoutes = routes
      this.routes = [...constantRoutes, ...routes] as AppRouteRecord[]
    },
    setDefaultRoutes(routes: AppRouteRecord[]) {
      this.defaultRoutes = [...constantRoutes, ...routes] as AppRouteRecord[]
    },
    setTopbarRoutes(routes: AppRouteRecord[]) {
      this.topbarRouters = routes
    },
    setSidebarRouters(routes: AppRouteRecord[]) {
      this.sidebarRouters = routes
    },
    // 改用 async/await，确保异常能被调用方捕获（P0-45）
    async generateRoutes(_roles?: string[]): Promise<AppRouteRecord[]> {
      try {
        // 先清空旧路由缓存，确保使用最新权限（P0-43）
        this.resetRoutes()
        // 向后端请求路由数据
        const res = await getRouters()
        // 恢复完整菜单（不再裁剪演示模块），便于全功能测试
        // L6 修复: trimmedData 命名误导（实际未做裁剪），重命名为 routeData 更准确
        const routeData = res.data
        // M2: 改用 structuredClone 替代 JSON.parse(JSON.stringify(...))，性能更好且支持更多数据类型
        const sdata = structuredClone(routeData) as AppRouteRecord[]
        const rdata = structuredClone(routeData) as AppRouteRecord[]
        const defaultData = structuredClone(routeData) as AppRouteRecord[]
        const sidebarRoutes = filterAsyncRouter(sdata)
        const rewriteRoutes = filterAsyncRouter(rdata, false, true)
        const defaultRoutes = filterAsyncRouter(defaultData)
        const asyncRoutes = filterDynamicRoutes(dynamicRoutes)
        asyncRoutes.forEach((route) => {
          router.addRoute(route as unknown as RouteRecordRaw)
        })
        // 注册额外的常量路由（/index、/user/profile 等）
        // Vue Router 5.2.0 中常量路由的嵌套子路由不被 matched 匹配，
        // 必须通过 router.addRoute 注册才能让 <router-view> 内的子组件正确渲染
        extraConstantRoutes.forEach((route) => {
          router.addRoute(route as unknown as RouteRecordRaw)
        })
        this.setRoutes(rewriteRoutes)
        this.setSidebarRouters([...constantRoutes, ...sidebarRoutes] as AppRouteRecord[])
        this.setDefaultRoutes(sidebarRoutes)
        this.setTopbarRoutes(defaultRoutes)
        return rewriteRoutes
      } catch (e) {
        // 忽略路由获取错误，request.ts 拦截器已统一弹错误提示；此处仅记录日志便于排查
        if (import.meta.env.DEV) console.error('[generateRoutes]', e)
        return []
      }
    },
    // 重置路由：移除所有动态添加的路由，只保留常量路由（P0-60）
    // 在登出或权限变更时调用，防止旧权限的路由残留导致权限泄漏
    resetRoutes() {
      // constantRouteNames 包含 constantRoutes + extraConstantRoutes 的 name，
      // 确保动态注册的常量路由（/index、/user/profile 等）不会被误清除
      const constantRouteNames = new Set(
        [...constantRoutes, ...extraConstantRoutes]
          .map((r) => (r as { name?: string | symbol }).name)
          .filter((n): n is string => typeof n === 'string' && n.length > 0)
      )
      router.getRoutes().forEach((route) => {
        if (route.name && typeof route.name === 'string' && !constantRouteNames.has(route.name)) {
          router.removeRoute(route.name)
        }
      })
      // 重置 store 状态
      this.routes = []
      this.addRoutes = []
      this.defaultRoutes = []
      this.topbarRouters = []
      this.sidebarRouters = []
      // M8 修复: 清空 loadView 缓存，避免多用户切换时使用旧权限加载的组件缓存
      // 场景: 用户A登录加载了 /system/user 组件并缓存，登出后用户B（无该权限）登录，
      // 若不清空缓存，loadView 仍会命中旧组件引用，可能导致权限泄漏或组件状态残留
      loadViewCache.clear()
    }
  }
})

// 遍历后台传来的路由字符串，转换为组件对象
function filterAsyncRouter(
  asyncRouterMap: AppRouteRecord[],
  _lastRouter: AppRouteRecord | false = false,
  type = false
): AppRouteRecord[] {
  return asyncRouterMap.filter((route) => {
    if (type && route.children) {
      route.children = filterChildren(route.children)
    }
    if (route.component) {
      // Layout ParentView 组件特殊处理
      if (route.component === 'Layout') {
        route.component = Layout
      } else if (route.component === 'ParentView') {
        route.component = ParentView
      } else if (route.component === 'InnerLink') {
        route.component = InnerLink
      } else {
        route.component = loadView(route.component)
      }
    }
    // 处理 noRedirect 标记：stepby 后端对 M 类型目录设置 redirect='noRedirect'，
    // 用于面包屑组件判断"不可点击"。但 Vue Router 会将其当作实际重定向路径，
    // 导致访问父级目录（如 /dashboard）时重定向到 /noRedirect 触发 404。
    // 解决方案：删除 noRedirect，改为重定向到第一个可见子路由，
    // 这样访问父级目录时会自动跳转到子页面，而不是显示空白 Layout。
    // 面包屑组件的"不可点击"通过 index == levelList.length - 1 判断，不依赖 redirect。
    if (route.redirect === 'noRedirect') {
      delete route['redirect']
      // 如果有子路由，设置默认重定向到第一个子路由
      if (route.children && route.children.length > 0) {
        const firstChild = route.children[0]
        const childPath = firstChild.path.startsWith('/') ? firstChild.path : route.path + '/' + firstChild.path
        route.redirect = childPath
      }
    }
    // L7 修复: 简化冗余条件判断（原 route.children != null && route.children && route.children.length）
    // route.children 为 truthy 时已隐含 != null，故可省略前两段
    if (route.children && route.children.length) {
      route.children = filterAsyncRouter(route.children, route, type)
    } else {
      delete route['children']
      delete route['redirect']
    }
    return true
  })
}

function filterChildren(childrenMap: AppRouteRecord[], lastRouter: AppRouteRecord | false = false): AppRouteRecord[] {
  let children: AppRouteRecord[] = []
  childrenMap.forEach((el) => {
    el.path = lastRouter ? lastRouter.path + '/' + el.path : el.path
    if (el.children && el.children.length && el.component === 'ParentView') {
      children = children.concat(filterChildren(el.children, el))
    } else {
      children.push(el)
    }
  })
  return children
}

// 动态路由遍历，验证是否具备权限
export function filterDynamicRoutes(routes: AppRouteRecord[]): AppRouteRecord[] {
  const res: AppRouteRecord[] = []
  routes.forEach((route) => {
    if (route.permissions) {
      if (hasPermiOr(route.permissions)) {
        res.push(route)
      }
    } else if (route.roles) {
      if (hasRoleOr(route.roles)) {
        res.push(route)
      }
    }
  })
  return res
}

// P1 修复: loadView 缓存，避免每次添加路由都遍历所有 views 模块（性能优化）
const loadViewCache = new Map<string, () => Promise<unknown>>()

export const loadView = (view: string): (() => Promise<unknown>) => {
  // 命中缓存直接返回
  const cached = loadViewCache.get(view)
  if (cached) return cached

  let res: (() => Promise<unknown>) | null = null
  for (const path in modules) {
    const dir = path.split('views/')[1].split('.vue')[0]
    if (dir === view) {
      res = () => modules[path]()
      break
    }
  }
  // 防御性兜底：找不到对应组件时返回 404 组件，避免 route.component=undefined
  // 导致 router.addRoute 抛错，进而引发 Vue Router 启动失败（VUE_ROUTER_R0011）
  // 触发场景：后端菜单配置的 component 路径在前端不存在（如已删除的旧组件）
  if (!res) {
    if (import.meta.env.DEV) console.warn(`[loadView] Component not found: ${view}, fallback to 404 page`)
    // U12 优化：用户可见提示，避免用户无感知 404
    import('element-plus')
      .then(() => {
        errorHub.report('warning', 'other', i18n.global.t('menu.componentNotFound', { view }))
      })
      .catch(() => {})
    res = () => import('@/views/error/404.vue')
  }
  loadViewCache.set(view, res)
  return res
}

export default usePermissionStore
