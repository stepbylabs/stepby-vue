import { defineConfig, loadEnv } from 'vite'
import type { Plugin, ProxyOptions } from 'vite'
import path from 'path'
import { readFileSync } from 'fs'
import createVitePlugins from './vite/plugins'

// 读取 package.json 版本号
function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// 统一构造开发/预览代理配置：覆盖所有环境的请求基址前缀
// （dev → /dev-api，prod → /prod-api，stage → /stage-api），将对应前缀剥离后转发到后端。
// 这样 `vite preview` 预览生产/预发构建产物时，接口也能正确代理（否则 /prod-api、/stage-api 会 404）。
function buildProxy(target: string): Record<string, ProxyOptions> {
  return {
    '/dev-api': {
      target,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/dev-api/, '')
    },
    '/prod-api': {
      target,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/prod-api/, '')
    },
    '/stage-api': {
      target,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/stage-api/, '')
    },
    // WebSocket 代理：实时通知推送（/ws?token=xxx）
    // 前端 wsService 连接 ws://localhost/ws，需代理到后端 8080
    '/ws': {
      target,
      changeOrigin: true,
      ws: true
    },
    // springdoc proxy
    '^/v3/api-docs/(.*)': {
      target,
      changeOrigin: true
    },
    // Swagger UI 静态页面（接口文档 iframe）：与 /v3/api-docs 同属 springdoc，
    // 同样需要代理到后端才能在 dev/preview 下工作（生产为同源直出，无需代理）
    '/swagger-ui': {
      target,
      changeOrigin: true
    }
  }
}

