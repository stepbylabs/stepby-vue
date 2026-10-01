/**
 * 查询后端 /getRouters 接口并打印所有注册的菜单路径，
 * 用于诊断前端路由 404 问题（如 /monitor/operlog、/monitor/logininfor）。
 *
 * 用法：node check-routers.mjs
 */
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs'

const BACKEND = process.env.BACKEND_URL || BASE_URL

async function main() {
  // 登录获取 token
  const loginRes = await fetch(`${BACKEND}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS, code: '', uuid: '' })
  })
  if (!loginRes.ok) {
    console.error(`登录失败: HTTP ${loginRes.status}`)
    process.exit(1)
  }
  const loginJson = await loginRes.json()
  const token = loginJson.token || loginJson.data?.token
  if (!token) {
    console.error('未获取到 token:', loginJson)
    process.exit(1)
  }

  // 拉取路由
  const res = await fetch(`${BACKEND}/getRouters`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    console.error(`getRouters 失败: HTTP ${res.status}`)
    process.exit(1)
  }
  const json = await res.json()
  const routers = json.data || []

  // 扁平化所有路径
  const flat = (arr, parent = '') => {
    const out = []
    for (const item of arr) {
      const fullPath = parent ? `${parent}/${item.path}`.replace(/\/+/g, '/') : item.path
      out.push({
        path: fullPath,
        name: item.name,
        component: item.component,
        hidden: item.hidden,
        menuType: item.menuType,
        i18nKey: item.meta?.i18nKey || '',
        title: item.meta?.title || ''
      })
      if (item.children && item.children.length) {
        out.push(...flat(item.children, fullPath))
      }
    }
    return out
  }
  const all = flat(routers)

  console.log(`========== 共 ${all.length} 条路由 ==========`)
  for (const r of all) {
    const i18nMark = r.i18nKey ? `[${r.i18nKey}]` : '[NO_KEY]'
    console.log(
      `${r.hidden ? '[H]' : '   '} ${r.path.padEnd(40)} ${r.menuType || '-'}  ${r.component || ''}  ${i18nMark}  "${r.title}"`
    )
  }

  // 检查关键路径
  const critical = [
    '/system/log/operlog',
    '/monitor/logininfor',
    '/monitor/online',
    '/monitor/audit-dashboard',
    '/monitor/cache',
    '/monitor/health',
    '/monitor/ip-location',
    '/monitor/backup',
    '/monitor/task',
    '/monitor/rateLimit',
    '/tool/about',
    '/tool/changelog',
    '/tool/shortcuts',
    '/tool/help',
    '/system/user',
    '/system/role',
    '/system/menu',
    '/system/dept',
    '/system/dict',
    '/system/config',
    '/system/notice',
    '/system/notice-center',
    '/dashboard',
    '/workbench'
  ]
  console.log(`\n========== 关键路径检查 ==========`)
  for (const p of critical) {
    const found = all.find((r) => r.path === p || r.path.endsWith(p))
    console.log(`${found ? '✅' : '❌'} ${p}`)
  }
}

main().catch((err) => {
  console.error('运行错误:', err.message)
  process.exit(1)
})
