import { fetchCaptchaForApi } from './e2e/run/auth.mjs'
import { TEST_USER, TEST_PASS, BASE_URL, http_request } from './test-config.mjs'

const { code, uuid } = await fetchCaptchaForApi(BASE_URL)
const login = await (await fetch(`${BASE_URL}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: TEST_USER, password: TEST_PASS, code, uuid })
})).json()
const token = login.token

async function api(method, path, body) {
  const resp = await http_request(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
    timeout: 15000
  })
  let json = null
  try { json = JSON.parse(resp.body) } catch { /* html */ }
  return { statusCode: resp.statusCode, json }
}

let fail = 0
function record(name, ok, detail = '') {
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`)
}

// F1 关闭态：矩阵读 → HTTP 403（fieldperm disabled）
let r = await api('GET', '/system/role/field-perm/2?tableKey=sys_user')
record('F1 关闭态矩阵读 403', r.statusCode === 403, `actual=${r.statusCode}`)

// F2 关闭态：field-hidden → 空数组（零行为变化）
r = await api('GET', '/system/user/field-hidden?tableKey=sys_user')
const hidden = r.json?.data
record('F2 关闭态 field-hidden 空集', r.statusCode === 200 && Array.isArray(hidden) && hidden.length === 0, `actual=${JSON.stringify(hidden)}`)

// F3 user 列表关闭态字段全量（admin 视角原值本就不掩码；断言 phonenumber 键存在即全列）
r = await api('GET', '/system/user/list?pageNum=1&pageSize=5')
const row = r.json?.rows?.[0]
record('F3 user 列表字段全量', r.statusCode === 200 && row && 'phonenumber' in row, `hasPhonenumber=${row ? ('phonenumber' in row) : 'no-row'}`)

// F4 掩码 M1：普通视角（无法在本脚本切角色，退化为 admin 自视角校验接口可用性）
r = await api('GET', '/system/user/2')
record('F4 user 详情接口可用', r.statusCode === 200 && r.json?.code === 200)

// F5 fieldPerm 矩阵白名单拒绝（非法 tableKey）
r = await api('GET', '/system/role/field-perm/2?tableKey=evil_table')
record('F5 非法 tableKey 拒绝', r.statusCode !== 200 || (r.json && r.json.code !== 200), `status=${r.statusCode}`)

console.log(`===== fieldperm-smoke 汇总：${fail === 0 ? 'ALL PASS' : fail + ' FAIL'} =====`)
process.exitCode = fail > 0 ? 1 : 0
