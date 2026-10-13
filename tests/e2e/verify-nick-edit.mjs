/**
 * 用户编辑昵称生效性 API 验证：新建 → PUT 改昵称 → GET 详情核对。
 * 若 PUT 200 后 GET 昵称未变 = 后端真实缺陷（feature 52 编辑断言失败的根因）。
 */
const B = 'http://127.0.0.1:8080'

const cap = await fetch(`${B}/captchaImage`).then((r) => r.json())
const login = await fetch(`${B}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123', code: 'x', uuid: cap.uuid })
}).then((r) => r.json())
if (!login.token) {
  console.log('LOGIN_FAIL ' + JSON.stringify(login).slice(0, 120))
  process.exit(1)
}
const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }

// 1. 新建用户（最小集，走 API 同 feature 52 表单字段）
const uname = `e2e_nick_${Date.now().toString(36)}`
const create = await fetch(`${B}/system/user`, {
  method: 'POST',
  headers: h,
  body: JSON.stringify({
    userName: uname,
    nickName: 'NICK_A',
    password: 'Test@12345',
    // 批六十四：时间戳号——固定号在复跑时与上次运行残留用户混淆（批三十七唯一性纪律）
    phonenumber: '151' + String(Date.now()).slice(-8),
    email: 'e2e_nick@example.com',
    deptId: 103,
    roleIds: [2],
    status: '0'
  })
}).then((r) => r.json())
console.log('CREATE code=' + create.code + ' msg=' + (create.msg || '').slice(0, 40))
if (create.code !== 200 && create.code !== 0) process.exit(1)

// 2. 查详情拿 userId
const list = await fetch(`${B}/system/user/list?pageNum=1&pageSize=10&userName=${uname}`, { headers: h }).then((r) => r.json())
const row = (list.rows || [])[0]
if (!row) {
  console.log('LIST_EMPTY total=' + list.total)
  process.exit(1)
}
console.log(`FOUND userId=${row.userId} nick=${row.nickName} phonenumber=${row.phonenumber}`)

// 3. PUT 修改昵称（全量更新语义，携带原字段）
const put = await fetch(`${B}/system/user`, {
  method: 'PUT',
  headers: h,
  body: JSON.stringify({
    userId: row.userId,
    userName: row.userName,
    nickName: 'NICK_B',
    phonenumber: row.phonenumber,
    email: row.email,
    deptId: row.deptId,
    roleIds: row.roleId ? [row.roleId] : [2],
    status: row.status
  })
}).then((r) => r.json())
console.log('PUT code=' + put.code + ' msg=' + (put.msg || '').slice(0, 40))

// 4. GET 详情核对昵称
const detail = await fetch(`${B}/system/user/${row.userId}`, { headers: h }).then((r) => r.json())
const nick = detail.data?.user?.nickName ?? detail.data?.nickName
console.log(`AFTER_PUT nick=${nick} expected=NICK_B verdict=${nick === 'NICK_B' ? 'EFFECTIVE' : 'NOT_EFFECTIVE_BUG'}`)

// 5. 清理
const del = await fetch(`${B}/system/user/${row.userId}`, { method: 'DELETE', headers: h }).then((r) => r.json())
console.log('CLEANUP code=' + del.code)
