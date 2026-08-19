/**
 * 浏览器 UI 测试脚本（HTTP 层 + 资源/CSS 变量可访问性验证）
 *
 * 功能：
 * 1. 启动 Vite dev server
 * 2. 等待 server 就绪
 * 3. 执行 UI 检查：
 *    - 页面 HTTP 可访问性
 *    - 关键静态资源可访问性（auto.svg / dark.svg / light.svg）
 *    - 关键源码文件可访问性（i18n / ThemeEditor / variables.module.scss）
 *    - HTML 入口包含 #app 根节点
 * 4. 输出汇总报告
 * 5. 关闭 dev server
 *
 * 使用方式：
 *   node scripts/ui-test.mjs                # 默认端口 82
 *   node scripts/ui-test.mjs --port=80      # 指定端口
 *   node scripts/ui-test.mjs --no-server    # 不启动 dev server（使用已运行的实例）
 *
 * 注意：此脚本不使用 Playwright/Puppeteer，仅做 HTTP 层面的可访问性验证。
 * 完整的浏览器视觉测试请使用 TRAE 的 Browser Use 功能或 tests/main.mjs。
 */

/* eslint-disable no-console */
import { spawn } from 'child_process'
import { createServer } from 'net'

const PORT = parseInt(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] || '82', 10)
const HOST = '127.0.0.1'
const MAX_WAIT_MS = 60000
const CHECK_INTERVAL_MS = 1000
const NO_SERVER = process.argv.includes('--no-server')

/**
 * 检查端口是否可用
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = createServer()
    tester.once('error', () => resolve(true))
    tester.once('listening', () => {
      tester.close(() => resolve(false))
    })
    tester.listen(port, HOST)
  })
}

/**
 * 等待 HTTP 服务就绪
 */
async function waitForServer(url, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 200) {
        return true
      }
    } catch {
      // 服务未就绪，继续等待
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS))
  }
  return false
}

/**
 * 执行页面 HTTP 可访问性检查
 */
async function checkPages(baseUrl) {
  const results = []
  const pages = [
    { path: '/', name: '首页/Dashboard' },
    { path: '/login', name: '登录页' }
  ]

  for (const page of pages) {
    try {
      const res = await fetch(`${baseUrl}${page.path}`, { redirect: 'follow' })
      // Vite SPA 所有路由都返回 200 + index.html
      const ok = res.ok || res.status === 200 || res.status === 302
      results.push({ category: 'page', name: page.name, path: page.path, status: res.status, ok })
      console.log(`  ${ok ? '✅' : '❌'} [页面] ${page.name} (${page.path}) → ${res.status}`)
    } catch (err) {
      results.push({ category: 'page', name: page.name, path: page.path, status: 0, ok: false, error: err.message })
      console.log(`  ❌ [页面] ${page.name} (${page.path}) → ${err.message}`)
    }
  }
  return results
}

/**
 * 检查 HTML 入口完整性
 */
async function checkHtmlIntegrity(baseUrl) {
  const results = []
  try {
    const res = await fetch(`${baseUrl}/`)
    const html = await res.text()
    const checks = [
      { name: 'HTML 包含 #app 根节点', ok: html.includes('id="app"') },
      { name: 'HTML 引用 main.ts', ok: html.includes('/src/main.ts') },
      { name: 'HTML 包含 <title>', ok: /<title>[^<]+<\/title>/.test(html) }
    ]
    for (const c of checks) {
      results.push({ category: 'html', name: c.name, ok: c.ok })
      console.log(`  ${c.ok ? '✅' : '❌'} [HTML] ${c.name}`)
    }
  } catch (err) {
    results.push({ category: 'html', name: 'HTML 入口检查', ok: false, error: err.message })
    console.log(`  ❌ [HTML] 入口检查失败: ${err.message}`)
  }
  return results
}

/**
 * 检查关键静态资源可访问性（主题切换相关）
 */
