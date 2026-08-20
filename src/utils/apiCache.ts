/**
 * API 响应内存级缓存工具
 *
 * 设计目标：
 * 1. 短期 TTL（默认 30 秒）缓存，避免短时间内重复请求同一接口
 * 2. 并发请求去重：同一接口被同时调用多次时合并为一个 Promise
 * 3. 透明：调用方无感知，不破坏原 API 函数签名
 * 4. 可控：提供 clear / refresh 方法，支持用户操作（如下拉刷新）显式失效
 *
 * 适用范围：仅缓存全局共享数据（如部门树、菜单树、配置参数），
 * 不要缓存用户特定数据（如某角色的已选菜单、某用户的详情）。
 *
 * 缓存生命周期：内存级，页面刷新即清空；登出时由 user store 调用 clearAllApiCache 显式清理。
 */

interface CacheEntry<T> {
  /** 缓存数据 */
  data: T
  /** 过期时间戳（ms） */
  expireAt: number
}

/** 默认 TTL：30 秒 */
export const DEFAULT_API_CACHE_TTL = 30 * 1000

// 缓存表：key -> CacheEntry
const cacheMap = new Map<string, { entry: CacheEntry<unknown>; timer: ReturnType<typeof setTimeout> | null }>()

// 进行中的 Promise 表：key -> Promise，用于并发去重
const pendingMap = new Map<string, Promise<unknown>>()

/** 内部：判断缓存是否过期 */
function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() >= entry.expireAt
}

/** 内部：写入缓存并设置过期定时器（到期自动清理，避免内存泄漏） */
function setEntry<T>(key: string, data: T, ttl: number): void {
  // 先清理同 key 旧记录（含定时器）
  removeEntry(key)
  const entry: CacheEntry<T> = { data, expireAt: Date.now() + ttl }
  // setTimeout 自动过期；同时也在读取时按 isExpired 兜底，避免定时器误差
  const timer = setTimeout(() => {
    removeEntry(key)
  }, ttl + 100)
  // 允许进程退出不被该定时器挂住（Node 环境 / SSR 友好）
  // v8 ignore start —— 浏览器/jsdom 中 setTimeout 返回 number，unref 分支不可达（仅 Node 环境存在）
  if (
    typeof timer === 'object' &&
    timer &&
    'unref' in timer &&
    typeof (timer as { unref?: () => void }).unref === 'function'
  ) {
    ;(timer as { unref: () => void }).unref()
  }
  // v8 ignore stop
  cacheMap.set(key, { entry: entry as CacheEntry<unknown>, timer })
}

/** 内部：移除某 key 的缓存及定时器 */
function removeEntry(key: string): void {
  const record = cacheMap.get(key)
  if (record) {
    // v8 ignore next —— timer 由 setEntry 恒写入，record 存在时必非空，false 分支不可达
    if (record.timer) {
      clearTimeout(record.timer)
    }
    cacheMap.delete(key)
  }
}

/**
 * 创建带缓存的 API 包装函数
 *
 * @param key   缓存 key，需唯一；建议形如 `module:action` 或包含入参，避免冲突
 * @param fn    原始 API 函数（返回 Promise）
 * @param ttl   缓存有效期（ms），默认 30s
 *
 * @returns 与 fn 同签名的函数；调用方无感知
 *
 * 行为说明：
 * - 命中未过期缓存 → 直接返回 resolved Promise
 * - 并发调用 → 复用同一个 pending Promise
 * - 接口失败 → 不写缓存，并清理 pending（避免下次永久拿到 rejected Promise）
 */
export function cachedApi<TArgs extends unknown[], TResult>(
  key: string | ((...args: TArgs) => string),
  fn: (...args: TArgs) => Promise<TResult>,
  ttl: number = DEFAULT_API_CACHE_TTL
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs): Promise<TResult> => {
    const cacheKey = typeof key === 'function' ? key(...args) : key

    // 1. 命中未过期缓存：直接返回
    const record = cacheMap.get(cacheKey)
    if (record && !isExpired(record.entry)) {
      return Promise.resolve(record.entry.data as TResult)
    }

    // 2. 命中进行中的 Promise：复用，做并发去重
    const pending = pendingMap.get(cacheKey)
    if (pending) {
      return pending as Promise<TResult>
    }

    // 3. 发起新请求
    const p = fn(...args)
      .then((result) => {
        // 仅成功时写缓存
        setEntry(cacheKey, result, ttl)
        return result
      })
      .finally(() => {
        // 无论成功失败，都清理 pending，避免失败后该 key 永久卡住
        pendingMap.delete(cacheKey)
      })

    pendingMap.set(cacheKey, p)
    return p
  }
}

/**
 * 显式失效指定 key 的缓存（下次调用会重新请求）
 *
 * @param key 缓存 key（与创建时一致）
 */
export function invalidateApiCache(key: string): void {
  removeEntry(key)
}

/**
 * 清空所有 API 缓存（包括 pending Promise）
 *
 * 用途：用户登出 / 切换角色 / 显式刷新全部等场景
 */
export function clearAllApiCache(): void {
  for (const [, record] of cacheMap) {
    // v8 ignore next —— timer 由 setEntry 恒写入，record 存在时必非空，false 分支不可达
    if (record.timer) {
      clearTimeout(record.timer)
    }
  }
  cacheMap.clear()
  pendingMap.clear()
}

/**
 * 按前缀批量失效缓存
 *
 * 用途：批量修改某类配置时，一次性失效该前缀下所有 key（避免逐个调用 invalidateApiCache）
 * 例如：参数配置页修改后调用 `invalidateByPrefix('system:config:configKey:')`
 * 即可让所有 getConfigKey 调用下次重新请求后端
 *
 * @param prefix  缓存 key 前缀
 */
export function invalidateByPrefix(prefix: string): void {
  for (const [key, record] of cacheMap) {
    if (key.startsWith(prefix)) {
      // v8 ignore next —— timer 由 setEntry 恒写入，record 存在时必非空，false 分支不可达
      if (record.timer) {
        clearTimeout(record.timer)
      }
      cacheMap.delete(key)
      pendingMap.delete(key)
    }
  }
}

/**
 * 刷新指定 key 的缓存（强制重新请求一次并更新缓存）
 *
 * @param key      缓存 key
 * @param fn       原始 API 函数
 * @param ttl      缓存有效期（ms）
 */
export function refreshCachedApi<TArgs extends unknown[], TResult>(
  key: string | ((...args: TArgs) => string),
  fn: (...args: TArgs) => Promise<TResult>,
  ttl: number = DEFAULT_API_CACHE_TTL
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs): Promise<TResult> => {
    const cacheKey = typeof key === 'function' ? key(...args) : key
    // 失效旧缓存（含 pending），强制重新拉取
    removeEntry(cacheKey)
    pendingMap.delete(cacheKey)
    return cachedApi(key, fn, ttl)(...args)
  }
}
