// stepby-vue/scripts/check-perf-budget.mjs
// 性能预算门禁（R102-PERF-001~012 / R102-BUNDLE-002/003/004 配套）
//
// 用法：
//   node scripts/check-perf-budget.mjs [--dir dist] [--report-only]
//
// 行为：
//   1. 读取 perf-budget.json（构建产物体积预算，gzip 后 KB）；
//   2. 扫描 dist/static 下 JS/CSS/图片/字体产物，zlib 压缩后与预算比对；
//   3. 检查 index.html 中的第三方（跨域）<script> 数量（预算默认 0，无 externals）；
//   4. 产出 dist/perf-budget-report.json（BUNDLE-004 体积趋势留存：CI 每次 build
//      上传该 artifact，按时间序列比对即可观察趋势）；
//   5. 超限 → 逐项打印明细并以 exit 1 失败（PERF-012 预算报警 = CI 失败机制）。
//      --report-only 仅产出报告不判失败（首次建立基线时使用）。

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, relative, extname } from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const argOf = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const reportOnly = args.includes('--report-only')
const distDir = argOf('--dir', 'dist')
const root = process.cwd()

const budgetPath = join(root, 'perf-budget.json')
if (!existsSync(budgetPath)) {
  console.error(`[perf-budget] 未找到 ${budgetPath} —— 预算文件必须提交入库`)
  process.exit(1)
}
const budget = JSON.parse(readFileSync(budgetPath, 'utf-8'))
const b = budget.build

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

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])
const FONT_EXTS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot'])

const files = walk(join(root, distDir, 'static'))
const groups = {
  js: { files: [], gzipKb: 0, rawKb: 0 },
  css: { files: [], gzipKb: 0, rawKb: 0 },
  image: { files: [], gzipKb: 0, rawKb: 0 },
  font: { files: [], gzipKb: 0, rawKb: 0 }
}
for (const f of files) {
  const ext = extname(f).toLowerCase()
  const raw = statSync(f).size
  // 构建产物若已有同名 .gz（vite-plugin-compression），直接读原始文件做 gzip 口径统一
  const gz = gzipSync(readFileSync(f)).length
  const kind = ext === '.js' ? 'js' : ext === '.css' ? 'css' : IMAGE_EXTS.has(ext) ? 'image' : FONT_EXTS.has(ext) ? 'font' : null
  if (!kind) continue
  groups[kind].files.push({ path: relative(root, f).replace(/\\/g, '/'), rawKb: round(raw / 1024), gzipKb: round(gz / 1024) })
  groups[kind].gzipKb += gz / 1024
  groups[kind].rawKb += raw / 1024
}
function round(n) {
  return Math.round(n * 10) / 10
}

// 第三方脚本：index.html 中跨域 <script src>
const indexHtml = existsSync(join(root, distDir, 'index.html'))
  ? readFileSync(join(root, distDir, 'index.html'), 'utf-8')
  : ''
const thirdPartyScripts = [...indexHtml.matchAll(/<script[^>]+src="(https?:)?\/\//g)].length

const checks = [
  { id: 'R102-PERF-006', label: 'JS 总体积（gzip）', valueKb: round(groups.js.gzipKb), budgetKb: b.jsTotalGzipKb },
  {
    id: 'R102-PERF-006b',
    label: '单 JS chunk 最大（gzip）',
    valueKb: groups.js.files.reduce((m, f) => Math.max(m, f.gzipKb), 0),
    budgetKb: b.singleJsChunkGzipKb
  },
  { id: 'R102-PERF-007', label: 'CSS 总体积（gzip）', valueKb: round(groups.css.gzipKb), budgetKb: b.cssTotalGzipKb },
  {
    id: 'R102-PERF-008',
    label: '单图最大（gzip，首屏背景等）',
    valueKb: groups.image.files.reduce((m, f) => Math.max(m, f.gzipKb), 0),
    budgetKb: b.imageMaxGzipKb
  },
  { id: 'R102-PERF-009', label: '字体总体积（gzip）', valueKb: round(groups.font.gzipKb), budgetKb: b.fontTotalGzipKb },
  { id: 'R102-PERF-010', label: '第三方跨域脚本数', value: thirdPartyScripts, budget: b.thirdPartyScriptCount }
]

const over = checks.filter((c) => (c.budgetKb !== undefined ? c.valueKb > c.budgetKb : c.value > c.budget))

console.log('[perf-budget] 构建产物预算核查')
for (const c of checks) {
  const mark = c.budgetKb !== undefined ? c.valueKb > c.budgetKb : c.value > c.budget
  const limit = c.budgetKb !== undefined ? `${c.budgetKb}KB(gzip)` : c.budget
  console.log(`  ${mark ? '❌' : '✅'} ${c.id} ${c.label}: ${c.valueKb !== undefined ? c.valueKb + 'KB' : c.value} / ${limit}`)
}
if (over.length) {
  console.error(`\n[perf-budget] 超出预算 ${over.length} 项：${over.map((o) => o.id).join(', ')}`)
  console.error('[perf-budget] 请优化产物体积；若为有意引入（新功能），需在评审后同步上调 perf-budget.json 并在优化台账登记。')
}

const report = {
  generatedAt: new Date().toISOString(),
  distDir,
  overBudget: over.length,
  groups,
  checks,
  runtimeBudget: budget.runtime
}
const reportPath = join(root, distDir, 'perf-budget-report.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`[perf-budget] 报告已写入 ${relative(root, reportPath)}（CI artifact 留存，作体积趋势数据）`)

if (over.length && !reportOnly) process.exit(1)
