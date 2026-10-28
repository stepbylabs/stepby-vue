// stepby-vue/scripts/check-perf-budget.mjs
// 性能预算门禁（R102-PERF-001~012 / R102-BUNDLE-002/006 配套）
//
// 用法：
//   node scripts/check-perf-budget.mjs [--dir dist] [--report-only]
//   node scripts/check-perf-budget.mjs --selftest
//
// 行为：
//   1. 读取 perf-budget.json（构建产物体积预算，gzip 后 KB）；
//   2. 扫描 dist/static 下 JS/CSS/图片/字体产物，zlib 压缩后与预算比对；
//   3. 从 dist/index.html 解析**首屏必须下载**的 JS/CSS（入口 chunk + 其静态依赖图，
//      含 modulepreload），单独与首屏预算比对 —— 分包之后"总量"与"每个用户实际下载"
//      不再是同一个量，首屏必须由自己的闸守，不能用总量冒充（b120）；
//   4. 检查 index.html 中的第三方（跨域）<script> 数量（预算默认 0，无 externals）；
//   5. 产出 dist/perf-budget-report.json（BUNDLE-004 体积趋势留存）；
//   6. 超限 → 逐项打印明细并以 exit 1 失败；**输入缺失/引用文件不存在 ⇒ exit 2（UNRUN）**，
//      因为"没测到"与"测了超限"必须是两种结局（AGENTS ②）。
//      --report-only 仅产出报告不判失败。
//
// 判据自身可证伪：`--selftest` 用合成数据逐条让每个预算项转红（含"只有它红"的排他断言），
// 并配"预算充足必须全绿"的正控 —— 没有正控的失败用例挡不住"永远失败"的实现（AGENTS ⑥）。

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, relative, extname, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'

const args = process.argv.slice(2)
const argOf = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const reportOnly = args.includes('--report-only')
const distDir = argOf('--dir', 'dist')
const root = process.cwd()

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])
const FONT_EXTS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot'])

class InputError extends Error {}

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function round(n) {
  return Math.round(n * 10) / 10
}

/**
 * 从 index.html 解析"首屏必须下载"的 JS/CSS 引用。
 * 返回 [{ kind:'js'|'css', url, pathname }]，按 pathname 去重。
 *
 * 只收 .js / .css：图片字体由 CSS 触发、不阻塞脚本执行，已由 image/font 两组单独约束。
 * URL 形态兼容 base 为 `/`、子路径与 CDN 绝对地址（VITE_APP_CDN_BASE）——
 * 一律剥掉 scheme+host 后按 `/static/` 定位到产物路径；定位不到 /static/ 的引用
 * 直接抛错（CDN 前缀变了而判据还在按旧形状数，就会静默少数）。
 */
export function parseIndexRefs(html) {
  const refs = []
  const seen = new Set()
  const re = /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g
  for (const m of html.matchAll(re)) {
    const url = m[1]
    const clean = url.split('?')[0].split('#')[0]
    const ext = extname(clean).toLowerCase()
    if (ext !== '.js' && ext !== '.css') continue
    const noOrigin = clean.replace(/^https?:\/\/[^/]+/i, '')
    const idx = noOrigin.indexOf('/static/')
    if (idx < 0) throw new InputError(`index.html 引用不在 /static/ 下，无法定位产物：${url}`)
    const pathname = noOrigin.slice(idx)
    if (seen.has(pathname)) continue
    seen.add(pathname)
    refs.push({ kind: ext === '.js' ? 'js' : 'css', url, pathname })
  }
  if (!refs.some((r) => r.kind === 'js')) throw new InputError('index.html 里没有解析到任何首屏 JS 引用')
  return refs
}

/** 把一项预算与实测值组成判据结果；`budget` 为数字时按 KB(gzip) 比 */
export function makeCheck(id, label, value, budget) {
  return { id, label, value, budget, over: value > budget }
}

export const BUDGET_KEYS = [
  'initialJsGzipKb',
  'initialCssGzipKb',
  'jsTotalGzipKb',
  'cssTotalGzipKb',
  'singleJsChunkGzipKb',
  'imageMaxGzipKb',
  'fontTotalGzipKb',
  'thirdPartyScriptCount'
]

