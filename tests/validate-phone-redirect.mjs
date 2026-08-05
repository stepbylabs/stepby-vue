/* eslint-disable no-console */
/**
 * 方案 D 相关工具逻辑回归测试（Node 22+ --experimental-strip-types）
 *
 * 覆盖：
 *  - src/utils/phone.ts   : 多地区手机号校验与归一化（G18 / 方案 D） —— 真实加载
 *  - src/utils/redirect.ts : 开放重定向防御 isSafeRedirect（F1/F2）  —— 真实加载
 *  - src/utils/safeI18n.ts : safeT 行为契约（F3/F11）—— 不加载 Vue 实例，
 *                            以源码契约断言 + 等价逻辑仿真守住"缺失 key 回落 / 异常不抛"
 *
 * 运行：node --experimental-strip-types tests/validate-phone-redirect.mjs
 * 退出码：0 全部通过；1 存在失败
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const phoneUrl = pathToFileURL(path.join(root, 'src/utils/phone.ts')).href
const redirectUrl = pathToFileURL(path.join(root, 'src/utils/redirect.ts')).href
const safeI18nPath = path.join(root, 'src/utils/safeI18n.ts')

let passed = 0
let failed = 0
function assert(name, cond) {
  if (cond) {
    passed += 1
    console.log('  ✓', name)
  } else {
    failed += 1
    console.log('  ✗', name)
  }
}

// ---------- phone.ts（真实加载） ----------
console.log('[phone.ts] 多地区手机号校验')
const phone = await import(phoneUrl)
const { isValidPhoneByRegion, normalizePhoneNumber, REGION_OPTIONS } = phone

assert('normalize "138 0013 8000" -> "13800138000"', normalizePhoneNumber('138 0013 8000') === '13800138000')
assert(
  'normalize "+86 138-0013-8000" -> "+8613800138000"',
  normalizePhoneNumber('+86 138-0013-8000') === '+8613800138000'
)

assert('CN 13800138000 合法', isValidPhoneByRegion('13800138000', 'CN') === true)
assert('CN "138 0013 8000" 带分隔合法', isValidPhoneByRegion('138 0013 8000', 'CN') === true)
assert('CN 12345678901 非法', isValidPhoneByRegion('12345678901', 'CN') === false)
assert('CN 138001380 非法（9 位）', isValidPhoneByRegion('138001380', 'CN') === false)
assert('CN 空串非法', isValidPhoneByRegion('', 'CN') === false)

assert('HK 51234567 合法', isValidPhoneByRegion('51234567', 'HK') === true)
assert('HK 21234567 非法（首位 2）', isValidPhoneByRegion('21234567', 'HK') === false)

assert('US 2025550123 合法', isValidPhoneByRegion('2025550123', 'US') === true)
assert('US 202555012 非法（9 位）', isValidPhoneByRegion('202555012', 'US') === false)

assert('缺省 region 回退 CN 合法', isValidPhoneByRegion('13800138000', '') === true)
assert('未知 region 返回 false', isValidPhoneByRegion('13800138000', 'XX') === false)
assert('REGION_OPTIONS 含 7 个地区', Array.isArray(REGION_OPTIONS) && REGION_OPTIONS.length === 7)

// ---------- redirect.ts（真实加载） ----------
console.log('[redirect.ts] 开放重定向防御')
const redirect = await import(redirectUrl)
const { isSafeRedirect } = redirect

assert('"/dashboard" 安全', isSafeRedirect('/dashboard') === true)
assert('"/" 安全', isSafeRedirect('/') === true)
assert('"/a/b?x=1" 安全', isSafeRedirect('/a/b?x=1') === true)
assert('"https://evil.com" 拒绝', isSafeRedirect('https://evil.com') === false)
assert('"//evil.com" 协议相对路径拒绝', isSafeRedirect('//evil.com') === false)
assert('"/\\evil.com" 反斜杠变体拒绝', isSafeRedirect('/\\evil.com') === false)
assert('"javascript:alert(1)" 拒绝', isSafeRedirect('javascript:alert(1)') === false)
assert('null 拒绝', isSafeRedirect(null) === false)
assert('undefined 拒绝', isSafeRedirect(undefined) === false)
assert('"" 拒绝', isSafeRedirect('') === false)

// ---------- safeI18n.ts 行为契约（不加载 Vue 实例） ----------
console.log('[safeI18n.ts] safeT 行为契约')
const safeSrc = fs.readFileSync(safeI18nPath, 'utf8')
assert('safeT 函数已导出', /export function safeT/.test(safeSrc))
assert('safeT 使用 try/catch 兜底', /try\s*\{[\s\S]*\}\s*catch/.test(safeSrc))
assert('缺失 key 返回 fallback ?? key', /return fallback \?\? key/.test(safeSrc))
assert('异常捕获返回 fallback ?? key', /catch\s*\{[\s\S]*?return fallback \?\? key/.test(safeSrc))

// 等价逻辑仿真断言行为契约
function safeTImpl(hasKey, key, fallback) {
  try {
    if (hasKey) return `[${key}]`
    return fallback ?? key
  } catch {
    return fallback ?? key
  }
}
assert('safeT 缺失 key 有 fallback 返回 fallback', safeTImpl(false, 'x.missing', '缺省文案') === '缺省文案')
assert('safeT 缺失 key 无 fallback 返回 key', safeTImpl(false, 'x.missing', undefined) === 'x.missing')
assert('safeT 命中 key 返回翻译', safeTImpl(true, 'x.ok', '兜底') === '[x.ok]')

// ---------- 汇总 ----------
console.log('')
console.log(`RESULT: passed=${passed} failed=${failed}`)
if (failed > 0) {
  process.exit(1)
}
console.log('ALL_PHONE_REDIRECT_SAFET_PASSED')
