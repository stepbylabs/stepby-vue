import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
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

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd())
  const { VITE_APP_ENV } = env
  // 开发/预览代理目标地址：默认指向本地 8080 后端；
  // 可通过 .env.* 中的 VITE_PROXY_TARGET 覆盖（例如后端部署在其他主机/端口）。
  const baseUrl = env.VITE_PROXY_TARGET || 'http://localhost:8080'
  const appVersion = readPackageVersion()
  const buildTime = new Date().toISOString()
  return {
    // 部署生产环境和开发环境下的URL。
    // 默认情况下，vite 会假设你的应用是被部署在一个域名的根路径上
    // 例如 https://yebot.dev/。如果应用被部署在一个子路径上，你就需要用这个选项指定这个子路径。例如，如果你的应用被部署在 https://yebot.dev/admin/，则设置 baseUrl 为 /admin/。
    base: '/',
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
      sourcemap: command === 'build' ? false : 'inline',
      outDir: 'dist',
      assetsDir: 'assets',
      // 性能优化：目标设为 es2020，使用现代 JS 特性（可选链、空值合并、async/await 原生支持），
      // 避免降级到 es5 生成大量 polyfill 和 helper 代码
      target: 'es2020',
      // 生产构建启用 CSS 压缩（esbuild，R6-DEP-17）
      // 注：lightningcss 压缩率与 esbuild 相近但构建时间 2.5x，故保留 esbuild
      cssMinify: true,
      // 小于 4KB 的静态资源内联为 base64，减少 HTTP 请求（R6-DEP-16）
      assetsInlineLimit: 4096,
      // chunk 体积警告阈值调整为 1500KB，提前发现过大 chunk（R6-DEP-19）
      chunkSizeWarningLimit: 1500,
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
          // 当前唯一可成功构建的配置是强制 inlineDynamicImports（所有动态 import 内联进单 chunk，
          // 彻底规避跨 chunk 链接）。代价是关闭代码分割与路由级懒加载、首屏 JS 体积偏大。
          // 待 Rolldown 修复该 bug（或升级 Vite/Rolldown 版本）后，应移除本选项以恢复分包。
          // 已登记于审计文档 docs/code-audit-2026-08-06.md 作为已知限制。
          inlineDynamicImports: true
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
    preview: {
      port: 4173,
      proxy: buildProxy(baseUrl)
    }
  }
})
