/**
 * PWA 运行时缓存规则（b115）
 *
 * 抽成**纯函数**而不是写在 `pwa.ts` 的对象字面量里，是因为它要被判据读：
 * `src/utils/pwaApiCachePolicy.guard.test.ts` 直接调用 `buildRuntimeCaching()` 拿到真实规则，
 * 用 `.test()` 对**从 .env 文件派生**的 API 基址逐个断言"没有任何规则命中"——
 * 判据读的是配置的语义（正则真的跑一遍），不是源码文本（㊸：规则必须语义读配置）。
 *
 * 规则只有两条，且各自有边界：
 * 1. **公共静态目录**（`/static`、`/assets`、`/pwa`）：StaleWhileRevalidate。
 *    这些是构建产物里的公开资源，URL 里不带用户身份。
 *    **刻意不用扩展名正则**：`/uploads/{tid}/{kind}/{file}` 是受鉴权的上传预览
 *    （`router/mod.rs::uploads_routes`，未带凭据 401），扩展名规则会把它一起缓存。
 * 2. **API（仅 opt-in 档）**：NetworkFirst、仅 GET、仅 200、TTL 60 秒。
 *    默认档不生成这条规则——服务端对 API 响应显式声明了 `no-store`
 *    （`middleware/security_headers.rs`），SW 覆盖它就是把敏感响应写进磁盘。
 *
 * 两条正则都按**绝对 URL** 形态写：workbox 的 `RegExpRoute` 拿 `request.url` 匹配
 * （b115 实测：`^/static/` 形态永远不命中，规则成了死代码）。
 */

import type { VitePWAOptions } from 'vite-plugin-pwa'
import { API_CACHE, PUBLIC_STATIC_CACHE, isApiCacheEnabled, type ApiCacheMode } from '../../src/utils/swCache.ts'

/**
 * 公共静态目录：只有这三个前缀进缓存；`/uploads/**` 与 API 路径都不匹配。
 *
 * **必须按绝对 URL 写锚点**：workbox 把 `urlPattern` 交给 `RegExpRoute`，它拿
 * `request.url`（`http://host/static/…`）去 `.test()`——写成 `^/static/` 这种"路径形态"
 * 的正则**永远不命中**（b115 自曝：M96 对照组实测 `stepby-public-static` 从未被创建，
 * 那条规则是死代码；而单测当时喂的是相对路径，所以照常绿）。
 * `[^/]+` 不用写死主机：SW 本就是 origin 作用域的。
 */
export const PUBLIC_STATIC_URL_PATTERN = /^https?:\/\/[^/]+\/(?:static|assets|pwa)\//

/** API 前缀：与后端 `router/mod.rs` 同时 nest 的三种基址一致（嵌入档 base 为空，不命中本规则） */
export const API_URL_PATTERN = /^https?:\/\/[^/]+\/(?:dev-api|prod-api|stage-api)\//

/**
 * 直接用 `vite-plugin-pwa` 暴露的 workbox 选项类型（不 import `workbox-build`：
 * 它是插件的传递依赖，pnpm 布局下不保证可解析；而类型不合格时 tsc 会在 pwa.ts 的赋值处报错）。
 */
type WorkboxOptions = NonNullable<VitePWAOptions['workbox']>
export type RuntimeCacheRule = NonNullable<WorkboxOptions['runtimeCaching']>[number]

/**
 * 产出 workbox `runtimeCaching` 数组。
 * @param rawMode `VITE_PWA_API_CACHE` 原值；缺省/非法一律按 `off`（关闭态即安全态）
 */
export function buildRuntimeCaching(rawMode?: string): RuntimeCacheRule[] {
  const rules: RuntimeCacheRule[] = [
    {
      urlPattern: PUBLIC_STATIC_URL_PATTERN,
      handler: 'StaleWhileRevalidate',
      method: 'GET',
      options: {
        cacheName: PUBLIC_STATIC_CACHE,
        // 只认 200：0（opaque）也会被默认放行，而 opaque 响应无法判断来源
        cacheableResponse: { statuses: [200] },
        expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }
      }
    }
  ]
  if (isApiCacheEnabled(rawMode)) {
    rules.push({
      urlPattern: API_URL_PATTERN,
      handler: 'NetworkFirst',
      method: 'GET',
      options: {
        cacheName: API_CACHE,
        networkTimeoutSeconds: 3,
        cacheableResponse: { statuses: [200] },
        // 60 秒：只够扛住一次网络抖动，且会话切换时本模块之外还会整档删除
        expiration: { maxEntries: 100, maxAgeSeconds: 60 }
      }
    })
  }
  return rules
}

/** 供判据与调用方读档位名（避免各处自己拼字符串） */
export function apiCacheModeOf(rawMode?: string): ApiCacheMode {
  return isApiCacheEnabled(rawMode) ? 'network-first' : 'off'
}
