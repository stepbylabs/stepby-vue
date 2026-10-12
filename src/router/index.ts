import { createWebHistory, createRouter } from 'vue-router'
/* Layout */
import Layout from '@/layout/index.vue'
import { isChunkLoadError, reloadOnChunkError } from '@/utils/routerError'

/**
 * Note: 路由配置项
 *
 * hidden: true                     // 当设置 true 的时候该路由不会再侧边栏出现 如401，login等页面，或者如一些编辑页面/edit/1
 * alwaysShow: true                 // 当你一个路由下面的 children 声明的路由大于1个时，自动会变成嵌套的模式--如组件页面
 *                                  // 只有一个时，会将那个子路由当做根路由显示在侧边栏--如引导页面
 *                                  // 若你想不管路由下面的 children 声明的个数都显示你的根路由
 *                                  // 你可以设置 alwaysShow: true，这样它就会忽略之前定义的规则，一直显示根路由
 * redirect: noRedirect             // 当设置 noRedirect 的时候该路由在面包屑导航中不可被点击
 * name:'router-name'               // 设定路由的名字，一定要填写不然使用<keep-alive>时会出现各种问题
 * query: '{"id": 1, "name": "stepby"}' // 访问路由的默认传递参数
 * roles: ['admin', 'common']       // 访问路由的角色权限
 * permissions: ['a:a:a', 'b:b:b']  // 访问路由的菜单权限
 * meta : {
    noCache: true                   // 如果设置为true，则不会被 <keep-alive> 缓存(默认 false)
    title: 'title'                  // 设置该路由在侧边栏和面包屑中展示的名字
    icon: 'svg-name'                // 设置该路由的图标，对应路径src/assets/icons/svg
    breadcrumb: false               // 如果设置为false，则不会在breadcrumb面包屑中显示
    activeMenu: '/system/user'      // 当路由设置了该属性，则会高亮相对应的侧边栏。
  }
 */

// 公共路由
export const constantRoutes = [
  {
    path: '/redirect',
    component: Layout,
    hidden: true,
    children: [
      {
        path: '/redirect/:path(.*)',
        component: () => import('@/views/redirect/index.vue')
      }
    ]
  },
  {
    path: '/login',
    component: () => import('@/views/login.vue'),
    hidden: true,
    meta: { title: 'route.login', i18nKey: 'route.login' }
  },
  {
    path: '/register',
    component: () => import('@/views/register.vue'),
    hidden: true,
    meta: { title: 'route.register', i18nKey: 'route.register' }
  },
  {
    // P0 OAuth：第三方登录回调落地页（/oauth2/callback 302 到此处，读取 token/handoff/error）
    path: '/oauth-login',
    component: () => import('@/views/oauthlogin.vue'),
    hidden: true,
    meta: { title: 'route.oauthLogin', i18nKey: 'route.oauthLogin' }
  },
  {
    // SSO / OIDC Provider：授权同意页（后端 authorize 判定需同意后 302 到此处；需登录态，非白名单）
    path: '/sso-consent',
    component: () => import('@/views/sso/consent.vue'),
    hidden: true,
    meta: { title: 'route.ssoConsent', i18nKey: 'route.ssoConsent' }
  },
  {
    // ROUNDS61-100 #6 / R10-SEC-005：隐私政策页面（独立页面，无需鉴权，未登录也可访问）
    path: '/privacy',
    component: () => import('@/views/legal/privacy.vue'),
    hidden: true,
    meta: { title: 'route.privacy', i18nKey: 'route.privacy', icon: 'Document' }
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/error/404.vue'),
    hidden: true,
    meta: { title: '404' }
  },
  {
    path: '/401',
    component: () => import('@/views/error/401.vue'),
    hidden: true,
    meta: { title: '401' }
  },
  // P2-34: R18-3.1/3.2/3.3 错误页面（无需登录即可访问，需在 permission.ts 白名单中）
  {
    path: '/403',
    component: () => import('@/views/error/403.vue'),
    hidden: true,
    meta: { title: '403' }
  },
  {
    path: '/500',
    component: () => import('@/views/error/500.vue'),
    hidden: true,
    meta: { title: '500' }
  },
  {
    path: '/network-error',
    component: () => import('@/views/error/network-error.vue'),
    hidden: true,
    meta: { title: 'route.networkError', i18nKey: 'route.networkError' }
  },
  {
    // 根路径重定向到首页
    path: '',
    redirect: '/index'
  },
  // 注意：/index 和 /user/profile/:activeTab? 路由不在 constantRoutes 中声明，
  // 而是通过 router.addRoute 在 permission.ts generateRoutes 中动态注册。
  // 原因：Vue Router 5.2.0 中常量路由的嵌套子路由（path:'' / 相对路径 / 绝对路径）
  // 都不会被 route.matched 匹配（matchedCount=1），导致 <router-view> 内的子组件不渲染。
  // 而通过 router.addRoute 注册的动态路由能正确匹配（matchedCount=2）。
  // 未登录访问 /index 会被 permission.ts 导航守卫拦截到 /login，无需占位路由。
  {
    path: '/lock',
    component: () => import('@/views/lock.vue'),
    hidden: true,
    meta: { title: 'route.lockScreen', i18nKey: 'route.lockScreen' }
  },
  {
    // 兼容旧路径 /user（访问 /user 时重定向到首页，避免 404）
    path: '/user',
    redirect: '/index',
    hidden: true
  }
]

