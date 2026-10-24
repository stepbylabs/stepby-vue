/**
 * 浏览器存储的**唯一**访问通道（b89 项 8）。
 *
 * ## 立的案
 *
 * `src/plugins/cache.ts` 原先写的是 `if (!localStorage) return`——那句挡的是
 * "**全局对象不存在**"（只在非浏览器环境成立），而真实浏览器里坏的是另外两件事：
 *
 * 1. **读那个属性本身就会抛**。Safari 隐私模式、Chrome「阻止第三方 Cookie/站点数据」、
 *    WebView 注入被禁的场合，访问 `window.localStorage` 直接抛 `SecurityError`。
 *    此时 `!localStorage` 这个表达式自己就炸了，守卫形同虚设。
 * 2. **`setItem` 会抛 `QuotaExceededError`**。配额满（本仓写进 storage 的东西不少：
 *    `layout-setting`、`user-prefs`、锁屏载荷、列显隐记忆、搜索条件、菜单收藏…）
 *    时，一次写入抛穿出去 = 用户点"保存"什么也没发生，或在登录链路上
 *    （`token` 落 storage 失败）**白屏**。
 *
 * 原先 18 处直接调用点里，`removeItem` 甚至**一处都没有守卫**（cache.ts:49/93、
 * lock.ts:32/38/44/75/77）。"取不到存储"这件事的三种结局（读不到 / 写不进 / 删不掉）
 * 都必须是**降级**，不是异常：本模块因此把三类操作各自收成一个不抛的函数。
 *
 * ## 取向
 *
 * - **不自动清理**别人的键：写不进去时最危险的动作是"删掉旧数据腾地方"——
 *    那会静默丢用户设置。这里只上报（DEV warn）并让调用方决定降级路径。
 * - **不缓存探测结果**：可用性由浏览器策略决定，而策略会在运行期变（用户在
 *    设置里关掉"允许站点数据"、隐私模式切换、iframe 被限）。缓存过一次就永远
 *    以为可用，等于把崩溃点从"取句柄"挪到"第一次真实写入"再挪进缓存里。
 *    取句柄本身只是一次全局属性读取，省不下什么。
 * - 返回 `false`/`null` 而不是抛：调用方**可以**关心失败（`setItem` 的返回值），
 *    但不关心也不会崩——这正是缺的那一半（"取不到"不得读成"没有失败"，AGENTS ⑧ 同族）。
 */

export type StorageKind = 'local' | 'session'

/** 探测用的键名：带 `__` 前后缀避免与业务键冲突，探完立刻删除 */
const PROBE_KEY = '__stepby_storage_probe__'

