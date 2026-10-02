/**
 * 测试共享配置模块
 *
 * 统一管理测试脚本的配置（凭据、URL、超时等），避免硬编码。
 * 凭据必须通过环境变量传入，无默认值，防止弱密码泄漏。
 *
 * 环境变量：
 *   STEPBY_TEST_USER  —— 测试登录用户名（必填）
 *   STEPBY_TEST_PASS  —— 测试登录密码（必填）
 *   STEPBY_BASE_URL   —— 后端基础 URL（可选，默认 http://localhost:8080）
 *   STEPBY_UI_URL     —— 前端基础 URL（可选，默认 http://localhost:5173）
 *
 * 用法：
 *   import { TEST_USER, TEST_PASS, BASE_URL, UI_URL, withBrowser } from './test-config.mjs'
 *
 *   await withBrowser(async (browser, page) => {
 *     // 测试逻辑
 *   })
 */

/** 测试用户名（必须通过环境变量设置） */
export const TEST_USER = process.env.STEPBY_TEST_USER || (() => {
  throw new Error('必须设置环境变量 STEPBY_TEST_USER（测试用户名）')
})()

/** 测试密码（必须通过环境变量设置） */
export const TEST_PASS = process.env.STEPBY_TEST_PASS || (() => {
  throw new Error('必须设置环境变量 STEPBY_TEST_PASS（测试密码）')
})()

/** 后端 API 基础 URL */
export const BASE_URL = process.env.STEPBY_BASE_URL || 'http://localhost:8080'

/** 前端 UI 基础 URL */
export const UI_URL = process.env.STEPBY_UI_URL || 'http://localhost:5173'

/** HTTP 请求默认超时（毫秒） */
export const HTTP_TIMEOUT_MS = 10000

/**
 * 包装浏览器生命周期，确保 try/finally 自动关闭
 *
 * @param {object} chromium - Playwright chromium 模块
 * @param {function} fn - 测试回调 (browser, page) => Promise<T>
 * @param {object} [options] - launch 选项
 * @returns {Promise<T>} 回调返回值
 *
 * @example
 * import { chromium } from 'playwright'
 * import { withBrowser } from './test-config.mjs'
 *
 * const result = await withBrowser(chromium, async (browser, page) => {
 *   await page.goto(UI_URL)
 *   return page.title()
 * })
 */
export async function withBrowser(chromium, fn, options = {}) {
  const browser = await chromium.launch({ headless: true, ...options })
  try {
    const page = await browser.newPage()
    try {
      return await fn(browser, page)
    } finally {
      await page.close().catch(() => {})
    }
  } finally {
    await browser.close()
  }
}

/**
 * 创建带超时的 HTTP 请求（Node.js 内置 http/https 模块封装，ESM 兼容）
 *
 * @param {string} url - 请求 URL
 * @param {object} [options] - { method, headers, body, timeout }
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
export async function http_request(url, options = {}) {
  const { method = 'GET', headers = {}, body = null, timeout = HTTP_TIMEOUT_MS } = options
  const lib = url.startsWith('https') ? await import('node:https') : await import('node:http')
  return new Promise((resolve, reject) => {
    const req = lib.default.request(url, { method, headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data
        })
      })
    })
    req.on('error', reject)
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`请求超时（${timeout}ms）: ${url}`))
    })
    if (body) req.write(body)
    req.end()
  })
}
