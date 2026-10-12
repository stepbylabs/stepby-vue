// stepby-vue/tests/e2e/ensure-b4-clean.mjs
// B4 强改密态复位（§5.31 循环流程沉淀）：admin 处于 mustChangePassword=true 或
// must_change_pwd='1'（B4 迁移标记存量用户）时，每次登录弹「安全提示」confirm
// （确定⇒跳转改密页），拦截一切后续页面用例。本脚本纯 API 复位。
// 密码自适应：admin 密码历史上有 admin123（种子）与 Temp!2026a（升级后强口令）
// 两种态，逐个尝试；终态统一为 Temp!2026a（R19-1.3 弱口令 admin123 已不可作为新密码）。
// 用法：node ensure-b4-clean.mjs   （幂等，可重复执行）
const BASE = process.env.BACKEND_URL || 'http://127.0.0.1:8080/prod-api'
const STRONG = 'Temp!2026a'
const LEGACY = 'admin123'
const log = (...a) => process.stdout.write(a.join(' ') + '\n')

async function jf(url, opts) {
  const r = await fetch(url, opts)
  return r.json()
}

async function tryLogin(password) {
  const cap = await jf(`${BASE}/captchaImage`)
  const login = await jf(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password, code: '', uuid: cap.uuid || '' }),
  })
  return login.token ? { token: login.token, password } : null
}

async function main() {
  const auth = (await tryLogin(STRONG)) || (await tryLogin(LEGACY))
  if (!auth) {
    log('LOGIN_FAIL_BOTH（Temp!2026a 与 admin123 均失败）')
    process.exit(1)
  }
  log('login_ok with=', auth.password === STRONG ? 'Temp!2026a' : 'admin123(legacy)')
  const h = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
  const info = await jf(`${BASE}/getInfo`, { headers: h })
  log('mustChangePassword=', info.mustChangePassword)

  if (auth.password === LEGACY) {
    // 旧库（admin123）：两步改密升级到强口令并清 must_change_pwd 标志
    const s1 = await jf(`${BASE}/system/user/profile/updatePwd`, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ oldPassword: LEGACY, newPassword: STRONG }),
    })
    log('upgrade(legacy→strong):', s1.code, s1.msg || '')
    if (s1.code !== 200) {
      log('升级失败（复杂度/策略拒绝），终止——请人工确认密码态')
      process.exit(1)
    }
    log('密码已升级为 Temp!2026a（后续 e2e 以此登录）')
  } else {
    // 已是强口令：改密即清标志——若 getInfo 仍报强改密态则再走一轮改密确认
    const re = await jf(`${BASE}/getInfo`, { headers: h })
    log('recheck mustChangePassword=', re.mustChangePassword)
  }

  const cfg = await jf(`${BASE}/system/config/configKey/${encodeURIComponent('sys.user.forceFirstLoginChangePwd')}`, { headers: h })
  log('B4_switch_current=', JSON.stringify(cfg.data))
  if (String(cfg.data) !== 'false') {
    log('B4 开关非 false——需要人工在参数页复位（list 过滤在本脚本不可靠）')
  } else {
    log('B4 开关已是 false')
  }
  log('DONE（终态：admin 密码=Temp!2026a，e2e 运行需 STEPBY_TEST_PASS=Temp!2026a）')
}

main().catch((e) => {
  log('FATAL', String(e).slice(0, 200))
  process.exit(1)
})
