/**
 * Passkey / WebAuthn 浏览器级真实凭据端到端测试（Chromium CDP 虚拟认证器）
 *
 * 为什么单独成文：`main.mjs`（15k 行套件）只覆盖"能力位关闭态"的静态回归，
 * 而 Passkey 的**快乐路径**需要浏览器真实产出 attestation / assertion，
 * 只能借助 Chromium DevTools Protocol 的虚拟认证器（`WebAuthn.*`）驱动
 * `navigator.credentials.create/get`。本脚本不 mock、不替换浏览器 API，走真实凭据。
 *
 * 三个场景（每个断言均有明确失败信息，不允许跳过 / 只截图）：
 *   1. 密码登录 → 个人中心「通行密钥」→ 添加（真实 attestation）→ 列表 1 条；
 *   2. 退出登录 → 登录页「使用通行密钥登录」→ 真实 assertion → 进入系统；
 *   3. 个人中心删除该凭据 → 列表清空；再用 passkey 登录应失败（无凭据，反枚举同形提示）。
 *
 * 运行（后端 embedded :8080 + 前端 preview :4173 均需在跑；能力位 auth.webauthn=on）：
 *   PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" \
 *   STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
 *   STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
 *   node webauthn.mjs
 *
 * 依赖：stepby-vue/tests/e2e/node_modules 下的 playwright（与 main.mjs 同源）。
 */

import { createRequire } from 'module'
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs'
import { capturePageCaptcha, fillCaptchaOnPage } from './e2e/run/auth.mjs'

const require = createRequire(import.meta.url)

// 兼容本地/全局安装的 playwright（与 main.mjs 同款回退逻辑）
let chromium
try {
  chromium = require('playwright').chromium
} catch (_) {
  const { execSync } = require('child_process')
  const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
  const globalRequire = createRequire(`file://${globalRoot}/_`)
  chromium = globalRequire('playwright').chromium
}

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.STEPBY_UI_URL || BASE_URL
const BACKEND_URL = process.env.BACKEND_URL || BASE_URL

// 用户名/密码必填（test-config.mjs 已 fail-fast）
const USERNAME = TEST_USER
const PASSKEY_NAME = `e2e-cdp-${Date.now()}`
// passkey 登录失败时后端返回的反枚举统一文案（与密码登录失败同形）
const LOGIN_FAILED_MSG = '用户名或密码错误'

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

const USER_INPUT_SEL =
  'input[placeholder="账号"], input[placeholder="Username"], input[name="username"]'

/**
 * 统计「通行密钥」卡片内的凭据行数（几何可见，规避 el-table 隐藏 pane 干扰）。
 * 定位方式：从卡片内的「添加通行密钥」按钮 closest('.el-card') 取得最内层卡片。
 */
async function passkeyRowCount(page) {
  return page.evaluate(() => {
    const addBtn = [...document.querySelectorAll('button')].find((b) =>
      /添加通行密钥|Add a passkey/.test(b.textContent || '')
    )
    if (!addBtn) return { found: false, rows: -1 }
    const card = addBtn.closest('.el-card')
    if (!card) return { found: false, rows: -1 }
    const rows = [...card.querySelectorAll('.el-table__row')].filter(
      (r) => r.getBoundingClientRect().height > 0
    ).length
    return { found: true, rows }
  })
}

/** 取浏览器内 Admin-Token（前端存于 cookie；http 下无 Secure） */
async function getAdminToken(context) {
  const cookies = await context.cookies(FRONTEND_URL)
  const c = cookies.find((x) => x.name === 'Admin-Token')
  return c ? c.value : null
}

/** 同源 API 读取本人凭据列表（与前端 request.ts 同口径：cookie 取 token + Bearer 头） */
async function apiCredentialCount(page) {
  return page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)Admin-Token=([^;]+)/)
    const token = m ? decodeURIComponent(m[1]) : ''
    const res = await fetch('/system/user/webauthn/credentials', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, code: body && body.code, len: Array.isArray(body && body.data) ? body.data.length : -1 }
  })
}

