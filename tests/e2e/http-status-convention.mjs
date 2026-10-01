/**
 * P2-33 `[server].http_status_convention` 的 **e2e 双档回归**（真实后端 + 真实浏览器，不 mock）
 *
 * ── 为什么单独成文 ──
 * 本仓 `http_status` 模块已有 8 条单测 + `into_response` 端的双向断言，但那是**服务端侧**证据。
 * 真正会被 P2-33 影响的是**前端**：`restful` 档下业务失败不再返回 200，而是走 axios 的
 * **错误分支**。前端 `request.ts` 的两个分支都必须识别 `body.code`（尤其是 TOTP 的 1003），
 * 否则会出现"后端改契约、前端不认"的**静默断链**（用户卡在登录页且没有任何提示）。
 * 本脚本用**真实的、唯一的未归类业务码来源**——TOTP 用户的"只给密码"登录（后端恒返回
 * `body.code = 1003`）——在浏览器里把这条链路跑穿：
 *
 *   ① legacy（默认）：`HTTP 200` + `body.code=1003` ⇒ 走 axios **成功**分支的 1003 特判；
 *   ② restful       ：`HTTP 400` + `body.code=1003` ⇒ 走 axios **错误**分支的 1003 特判；
 *   两档都必须让登录页**进入动态验证码步骤**，并在补码后**真正进入系统**。
 *
 * ── 场景 ──
 *   S0 档位判定（API）：一次性用户绑定 TOTP 后"只给密码"登录 ⇒ 读 HTTP 状态自动判定档位
 *      （200 ⇒ legacy / 400 ⇒ restful），并断言 `body.code === 1003`（两档一致）；
 *   S1 错误凭据（浏览器）：错误密码 ⇒ 展示错误 Toast 且**停留** /login（两档一致）；
 *   S2 TOTP 分叉（浏览器，关键断言）：只给密码 ⇒ 出现动态验证码输入框、无错误 Toast，
 *      且该请求的 HTTP 状态与档位一致；补正确验证码后 ⇒ **进入系统**（两档都必须成功）；
 *   S3 清理：删除一次性用户（硬删，不留残留）。
 *
 * ── 运行 ──
 *   后端（embedded :8080）+ 前端 preview 需在跑；`sys.account.captchaEnabled=false` 时无需读验证码。
 *   legacy 档：
 *     PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" \
 *     STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
 *     STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
 *     EXPECT_CONVENTION=legacy node http-status-convention.mjs
 *   restful 档（装配见 RUN-RECIPE §3.23）：把 EXPECT_CONVENTION 换成 restful 再跑一遍。
 *   两档都必须「总计 N 通过，0 失败」且 EXIT=0；`EXPECT_CONVENTION` 可用于断言"确实跑在对的档上"。
 */

import { createRequire } from 'module'
import crypto from 'node:crypto'
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs'
import { capturePageCaptcha, fillCaptchaOnPage, fetchCaptchaForApi } from './e2e/run/auth.mjs'

const require = createRequire(import.meta.url)

// 兼容本地/全局安装的 playwright（与 main.mjs / webauthn.mjs 同款回退逻辑）
let chromium
try {
  chromium = require('playwright').chromium
} catch (_) {
  const { execSync } = require('child_process')
  const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
  const globalRequire = createRequire(`file://${globalRoot}/_`)
  chromium = globalRequire('playwright').chromium
}

const BACKEND_URL = process.env.BACKEND_URL || BASE_URL
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.STEPBY_UI_URL || BASE_URL
/** 期望档位（可选）：legacy | restful；留空 = 只做自洽断言 */
const EXPECT = (process.env.EXPECT_CONVENTION || '').trim().toLowerCase()

const TOTP_CODE_REQUIRED = 1003
const CS_PASSWORD = 'Stepby@12345'
const CS_USER = `e2e_hsc_${Date.now().toString(36)}`

const USERNAME_SEL =
  'input[placeholder="账号"], input[placeholder="Username"], input[name="username"]'
const PASSWORD_SEL =
  'input[placeholder="密码"], input[placeholder="Password"], input[type="password"]'
const LOGIN_BTN_SEL =
  'button:has-text("登 录"), button:has-text("登录"), button:has-text("Login"), button[type="submit"]'
const TOTP_INPUT_SEL =
  'input[placeholder="动态验证码（6 位）"], input[placeholder="TOTP code (6 digits)"]'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

let passCount = 0
let failCount = 0

