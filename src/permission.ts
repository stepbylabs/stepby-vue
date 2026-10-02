import router from './router'
import { errorHub } from '@/utils/errorHub'
import { startProgress, doneProgress } from '@/utils/progress'
import 'nprogress/nprogress.css'
import { getToken } from '@/utils/auth'
import { isHttp, isPathMatch } from '@/utils/validate'
import { isRelogin } from '@/utils/request'
import useUserStore from '@/store/modules/user'
import useLockStore from '@/store/modules/lock'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'
import i18n from '@/i18n'
import { translateTitle } from '@/composables/useMenuTitle'
import type { AppRouteRecord } from '@/types'
import type { AxiosError } from 'axios'

const t = i18n.global.t

const whiteList = ['/login', '/register', '/oauth-login', '/privacy', '/403', '/500', '/network-error']

const isWhiteList = (path: string): boolean => {
  return whiteList.some((pattern: string) => isPathMatch(pattern, path))
}

router.beforeEach(async (to, _from) => {
  startProgress()
  if (getToken()) {
    if (to.meta.title) {
      // 优先使用 i18nKey 翻译标题，回退到 meta.title 原文
      useSettingsStore().setTitle(translateTitle(to.meta as { title?: string; i18nKey?: string }))
    }
    const isLock = useLockStore().isLock
    // 锁屏检查必须在白名单检查之前，防止锁屏后通过 /register 等 URL 绕过（P0-62）
    if (isLock && to.path !== '/lock') {
      doneProgress()
      return { path: '/lock' }
    }
    if (!isLock && to.path === '/lock') {
      doneProgress()
      return { path: '/' }
    }
    if (to.path === '/login') {
      doneProgress()
      return { path: '/' }
    }
    if (isWhiteList(to.path)) {
      return true
    }
    if (useUserStore().roles.length === 0) {
      isRelogin.show = true
      try {
        // 拉取user_info信息
        await useUserStore().getInfo()
        // 根据roles权限生成可访问的路由
        const accessRoutes = await usePermissionStore().generateRoutes()
        accessRoutes.forEach((route: AppRouteRecord) => {
          if (!isHttp(route.path)) {
            router.addRoute(route as unknown as Parameters<typeof router.addRoute>[0])
          }
        })
        // 重新导航到目标路由，确保动态路由已注册
        // 注意：在 Vue Router 5 中不能整对象展开 `to`（会丢失 fullPath 导致初始导航崩溃），
        // 也不能把 to.fullPath 直接塞进 `path`——对象形式的 `path` 不解析内嵌 query/hash，
        // 会把 ?a=b 当作 path 的一部分而丢弃查询参数。故显式分离 path/query/hash 重导航，
        // 保证冷加载受保护路由（如 /sso-consent?clientId=…）的查询参数在二次导航后仍然保留。
        return { path: to.path, query: to.query, hash: to.hash, replace: true }
      } catch (err) {
        // P2-34: R18-3.1/3.2/3.3 根据错误类型重定向到对应错误页（保留 401 等鉴权失败的登出逻辑）
        // U6 优化：优先使用 HTTP status 判断，字符串匹配作为兜底（更健壮）
        // U6-IMPACT: 收紧字符串匹配，避免误判包含"网络"的任意错误消息
        const errorObj = err as AxiosError<{ message?: string }>
        const httpStatus = errorObj?.response?.status
        const errMsg: string = errorObj?.message || (typeof errorObj === 'string' ? errorObj : '')
        const axiosCode: string = errorObj?.code || ''
        // 网络异常（断网 / 超时无法到达服务器）：
        //   1. 无 response.status（HTTP 请求未到达服务器）
        //   2. axios error.code 为 ERR_NETWORK / ECONNABORTED
        //   3. 或消息匹配原始 axios 消息（跨语言通用）
        const isNetworkError =
          httpStatus === undefined &&
          (axiosCode === 'ERR_NETWORK' ||
            axiosCode === 'ECONNABORTED' ||
            errMsg === 'Network Error' ||
            errMsg.includes('timeout'))
        if (isNetworkError) {
          doneProgress()
          return { path: '/network-error' }
        }
        // 403 权限不足：用户已认证但无权限，不登出
        if (httpStatus === 403) {
          doneProgress()
          return { path: '/403' }
        }
        // 500/502/503 服务器错误：不登出，便于用户刷新重试
        if (httpStatus === 500 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
          doneProgress()
          return { path: '/500' }
        }
        // P1 修复：仅鉴权类错误（401 / token 失效）才强制登出；
        // 其他异常（如后端瞬时故障、前端权限树解析错误）保留登录态，避免把已登录用户踢下线
        if (httpStatus === 401) {
          await useUserStore().logOut()
          errorHub.report('error', 'other', errMsg || t('common.routeLoadFailed'))
          return { path: '/' }
        }
        // 其余未知错误：保留登录态，跳 500 错误页
        if (import.meta.env.DEV) console.error('[permission] route load error:', err)
        doneProgress()
        return { path: '/500' }
      } finally {
        // P1 修复：无论成功/失败都复位 isRelogin.show，
        // 否则残留 true 会导致 request.ts 中后续所有 401 不再触发"重新登录"对话框
        isRelogin.show = false
      }
    }
    return true
  } else {
    // 没有token
    if (isWhiteList(to.path)) {
      // 在免登录白名单，直接进入
      return true
    }
    doneProgress()
    // redirect 必须整体 encodeURIComponent：to.fullPath 含 `?a=1&b=2` 时若不转义，
    // `&b=2` 会被解析成 /login 自身的顶层 query，登录回跳后目标只剩 `?a=1` → 多参深链丢参。
    return `/login?redirect=${encodeURIComponent(to.fullPath)}` // 否则全部重定向到登录页
  }
})

router.afterEach(() => {
  doneProgress()
})
