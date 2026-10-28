/**
 * 跨标签页事件的**消费侧**（b122）。
 *
 * 通道与解析在 `utils/crossTab.ts`，这里只做"收到事件后，本标签页该做什么"。
 * 三类事件的处置各自有不可省略的边界：
 *
 * - `session-ended`：别的标签页已经登出/到期 ⇒ 本页必须**立即**收场。只清令牌
 *   不跳走会留下一个"看着像登录、实际没有会话"的页面（b101 立过的同一形状）；
 *   而重新走一次远程 logout 请求是错的——令牌已被对方删除，那条请求只会换来 401。
 *   所以走 `clearLocalSession()`（纯本地收尾）而不是 `logOut()`。
 * - `identity-changed`：别的标签页换了账号并拿到新令牌（Cookie 是共享的）。
 *   本页内存里仍是旧账号的 roles/permissions/用户信息，继续用新令牌发请求 =
 *   **把 A 的数据写进 B 的会话**。唯一可靠的复位是整页重载：它按新凭据重建
 *   store、动态路由与全部 chunk，SPA 内重登只会残留旧权限树。
 * - `language-changed`：只应用、不持久化（对方已经落过盘），失败保持原语言。
 */
import { ElMessage } from 'element-plus'
import i18n, { applyExternalLanguage } from '@/i18n'
import router from '@/router'
import { getToken } from '@/utils/auth'
import { goLogin } from '@/utils/navigation'
import useUserStore from '@/store/modules/user'
import { installCrossTabSync, type CrossTabEvent } from '@/utils/crossTab'

/**
 * 免登录页：会话结束时用户已经站在这些页面上，再跳一次毫无意义，
 * 而且会给正在走的登录流程制造一次不必要的导航。
 */
const ANONYMOUS_PATHS = ['/login', '/register', '/oauth-login', '/privacy', '/403', '/500', '/network-error']

function isAnonymousPath(path: string): boolean {
  return ANONYMOUS_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/** 单条事件的处置（导出供单测直接调用，避免只能靠真实 storage 事件驱动） */
export function handleCrossTabEvent(event: CrossTabEvent): void {
  if (event.type === 'language-changed') {
    void applyExternalLanguage(event.locale)
    return
  }
  if (event.type === 'session-ended') {
    const current = router.currentRoute.value
    if (isAnonymousPath(current.path)) return
    // 判"本页是否有会话"只能用**内存里的 token**，不能用 getToken()：
    // Cookie 是同一浏览器共享的，写方在广播之前就已经把它删了——用 Cookie 判
    // 会让接收页刚好读到"没有会话"，于是把真正要处理的那条事件静默吞掉
    // （b122 首轮实测：另一页 Cookie 已清、URL 却纹丝不动）。
    const store = useUserStore()
    if (!store.token) return
    const redirect = current.fullPath
    store.clearLocalSession()
    ElMessage.warning(i18n.global.t('common.crossTabLogout'))
    goLogin({ redirect, reason: 'cross-tab-logout' })
    return
  }
  // identity-changed：没有令牌时本页会在下次导航按新 Cookie 重建，不动作
  if (!getToken()) return
  const currentId = String(useUserStore().id || '')
  // 还没取到用户信息时不做判断：该标签页下一次 getInfo 用的已经是新 Cookie，
  // 按新身份建态即可；此时重载是白重载。
  if (!currentId || currentId === event.userId) return
  window.location.reload()
}

/**
 * 应用启动时安装一次。
 *
 * 不加幂等闸：`installCrossTabSync` 返回卸载函数，重复安装只会让同一事件被处理两次
 * （两条登出提示、两次导航）。main.ts 是唯一调用点，重复安装属接线错误，
 * 由 `crossTabWiring.guard.test.ts` 的"唯一调用点"判据拦住。
 */
export function installCrossTabHandlers(): () => void {
  return installCrossTabSync(handleCrossTabEvent)
}
