/**
 * 排序统一层 e2e 专项验证（方案 B 落地验收，纯 API 级、无浏览器）
 *
 * 验证目标：分页列表接口的 orderByColumn/isAsc 动态排序经统一层
 * （PageDomain::sanitize_order_fields + sort::resolve_column 白名单 + 参数化 ORDER BY）真实生效：
 *   - 白名单内列 + asc/desc → 行序按该字段单调
 *   - 白名单外列 → HTTP/业务双 200，且回退默认排序（logininfor 默认 loginTime desc）
 *   - 非法方向值（isAsc=evil）→ 双 200，且回退 Desc
 *   - 新接入表（config）→ 白名单列生效
 *
 * 登录：fetchCaptchaForApi（自取 /captchaImage → redis 读真码 → POST /login），无假码。
 * 运行（PowerShell）：
 *   $env:STEPBY_TEST_USER='admin'; $env:STEPBY_TEST_PASS='admin123'
 *   node tests/e2e/sort-verify.mjs
 * 退出码：全部通过 0，任一失败 1。
 */

import { TEST_USER, TEST_PASS, BASE_URL, http_request } from './test-config.mjs'
import { fetchCaptchaForApi } from './e2e/run/auth.mjs'

const results = []
let token = ''

function log(msg) {
  console.log(msg)
}

/** API 登录拿 token（复用 deep-e2e 同款链路） */
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

/** 带 token 请求分页列表，返回解析后的 JSON（断言双 200） */
async function getList(path, query) {
  const url = `${BASE_URL}${path}?${query}`
  const resp = await http_request(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  })
  if (resp.statusCode !== 200) {
    throw new Error(`HTTP ${resp.statusCode}: ${resp.body.slice(0, 200)}`)
  }
  const data = JSON.parse(resp.body)
  if (data.code !== 200) {
    throw new Error(`业务 code=${data.code}: ${String(data.msg || '').slice(0, 200)}`)
  }
  if (!Array.isArray(data.rows)) {
    throw new Error(`响应缺少 rows 数组: ${resp.body.slice(0, 200)}`)
  }
  return data
}

/**
 * 单调性判定（允许相等；同格式时间字符串字典序=时间序）。
 * 空值/null 跳过（单独计数，不参与方向断言）。
 * @returns {{ok: boolean, detail?: string}}
 */
function isMonotonic(rows, field, dir) {
  const vals = rows.map((r) => r?.[field]).filter((v) => v !== null && v !== undefined && v !== '')
  const cmp = (a, b) => {
    const na = Number(a)
    const nb = Number(b)
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
      return na - nb
    }
    return a < b ? -1 : a > b ? 1 : 0
  }
  for (let i = 1; i < vals.length; i++) {
    const c = cmp(vals[i - 1], vals[i])
    if (dir === 'asc' ? c > 0 : c < 0) {
      return {
        ok: false,
        detail: `第 ${i - 1}→${i} 行违反${dir === 'asc' ? '非降' : '非升'}: ${JSON.stringify(vals[i - 1])} → ${JSON.stringify(vals[i])}`
      }
    }
  }
  return { ok: true, detail: `有效样本 ${vals.length}/${rows.length} 行` }
}

/** 执行一个用例并记录结果 */
async function runCase(name, fn) {
  try {
    const note = await fn()
    results.push({ name, pass: true, note: note || '' })
    log(`  ✅ PASS ${name}${note ? ` — ${note}` : ''}`)
  } catch (e) {
    results.push({ name, pass: false, note: e.message })
    log(`  ❌ FAIL ${name} — ${e.message}`)
  }
}

