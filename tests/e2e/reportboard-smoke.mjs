import { fetchCaptchaForApi } from './e2e/run/auth.mjs'
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs'

const { code, uuid } = await fetchCaptchaForApi(BASE_URL)
const login = await (await fetch(`${BASE_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: TEST_USER, password: TEST_PASS, code, uuid }) })).json()
const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }
let fail = 0
const rec = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' - ' + d : ''}`) }

// A. 数据源白名单
const src = await (await fetch(`${BASE_URL}/tool/report-board/sources`, { headers: h })).json()
rec('A1 sources 白名单返回', src.code === 200 && Array.isArray(src.data) && src.data.length >= 4, `keys=${(src.data || []).map((s) => s.sourceKey).join('|')}`)

// B. 数据源白名单外 400
const bad = await fetch(`${BASE_URL}/tool/report-board/data/evil_source?range=7d`, { headers: h })
rec('A2 白名单外 sourceKey 400', bad.status === 400, `status=${bad.status}`)

// C. 真实数据源取数（login_trend 7d）
const data = await (await fetch(`${BASE_URL}/tool/report-board/data/login_trend?range=7d`, { headers: h })).json()
rec('A3 login_trend 7d 真实取数', data.code === 200 && data.data !== null, JSON.stringify(data.data || {}).slice(0, 80))

// B. 保存配置 → 回读 → 删除（list 返回 data 数组，非分页 rows）
const name = `smoke-board-${Date.now()}`
const save = await (await fetch(`${BASE_URL}/tool/report-board`, { method: 'POST', headers: h, body: JSON.stringify({ name, config: { cards: [{ id: 'c1', title: '登录趋势', chartType: 'line', sourceKey: 'login_trend', size: { w: 2, h: 1 } }] } }) })).json()
rec('B1 保存看板配置', save.code === 200, `code=${save.code} ${save.msg}`)
const list = await (await fetch(`${BASE_URL}/tool/report-board/list`, { headers: h })).json()
const row = (list.data || []).find((r) => r.name === name)
rec('B2 回读含卡片', !!row && JSON.stringify(row.config || {}).includes('login_trend') && row.id > 0, `id=${row?.id}`)
if (row) {
  const del = await (await fetch(`${BASE_URL}/tool/report-board/${row.id}`, { method: 'DELETE', headers: h })).json()
  rec('B3 删除看板', del.code === 200)
}

console.log(`===== reportboard-smoke 汇总：${fail === 0 ? 'ALL PASS' : fail + ' FAIL'} =====`)
process.exitCode = fail > 0 ? 1 : 0
