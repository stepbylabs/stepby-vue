/**
 * 模块 94（b102）：WS 会话到期的**浏览器结局**（b101 N-101-3 的端到端判据）。
 *
 * ## 立的案
 *
 * 服务端在令牌到期时先发 `system{kind:"sessionExpired"}` 再 Close（`ws_handler.rs`
 * 的到期分支，集成测试 `ws_session_expires_and_closes` 已在协议层证明）；前端 b101 之前
 * 只"停止自动重连"，页面仍显示已登录，用户下一次点按钮才被 401 拦住 —— 与强制下线 /
 * 401 的结局不一致。b101 把结局收敛成 `utils/sessionExpiry.ts`（提示 + 清会话 +
 * 回登录页）并在 `permission.ts` 的"新会话已建立"处复位幂等闸。
 *
 * 单测（`sessionExpiry.test.ts` / `websocket.test.ts`）覆盖了函数体与静态接线，
 * 但**浏览器里这条链从未被端到端执行过**：真实 WS 连接 + 真实布局订阅 + 真实路由跳转。
 *
 * ## 判据形状（每条都有反向对照，缺一条实现也能半边全绿）
 *
 * ① 对照组：`system{kind:"connected"}` 这类**非到期**消息不得触发登出；
 * ② 到期消息 ⇒ 提示可见（文案回读）+ 回登录页且带 `redirect` 与 `reason=session-expired`；
 * ③ 本地会话已清（`Admin-Token` cookie 必须不在）；
 * ④ **不自动重连**：到期后服务端关闭连接，2.5s 内（首个退避窗口 1s 之后）不得出现第二条 WS；
 * ⑤ **复位点真实生效**：同一页面不刷新，重新取得真实令牌并以 SPA 导航建立新会话，
 *    第二次到期必须**再次**执行同一结局（闸没复位时第二次会被静默吞掉——这正是 b101 修的形状）。
 *
 * ## 为什么用 `routeWebSocket` 的"服务端替身"
 *
 * 令牌有效期以小时计，端到端等它到期不现实；这里注入的是**协议事实**（与后端到期分支
 * 逐字段同形的两条帧 + Close），不是产品实现。前端连的仍是真实 `wsService`、订阅仍是
 * 真实布局，只有对端被替换——与"`page.route` 按住响应造加载态"同一类构造式判据。
 */

/** 到期提示的两种语言形（`common.sessionExpired`：zh 含"会话已过期"，en 含 "Invalid session"） */
const EXPIRED_TEXT_RE = /会话已过期|Invalid session/i

/**
 * @param {object} ctx 由 deep-e2e 注入的共享 helpers（不 import 入口，入口 import 即执行）
 */
import { readCaptchaCodeFromRedis } from '../e2e/run/auth.mjs'