/** 预算缺键必须拒绝判据：缺键时 `value > undefined` 恒 false，会把超限静默放行 */
export function missingBudgetKeys(b) {
  return BUDGET_KEYS.filter((k) => typeof b?.[k] !== 'number')
}

/** 纯函数：由实测值与预算产出全部判据（自检直接喂合成值，不碰磁盘） */
export function evaluate(measured, budget) {
  return [
    makeCheck('R102-PERF-011', '首屏 JS（gzip）', round(measured.initialJsKb), budget.initialJsGzipKb),
    makeCheck('R102-PERF-012', '首屏 CSS（gzip）', round(measured.initialCssKb), budget.initialCssGzipKb),
    makeCheck('R102-PERF-006', '全部 JS chunk 之和（gzip，构建卫生）', round(measured.jsTotalKb), budget.jsTotalGzipKb),
    makeCheck('R102-PERF-006b', '单 JS chunk 最大（gzip）', round(measured.maxChunkKb), budget.singleJsChunkGzipKb),
    makeCheck('R102-PERF-007', '全部 CSS 之和（gzip，构建卫生）', round(measured.cssTotalKb), budget.cssTotalGzipKb),
    makeCheck('R102-PERF-008', '单图最大（gzip，首屏背景等）', round(measured.maxImageKb), budget.imageMaxGzipKb),
    makeCheck('R102-PERF-009', '字体总体积（gzip）', round(measured.fontTotalKb), budget.fontTotalGzipKb),
    makeCheck('R102-PERF-010', '第三方跨域脚本数', measured.thirdPartyScripts, budget.thirdPartyScriptCount)
  ]
}

