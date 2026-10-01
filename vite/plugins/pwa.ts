import { VitePWA } from 'vite-plugin-pwa'
import type { PluginOption } from 'vite'

/**
 * PWA 支持（P3-23）
 * - manifest：可将管理系统"安装为桌面应用 / 添加到主屏"。
 * - workbox：预缓存构建静态资源（默认 precache，cache-first）；运行时缓存——
 *   · API 请求（/dev-api、/prod-api、/stage-api 前缀）networkFirst，且仅 GET 幂等接口，
 *     敏感/非幂等的 POST/PUT/DELETE 一律不缓存，保证登录态等接口总是走真实网络。
 * - devOptions.enabled = false：开发模式不注册 Service Worker，仅生产构建生效。
 */
export default function createPwaPlugin(): PluginOption {
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
      // 项目因 Rolldown 跨 chunk 链接 bug 采用 codeSplitting:false（单 chunk 约 9.5MB），
      // 超出 workbox 默认 2MiB 预缓存上限会导致构建失败，故抬升上限以允许预缓存整个应用包
      // （否则离线/优先缓存无法命中主 JS）。参见 vite.config.ts 中该 workaround 的说明。
      maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
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
      runtimeCaching: [
        {
          // API：networkFirst（先网络、离线兜底旧缓存），仅 GET 幂等接口
          // POST/PUT/DELETE 天然不被本策略命中，不会误缓存登录、提交等敏感请求。
          urlPattern: /(?:\/dev-api\/|\/prod-api\/|\/stage-api\/)/,
          handler: 'NetworkFirst',
          method: 'GET',
          options: {
            cacheName: 'stepby-api',
            networkTimeoutSeconds: 3,
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 }
          }
        },
        {
          // 同源静态资源（图片等非预缓存资源）：cache-first，快速离线复用
          urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|woff2?)$/,
          handler: 'StaleWhileRevalidate',
          method: 'GET',
          options: {
            cacheName: 'stepby-static',
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }
          }
        }
      ]
    },
    // 开发环境不启用 SW（避免缓存干扰开发调试/接口代理）；生产构建才生成 manifest + sw.js
    devOptions: { enabled: false }
  })
}