async function checkThemeAssets(baseUrl) {
  const results = []
  const assets = [
    { path: '/src/assets/images/auto.svg', name: '主题预览图 auto.svg（theme-auto）' },
    { path: '/src/assets/images/dark.svg', name: '主题预览图 dark.svg（theme-dark）' },
    { path: '/src/assets/images/light.svg', name: '主题预览图 light.svg（theme-light）' },
    { path: '/src/assets/logo/logo.png', name: 'Logo 图片' }
  ]

  for (const asset of assets) {
    try {
      const res = await fetch(`${baseUrl}${asset.path}`)
      const ok = res.ok
      const contentType = res.headers.get('content-type') || ''
      results.push({
        category: 'asset',
        name: asset.name,
        path: asset.path,
        status: res.status,
        contentType,
        ok
      })
      console.log(`  ${ok ? '✅' : '❌'} [资源] ${asset.name} → ${res.status} (${contentType})`)
    } catch (err) {
      results.push({ category: 'asset', name: asset.name, path: asset.path, ok: false, error: err.message })
      console.log(`  ❌ [资源] ${asset.name} → ${err.message}`)
    }
  }
  return results
}

/**
 * 检查关键源码文件可访问性（用于验证 dev server 文件服务正常）
 */
async function checkSourceFiles(baseUrl) {
  const results = []
  const files = [
    {
      path: '/src/i18n/locales/zh-CN/common.ts',
      name: 'i18n 中文语言包（模块化 common 模块）',
      expectContent: ['sideAuto', 'autoThemeStyle', 'autoThemePreview']
    },
    {
      path: '/src/i18n/locales/en-US/common.ts',
      name: 'i18n 英文语言包（模块化 common 模块）',
      expectContent: ['sideAuto', 'autoThemeStyle', 'autoThemePreview']
    },
    {
      path: '/src/components/ThemeEditor/index.vue',
      name: 'ThemeEditor 组件',
      expectContent: ['theme-auto', 'theme-dark', 'theme-light']
    },
    // Vite dev server 会将 TS 转译为 JS，单引号变为双引号：sideTheme: "theme-auto"
    { path: '/src/settings.ts', name: '应用设置文件', expectContent: ['sideTheme: "theme-auto"'] },
    {
      path: '/src/assets/styles/variables.module.scss',
      name: 'CSS 变量定义文件',
      expectContent: ['--sidebar-bg', '--menu-hover', '--navbar-hover']
    }
  ]

  for (const file of files) {
    try {
      const res = await fetch(`${baseUrl}${file.path}`)
      const text = await res.text()
      const ok = res.ok
      const contentChecks = file.expectContent.map((c) => ({
        key: c,
        found: text.includes(c)
      }))
      const allContentFound = contentChecks.every((c) => c.found)
      results.push({
        category: 'source',
        name: file.name,
        path: file.path,
        status: res.status,
        ok: ok && allContentFound,
        contentChecks
      })
      const contentDetail = contentChecks.map((c) => `${c.key}=${c.found ? '✓' : '✗'}`).join(' ')
      console.log(`  ${ok && allContentFound ? '✅' : '❌'} [源码] ${file.name} → ${res.status} [${contentDetail}]`)
    } catch (err) {
      results.push({ category: 'source', name: file.name, path: file.path, ok: false, error: err.message })
      console.log(`  ❌ [源码] ${file.name} → ${err.message}`)
    }
  }
  return results
}

/**
 * 检查 theme-auto 优化完整性（清理检查）
 */
async function checkThemeAutoCleanup(baseUrl) {
  const results = []
  // 验证已清理的旧值不再存在
  const cleanupChecks = [
    {
      path: '/src/i18n/locales/zh-CN/common.ts',
      name: '中文语言包已清理 sideDarkMode',
      // sideDarkMode 应该不再存在
      expectNotContent: ['sideDarkMode:']
    },
    {
      path: '/src/i18n/locales/en-US/common.ts',
      name: '英文语言包已清理 sideDarkMode',
      expectNotContent: ['sideDarkMode:']
    },
    {
      path: '/src/components/ThemeEditor/index.vue',
      name: 'ThemeEditor 已清理旧值（value="theme"）',
      expectNotContent: ['value="theme"', "value='theme'"]
    }
  ]

  for (const check of cleanupChecks) {
    try {
      const res = await fetch(`${baseUrl}${check.path}`)
      const text = await res.text()
      const ok = res.ok && check.expectNotContent.every((c) => !text.includes(c))
      results.push({
        category: 'cleanup',
        name: check.name,
        path: check.path,
        ok
      })
      console.log(`  ${ok ? '✅' : '❌'} [清理] ${check.name}`)
    } catch (err) {
      results.push({ category: 'cleanup', name: check.name, ok: false, error: err.message })
      console.log(`  ❌ [清理] ${check.name} → ${err.message}`)
    }
  }
  return results
}