// 需要动态注册的常量路由（Vue Router 5.2.0 中常量路由的嵌套子路由不被 matched 匹配，
// 必须通过 router.addRoute 注册才能让 <router-view> 内的子组件正确渲染）
// 这些路由不带 permissions/roles 校验，登录后即可访问
export const extraConstantRoutes = [
  {
    path: '/index',
    component: Layout,
    children: [
      {
        path: '',
        component: () => import('@/views/index.vue'),
        name: 'Index',
        meta: { title: 'route.home', i18nKey: 'route.home', icon: 'dashboard', affix: true }
      }
    ]
  },
  {
    path: '/user/profile/:activeTab?',
    component: Layout,
    hidden: true,
    children: [
      {
        path: '',
        component: () => import('@/views/system/user/profile/index.vue'),
        name: 'Profile',
        meta: { title: 'route.profile', i18nKey: 'route.profile', icon: 'user' }
      }
    ]
  }
]

// 动态路由，基于用户权限动态去加载
export const dynamicRoutes = [
  {
    path: '/system/user-auth',
    component: Layout,
    hidden: true,
    permissions: ['system:user:edit'],
    children: [
      {
        path: 'role/:userId(\\d+)',
        component: () => import('@/views/system/user/authRole.vue'),
        name: 'AuthRole',
        meta: { title: 'route.assignRole', i18nKey: 'route.assignRole', activeMenu: '/system/user' }
      }
    ]
  },
  {
    path: '/system/role-auth',
    component: Layout,
    hidden: true,
    permissions: ['system:role:edit'],
    children: [
      {
        path: 'user/:roleId(\\d+)',
        component: () => import('@/views/system/role/authUser.vue'),
        name: 'AuthUser',
        meta: { title: 'route.assignUser', i18nKey: 'route.assignUser', activeMenu: '/system/role' }
      }
    ]
  },
  // ===== 字典数据详情页路由 =====
  {
    path: '/system/dict-data',
    component: Layout,
    hidden: true,
    permissions: ['system:dict:list'],
    children: [
      {
        path: 'index/:dictId(\\d+)',
        component: () => import('@/views/system/dict/data.vue'),
        name: 'SystemDictData',
        meta: { title: 'route.dictData', i18nKey: 'route.dictData', activeMenu: '/system/dict' }
      }
    ]
  },
  {
    path: '/monitor/job-log',
    component: Layout,
    hidden: true,
    permissions: ['monitor:job:list'],
    children: [
      {
        path: 'index/:jobId(\\d+)',
        component: () => import('@/views/monitor/job/log.vue'),
        name: 'JobLog',
        meta: { title: 'route.jobLog', i18nKey: 'route.jobLog', activeMenu: '/monitor/job' }
      }
    ]
  },
  {
    path: '/tool/gen-edit',
    component: Layout,
    hidden: true,
    permissions: ['tool:gen:edit'],
    children: [
      {
        path: 'index/:tableId(\\d+)',
        component: () => import('@/views/tool/gen/editTable.vue'),
        name: 'GenEdit',
        meta: { title: 'route.editGenConfig', i18nKey: 'route.editGenConfig', activeMenu: '/tool/gen' }
      }
    ]
  },
  {
    // P3-16：服务器监控页（独立实时图表页面）。
    // 该路由为前端隐藏动态路由（不注册到侧边栏），仅按权限 monitor:health:list 开放，
    // 复用健康检查页面同源 API（GET /monitor/server，服务监控菜单已并入健康检查 P0-1，无独立 sys_menu）。
    path: '/monitor/server',
    component: Layout,
    hidden: true,
    permissions: ['monitor:health:list'],
    children: [
      {
        path: '',
        component: () => import('@/views/monitor/server/index.vue'),
        name: 'ServerMonitor',
        meta: { title: 'route.monitorServer', i18nKey: 'route.monitorServer' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes: constantRoutes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  }
})

// P1-4: 路由错误捕获（懒加载失败、导航守卫异常）
// 捕获动态 import 失败（网络错误/部署更新导致 chunk 缺失），提示用户刷新
// 注意：router 模块不依赖 UI 组件，仅用 console + 刷新；全局错误提示由 main.ts errorHandler 兜底
router.onError((error) => {
  if (import.meta.env.DEV) console.error('[Router Error]', error)
  // 懒加载 chunk 加载失败时（部署后旧资源失效），整页重新加载当前页以拉取最新 index.html + chunk。
  // 抽离到 routerError 模块统一判定与兜底刷新：保留“部署更新自动刷新”能力（避免直接删除导致白屏），
  // 并用 sessionStorage 标记防止资源持续不可用时陷入无限刷新循环。
  if (isChunkLoadError(error)) {
    reloadOnChunkError()
  }
})

export default router