export function makeWsSessionExpiryTest(ctx) {
  const { record, log, CONFIG, checkConsoleErrors, sleep, getApiToken, createPage } = ctx

  return async function testModule94(browser, consoleErrors, pageErrors) {
    const M = 94
    log('\n=== 模块 94: WS 会话到期的浏览器结局（提示 + 回登录页 + 不重连 + 复位点）===')

    if (!browser || !createPage) {
      record(
        M,
        '94.0 前置: 浏览器与 createPage 可用',
        false,
        'runner 未提供 browser/createPage ⇒ 无法建独立会话（工具自曝）'
      )
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }
    const created = await createPage(browser).catch(() => null)
    if (!created) {
      record(M, '94.0 前置: 独立上下文创建成功', false, 'createPage 返回 null（工具自曝）')
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }
    const { page, context, consoleErrors: ce, pageErrors: pe } = created

    // 引导完成标记：Tour 遮罩在数据加载后挂载，会拦截点击/遮挡提示读取
    await page.addInitScript(() => {
      try {
        localStorage.setItem('stepby-layout-tour', 'completed')
        localStorage.setItem('workbench-tour', 'completed')
        localStorage.setItem('home-tour', 'completed')
      } catch {
        /* localStorage 不可用时保持原行为 */
      }
    })

    /** 轮询到条件成立；`{ok, ms, ...}` 的耗时进凭证（禁止"导航后看一眼"） */
    async function pollUntil(fn, { timeout = 12000, every = 150 } = {}) {
      const t0 = Date.now()
      let last = null
      while (Date.now() - t0 < timeout) {
        last = await fn()
        if (last && last.ok) return { ok: true, ms: Date.now() - t0, ...last }
        await sleep(every)
      }
      return { ok: false, ms: Date.now() - t0, ...(last || {}) }
    }

    /** 当前所有 el-message 文本（一次 evaluate 读全，不等待） */
    async function messageText() {
      return page
        .evaluate(() =>
          Array.from(document.querySelectorAll('.el-message'))
            .map((e) => e.innerText || '')
            .join(' | ')
        )
        .catch(() => '')
    }

    /** 建"服务端替身"：记录每条 WS 连接，不连真后端（心跳消息忽略） */
    const sockets = []
    await page.routeWebSocket(/\/ws$/, (ws) => {
      sockets.push(ws)
      ws.onMessage(() => {})
    })
    const lastSocket = () => sockets[sockets.length - 1]

    // 登录页自己的验证码状态（SPA 回登录页时页面会自行拉 /captchaImage）。
    // 验证码启用时明文只在 Redis 里（`readCaptchaCodeFromRedis`），测试环境关闭时
    // 这两个字段就是 false/空 —— 是否启用由页面响应自证，不在判据里写死。
    let captchaState = { captchaEnabled: false, uuid: '' }
    page.on('response', (resp) => {
      if (!resp.url().includes('/captchaImage')) return
      resp
        .json()
        .then((d) => {
          captchaState = { captchaEnabled: !!d?.captchaEnabled, uuid: d?.uuid || '' }
        })
        .catch(() => {})
    })

    /** 在**已挂载的登录页**上直接填表提交（不刷新页面，走真实 applyLoginToken 链路） */
    async function spaLogin() {
      const userInput = page
        .locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]')
        .first()
      await userInput.waitFor({ state: 'visible', timeout: 10000 })
      await userInput.fill(CONFIG.username)
      await page
        .locator('input[placeholder="密码"], input[placeholder="Password"], input[type="password"]')
        .first()
        .fill(CONFIG.password)
      if (captchaState.captchaEnabled) {
        const code = await readCaptchaCodeFromRedis(captchaState.uuid)
        await page
          .locator('input[placeholder="验证码"], input[placeholder="Code"], input[name="captcha"]')
          .first()
          .fill(code)
      }
      await page
        .locator('button:has-text("登 录"), button:has-text("登录"), button:has-text("Login"), button[type="submit"]')
        .first()
        .click()
    }

    const sendFrame = (data) => {
      const s = lastSocket()
      if (!s) return false
      s.send(JSON.stringify({ type: 'system', data, timestamp: Date.now() }))
      return true
    }

    try {
      // ---------- 94.1 真实登录（表单登录由 M9/M12 覆盖，这里只要能建会话即可） ----------
      const token = await getApiToken().catch(() => null)
      record(M, '94.1 前置: 取得真实管理员令牌（API 登录）', !!token, token ? 'token 获取成功' : 'API 登录失败')
      if (!token) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }
      // 先落到本应用源（about:blank 是不透明源，写不了 cookie），再写与 `setToken` 同形的 cookie
      await page.goto(`${CONFIG.frontendUrl}/login`, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
      await page.evaluate((t) => {
        document.cookie = `Admin-Token=${t}; path=/; SameSite=Lax`
      }, token)
      await page.goto(`${CONFIG.frontendUrl}/index`, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
      const wsUp = await pollUntil(async () => ({ ok: sockets.length >= 1, count: sockets.length }), { timeout: 15000 })
      record(M, '94.2 WS 已连接且被替身接管', wsUp.ok, `连接数=${wsUp.count}`)
      if (!wsUp.ok) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }

      // ---------- 94.3 对照组：非到期 system 消息不得触发登出 ----------
      sendFrame({ kind: 'connected' })
      await sleep(1200)
      const afterControl = await page.evaluate(() => ({
        path: location.pathname,
        hasToken: document.cookie.includes('Admin-Token=')
      }))
      record(
        M,
        '94.3 对照组: system/connected 不触发登出',
        afterControl.path !== '/login' && afterControl.hasToken,
        `pathname=${afterControl.path}, token=${afterControl.hasToken}`
      )

      // ---------- 94.4/94.5/94.6 到期消息 ⇒ 提示 + 回登录页（带 redirect/reason）+ 清会话 ----------
      const toastWait = pollUntil(async () => {
        const txt = await messageText()
        return { ok: EXPIRED_TEXT_RE.test(txt), txt: txt.slice(0, 120) }
      })
      sendFrame({ kind: 'sessionExpired', message: 'e2e94: session expired' })
      // 与真实服务端一致：告知后立即关闭连接（客户端据此走 onclose；isManualClose 已置位 ⇒ 不重连）
      await sleep(120)
      lastSocket()?.close()
      const toast = await toastWait
      record(M, '94.4 到期提示可见（文案回读）', toast.ok, `耗时 ${toast.ms}ms, 文本=${toast.txt || '（无）'}`)

      const backToLogin = await pollUntil(
        async () => {
          const u = new URL(page.url())
          return {
            ok:
              u.pathname === '/login' &&
              u.searchParams.get('reason') === 'session-expired' &&
              !!u.searchParams.get('redirect'),
            href: page.url()
          }
        },
        { timeout: 12000 }
      )
      record(
        M,
        '94.5 已回登录页且带 redirect 与 reason=session-expired',
        backToLogin.ok,
        `耗时 ${backToLogin.ms}ms, url=${backToLogin.href}`
      )

      const cleared = await page.evaluate(() => document.cookie)
      record(
        M,
        '94.6 本地会话已清（Admin-Token cookie 不在）',
        !/Admin-Token=/.test(cleared),
        `cookie=${cleared || '（空）'}`
      )

      // ---------- 94.7 不自动重连：首个退避窗口（1s）之后仍只有一条连接 ----------
      await sleep(2500)
      record(
        M,
        '94.7 到期后不自动重连（2.5s 内无第二条 WS）',
        sockets.length === 1,
        `连接数=${sockets.length}（期望 1；首条退避 1s）`
      )

      // ---------- 94.8/94.9 复位点：同一页面不刷新，真实登录建立新会话 ⇒ 第二次到期仍生效 ----------
      // 走真实登录表单（`applyLoginToken` → `notification.init()` → WS 重连），
      // 不能用 page.goto：整页重载会随 JS 上下文一起重建模块级幂等闸，
      // "复位点是否真实接线"这一条就退化成空跑。
      const spaLoginErr = await spaLogin()
        .then(() => null)
        .catch((e) => String(e && e.message).slice(0, 120))
      const secondUp = await pollUntil(
        async () => ({ ok: sockets.length >= 2 && new URL(page.url()).pathname === '/index', count: sockets.length }),
        { timeout: 20000 }
      )
      record(
        M,
        '94.8 复位点: 同页 SPA 真实登录后 WS 再次连接（不刷新）',
        !spaLoginErr && secondUp.ok,
        `登录错误=${spaLoginErr || '无'}, 验证码=${captchaState.captchaEnabled ? '启用(redis取码)' : '未启用'}, ` +
          `连接数=${secondUp.count}, url=${page.url()}`
      )
      if (!secondUp.ok) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }

      sendFrame({ kind: 'sessionExpired', message: 'e2e94: session expired (2nd)' })
      await sleep(120)
      lastSocket()?.close()
      const secondRedirect = await pollUntil(
        async () => {
          const u = new URL(page.url())
          return { ok: u.pathname === '/login' && u.searchParams.get('reason') === 'session-expired', href: page.url() }
        },
        { timeout: 12000 }
      )
      record(
        M,
        '94.9 第二次到期同样生效（幂等闸已复位，不得被静默吞掉）',
        secondRedirect.ok,
        `耗时 ${secondRedirect.ms}ms, url=${secondRedirect.href}`
      )
    } catch (err) {
      record(M, '94.10 异常收口', false, `异常: ${String(err && err.message).slice(0, 160)}`)
    } finally {
      await context.close().catch(() => {})
      consoleErrors.push(...ce)
      pageErrors.push(...pe)
      checkConsoleErrors(consoleErrors, pageErrors, M)
    }
  }
}
