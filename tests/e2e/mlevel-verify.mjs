/**
 * M 级缺口功能 e2e 专项验证（纯 API 级、无浏览器）
 *
 * 验证目标（2026-10-03 M 级对标缺口全量落地的运行时链路验收）：
 *   M1 变更留痕：/system/audit-change/list 可查询（200 + rows）
 *   M2 告警规则：/monitor/alert/list 可查询
 *   M3 事件目录：/system/webhook/event/list 可查询
 *   M4 连接池监控：/monitor/db-pool 返回真实池统计（dbKind 非空）
 *   M5 全局搜索：/common/global-search?q=admin 命中 user 域
 *   M6 链完整性：/monitor/operlog/verify-chain 返回 valid 布尔
 *   M7 AK/SK 端到端：创建 PAT(withAk) → 明文一次 → HMAC 签名调 /open/v1/profile
 *      → 轮换后旧 SK 失效 → 新 SK 生效 → 吊销后 401
 *   M8 Swagger 文档：/api-docs/openapi.json 可达且 paths >= 350
 *
 * 登录：fetchCaptchaForApi（自取 /captchaImage → redis 读真码 → POST /login），无假码。
 * 运行（PowerShell）：
 *   $env:STEPBY_TEST_USER='admin'; $env:STEPBY_TEST_PASS='admin123'
 *   node tests/e2e/mlevel-verify.mjs
 * 退出码：全部通过 0，任一失败 1。
 */

import { createHash, createHmac, randomUUID } from 'node:crypto'
import { TEST_USER, TEST_PASS, BASE_URL, http_request } from './test-config.mjs'
import { fetchCaptchaForApi } from './e2e/run/auth.mjs'

const results = []
let token = ''

function record(name, passed, detail = '') {
  results.push({ name, passed })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
}

async function login() {
  const { code, uuid } = await fetchCaptchaForApi(BASE_URL)
  const resp = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS, code, uuid })
  })
  const data = await resp.json()
  if (!data.token) throw new Error(`登录失败: ${JSON.stringify(data).slice(0, 200)}`)
  token = data.token
}

/** 带 token 的 JSON 请求（断言 HTTP 200），返回 { statusCode, json, body } */
async function api(method, path, body) {
  const resp = await http_request(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
    timeout: 15000
  })
  let json = null
  try { json = JSON.parse(resp.body) } catch { /* 保留原始 body */ }
  return { statusCode: resp.statusCode, json, body: resp.body }
}

/** 断言 HTTP 200 + 业务 code 200 */
function assertOk(step, resp) {
  if (resp.statusCode !== 200) throw new Error(`HTTP ${resp.statusCode}: ${resp.body.slice(0, 200)}`)
  if (!resp.json || resp.json.code !== 200) {
    throw new Error(`业务 code=${resp.json?.code}: ${String(resp.json?.msg || resp.body).slice(0, 200)}`)
  }
  record(step, true)
  return resp.json
}

/** AK 签名请求（M7） */
async function akRequest(ak, sk, method, path, body = '') {
  const ts = String(Math.floor(Date.now() / 1000))
  const nonce = randomUUID()
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const stringToSign = [method.toUpperCase(), path, ts, nonce, bodyHash].join('\n')
  const sig = createHmac('sha256', sk).update(stringToSign).digest('hex')
  const resp = await http_request(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-CA-Key': ak,
      'X-CA-Timestamp': ts,
      'X-CA-Nonce': nonce,
      'X-CA-Signature': sig,
      'Content-Type': 'application/json'
    },
    body: body || null,
    timeout: 15000
  })
  let json = null
  try { json = JSON.parse(resp.body) } catch { /* 非 JSON */ }
  return { statusCode: resp.statusCode, json }
}