// 资源提示注入（R102-PRELOAD-007/008、R102-CRP-009）：
// 在 .env.* 配置 VITE_PRECONNECT_DOMAINS（逗号分隔，含 scheme），构建时为每个域注入
// <link rel="preconnect" ...> + <link rel="dns-prefetch" ...>。
// 本项目默认全部同源（无第三方域名）⇒ 默认空 ⇒ 不注入任何标签（零开销）。
// 接入 CDN / 对象存储后配置该键即可获得提前建连收益。
function resourceHintsPlugin(domains: string[]): Plugin {
  const clean = domains.map((d) => d.trim()).filter(Boolean)
  return {
    name: 'stepby-resource-hints',
    transformIndexHtml() {
      return clean.flatMap((href) => [
        { tag: 'link', attrs: { rel: 'preconnect', href, crossorigin: '' } },
        { tag: 'link', attrs: { rel: 'dns-prefetch', href } }
      ])
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd())
  const { VITE_APP_ENV } = env
  // 开发/预览代理目标地址：默认指向本地 8080 后端；
  // 可通过 .env.* 中的 VITE_PROXY_TARGET 覆盖（例如后端部署在其他主机/端口）。
  const baseUrl = env.VITE_PROXY_TARGET || 'http://localhost:8080'
  const appVersion = readPackageVersion()
  const buildTime = new Date().toISOString()
  // preconnect/dns-prefetch 域名清单（逗号分隔）；未配置 ⇒ 空数组 ⇒ 不注入
  const preconnectDomains = (env.VITE_PRECONNECT_DOMAINS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean)
  return {
    // 部署生产环境和开发环境下的URL。
    // 默认情况下，vite 会假设你的应用是被部署在一个域名的根路径上
    // 例如 https://stepby.tzkj.net/。如果应用被部署在一个子路径上，你就需要用这个选项指定这个子路径。
    // CDN 集成点（R102-CDN-001/002）：在 .env.production 设 VITE_APP_CDN_BASE=https://cdn.example.com/
    // 即可把全部静态资源引用指向 CDN 域名（index.html 仍由源站托管）。默认 '/' 同源。
    base: env.VITE_APP_CDN_BASE || '/',
    // 全局常量定义（在源码中可直接引用，编译期替换）
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __BUILD_TIME__: JSON.stringify(buildTime)
    },
    plugins: createVitePlugins(env, command === 'build'),
    resolve: {
      // https://cn.vitejs.dev/config/#resolve-alias
      alias: {
        // 设置路径
        '~': path.resolve(__dirname, './'),
        // 设置别名
        '@': path.resolve(__dirname, './src')
      },
      // https://cn.vitejs.dev/config/#resolve-extensions
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    // 打包配置
    build: {
      // https://vite.dev/config/build-options.html
      // 反代档（production）构建输出 **hidden sourcemap**（R102-SMAP-001/002）：生成 .map
      // 文件供错误堆栈离线还原（scripts/decode-stack.mjs / source-map CLI），但产物 JS
      // 尾部**不带** sourceMappingURL 注释、浏览器不会自动拉取。
      // 部署侧兜底：nginx.conf 拒绝对外提供 *.map（location ~* \.map$ { deny all; }）。
      // 无 Sentry 等第三方错误平台时不需要"上传 map"步骤（R102-SMAP-003/004 改判，见性能文档）。
      // ⚠ embedded 档必须**不产 map**（b100 实测缺陷）：嵌入档产物由 rust-embed 直接对外
      // 服务，`.map` 与 `.js` 同目录 ⇒ 访客把入口 chunk 名加 `.map` 即得 200 + 完整源码
      // （实测 /static/js/index-*.js.map = 20,805,274 字节）。"浏览器不自动拉取"只挡住
      // 顺手抓取，不构成安全边界。后端已同时拒绝 .map（embedded_assets.rs），此处从生成面
      // 收口：嵌入档 0 个 map 文件（frontend-dist 也不再被它撑大）。
      // 已知上游限制（2026-10-10 实证）：vite 8（rolldown）CSS 管线不产出 .map（sourcemap:true 亦然），
      // 故 hidden map 仅覆盖 JS；CSS 走 postcss.config.mjs + @tailwindcss/postcss（替代
      // @tailwindcss/vite 插件）后 SOURCEMAP_BROKEN 构建告警已清零，待上游支持后自动生效。
      sourcemap: command === 'build' ? (mode === 'embedded' ? false : 'hidden') : 'inline',
      outDir: 'dist',
      assetsDir: 'assets',
      // 性能优化：目标设为 es2020，使用现代 JS 特性（可选链、空值合并、async/await 原生支持），
      // 避免降级到 es5 生成大量 polyfill 和 helper 代码
      target: 'es2020',
      // 生产构建启用 CSS 压缩。本仓库（pnpm）未安装 esbuild 包，Vite 8（Rolldown）下
      // cssMinify: true 即使用已安装的 lightningcss 压缩（此为当前唯一可用 minifier，
      // 显式 'esbuild' 会因缺少依赖而构建失败）。lightningcss 对 CSS Modules 的 `:export`
      // 与 Vue scoped 的 `:deep()` 会输出无意义的伪类告警，属其严格解析所致、不影响产物正确性。
      cssMinify: true,
      // 小于 4KB 的静态资源内联为 base64，减少 HTTP 请求（R6-DEP-16）
      assetsInlineLimit: 4096,
      // chunk 体积告警阈值：分包后最大单 chunk 是 html2pdf（~0.9MB raw），
      // 取 1.2MB —— 超过即提示"有新的巨型 chunk"，但不为已知的大库报警。（R6-DEP-19）
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        // 性能优化：开启模块级别 tree shaking，移除未使用的导出
        treeshake: true,
        // 路由级分包（b120 恢复；此前是被迫关闭）。历史：Vite 8.1.5 / Rolldown 1.1.5 在
        // element-plus 跨 chunk 引用处 panic（compute_cross_chunk_links.rs:584
        // "Symbol defaults_default … should belong to a chunk"），当时只能 codeSplitting:false
        // 把动态 import 全部内联成单 chunk。b120 升级 vite 8.3.5（rolldown 1.2.15）后同一份源码
        // 构建通过：入口 chunk 1705.8KB → 62.2KB(gzip)，首屏必须下载 573.4KB JS + 52.3KB CSS(gzip)。
        // 三栏预算与判据见 perf-budget.json + scripts/check-perf-budget.mjs。
        output: {
          chunkFileNames: 'static/js/[name]-[hash].js',
          entryFileNames: 'static/js/[name]-[hash].js',
          assetFileNames: 'static/[ext]/[name]-[hash].[ext]'
        }
      }
    },
    // vite 相关配置
    server: {
      port: 5173,
      host: true,
      open: true,
      proxy: buildProxy(baseUrl)
    },
    // vite preview 用于本地预览生产/预发构建产物，
    // 其请求基址为 /prod-api 或 /stage-api，需同样代理到后端。
    // strictPort：端口被占时**直接报错**而非自动漂移到 4174——端口漂移会让
    // "服务在哪个端口"产生歧义（用户实测混淆：4173 被残留进程占用后悄悄换到 4174，
    // 旧的 4173 实例/书签全部失效）。
    preview: {
      port: 4173,
      strictPort: true,
      proxy: buildProxy(baseUrl)
    }
  }
})
