/**
 * 跨标签页事件的**唯一**通道（b122）。
 *
 * ## 立的案
 *
 * 令牌存在 Cookie 里（`utils/auth.ts` 用 js-cookie），而 Cookie 的变化**不产生
 * `storage` 事件**。于是同一个浏览器里开两个标签页时，A 页退出登录/换账号，
 * B 页完全不知道：界面仍显示上一个身份的用户名与菜单，按钮继续按旧权限渲染，
 * 直到下一次请求 401 才被动收场。这不是"少一个提示"，而是**两个标签页对
 * 「我是谁」的判断已经分叉**——越晚收场，越可能把 A 账号的数据在 B 账号的
 * 令牌下提交。
 *
 * 解法是把"会话/身份/语言发生了变化"显式广播成一条 localStorage 记录：
 * `storage` 事件天然只在**其他**文档里触发，写方不会收到自己的回声，
 * 不需要额外的来源标记。读取侧一律经过本模块的严格解析——存储是用户可改的
 * 外部输入，不是可信通道（同 AGENTS「前端外部输入归一」）。
 *
 * 刻意**不做**的：主题/尺寸/布局偏好的跨标签同步。它们是纯展示偏好，
 * 不会让两个标签页对数据归属产生分歧；而 `useDark` 自己还有一份
 * `vueuse-color-scheme` 键，只同步其中一半会造出更隐蔽的半套状态。
 */
import { getItem, setItem, storage } from '@/utils/webStorage'

/** 广播键：带命名空间前缀，其余键的 storage 事件一律不看 */
export const CROSS_TAB_KEY = 'stepby:cross-tab'

export type AppLocaleValue = 'zh-CN' | 'en-US'

/**
 * 事件形状。
 *
 * `at` 是写入时刻（毫秒）：读取侧只用它做诊断与"过期事件"判断，
 * **不**拿它当排序依据——storage 事件按写入顺序到达，时间戳同毫秒完全可能。
 */
export type CrossTabEvent =
  | { type: 'session-ended'; at: number; reason: 'logout' | 'expired' }
  | { type: 'identity-changed'; at: number; userId: string }
  | { type: 'language-changed'; at: number; locale: AppLocaleValue }

const EVENT_TYPES = new Set(['session-ended', 'identity-changed', 'language-changed'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 严格解析一条广播。
 *
 * 畸形值一律返回 `null`（调用方不动作）而不是抛：存储可能被其他页面、
 * 旧版本代码或用户手工写入，解析失败只意味着"这条不能信"，
 * 不该让整个应用停在事件回调里。`import.meta.env.DEV` 下留一条线索，
 * 否则"事件没生效"会被误诊成监听没装上。
 */
export function parseCrossTabEvent(raw: unknown): CrossTabEvent | null {
  if (typeof raw !== 'string' || raw === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    if (import.meta.env.DEV) console.warn('[crossTab] 忽略无法解析的广播')
    return null
  }
  if (!isPlainObject(parsed)) return null
  const type = parsed.type
  const at = parsed.at
  if (typeof type !== 'string' || !EVENT_TYPES.has(type)) return null
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null
  if (type === 'session-ended') {
    const reason = parsed.reason
    if (reason !== 'logout' && reason !== 'expired') return null
    return { type, at, reason }
  }
  if (type === 'identity-changed') {
    const userId = parsed.userId
    if (typeof userId !== 'string' || userId.trim() === '') return null
    return { type, at, userId: userId.trim() }
  }
  const locale = parsed.locale
  if (locale !== 'zh-CN' && locale !== 'en-US') return null
  return { type: 'language-changed', at, locale }
}

/**
 * 写一条广播。返回是否真的落盘（存储被禁/配额满 ⇒ `false`，其他标签页不会知晓）。
 *
 * 广播是**尽力而为**的旁路：写不进去不影响本标签页已经完成的动作
 * （登出本身已生效），所以调用方不因 `false` 回滚；但返回值保留，
 * 便于单测与将来做"通道不可用时降级提示"。
 */
export function announceCrossTabEvent(event: CrossTabEvent): boolean {
  return setItem(CROSS_TAB_KEY, JSON.stringify(event))
}

/**
 * 本标签页的会话已结束（主动登出或到期），通知其他标签页收场。
 * 返回是否真的落盘——调用方不因此回滚（登出本身已生效），但单测与降级提示需要它。
 */
export function announceSessionEnded(reason: 'logout' | 'expired' = 'logout'): boolean {
  return announceCrossTabEvent({ type: 'session-ended', at: Date.now(), reason })
}

/**
 * 本标签页登录身份已确定（getInfo 成功）时广播 userId。
 *
 * 只有身份**变化**才写：每次页面加载都广播会让其他标签页无谓地解析一遍；
 * 读取侧同 id 时本来就忽略，但"只在变化时写"让通道语义更清晰——
 * 这条事件的含义是"身份换了"，而不是"我读到了自己的身份"。
 */
export function announceIdentityIfChanged(userId: string): boolean {
  const id = userId.trim()
  if (!id) return false
  const prev = parseCrossTabEvent(getItem(CROSS_TAB_KEY))
  if (prev?.type === 'identity-changed' && prev.userId === id) return false
  return announceCrossTabEvent({ type: 'identity-changed', at: Date.now(), userId: id })
}

/** 本标签页用户切换了界面语言，通知其他标签页跟随（见 applyExternalLanguage） */
export function announceLanguageChanged(locale: AppLocaleValue): boolean {
  return announceCrossTabEvent({ type: 'language-changed', at: Date.now(), locale })
}

/**
 * 安装监听并返回卸载函数（幂等性由调用方保证：应用启动只调一次）。
 *
 * 只接受 `localStorage` 的广播：`sessionStorage` 按标签页隔离，
 * 它的 storage 事件永远只在本页触发，用来做跨页同步只会静默无效。
 * `event.newValue` 为 `null` 表示该键被删除，按"没有事件"处理。
 */
export function installCrossTabSync(dispatch: (event: CrossTabEvent) => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== CROSS_TAB_KEY) return
    // 判别事件来自哪个存储区：同源 iframe 里写 sessionStorage 也会触发 storage 事件，
    // 而本通道只广播 localStorage。句柄经 `storage('local')` 取（裸访问被 b89 守卫禁止）；
    // 取不到句柄时无法证明来源，按"不可信"忽略（fail-closed，事件只会在存储可用时到来）。
    const localArea = storage('local')
    if (event.storageArea && event.storageArea !== localArea) return
    const parsed = parseCrossTabEvent(event.newValue)
    if (parsed) dispatch(parsed)
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
