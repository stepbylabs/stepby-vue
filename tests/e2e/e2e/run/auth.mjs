/**
 * e2e 登录验证码共享工具（真实读码，无假码）
 *
 * 依赖约定（本机测试环境）：
 *   - 后端验证码开启时写入 redis 键 captcha:{uuid}:{ip}（明文小写，TTL 300s）
 *   - 本机 stepby-redis 容器在运行（redis-cli 可达）
 *
 * 关键约束：
 *   - 浏览器场景必须用**页面自身发出的 /captchaImage 响应**里的 uuid
 *     （预取的 uuid 与页面显示的验证码图不是同一次请求，码必然对不上）
 *   - Windows 下 child_process.execSync 走 cmd：命令内必须用双引号
 *     （单引号是字面字符，会导致 --pattern 带引号匹配失败）
 */

import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { execSync } = require('child_process')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 经 stepby-redis 容器读取指定 uuid 的验证码明文。
 * 按 pattern 扫描键名（ip 段格式无关）。读不到抛错（fail-fast），绝不填假码。
 * @param {string} uuid - /captchaImage 响应中的 uuid
 * @returns {Promise<string>} 验证码明文
 */
export async function readCaptchaCodeFromRedis(uuid) {
  const pattern = `captcha:${uuid}:*`
  // redis 密码：本机容器由 compose REDIS_PASSWORD 注入（默认 stepby123）；可经环境变量覆盖。
  // 缺密码会在受保护实例上 NOAUTH（历史段 3 实测崩溃点）。
  const pass = process.env.REDIS_PASSWORD || 'stepby123'
  const auth = ['-a', pass, '--no-auth-warning']
  try {
    await sleep(300) // 键写入兜底等待
    const key = execSync(`docker exec stepby-redis redis-cli ${auth.join(' ')} --raw --scan --pattern "${pattern}"`, {
      encoding: 'utf-8',
      timeout: 10000
    })
      .trim()
      .split('\n')[0]
    if (!key) throw new Error('redis 无匹配键（可能已过期或 ip 段异常）')
    const code = execSync(`docker exec stepby-redis redis-cli ${auth.join(' ')} --raw GET "${key}"`, {
      encoding: 'utf-8',
      timeout: 10000
    }).trim()
    if (!code) throw new Error(`redis 键 ${key} 值为空`)
    return code
  } catch (e) {
    throw new Error(
      `验证码已启用且无法经 stepby-redis 读取真码（${String(e.message).slice(0, 100)}）。` +
        `处理：将 sys_config 的 sys.account.captchaEnabled 设为 false，并清除 redis config: 前缀的对应缓存键，或确保 stepby-redis 容器在运行（REDIS_PASSWORD 环境变量可覆盖默认密码）`
    )
  }
}

/**
 * 注册页面验证码响应捕获（必须在 goto 之前调用）。
 * 返回 promise，resolve 为 { enabled, code }：
 *   - enabled=false：后端关闭验证码，code 为空
 *   - enabled=true：code 为与页面显示图同源的 redis 明文
 *   - 30s 内页面未发出 /captchaImage 请求：resolve 为 null（调用方按配置不一致处理）
 * @param {import('playwright').Page} page
 */
export function capturePageCaptcha(page) {
  return page
    .waitForResponse((r) => r.url().includes('/captchaImage') && r.status() === 200, {
      timeout: 30000
    })
    .then(async (resp) => {
      const data = await resp.json()
      if (!data.captchaEnabled) return { enabled: false, code: '' }
      if (!data.uuid) throw new Error('页面 captchaImage 响应未含 uuid')
      return { enabled: true, code: await readCaptchaCodeFromRedis(data.uuid) }
    })
    .catch((e) => {
      if (e?.message?.includes('captcha')) throw e // 读码失败：上抛 fail-fast
      return null // 未捕获到响应：页面未请求验证码
    })
}