async function main() {
  log(`=== 排序统一层 e2e 专项验证（后端 ${BASE_URL}）===`)
  await login()
  const cases = [
    // 1/2. logininfor 白名单内列 loginTime asc/desc 生效
    [
      'logininfor loginTime asc 生效',
      async () => {
        const d = await getList('/monitor/logininfor/list', 'pageNum=1&pageSize=50&orderByColumn=loginTime&isAsc=asc')
        const r = isMonotonic(d.rows, 'loginTime', 'asc')
        if (!r.ok) throw new Error(r.detail)
        return `${d.total} 条中取 ${d.rows.length} 行，${r.detail}`
      }
    ],
    [
      'logininfor loginTime desc 生效',
      async () => {
        const d = await getList('/monitor/logininfor/list', 'pageNum=1&pageSize=50&orderByColumn=loginTime&isAsc=desc')
        const r = isMonotonic(d.rows, 'loginTime', 'desc')
        if (!r.ok) throw new Error(r.detail)
        return `${d.total} 条中取 ${d.rows.length} 行，${r.detail}`
      }
    ],
    // 3. 白名单内列 userName asc（方向区分度：userName 升序 ≠ 默认 loginTime desc）
    [
      'logininfor userName asc 生效（白名单内）',
      async () => {
        const d = await getList('/monitor/logininfor/list', 'pageNum=1&pageSize=50&orderByColumn=userName&isAsc=asc')
        const r = isMonotonic(d.rows, 'userName', 'asc')
        if (!r.ok) throw new Error(r.detail)
        return `${d.total} 条中取 ${d.rows.length} 行，${r.detail}`
      }
    ],
    // 4. 白名单外列 → 双 200 且回退默认（loginTime desc 非升）
    [
      'logininfor 白名单外列回退默认排序',
      async () => {
        const d = await getList(
          '/monitor/logininfor/list',
          'pageNum=1&pageSize=50&orderByColumn=not_a_real_column&isAsc=asc'
        )
        const r = isMonotonic(d.rows, 'loginTime', 'desc')
        if (!r.ok) throw new Error(`白名单外列未回退默认 loginTime desc：${r.detail}`)
        return `双 200 且回退 loginTime desc，${r.detail}`
      }
    ],
    // 5. operlog operTime desc 生效
    [
      'operlog operTime desc 生效',
      async () => {
        const d = await getList('/monitor/operlog/list', 'pageNum=1&pageSize=50&orderByColumn=operTime&isAsc=desc')
        const r = isMonotonic(d.rows, 'operTime', 'desc')
        if (!r.ok) throw new Error(r.detail)
        return `${d.total} 条中取 ${d.rows.length} 行，${r.detail}`
      }
    ],
    // 6. user userId asc 生效（数字字段单调）
    [
      'user userId asc 生效',
      async () => {
        const d = await getList('/system/user/list', 'pageNum=1&pageSize=50&orderByColumn=userId&isAsc=asc')
        const r = isMonotonic(d.rows, 'userId', 'asc')
        if (!r.ok) throw new Error(r.detail)
        return `${d.total} 条中取 ${d.rows.length} 行，${r.detail}`
      }
    ],
    // 7. config configKey asc 生效（批量接入新表）
    [
      'config configKey asc 生效（新接入表）',
      async () => {
        const d = await getList('/system/config/list', 'pageNum=1&pageSize=50&orderByColumn=configKey&isAsc=asc')
        const r = isMonotonic(d.rows, 'configKey', 'asc')
        if (!r.ok) throw new Error(r.detail)
        return `${d.total} 条中取 ${d.rows.length} 行，${r.detail}`
      }
    ],
    // 8. 非法方向值 → 双 200 且回退 Desc
    [
      'logininfor 非法 isAsc 回退 Desc',
      async () => {
        const d = await getList(
          '/monitor/logininfor/list',
          'pageNum=1&pageSize=50&orderByColumn=loginTime&isAsc=evil_value'
        )
        const r = isMonotonic(d.rows, 'loginTime', 'desc')
        if (!r.ok) throw new Error(`非法方向未回退 Desc：${r.detail}`)
        return `双 200 且回退 Desc，${r.detail}`
      }
    ]
  ]

  log(`登录成功（${TEST_USER}），开始 ${cases.length} 个用例\n`)

  for (const [name, fn] of cases) {
    await runCase(name, fn)
  }

  const passed = results.filter((r) => r.pass).length
  const failed = results.length - passed
  log(`\n=== 汇总：${passed}/${results.length} 通过，${failed} 失败 ===`)
  if (failed > 0) {
    log('失败明细:')
    for (const r of results.filter((x) => !x.pass)) {
      log(`  - ${r.name}: ${r.note}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(`❌ 脚本异常: ${e.message}`)
  process.exit(1)
})
