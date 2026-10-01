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
      // 生产构建输出 **hidden sourcemap**（R102-SMAP-001/002）：生成 .map 文件供错误堆栈
      // 离线还原（scripts/decode-stack.mjs / source-map CLI），但产物 JS 尾部**不带**
      // sourceMappingURL 注释、浏览器不会自动拉取 ⇒ 源码不暴露给访客。
      // 部署侧兜底：nginx.conf 拒绝对外提供 *.map（location ~* \.map$ { deny all; }）。
      // 无 Sentry 等第三方错误平台时不需要"上传 map"步骤（R102-SMAP-003/004 改判，见性能文档）。
      sourcemap: command === 'build' ? 'hidden' : 'inline',
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
      // chunk 体积警告阈值。由于上述 Rolldown 限制被迫使用 codeSplitting:false（单 chunk），
      // 入口 chunk 稳定在 ~9.5MB，1500KB 阈值必然触发且无法消解，故与单 chunk 实况对齐调高，
      // 保留对新引入的超大产物（超出当前基线）的告警能力。（R6-DEP-19）
      chunkSizeWarningLimit: 10000,
      rollupOptions: {
        // 性能优化：开启模块级别 tree shaking，移除未使用的导出
        treeshake: true,
        output: {
          chunkFileNames: 'static/js/[name]-[hash].js',
          entryFileNames: 'static/js/[name]-[hash].js',
          assetFileNames: 'static/[ext]/[name]-[hash].[ext]',
          // 已知 Rolldown 限制（必选 workaround，非项目缺陷）：
          // Vite 8 / Rolldown v8.1.5 在处理 element-plus 跨 chunk 引用时存在 panic bug
          // （compute_cross_chunk_links.rs:584: "Symbol defaults_default in
          //  element-plus/es/defaults.mjs should belong to a chunk"）。
          // 实测：无论使用 manualChunks 还是交予 Rolldown 完全自动分包，
          // 只要存在跨 chunk 引用该符号的分包，构建即 panic。
          // 当前唯一可成功构建的配置是关闭代码分割（把动态 import 全内联进单 chunk，
          // 彻底规避跨 chunk 链接）。代价是缺省路由级懒加载、首屏 JS 体积偏大。
          // 旧选项 inlineDynamicImports 在 Vite 8 已废弃，改用等价的 codeSplitting: false。
          // 待 Rolldown 修复该 bug（或升级 Vite/Rolldown 版本）后，应移除本选项以恢复分包。
          // 已登记于审计文档 docs/code-audit-2026-08-06.md 作为已知限制。
          codeSplitting: false
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