/** 记录一条断言（必须传入明确判据与失败信息） */
function check(name, cond, detail = '') {
  if (cond) {
    passCount += 1
    log(`  ✅ PASS ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failCount += 1
    log(`  ❌ FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
  return cond
}

/**
 * 生成 6 位 TOTP 验证码（RFC 6238，HMAC-SHA1，30 秒步长）
 * 与 main.mjs 的同名实现逐行一致（纯本地计算，不依赖任何外部服务）。
 */
function generateTotp(secretBase32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secretBase32.toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(c)
    if (idx === -1) continue
    bits += idx.toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Math.floor(Date.now() / 30000)
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3]) %
    1000000
  return code.toString().padStart(6, '0')
}

/** 统一 API 调用：返回 { status, code, body }（不抛错，便于断言） */
async function api(path, { method = 'GET', body = null, token = null, raw = false } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== null) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    })
    const text = await res.text()
    if (raw) return { status: res.status, code: null, body: text }
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch (_) {
      parsed = null
    }
    return { status: res.status, code: parsed?.code ?? null, body: parsed }
  } catch (e) {
    return { status: 0, code: null, body: { error: String(e?.message || e).slice(0, 120) } }
  }
}

/** 登录（API）：带验证码（若后端要求）与可选 TOTP 码 */
async function apiLogin(username, password, totpCode = null) {
  const { code, uuid } = await fetchCaptchaForApi(BACKEND_URL)
  const payload = { username, password, code, uuid }
  if (totpCode) payload.totpCode = totpCode
  return api('/login', { method: 'POST', body: payload })
}