function rawStore(kind: StorageKind): Storage | null {
  try {
    // 注意：这一行本身就可能在 Safari 隐私模式下抛 SecurityError
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

/**
 * 取存储句柄（读不到 ⇒ `null`，永不抛）。
 *
 * 这里**只**判"句柄取不取得到"；真正的写入失败（配额满 / 禁写）由各操作自己的
 * try/catch 兜——因为那些是**每次操作**都可能遇到的，而句柄缺失是全局态。
 */
export function storage(kind: StorageKind): Storage | null {
  return rawStore(kind)
}

/**
 * 存储是否**真的可写**（供 UI 决定要不要显示"记住我 / 锁屏可恢复"这类依赖持久化的选项）。
 *
 * 为什么要写删一次探针：`window.localStorage` 在某些被禁的上下文里**读得到对象**、
 * 但任何写入都抛（Safari 旧版本行为）。只判"对象在不在"会把不可用误判为可用，
 * 于是 UI 承诺"下次还记得你"而下次什么都没有——那是静默失效，比崩更难发现。
 */
export function storageAvailable(kind: StorageKind = 'local'): boolean {
  const s = rawStore(kind)
  if (!s) {
    return false
  }
  try {
    s.setItem(PROBE_KEY, '1')
    s.removeItem(PROBE_KEY)
    return true
  } catch {
    return false
  }
}

/**
 * 读。**键不存在**与**存储坏了**都回 `null`——两者对调用方的动作相同
 * （回落到缺省值），区别只留在 DEV 控制台，避免"读不到 = 坏了"的误诊。
 */
export function getItem(key: string, kind: StorageKind = 'local'): string | null {
  const s = storage(kind)
  if (!s) {
    warnOnce(kind, 'unavailable')
    return null
  }
  try {
    return s.getItem(key)
  } catch (e) {
    warnOnce(kind, 'failed', e)
    return null
  }
}

/**
 * 写。返回是否真的落进去了（配额满 / 存储被禁 ⇒ `false`）。
 *
 * 调用方**可以**据此提示用户"本设置不会被记住"；忽略返回值也不会崩，
 * 但**不得**在返回 false 时继续当作已保存（那等于静默丢弃用户操作）。
 */
export function setItem(key: string, value: string, kind: StorageKind = 'local'): boolean {
  const s = storage(kind)
  if (!s) {
    warnOnce(kind, 'unavailable')
    return false
  }
  try {
    s.setItem(key, value)
    return true
  } catch (e) {
    // QuotaExceededError 走这一支：绝不"顺手删掉别的键腾地方"（见模块头取向）
    warnOnce(kind, 'failed', e)
    return false
  }
}

/** 删。存储不可用或键不存在都按"目标态已达成"处理（幂等，不抛） */
export function removeItem(key: string, kind: StorageKind = 'local'): void {
  const s = storage(kind)
  if (!s) {
    warnOnce(kind, 'unavailable')
    return
  }
  try {
    s.removeItem(key)
  } catch (e) {
    warnOnce(kind, 'failed', e)
  }
}

/** JSON 读：脏数据（解析失败）返回 `null` 并清掉那一行，避免每次访问都抛 */
export function getJSON<T = unknown>(key: string, kind: StorageKind = 'local'): T | null {
  const raw = getItem(key, kind)
  if (raw == null) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch (e) {
    // v8 ignore next —— DEV=false 分支仅在生产构建可达，Vitest 恒为 DEV 模式
    if (import.meta.env.DEV) console.warn('[storage] JSON 解析失败，已清理脏数据:', key, e)
    removeItem(key, kind)
    return null
  }
}

/** JSON 写（不抛；失败返回 false） */
export function setJSON(key: string, value: unknown, kind: StorageKind = 'local'): boolean {
  return setItem(key, JSON.stringify(value), kind)
}

/**
 * 每种类型只 warn 一次：存储坏了以后每个动作都调一次 = 控制台刷满噪声，
 * 反而把真正有用的那条日志淹掉（AGENTS C.9"机器遥测不得刷成流水"同族）。
 *
 * 两种成因必须分开写：`unavailable` 是"这个浏览器根本不给存储"（隐私模式 / 站点数据被禁），
 * `failed` 是"存储存在但这次操作被拒"（配额满）。把后者报成前者会引导人去改浏览器设置，
 * 而真正该做的是清磁盘——文案指错方向等于没有文案。
 */
const warned = new Set<StorageKind>()
function warnOnce(kind: StorageKind, reason: 'unavailable' | 'failed', e?: unknown): void {
  if (warned.has(kind)) {
    return
  }
  warned.add(kind)
  // v8 ignore next —— 同上：DEV=false 分支仅生产可达
  if (import.meta.env.DEV) {
    const head =
      reason === 'unavailable'
        ? `[storage] ${kind}Storage 不可用（隐私模式或站点数据被禁用），相关设置本次不会被记住`
        : `[storage] ${kind}Storage 读写失败（多为配额已满），相关设置本次不会被记住`
    console.warn(head, e ?? '')
  }
}

/** 仅供测试：清掉"每种类型只 warn 一次"的去重状态（生产码不调用） */
export function __resetStorageWarnDedupeForTest(): void {
  warned.clear()
}
