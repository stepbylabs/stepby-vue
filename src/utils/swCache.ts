/**
 * Service Worker 持久缓存的边界（b115）
 *
 * 立的案（真机取证，`tests/e2e/_tmp/probe-b115-sw-cache.mjs` 与 `-sw-uploads.mjs`）：
 * ① 受鉴权的 `GET /prod-api/getInfo` 响应头是 `Cache-Control: no-store, no-cache,
 *    must-revalidate, private`（`middleware/security_headers.rs` 为 API 显式加的），
 *    但 SW 的 `stepby-api` 规则照存不误；断网后同一 URL **静默回放** 200 / 744 字节 / 3ms。
 * ② 上传预览 `GET /uploads/0/file/<uuid>.png` 是**受鉴权**路由（未带凭据 401），
 *    而静态规则 `\.(?:png|jpg|…)$` 按扩展名命中它 ⇒ 以 cache-first 存进 `stepby-static`
 *    七天；实测第二次请求 `cached=200`，断网回放 200 / 70 字节 / 4ms。
 *
 * 两条合起来的后果是**缓存活过会话边界**：同一台浏览器换账号（或登出后按返回键）后，
 * 上一账号的响应与上传件仍在 Cache Storage 里可读；而全仓 `caches.delete` 一处都没有。
 * 对照：内存层早就立过同一条纪律（`utils/apiCache.ts` 的 30 秒 TTL + `logOut` 里
 * `clearAllApiCache()`，注释写着"防止切换账号后看到上一个账号权限范围内的数据"）——
 * SW 这一层完全在它的视野之外，因为 SW 的缓存住在浏览器进程里，不在 store 里。
 *
 * 本模块是该层唯一的事实源：缓存名、档位归一、回收动作。三档口径：
 * - **默认 `off`**：SW 只缓存**公共静态目录**（`/static`、`/assets`、`/pwa`，来自构建产物）；
 *   API 与 `/uploads/**` 一概不进缓存 ⇒ 失败走 b106–b109 已经做好的可见失败态。
 * - **`network-first`（显式 opt-in）**：弱网演示档，仅 GET、仅 200、TTL 60 秒、会话切换即清。
 *   该档**显式覆盖服务端的 no-store**，属于高危能力，故默认关、且不继承任何旧缓存内容。
 * - **旧档回收**：`stepby-api` / `stepby-static` 两个历史缓存名里的内容不可信（可能已有他人数据），
 *   启动时无条件删除；新策略一律用新名字，不读旧档一个字节。
 */

/** 历史缓存名：只要浏览器里出现就删掉（内容来源不可信） */
export const LEGACY_SW_CACHES = ['stepby-api', 'stepby-static'] as const

/** 公共静态资源缓存：只由 `PUBLIC_STATIC_URL_PATTERN` 写入 */
export const PUBLIC_STATIC_CACHE = 'stepby-public-static'

/** 受鉴权 API 缓存（opt-in 档；默认不存在） */
export const API_CACHE = 'stepby-api-v2'

/** API 缓存档位：`off`（默认，关闭态即安全态）/ `network-first`（弱网演示档） */
export type ApiCacheMode = 'off' | 'network-first'

/** 合法档位（有序度无关，纯值域；值域外一律回落 `off`） */
export const API_CACHE_MODES: readonly ApiCacheMode[] = ['off', 'network-first']

export const DEFAULT_API_CACHE_MODE: ApiCacheMode = 'off'

/**
 * 归一档位：值域外（拼错、大小写不符、空串）一律回落 `off`。
 * 与《开关规范》第 2 条一致：非法取值不静默生效，而是取安全档。
 */
export function normalizeApiCacheMode(raw: unknown): ApiCacheMode {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return (API_CACHE_MODES as readonly string[]).includes(v) ? (v as ApiCacheMode) : DEFAULT_API_CACHE_MODE
}

/** 该档是否启用 API 缓存 */
export function isApiCacheEnabled(mode: unknown): boolean {
  return normalizeApiCacheMode(mode) !== 'off'
}

/**
 * 删除指定名字的缓存（尽力而为，**永不抛错**）。
 * 返回实际被删掉的名字，便于调用方留痕；`caches` 不存在（SSR / jsdom / 老浏览器）时返回空数组。
 */
export async function purgeCaches(names: readonly string[]): Promise<string[]> {
  if (typeof caches === 'undefined' || typeof caches.delete !== 'function') return []
  const purged: string[] = []
  for (const name of names) {
    try {
      if (await caches.delete(name)) purged.push(name)
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[swCache] 删除缓存失败', name, err)
    }
  }
  return purged
}

/**
 * 启动时回收历史档。
 * **刻意不删** `stepby-api-v2`：opt-in 档的离线数据要能跨刷新存活（它由会话切换负责清）。
 */
export async function purgeLegacySwCaches(): Promise<string[]> {
  return purgeCaches(LEGACY_SW_CACHES)
}

/**
 * 会话切换时回收：登录成功、登出都调用。
 * 覆盖历史档 + opt-in 的 API 档（后者的内容与"上一个凭据"绑定，换人即失效）。
 */
export async function purgeSessionSwCaches(): Promise<string[]> {
  return purgeCaches([...LEGACY_SW_CACHES, API_CACHE])
}