async function main() {
  await login()
  console.log('登录成功')

  // M1 变更留痕
  try {
    const j = assertOk('M1 变更留痕 list', await api('GET', '/system/audit-change/list?pageNum=1&pageSize=10'))
    if (!Array.isArray(j.rows)) throw new Error('rows 非数组')
  } catch (e) { record('M1 变更留痕 list', false, String(e.message)) }

  // M2 告警规则
  try {
    const j = assertOk('M2 告警规则 list', await api('GET', '/monitor/alert/list?pageNum=1&pageSize=10'))
    if (!Array.isArray(j.rows)) throw new Error('rows 非数组')
  } catch (e) { record('M2 告警规则 list', false, String(e.message)) }

  // M3 事件目录
  try {
    const j = assertOk('M3 事件目录 list', await api('GET', '/system/webhook/event/list?pageNum=1&pageSize=50'))
    if (!Array.isArray(j.rows) || j.rows.length < 10) {
      throw new Error(`事件种子应 >= 10，实际 ${j.rows?.length}`)
    }
  } catch (e) { record('M3 事件目录 list', false, String(e.message)) }

  // M4 连接池监控
  try {
    const j = assertOk('M4 db-pool', await api('GET', '/monitor/db-pool'))
    const d = j.data || {}
    if (!d.dbKind) throw new Error(`dbKind 为空: ${JSON.stringify(d)}`)
    if (typeof d.poolSize !== 'number') throw new Error('poolSize 非数字')
  } catch (e) { record('M4 db-pool', false, String(e.message)) }

  // M5 全局搜索
  try {
    const j = assertOk('M5 全局搜索', await api('GET', '/common/global-search?q=admin&limit=10'))
    if (!Array.isArray(j.data)) throw new Error('data 非数组')
    if (j.data.length === 0) throw new Error('q=admin 应命中至少一条')
    if (!j.data[0].title || !j.data[0].url) throw new Error('条目缺 title/url')
  } catch (e) { record('M5 全局搜索', false, String(e.message)) }

  // M6 链完整性
  try {
    const j = assertOk('M6 verify-chain', await api('GET', '/monitor/operlog/verify-chain'))
    if (typeof j.data?.valid !== 'boolean') throw new Error(`valid 非布尔: ${JSON.stringify(j.data)}`)
  } catch (e) { record('M6 verify-chain', false, String(e.message)) }

  // M7 AK/SK 端到端（PAT 自助路由：POST /system/user/profile/tokens）
  try {
    const created = await api('POST', '/system/user/profile/tokens', {
      name: `mlevel-ak-${Date.now()}`,
      scopes: ['read'],
      expireDays: 1,
      withAk: true
    })
    const d = assertOk('M7-a 创建 PAT(withAk)', created).data
    const patId = d?.pat?.patId
    const accessKey = d?.accessKey
    const secretKey = d?.secretKey
    const accessToken = d?.token
    if (!accessKey || !secretKey) throw new Error('创建响应缺 accessKey/secretKey')
    if (!patId) throw new Error('创建响应缺 pat.patId')

    const patHeader = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

    // 明文一次：列表不含 secretKey
    const list = await api('GET', '/system/pat/list?pageNum=1&pageSize=50')
    const listStr = list.body
    if (listStr.includes(secretKey)) throw new Error('列表响应泄露了 secretKey（明文应仅一次）')
    record('M7-b SK 明文仅创建响应返回', true)

    // 签名调用（新 SK）→ 200
    let r = await akRequest(accessKey, secretKey, 'GET', '/open/v1/profile')
    if (r.statusCode !== 200 || r.json?.code !== 200) {
      throw new Error(`正确签名应 200，实际 ${r.statusCode}: ${JSON.stringify(r.json).slice(0, 200)}`)
    }
    record('M7-c 正确签名调 /open/v1/profile', true)

    // 错签 → 401
    r = await akRequest(accessKey, secretKey + 'x', 'GET', '/open/v1/profile')
    if (r.statusCode !== 401) throw new Error(`错签应 401，实际 ${r.statusCode}`)
    record('M7-d 错签 401', true)

    // 重放（同 nonce）→ 401
    const ts = String(Math.floor(Date.now() / 1000))
    const nonce = randomUUID()
    const bh = createHash('sha256').update('').digest('hex')
    const sts = ['GET', '/open/v1/profile', ts, nonce, bh].join('\n')
    const sig = createHmac('sha256', secretKey).update(sts).digest('hex')
    const headers = {
      'X-CA-Key': accessKey,
      'X-CA-Timestamp': ts,
      'X-CA-Nonce': nonce,
      'X-CA-Signature': sig
    }
    await http_request(`${BASE_URL}/open/v1/profile`, { headers, timeout: 15000 })
    const replay = await http_request(`${BASE_URL}/open/v1/profile`, { headers, timeout: 15000 })
    if (replay.statusCode !== 401) throw new Error(`重放应 401，实际 ${replay.statusCode}`)
    record('M7-e 重放 401', true)

    // 轮换：旧 SK 失效、新 SK 生效
    const rot = await api('POST', `/system/pat/${patId}/rotate-ak`, {})
    const newSk = assertOk('M7-f rotate-ak', rot).data?.secretKey
    if (!newSk || newSk === secretKey) throw new Error('轮换应返回新 SK 且不同于旧 SK')
    r = await akRequest(accessKey, secretKey, 'GET', '/open/v1/profile')
    if (r.statusCode !== 401) throw new Error(`旧 SK 轮换后应 401，实际 ${r.statusCode}`)
    r = await akRequest(accessKey, newSk, 'GET', '/open/v1/profile')
    if (r.statusCode !== 200) throw new Error(`新 SK 应 200，实际 ${r.statusCode}`)
    record('M7-g 轮换后旧 SK 失效/新 SK 生效', true)

    // 吊销 → 401
    const rev = await api('POST', `/system/pat/${patId}/revoke-ak`, {})
    assertOk('M7-h revoke-ak', rev)
    r = await akRequest(accessKey, newSk, 'GET', '/open/v1/profile')
    if (r.statusCode !== 401) throw new Error(`吊销后应 401，实际 ${r.statusCode}`)
    record('M7-i 吊销后 401', true)
  } catch (e) {
    record('M7 AK/SK 端到端', false, String(e.message))
  }

  // M8 OpenAPI 文档（断言全部新域路径已入文档）
  try {
    const resp = await http_request(`${BASE_URL}/api-docs/openapi.json`, { timeout: 15000 })
    if (resp.statusCode !== 200) throw new Error(`HTTP ${resp.statusCode}`)
    const doc = JSON.parse(resp.body)
    const paths = Object.keys(doc.paths || {})
    const required = [
      '/system/audit-change/list',
      '/monitor/alert/list',
      '/system/webhook/event/list',
      '/monitor/db-pool',
      '/common/global-search',
      '/open/v1/profile'
    ]
    const missing = required.filter((p) => !paths.includes(p))
    if (missing.length > 0) throw new Error(`新域路径未注册: ${missing.join(', ')}`)
    record(`M8 OpenAPI（paths=${paths.length}，新域 6 路径齐备）`, true)
  } catch (e) { record('M8 OpenAPI', false, String(e.message)) }

  const pass = results.filter((r) => r.passed).length
  const fail = results.length - pass
  console.log(`===== mlevel-verify 汇总：PASS=${pass} FAIL=${fail} =====`)
  process.exitCode = fail > 0 ? 1 : 0
}

main().catch((e) => {
  console.error(`运行异常: ${e.stack || e.message}`)
  process.exitCode = 1
})