async function main() {
  console.log(`\n=== UI 测试脚本启动 ===`)
  console.log(`目标端口: ${PORT}`)
  console.log(`模式: ${NO_SERVER ? '使用已运行的 dev server' : '启动新 dev server'}`)

  let server = null
  let serverReady = false

  if (!NO_SERVER) {
    // 检查端口占用
    if (await isPortInUse(PORT)) {
      console.error(`❌ 端口 ${PORT} 已被占用，请先关闭占用进程或指定其他端口`)
      process.exit(1)
    }

    // 启动 dev server
    console.log(`\n[1/6] 启动 Vite dev server (端口 ${PORT})...`)
    server = spawn('npx', ['vite', '--port', String(PORT), '--host', HOST], {
      cwd: process.cwd(),
      shell: true,
      stdio: 'pipe'
    })

    server.stdout?.on('data', (data) => {
      const output = data.toString()
      if (output.includes('ready in') && !serverReady) {
        serverReady = true
        console.log(`  dev server 已就绪`)
      }
    })

    server.stderr?.on('data', (data) => {
      console.error(`  [server error] ${data.toString()}`)
    })

    // 确保进程退出时关闭 server
    const cleanup = () => {
      if (server && !server.killed) {
        console.log(`\n[6/6] 关闭 dev server...`)
        server.kill('SIGTERM')
        setTimeout(() => {
          if (!server.killed) {
            server.kill('SIGKILL')
          }
          process.exit(0)
        }, 3000)
      }
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('exit', cleanup)

    // 等待 server 就绪
    console.log(`\n[2/6] 等待 server 就绪 (最长 ${MAX_WAIT_MS / 1000}s)...`)
    const baseUrl = `http://${HOST}:${PORT}`
    const ready = await waitForServer(baseUrl, MAX_WAIT_MS)

    if (!ready) {
      console.error(`❌ dev server 在 ${MAX_WAIT_MS / 1000}s 内未就绪`)
      cleanup()
      process.exit(1)
    }
  } else {
    // 验证 server 已运行
    console.log(`\n[1/6] 跳过 dev server 启动（--no-server 模式）`)
    const baseUrl = `http://${HOST}:${PORT}`
    const ready = await waitForServer(baseUrl, 5000)
    if (!ready) {
      console.error(`❌ 未检测到运行中的 dev server（${baseUrl}），请先启动 pnpm dev`)
      process.exit(1)
    }
    serverReady = true
  }

  const baseUrl = `http://${HOST}:${PORT}`

  // 执行 UI 检查
  console.log(`\n[3/6] 执行页面 HTTP 可访问性检查...`)
  const pageResults = await checkPages(baseUrl)

  console.log(`\n[4/6] 执行 HTML 入口完整性检查...`)
  const htmlResults = await checkHtmlIntegrity(baseUrl)

  console.log(`\n[5/6] 执行主题资源/源码/清理检查...`)
  const assetResults = await checkThemeAssets(baseUrl)
  const sourceResults = await checkSourceFiles(baseUrl)
  const cleanupResults = await checkThemeAutoCleanup(baseUrl)

  const allResults = [...pageResults, ...htmlResults, ...assetResults, ...sourceResults, ...cleanupResults]
  const allOk = allResults.every((r) => r.ok)

  // 输出汇总
  console.log(`\n=== 测试结果汇总 ===`)
  const categories = ['page', 'html', 'asset', 'source', 'cleanup']
  for (const cat of categories) {
    const catResults = allResults.filter((r) => r.category === cat)
    if (catResults.length === 0) continue
    const passed = catResults.filter((r) => r.ok).length
    console.log(`  [${cat}] ${passed}/${catResults.length} 通过`)
  }
  const totalPassed = allResults.filter((r) => r.ok).length
  console.log(`  总计: ${totalPassed}/${allResults.length} 通过`)
  console.log(`  状态: ${allOk ? '✅ 全部通过' : '❌ 存在失败'}`)

  // 关闭 server
  if (server && !server.killed) {
    console.log(`\n[6/6] 关闭 dev server...`)
    server.kill('SIGTERM')
    setTimeout(() => {
      if (!server.killed) server.kill('SIGKILL')
      process.exit(allOk ? 0 : 1)
    }, 3000)
  } else {
    process.exit(allOk ? 0 : 1)
  }
}

main().catch((err) => {
  console.error('脚本执行失败:', err)
  process.exit(1)
})
