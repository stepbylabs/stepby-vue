/* eslint-disable no-console */
/**
 * 检查所有菜单的 i18nKey 是否在语言包中存在，
 * 用于诊断语言切换时部分菜单标题未翻译的问题。
 *
 * 用法：node check-menu-i18n.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BACKEND = process.env.BACKEND_URL || BASE_URL
const UI_DIR = path.resolve(__dirname, '../yebot-ui')

async function main() {
  // 登录
  const loginRes = await fetch(`${BACKEND}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS, code: '', uuid: '' })
  })
  if (!loginRes.ok) {
    console.error(`登录失败: HTTP ${loginRes.status} ${await loginRes.text()}`)
    process.exit(1)
  }
  const loginJson = await loginRes.json()
  const token = loginJson.token || loginJson.data?.token

  // 拉取路由
  const res = await fetch(`${BACKEND}/getRouters`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const json = await res.json()
  const routers = json.data || []

  // 扁平化提取 meta
  const flat = (arr, parent = '') => {
    const out = []
    for (const item of arr) {
      const fullPath = parent ? `${parent}/${item.path}`.replace(/\/+/g, '/') : item.path
      out.push({
        path: fullPath,
        name: item.name,
        title: item.meta?.title,
        i18nKey: item.meta?.i18nKey,
        menuType: item.menuType
      })
      if (item.children && item.children.length) {
        out.push(...flat(item.children, fullPath))
      }
    }
    return out
  }
  const all = flat(routers)

  // 读取语言包源文件
  const zhContent = fs.readFileSync(path.join(UI_DIR, 'src/i18n/locales/zh-CN.ts'), 'utf-8')
  const enContent = fs.readFileSync(path.join(UI_DIR, 'src/i18n/locales/en-US.ts'), 'utf-8')

  console.log(`========== 菜单 i18n 检查（共 ${all.length} 项）==========`)
  const missing = []
  const noKey = []
  const ok = []
  for (const m of all) {
    if (!m.i18nKey) {
      noKey.push(m)
      console.log(`⚠️  NO_KEY  ${m.path.padEnd(40)} title="${m.title}"`)
    } else {
      // 在语言包源码中检查 key 是否存在（粗略匹配 `key':` 或 `key':`）
      const keyPattern = new RegExp(`['"\`]${escapeReg(m.i18nKey)}['"\`]\\s*:`)
      const inZh = keyPattern.test(zhContent)
      const inEn = keyPattern.test(enContent)
      if (inZh && inEn) {
        ok.push(m)
        console.log(`✅ OK     ${m.path.padEnd(40)} i18nKey="${m.i18nKey}"`)
      } else {
        missing.push({ ...m, inZh, inEn })
        console.log(
          `❌ MISS   ${m.path.padEnd(40)} i18nKey="${m.i18nKey}" zh=${inZh} en=${inEn}`
        )
      }
    }
  }

  console.log(`\n========== 汇总 ==========`)
  console.log(`✅ 已翻译: ${ok.length}`)
  console.log(`⚠️  未配置 i18nKey: ${noKey.length}`)
  console.log(`❌ i18nKey 缺失翻译: ${missing.length}`)
  if (noKey.length) {
    console.log(`\n--- 未配置 i18nKey 的菜单 ---`)
    for (const m of noKey) console.log(`  ${m.path.padEnd(40)} title="${m.title}"`)
  }
  if (missing.length) {
    console.log(`\n--- i18nKey 缺失翻译的菜单 ---`)
    for (const m of missing) {
      console.log(`  ${m.path.padEnd(40)} i18nKey="${m.i18nKey}" zh=${m.inZh} en=${m.inEn}`)
    }
  }
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

main().catch(err => {
  console.error('运行错误:', err.message)
  process.exit(1)
})