/** 量一次真实产物；输入缺失一律抛 InputError（调用方转 EXIT=2，不当"通过"） */
export function measure(distRoot) {
  if (!existsSync(distRoot)) throw new InputError(`产物目录不存在：${distRoot}（先构建再判体积）`)
  const files = walk(join(distRoot, 'static'))
  const groups = {
    js: { files: [], gzipKb: 0, rawKb: 0 },
    css: { files: [], gzipKb: 0, rawKb: 0 },
    image: { files: [], gzipKb: 0, rawKb: 0 },
    font: { files: [], gzipKb: 0, rawKb: 0 }
  }
  for (const f of files) {
    const ext = extname(f).toLowerCase()
    const raw = statSync(f).size
    const gz = gzipSync(readFileSync(f)).length
    const kind =
      ext === '.js' ? 'js' : ext === '.css' ? 'css' : IMAGE_EXTS.has(ext) ? 'image' : FONT_EXTS.has(ext) ? 'font' : null
    if (!kind) continue
    groups[kind].files.push({
      path: relative(distRoot, f).replace(/\\/g, '/'),
      rawKb: round(raw / 1024),
      gzipKb: round(gz / 1024)
    })
    groups[kind].gzipKb += gz / 1024
    groups[kind].rawKb += raw / 1024
  }
  if (!groups.js.files.length) throw new InputError('static/ 下没有任何 JS 产物（产物不完整，判据不作数）')

  const indexPath = join(distRoot, 'index.html')
  if (!existsSync(indexPath)) throw new InputError(`缺少 ${indexPath}（先构建再判体积）`)
  const html = readFileSync(indexPath, 'utf-8')
  const refs = parseIndexRefs(html)
  let initialJsKb = 0
  let initialCssKb = 0
  const initialFiles = []
  for (const r of refs) {
    const p = join(distRoot, r.pathname)
    if (!existsSync(p)) throw new InputError(`index.html 引用的产物不存在：${r.pathname}（产物与服务不一致）`)
    const gz = gzipSync(readFileSync(p)).length / 1024
    if (r.kind === 'js') initialJsKb += gz
    else initialCssKb += gz
    initialFiles.push({ kind: r.kind, path: r.pathname, gzipKb: round(gz) })
  }

  const thirdPartyScripts = [...html.matchAll(/<script[^>]+src="(https?:)?\/\//g)].length

  return {
    groups,
    initial: { jsKb: initialJsKb, cssKb: initialCssKb, files: initialFiles },
    thirdPartyScripts,
    measured: {
      initialJsKb,
      initialCssKb,
      jsTotalKb: groups.js.gzipKb,
      maxChunkKb: groups.js.files.reduce((m, f) => Math.max(m, f.gzipKb), 0),
      cssTotalKb: groups.css.gzipKb,
      maxImageKb: groups.image.files.reduce((m, f) => Math.max(m, f.gzipKb), 0),
      fontTotalKb: groups.font.gzipKb,
      thirdPartyScripts
    }
  }
}

// ---------------------------------------------------------------- selftest
function selftest() {
  let passed = 0
  let failed = 0
  const ok = (name, cond, detail = '') => {
    if (cond) {
      passed += 1
      console.log(`  ✅ ${name}`)
    } else {
      failed += 1
      console.error(`  ❌ ${name} ${detail}`)
    }
  }
  const budget = {
    initialJsGzipKb: 700,
    initialCssGzipKb: 40,
    jsTotalGzipKb: 1900,
    cssTotalGzipKb: 120,
    singleJsChunkGzipKb: 300,
    imageMaxGzipKb: 140,
    fontTotalGzipKb: 100,
    thirdPartyScriptCount: 0
  }
  const base = {
    initialJsKb: 600,
    initialCssKb: 30,
    jsTotalKb: 1800,
    maxChunkKb: 258,
    cssTotalKb: 109,
    maxImageKb: 126,
    fontTotalKb: 0,
    thirdPartyScripts: 0
  }
  const failedIds = (m) =>
    evaluate(m, budget)
      .filter((c) => c.over)
      .map((c) => c.id)

  // ① 解析：只收 js/css、去重、CDN 绝对地址按 /static/ 归一
  const html =
    '<script src="/static/js/a.js"></script>' +
    '<link rel="modulepreload" href="https://cdn.example.com/static/js/a.js">' +
    '<link rel="stylesheet" href="/static/css/x.css">' +
    '<img src="/static/img/a.png">' +
    '<link rel="icon" href="/favicon.ico">'
  const refs = parseIndexRefs(html)
  ok(
    '① 引用解析：只收 js/css 且按 pathname 去重',
    JSON.stringify(refs.map((r) => r.pathname)) === JSON.stringify(['/static/js/a.js', '/static/css/x.css']),
    JSON.stringify(refs)
  )

  // ② 正控：预算充足 ⇒ 一条都不红（防"永远失败"的实现）
  ok('② 正控：全部在预算内必须零超限', failedIds(base).length === 0, JSON.stringify(failedIds(base)))

  // ③~⑦ 每一项单独超限，且**只有它自己**红
  const cases = [
    ['③ 首屏 JS 超限只红 PERF-011', { ...base, initialJsKb: 701 }, 'R102-PERF-011'],
    ['④ 首屏 CSS 超限只红 PERF-012', { ...base, initialCssKb: 41 }, 'R102-PERF-012'],
    ['⑤ JS 总量超限只红 PERF-006', { ...base, jsTotalKb: 1901 }, 'R102-PERF-006'],
    ['⑥ 单 chunk 超限只红 PERF-006b', { ...base, maxChunkKb: 301 }, 'R102-PERF-006b'],
    ['⑦ CSS 总量超限只红 PERF-007', { ...base, cssTotalKb: 121 }, 'R102-PERF-007'],
    ['⑧ 第三方脚本只红 PERF-010', { ...base, thirdPartyScripts: 1 }, 'R102-PERF-010']
  ]
  for (const [name, m, id] of cases) {
    const ids = failedIds(m)
    ok(name, ids.length === 1 && ids[0] === id, `实际：${JSON.stringify(ids)}`)
  }

  // ⑨ 输入缺失必须抛（UNRUN 路径），不得返回空集合让门禁打 OK
  const tmp = mkdtempSync(join(tmpdir(), 'perfbudget-'))
  try {
    let threw = false
    try {
      measure(join(tmp, 'no-such-dist'))
    } catch (e) {
      threw = e instanceof InputError
    }
    ok('⑨ 产物目录缺失必须抛 InputError', threw)

    const fake = join(tmp, 'dist')
    mkdirSync(join(fake, 'static', 'js'), { recursive: true })
    writeFileSync(join(fake, 'static', 'js', 'index-abc.js'), 'console.log(1)')
    writeFileSync(join(fake, 'index.html'), '<script src="/static/js/index-abc.js"></script>')
    const got = measure(fake)
    ok(
      '⑩ 引用文件存在时首屏 JS 量等于该文件 gzip',
      got.initial.jsKb === gzipSync('console.log(1)').length / 1024,
      `实际：${got.initial.jsKb}`
    )

    writeFileSync(join(fake, 'index.html'), '<script src="/static/js/missing.js"></script>')
    let threw2 = false
    try {
      measure(fake)
    } catch (e) {
      threw2 = e instanceof InputError
    }
    ok('⑪ index.html 引用了不存在的产物必须抛 InputError', threw2)

    writeFileSync(join(fake, 'index.html'), '<script src="/app.js"></script>')
    let threw3 = false
    try {
      measure(fake)
    } catch (e) {
      threw3 = e instanceof InputError
    }
    ok('⑫ 非 /static/ 的引用形状必须抛（防按旧形状静默少数）', threw3)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  // ⑬ 预算缺键必须被显式拒绝（缺键时 `value > undefined` 恒 false ⇒ 超限会被静默放行）
  ok(
    '⑬ 预算缺键必须被列出',
    JSON.stringify(missingBudgetKeys({ ...budget, initialJsGzipKb: undefined })) === JSON.stringify(['initialJsGzipKb'])
  )
  ok('⑭ 预算齐全时必须零缺键（正控）', missingBudgetKeys(budget).length === 0)

  console.log(`\n[perf-budget] selftest：${passed} 通过 / ${failed} 失败（共 ${passed + failed} 组双向）`)
  return failed === 0
}

// ---------------------------------------------------------------- main
if (args.includes('--selftest')) {
  process.exit(selftest() ? 0 : 1)
}

const budgetPath = join(root, 'perf-budget.json')
if (!existsSync(budgetPath)) {
  console.error(`[perf-budget] 未找到 ${budgetPath} —— 预算文件必须提交入库`)
  process.exit(2)
}
const budget = JSON.parse(readFileSync(budgetPath, 'utf-8'))
const b = budget.build
const missing = missingBudgetKeys(b)
if (missing.length) {
  console.error(`[perf-budget] 预算缺键或非数字：build.${missing.join(', ')} —— 判据不作数（缺键会让超限比较恒 false）`)
  process.exit(2)
}

let result
try {
  result = measure(join(root, distDir))
} catch (e) {
  console.error(`[perf-budget] [FATAL] ${e.message}`)
  process.exit(2)
}

const checks = evaluate(result.measured, b)
const over = checks.filter((c) => c.over)

console.log('[perf-budget] 构建产物预算核查')
for (const c of checks) {
  const limit = `${c.budget}${c.id === 'R102-PERF-010' ? '' : 'KB(gzip)'}`
  console.log(`  ${c.over ? '❌' : '✅'} ${c.id} ${c.label}: ${c.value} / ${limit}`)
}
if (over.length) {
  console.error(`\n[perf-budget] 超出预算 ${over.length} 项：${over.map((o) => o.id).join(', ')}`)
  console.error(
    '[perf-budget] 请优化产物体积；若为有意引入（新功能），需在评审后同步上调 perf-budget.json 并在优化台账登记。'
  )
}

const report = {
  generatedAt: new Date().toISOString(),
  distDir,
  overBudget: over.length,
  groups: result.groups,
  initial: result.initial,
  checks,
  runtimeBudget: budget.runtime
}
const reportPath = join(root, distDir, 'perf-budget-report.json')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`[perf-budget] 报告已写入 ${relative(root, reportPath)}（CI artifact 留存，作体积趋势数据）`)

if (over.length && !reportOnly) process.exit(1)