/**
 * 条件填码：后端启用且页面渲染了验证码输入框时填入真码。
 * 启用但输入框缺失 → 抛错（页面与后端配置不一致）。
 * @param {import('playwright').Page} page
 * @param {{enabled: boolean, code: string}|null} captcha - capturePageCaptcha 的结果
 */
export async function fillCaptchaOnPage(page, captcha) {
  if (!captcha?.enabled) return
  const codeInput = page.locator('input[placeholder="验证码"], input[placeholder="Captcha"]').first()
  const codeVisible = await codeInput.isVisible({ timeout: 3000 }).catch(() => false)
  if (!codeVisible) {
    throw new Error('后端已启用验证码但登录/注册页未渲染验证码输入框，页面与后端配置不一致')
  }
  await codeInput.fill(captcha.code)
}

/**
 * API 直登取码：自行请求 /captchaImage 取 uuid 并读 redis 明文（自取自用，天然同源）。
 * @param {string} backendUrl - 后端基础 URL
 * @returns {Promise<{code: string, uuid: string}>}
 */
export async function fetchCaptchaForApi(backendUrl) {
  const resp = await fetch(`${backendUrl}/captchaImage`, { signal: AbortSignal.timeout(10000) })
  const data = await resp.json()
  if (!data.captchaEnabled || !data.uuid) return { code: '', uuid: '' }
  const code = await readCaptchaCodeFromRedis(data.uuid)
  return { code, uuid: data.uuid }
}

/**
 * 回到「未登录起点」：先切到免登录白名单页，再清本地态与 cookie（批八十六）。
 *
 * 为什么必须是这个顺序（两条都是实测，不是推测）：
 * ① 旧写法 `goto('${frontendUrl}/logout')` 想"先登出"，但前端路由表里没有 `/logout`，
 *    `curl -i :8080/logout` 回的是 `content-type: text/html`——命中的是 SPA 兜底页，
 *    服务端会话从未被吊销；它真正发生的副作用是**把整个应用冷加载一遍**。
 * ② 冷加载的认证链是**串行依赖**的（getInfo → configKey → getRouters → 布局挂载后的 listTop），
 *    而 `waitUntil:'load'` 在 HTML 加载完就返回，测试紧接着清 cookie ⇒ 排在清除之后的请求以
 *    `auth=(none)` 出网 → 401。b86 诊断实测：getInfo 与 configKey 带令牌（清除前 1ms）、
 *    getRouters（清除后 5ms）与 listTop（清除后 273ms）不带令牌。同一段代码在不同批次里
 *    0 条与 3 条 console error 轮流出现 ⇒ 结论由毫秒时机决定，正是本仓禁止的"判据与环境耦合"
 *    （AGENTS 测试门禁全景 前言 ④）。
 *
 * 切 `/privacy` 的依据：它在 `src/permission.ts` 的 `whiteList` 里 ⇒ 守卫 `isWhiteList` 直接放行、
 * 不发任何认证请求；又不套布局 ⇒ 铃铛/公告那类挂载期拉取随之卸载。清除之后不再有任何认证链在飞。
 *
 * @param {import('playwright').Page} page
 * @param {string} frontendUrl - 前端基础 URL（由调用方的 CONFIG 传入：本模块不得 import 入口脚本）
 * @returns {Promise<{ landedOnWhitelist: boolean, tokenLeft: boolean }>} 两个自证事实
 */
export async function clearSession(page, frontendUrl) {
  await page.goto(`${frontendUrl}/privacy`, { waitUntil: 'load', timeout: 15000 }).catch(() => {})
  // 让上一次导航的挂载期请求落定后再清——清除点必须落在"没有认证链在飞"的时刻
  await new Promise((r) => setTimeout(r, 600))
  await page
    .evaluate(() => {
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch (e) {}
    })
    .catch(() => {})
  await page
    .context()
    .clearCookies()
    .catch(() => {})
  const tokenLeft = await page.evaluate(() => /(?:^|;\s*)Admin-Token=/.test(document.cookie)).catch(() => null)
  return { landedOnWhitelist: page.url().includes('/privacy'), tokenLeft: tokenLeft === true }
}