/** 密码登录（真实表单，验证码开启时经 redis 读真码） */
async function passwordLogin(page) {
  const captchaPromise = capturePageCaptcha(page)
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.locator(USER_INPUT_SEL).first().waitFor({ state: 'visible', timeout: 20000 })
  const captcha = await captchaPromise
  await page.locator(USER_INPUT_SEL).first().fill(USERNAME)
  await page
    .locator('input[placeholder="密码"], input[placeholder="Password"], input[type="password"]')
    .first()
    .fill(TEST_PASS)
  await fillCaptchaOnPage(page, captcha)
  await page
    .locator('button:has-text("登 录"), button:has-text("登录"), button:has-text("Login"), button[type="submit"]')
    .first()
    .click()
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }).catch(() => {})
  await sleep(800)
}

/** 注销：清 localStorage / sessionStorage / cookie，回到登录页 */
async function doLogout(page) {
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.context().clearCookies()
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.locator(USER_INPUT_SEL).first().waitFor({ state: 'visible', timeout: 20000 })
  await sleep(500)
}

async function main() {
  log(`=== Passkey/WebAuthn 浏览器级 e2e（前端 ${FRONTEND_URL} / 后端 ${BACKEND_URL}）===`)

  const browser = await chromium.launch({ headless: true })
  let exitCode = 1
  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // ---- CDP 虚拟认证器（真实产出 attestation / assertion，非 mock）----
    const cdp = await context.newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true
      }
    })
    check('CDP 虚拟认证器已注册', !!authenticatorId, `authenticatorId=${authenticatorId}`)

    // 页面必须支持 WebAuthn（入口渲染依赖 PublicKeyCredential）
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    const supported = await page.evaluate(() => typeof window.PublicKeyCredential !== 'undefined')
    check('浏览器支持 WebAuthn（PublicKeyCredential 存在）', supported)

    // ==================== 场景 1：密码登录 → 添加通行密钥 ====================
    log('--- 场景 1：密码登录 + 添加通行密钥 ---')
    await passwordLogin(page)
    check('S1 密码登录成功（URL 离开 /login）', !page.url().includes('/login'), `url=${page.url()}`)

    await page.goto(`${FRONTEND_URL}/user/profile`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    // 关闭可能的 Tour 引导遮罩
    await page.keyboard.press('Escape').catch(() => {})

    // 切到「通行密钥」tab
    const tab = page.locator('.el-tabs__item', { hasText: '通行密钥' }).first()
    await tab.waitFor({ state: 'visible', timeout: 15000 })
    await tab.click()
    await sleep(500)

    const addBtn = page.locator('button:has-text("添加通行密钥")').first()
    await addBtn.waitFor({ state: 'visible', timeout: 10000 })
    const before = await passkeyRowCount(page)
    check('S1 初始凭据列表为 0 条', before.found && before.rows === 0, `rows=${before.rows}`)

    // 打开新增对话框
    await addBtn.click()
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: '添加通行密钥' }).first()
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    await dialog.locator('.el-input__inner').first().fill(PASSKEY_NAME)

    // 监听真实注册请求（start + finish）
    const startRespP = page
      .waitForResponse(
        (r) => r.url().includes('/system/user/webauthn/register/start') && r.request().method() === 'POST',
        { timeout: 20000 }
      )
      .catch(() => null)
    const finishRespP = page
      .waitForResponse(
        (r) => r.url().includes('/system/user/webauthn/register/finish') && r.request().method() === 'POST',
        { timeout: 25000 }
      )
      .catch(() => null)

    // 点击对话框「确定」→ 触发 navigator.credentials.create（虚拟认证器自动完成）
    await dialog.locator('.el-button--primary').first().click()
    const startResp = await startRespP
    const finishResp = await finishRespP

    check(
      'S1 register/start 返回 200',
      !!startResp && startResp.status() === 200,
      startResp ? `status=${startResp.status()}` : '未捕获到 /register/start 请求'
    )
    check(
      'S1 register/finish 返回 200',
      !!finishResp && finishResp.status() === 200,
      finishResp ? `status=${finishResp.status()}` : '未捕获到 /register/finish 请求'
    )

    // 证据：POST body 含真实 attestation（虚拟认证器产物）
    let attestationOk = false
    let attestationDetail = '无 register/finish 请求体'
    if (finishResp) {
      const pd = finishResp.request().postData() || ''
      try {
        const dto = JSON.parse(pd)
        const rawIdLen = (dto.rawId || '').length
        const attLen = (dto.response && dto.response.attestationObject || '').length
        const cdjLen = (dto.response && dto.response.clientDataJSON || '').length
        attestationOk = rawIdLen > 20 && attLen > 100 && cdjLen > 20 && dto.type === 'public-key'
        attestationDetail = `rawId=${rawIdLen}, attestationObject=${attLen}, clientDataJSON=${cdjLen}, name=${dto.name}`
      } catch (e) {
        attestationDetail = `请求体解析失败: ${String(e.message).slice(0, 60)}`
      }
    }
    check('S1 真实产出 attestation（rawId/attestationObject/clientDataJSON 非空）', attestationOk, attestationDetail)

    await sleep(1500)
    const after = await passkeyRowCount(page)
    check('S1 添加后列表出现 1 条', after.found && after.rows === 1, `rows=${after.rows}`)

    const api1 = await apiCredentialCount(page)
    check('S1 API 复核凭据数 = 1', api1.status === 200 && api1.len === 1, `status=${api1.status}, code=${api1.code}, len=${api1.len}`)

    // ==================== 场景 2：passkey 免密登录 ====================
    log('--- 场景 2：退出登录 + 通行密钥登录 ---')
    await doLogout(page)
    check('S2 注销后回到登录页', page.url().includes('/login'), `url=${page.url()}`)

    // 登录页通行密钥入口可见（浏览器支持性检测）
    const passkeyBtn = page.locator('button:has-text("使用通行密钥登录")').first()
    const passkeyBtnVisible = await passkeyBtn.isVisible({ timeout: 8000 }).catch(() => false)
    check('S2 登录页「使用通行密钥登录」入口可见', passkeyBtnVisible)

    // 先填用户名（passkey 登录需要用户提供用户名以定位凭据）
    await page.locator(USER_INPUT_SEL).first().fill(USERNAME)

    const loginStartP = page
      .waitForResponse(
        (r) => r.url().includes('/login/webauthn/start') && r.request().method() === 'POST',
        { timeout: 20000 }
      )
      .catch(() => null)
    const loginFinishP = page
      .waitForResponse(
        (r) => r.url().includes('/login/webauthn/finish') && r.request().method() === 'POST',
        { timeout: 25000 }
      )
      .catch(() => null)

    await passkeyBtn.click()
    const loginStart = await loginStartP
    const loginFinish = await loginFinishP

    check(
      'S2 login/webauthn/start 返回 200',
      !!loginStart && loginStart.status() === 200,
      loginStart ? `status=${loginStart.status()}` : '未捕获到 /login/webauthn/start'
    )
    check(
      'S2 login/webauthn/finish 返回 200',
      !!loginFinish && loginFinish.status() === 200,
      loginFinish ? `status=${loginFinish.status()}` : '未捕获到 /login/webauthn/finish'
    )

    // 证据：断言响应含真实签名
    let assertionOk = false
    let assertionDetail = '无 login/webauthn/finish 请求体'
    if (loginFinish) {
      const pd = loginFinish.request().postData() || ''
      try {
        const dto = JSON.parse(pd)
        const sigLen = (dto.response && dto.response.signature || '').length
        const authLen = (dto.response && dto.response.authenticatorData || '').length
        assertionOk = sigLen > 20 && authLen > 20 && dto.username === USERNAME
        assertionDetail = `signature=${sigLen}, authenticatorData=${authLen}, username=${dto.username}`
      } catch (e) {
        assertionDetail = `请求体解析失败: ${String(e.message).slice(0, 60)}`
      }
    }
    check('S2 真实产出 assertion（signature/authenticatorData 非空）', assertionOk, assertionDetail)

    // 登录成功：URL 离开 /login，且 token cookie 已写入
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }).catch(() => {})
    await sleep(1200)
    check('S2 通行密钥登录成功进入系统', !page.url().includes('/login'), `落地 URL=${page.url()}`)
    const token2 = await getAdminToken(context)
    check('S2 登录后 Admin-Token 已签发', !!token2 && token2.length > 20, `token 长度=${token2 ? token2.length : 0}`)

    // ==================== 场景 3：删除凭据 → passkey 登录失败 ====================
    log('--- 场景 3：删除凭据 + 删除后 passkey 登录失败 ---')
    await page.goto(`${FRONTEND_URL}/user/profile`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
    const tab3 = page.locator('.el-tabs__item', { hasText: '通行密钥' }).first()
    await tab3.waitFor({ state: 'visible', timeout: 15000 })
    await tab3.click()
    await sleep(500)

    const beforeDel = await passkeyRowCount(page)
    check('S3 删除前列表为 1 条', beforeDel.found && beforeDel.rows === 1, `rows=${beforeDel.rows}`)

    const delRespP = page
      .waitForResponse(
        (r) => /\/system\/user\/webauthn\/credentials\/\d+$/.test(r.url()) && r.request().method() === 'DELETE',
        { timeout: 20000 }
      )
      .catch(() => null)

    await page.locator('button:has-text("删除"):visible').first().click()
    // ElMessageBox 确认
    const confirmBox = page.locator('.el-message-box:visible').first()
    await confirmBox.waitFor({ state: 'visible', timeout: 10000 })
    await confirmBox.locator('.el-button--primary').first().click()

    const delResp = await delRespP
    check(
      'S3 DELETE 凭据返回 200',
      !!delResp && delResp.status() === 200,
      delResp ? `status=${delResp.status()}` : '未捕获到 DELETE /credentials/{id}'
    )

    await sleep(1500)
    const afterDel = await passkeyRowCount(page)
    check('S3 删除后列表清空（0 条）', afterDel.found && afterDel.rows === 0, `rows=${afterDel.rows}`)
    const api3 = await apiCredentialCount(page)
    check('S3 API 复核凭据数 = 0', api3.status === 200 && api3.len === 0, `status=${api3.status}, len=${api3.len}`)

    // 删除后再尝试 passkey 登录：应失败（无凭据），提示与密码登录失败同形（反枚举）
    await doLogout(page)
    await page.locator(USER_INPUT_SEL).first().fill(USERNAME)

    const failStartP = page
      .waitForResponse(
        (r) => r.url().includes('/login/webauthn/start') && r.request().method() === 'POST',
        { timeout: 20000 }
      )
      .catch(() => null)
    let finishCalled = false
    page.on('request', (r) => {
      if (r.url().includes('/login/webauthn/finish')) finishCalled = true
    })

    await page.locator('button:has-text("使用通行密钥登录")').first().click()
    const failStart = await failStartP
    const failStatus = failStart ? failStart.status() : 0
    let failBody = null
    if (failStart) {
      failBody = await failStart.json().catch(() => null)
    }

    check(
      'S3 无凭据时 login/webauthn/start 被拒（401）',
      failStatus === 401,
      `status=${failStatus}, body=${failBody ? JSON.stringify(failBody).slice(0, 120) : 'N/A'}`
    )
    const msgOk = !!failBody && typeof failBody.msg === 'string' && failBody.msg.includes(LOGIN_FAILED_MSG)
    check(`S3 反枚举提示与密码登录失败同形（含「${LOGIN_FAILED_MSG}」）`, msgOk, `msg=${failBody ? failBody.msg : 'N/A'}`)

    await sleep(1500)
    check('S3 未发出 login/webauthn/finish（浏览器未拿到挑战）', !finishCalled)
    check('S3 仍停留在登录页（未进入系统）', page.url().includes('/login'), `url=${page.url()}`)

    // 失败 Toast 文案（request 拦截器展示后端 msg）
    const toastText = await page.locator('.el-message--error').first().innerText().catch(() => '')
    check(
      'S3 页面展示失败 Toast',
      toastText.includes(LOGIN_FAILED_MSG),
      `toast=${JSON.stringify(toastText.slice(0, 60))}`
    )

    // 清理：确保虚拟认证器被移除（不留状态）
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {})
    await context.close().catch(() => {})

    exitCode = failCount > 0 ? 1 : 0
  } catch (err) {
    failCount += 1
    log(`  ❌ FAIL 未捕获异常：${err && err.stack ? err.stack : err}`)
    exitCode = 1
  } finally {
    await browser.close().catch(() => {})
  }

  log('============================================')
  log(`总计 ${passCount} 通过，${failCount} 失败`)
  log('============================================')
  process.exit(exitCode)
}

main()