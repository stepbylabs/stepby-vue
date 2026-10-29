import { VitePWA } from 'vite-plugin-pwa'
import type { PluginOption } from 'vite'
import { buildRuntimeCaching } from './pwaRuntimeCaching.ts'

/**
 * PWA 支持（P3-23）
 * - manifest：可将管理系统"安装为桌面应用 / 添加到主屏"。
 * - workbox：预缓存构建静态资源（默认 precache，cache-first）；运行时缓存见
 *   `pwaRuntimeCaching.ts`——**只缓存公共静态目录**，受鉴权的 API 与 `/uploads/**`
 *   一概不进缓存（b115：实测旧规则会把服务端标了 `no-store` 的响应与上传预览图
 *   写进磁盘并跨会话回放，见 `src/utils/swCache.ts` 文件头）。
 * - devOptions.enabled = false：开发模式不注册 Service Worker，仅生产构建生效。
 */
export default function createPwaPlugin(viteEnv: Record<string, string> = {}): PluginOption {
  return VitePWA({
    // autoUpdate：SW 安装后自动检查并更新（避免用户长期停留在旧缓存版本）
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico'],
    manifest: {
      name: 'Stepby 管理系统',
      short_name: 'Stepby',
      description: '基于 Axum + Vue 3 + Element Plus 的企业级后台管理系统',
      lang: 'zh-CN',
      theme_color: '#409eff',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      icons: [
        { src: '/pwa/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/pwa/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' }
      ]
    },
    workbox: {
      // 预缓存全部构建产物（保留"访问任意页面都能离线"的能力；b120 分包后实测 576 条）。
      // b120 恢复路由级分包后最大单文件是 html2pdf chunk（~0.9MB raw），上限取 5MB：
      // 既远高于实测最大值，又能在将来某个 chunk 意外膨胀时让构建失败而不是悄悄预缓存。
      // （原 20MB 是为单 chunk 时代放宽的，见 vite.config.ts 的 b120 注释。）
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // 预缓存全部构建产物（带 hash 文件名天然 cache-first；入口 index.html 经 navigateFallback 兜底）
      globPatterns: ['**/*.{js,html,css,svg,ico,png,woff2,eot,ttf}'],
      navigateFallback: '/index.html',
      // navigateFallbackDenylist：后端提供的路由绝不能被 SW 兜底成 SPA shell（/index.html）。
      // 否则 embed 模式下前端"系统接口"页 iframe 请求 /swagger-ui/index.html 时，SW 会返回
      // 缓存的 SPA index.html（其响应带 X-Frame-Options: DENY），触发浏览器
      // "Refused to display ... in a frame" 拦截。这些路径必须由后端原样返回。
      // /sso/：OIDC Provider 后端协议端点（/sso/authorize、/sso/logout）。它们是浏览器顶层
      // 导航（RP 跳转到 authorize），必须打到后端拿 302；若被兜底成 index.html，SPA 路由器
      // 会命中 404 catch-all，导致已注册过 SW 的浏览器（autoUpdate 即 skipWaiting+clientsClaim）
      // 永远无法完成 SSO 授权/登出链路。注意 /sso-consent 是 SPA 路由，不能被 /^\/sso\// 匹配。
      // /oauth2/callback：第三方登录（OAuth 客户端）由提供商 302 回本后端的顶层导航，同理必须
      // 打到后端换 token 再 302 到 SPA 路由 /oauth-login；/oauth2/ 其余是 API fetch，不受影响。
      navigateFallbackDenylist: [/^\/sso\//, /^\/oauth2\/callback/, /^\/swagger-ui/, /^\/v3\/api-docs/, /^\/actuator/],
      // b115：运行时缓存只保留"公共静态目录"一条；API 缓存是显式 opt-in 档
      // （`VITE_PWA_API_CACHE=network-first`，默认 off）。判据见
      // `src/utils/pwaApiCachePolicy.guard.test.ts`（从 .env 派生基址逐个断言不命中）。
      runtimeCaching: buildRuntimeCaching(viteEnv.VITE_PWA_API_CACHE)
    },
    // 开发环境不启用 SW（避免缓存干扰开发调试/接口代理）；生产构建才生成 manifest + sw.js
    devOptions: { enabled: false }
  })
}