async function main() {
  log(`=== P2-33 HTTP 状态码约定 双档 e2e（后端 ${BACKEND_URL} / 前端 ${FRONTEND_URL}）===`)
  if (EXPECT && !['legacy', 'restful'].includes(EXPECT)) {
    log(`  ❌ FAIL EXPECT_CONVENTION 取值非法：${EXPECT}（只允许 legacy / restful）`)
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  let exitCode = 1
  let csUserId = 0
  let adminToken = null
  let csSecret = null

  /**
   * 兜底清理：**先解绑 TOTP，再硬删用户**。
   *
   * 为什么必须先解绑：TOTP 的"已启用"标志落在 Redis（`totp:enabled:{user_id}`），
   * 而 SQLite 的 rowid 在删除"最大行"后会被后续插入**复用** —— 若只删用户不删该键，
   * 后来的新用户可能继承同一个 user_id 并**凭空要求 TOTP**，污染后续 e2e。
   * 解绑需要"该用户的 token + 密码 + 有效动态码"，故用 API 重新登录取 token。
   */
  async function cleanupCsUser() {
    if (!csUserId) return { disabled: false, deleted: false }
    let disabled = false
    let deleted = false
    try {
      if (csSecret) {
        const relogin = await apiLogin(CS_USER, CS_PASSWORD, generateTotp(csSecret))
        const tok = relogin.body?.token
        if (tok) {
          const off = await api('/system/user/totp/disable', {
            method: 'POST',
            token: tok,
            body: { password: CS_PASSWORD, code: generateTotp(csSecret) }
          })
          disabled = off.code === 200
          log(`  ℹ️ 清理：解绑 TOTP ⇒ code=${off.code}`)
        } else {
          log(`  ℹ️ 清理：重新登录失败（code=${relogin.code}），跳过解绑`)
        }
      }
      if (adminToken) {
        const del = await api(`/system/user/${csUserId}`, { method: 'DELETE', token: adminToken })
        deleted = del.code === 200
        log(`  ℹ️ 清理：删除一次性用户 userId=${csUserId} ⇒ code=${del.code}`)
      }
    } catch (e) {
      log(`  ℹ️ 清理异常（不影响判定）：${String(e?.message || e).slice(0, 120)}`)
    }
    csUserId = 0
    return { disabled, deleted }
  }

  try {
    // ==================== S0：准备一次性 TOTP 用户 + 档位判定 ====================
    log('--- S0：一次性 TOTP 用户 + 档位判定（API） ---')
    const adminLogin = await apiLogin(TEST_USER, TEST_PASS)
    adminToken = adminLogin.body?.token || null
    check(
      'S0 admin 登录成功',
      adminLogin.status === 200 && adminLogin.code === 200 && !!adminToken,
      `status=${adminLogin.status}, code=${adminLogin.code}`
    )
    if (!adminToken) throw new Error('admin 登录失败，后续步骤无法继续')

    const created = await api('/system/user', {
      method: 'POST',
      token: adminToken,
      body: {
        deptId: 100,
        userName: CS_USER,
        nickName: 'e2e 状态码档位探针',
        password: CS_PASSWORD,
        phonenumber: '13800008888',
        sex: '0',
        status: '0',
        roleIds: [2],
        postIds: [1],
        remark: 'P2-33 双档回归用一次性用户（脚本结束即删除）'
      }
    })
    check('S0 创建一次性用户', created.code === 200, `code=${created.code} msg=${created.body?.msg || ''}`)

    const found = await api(`/system/user/list?userName=${encodeURIComponent(CS_USER)}`, {
      token: adminToken
    })
    csUserId = Number((found.body?.rows || []).find((r) => r.userName === CS_USER)?.userId || 0)
    check('S0 查到一次性用户 userId', csUserId > 0, `userId=${csUserId}`)
    if (!csUserId) throw new Error('无法取得一次性用户 userId')

    // 绑 TOTP 前该用户可直接登录（否则 setup 拿不到 token）
    const preLogin = await apiLogin(CS_USER, CS_PASSWORD)
    const csToken = preLogin.body?.token || null
    check(
      'S0 绑 TOTP 前该用户可正常登录',
      preLogin.code === 200 && !!csToken,
      `status=${preLogin.status}, code=${preLogin.code}`
    )
    if (!csToken) throw new Error('一次性用户登录失败，无法绑定 TOTP')

    const setup = await api('/system/user/totp/setup', { method: 'POST', token: csToken })
    const secret = setup.body?.data?.secret || null
    csSecret = secret
    check('S0 TOTP setup 返回 secret', !!secret, secret ? `len=${secret.length}` : '缺失')

    let bound = false
    for (let i = 0; i < 3 && !bound; i++) {
      const v = await api('/system/user/totp/verify', {
        method: 'POST',
        token: csToken,
        body: { code: generateTotp(secret), secret }
      })
      bound = v.code === 200
      if (!bound) await sleep(2000)
    }
    check('S0 TOTP 绑定成功（此后该用户登录需动态码）', bound)

    // 关键探针：只给密码 ⇒ 后端恒返回未归类业务码 1003，HTTP 状态由档位决定
    const probe = await apiLogin(CS_USER, CS_PASSWORD)
    check(
      'S0 未带动态码 ⇒ body.code === 1003（两档一致）',
      probe.code === TOTP_CODE_REQUIRED,
      `status=${probe.status}, code=${probe.code}, msg=${probe.body?.msg || ''}`
    )
    const convention = probe.status === 200 ? 'legacy' : probe.status === 400 ? 'restful' : 'unknown'
    check(
      'S0 档位可判定（HTTP 200 ⇒ legacy / HTTP 400 ⇒ restful）',
      convention !== 'unknown',
      `status=${probe.status}, 判定=${convention}`
    )
    if (EXPECT) {
      check(`S0 实际档位与 EXPECT_CONVENTION=${EXPECT} 一致`, convention === EXPECT, `实际=${convention}`)
    }
    log(`  ℹ️ 当前后端档位：${convention}（HTTP 状态 ${probe.status} + body.code 1003）`)

    // 补正确动态码 ⇒ 两档都必须登录成功（证明状态码变化没有破坏快乐路径）
    const okLogin = await apiLogin(CS_USER, CS_PASSWORD, generateTotp(secret))
    check(
      'S0 补正确动态码 ⇒ 登录成功（两档都必须）',
      okLogin.code === 200 && !!okLogin.body?.token,
      `status=${okLogin.status}, code=${okLogin.code}`
    )

    // ==================== S1：错误凭据（浏览器） ====================
    log('--- S1：错误凭据登录（浏览器） ---')
    const context = await browser.newContext()
    const page = await context.newPage()

    const captchaP = capturePageCaptcha(page)
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.locator(USERNAME_SEL).first().waitFor({ state: 'visible', timeout: 20000 })
    const captcha = await captchaP
    await page.locator(USERNAME_SEL).first().fill(CS_USER)
    await page.locator(PASSWORD_SEL).first().fill('definitely-wrong-password')
    await fillCaptchaOnPage(page, captcha)
    await page.locator(LOGIN_BTN_SEL).first().click()
    await sleep(1500)

    check('S1 错误密码后仍停留 /login', page.url().includes('/login'), `url=${page.url()}`)
    const errToast = await page.locator('.el-message--error').first().innerText().catch(() => '')
    check(
      'S1 错误密码展示错误 Toast（两档一致）',
      errToast.includes('用户名或密码错误'),
      `toast=${JSON.stringify(errToast.slice(0, 60))}`
    )

    // ==================== S2：TOTP 分叉（浏览器，双档关键断言） ====================
    log('--- S2：只给密码 ⇒ 进入动态验证码步骤（双档关键断言） ---')
    // 重新进入登录页：保证 /captchaImage 是一次**全新**请求（与该页面显示的验证码同源），
    // 同时清掉 S1 失败可能残留的表单状态；captcha 关闭时 fillCaptcha 为无操作。
    const captcha2P = capturePageCaptcha(page)
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.locator(USERNAME_SEL).first().waitFor({ state: 'visible', timeout: 20000 })
    const captcha2 = await captcha2P
    await page.locator(USERNAME_SEL).first().fill(CS_USER)
    await page.locator(PASSWORD_SEL).first().fill(CS_PASSWORD)
    await fillCaptchaOnPage(page, captcha2)

    const loginRespP = page
      .waitForResponse((r) => r.url().endsWith('/login') && r.request().method() === 'POST', {
        timeout: 20000
      })
      .catch(() => null)
    await page.locator(LOGIN_BTN_SEL).first().click()
    const loginResp = await loginRespP
    const totpInput = page.locator(TOTP_INPUT_SEL).first()
    const totpVisible = await totpInput.isVisible({ timeout: 10000 }).catch(() => false)

    check(
      'S2 只给密码 ⇒ 登录页进入动态验证码步骤（两档都必须）',
      totpVisible,
      `totp 输入框可见=${totpVisible}, url=${page.url()}`
    )
    const toast1003 = await page
      .locator('.el-message--error')
      .first()
      .innerText({ timeout: 3000 })
      .catch(() => '')
    check('S2 进入验证码步骤时不得弹错误 Toast', !toast1003.includes('用户名或密码错误'), `toast=${JSON.stringify(toast1003.slice(0, 60))}`)

    const respStatus = loginResp ? loginResp.status() : 0
    let respCode = null
    if (loginResp) {
      const rb = await loginResp.json().catch(() => null)
      respCode = rb?.code ?? null
    }
    check('S2 未带动态码请求 body.code === 1003', respCode === TOTP_CODE_REQUIRED, `code=${respCode}`)
    if (convention === 'legacy') {
      check('S2 legacy 档 HTTP 状态为 200（成功分支 1003 特判）', respStatus === 200, `status=${respStatus}`)
    } else if (convention === 'restful') {
      check('S2 restful 档 HTTP 状态为 400（错误分支 1003 特判）', respStatus === 400, `status=${respStatus}`)
    }

    // 补正确动态码 ⇒ 浏览器必须真正进入系统
    const codeToUse = generateTotp(secret)
    await totpInput.fill(codeToUse)
    const filledValue = await totpInput.inputValue().catch(() => '<读取失败>')
    const secondRespP = page
      .waitForResponse((r) => r.url().endsWith('/login') && r.request().method() === 'POST', {
        timeout: 20000
      })
      .catch(() => null)
    await page.locator(LOGIN_BTN_SEL).first().click()
    const secondResp = await secondRespP
    check(
      'S2 补码后确实发出 /login（前端表单校验通过）',
      !!secondResp,
      secondResp ? `status=${secondResp.status()}` : `未发出请求（填值=${JSON.stringify(filledValue)}）`
    )
    let secondCode = null
    let secondMsg = null
    if (secondResp) {
      const sb = await secondResp.json().catch(() => null)
      secondCode = sb?.code ?? null
      secondMsg = sb?.msg ?? null
    }
    check(
      'S2 补正确动态码 ⇒ 后端业务码 200',
      secondCode === 200,
      `code=${secondCode}, msg=${secondMsg || ''}`
    )
    await page
      .waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
      .catch(() => {})
    await sleep(1200)
    check(
      'S2 补正确动态码 ⇒ 浏览器进入系统（两档都必须）',
      !page.url().includes('/login'),
      `落地 URL=${page.url()}`
    )

    await context.close().catch(() => {})

    // ==================== S3：清理 ====================
    log('--- S3：清理一次性用户（先解绑 TOTP，再硬删） ---')
    const cleanup = await cleanupCsUser()
    check('S3 解绑 TOTP（清 Redis totp:enabled，避免 rowid 复用污染）', cleanup.disabled, `disabled=${cleanup.disabled}`)
    check('S3 硬删一次性用户', cleanup.deleted, `deleted=${cleanup.deleted}`)
    const after = await api(`/system/user/list?userName=${encodeURIComponent(CS_USER)}`, {
      token: adminToken
    })
    const remain = (after.body?.rows || []).filter((r) => r.userName === CS_USER).length
    check('S3 删除后列表不再出现该用户', remain === 0, `remaining=${remain}`)

    exitCode = failCount > 0 ? 1 : 0
  } catch (err) {
    failCount += 1
    log(`  ❌ FAIL 未捕获异常：${err && err.stack ? err.stack : err}`)
    exitCode = 1
  } finally {
    // 兜底清理（异常路径也要解绑并删掉一次性用户，避免污染后续 e2e）
    await cleanupCsUser()
    await browser.close().catch(() => {})
  }

  log('============================================')
  log(`总计 ${passCount} 通过，${failCount} 失败`)
  log('============================================')
  process.exit(exitCode)
}

main()
