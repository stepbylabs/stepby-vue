import fs from 'fs'
import path from 'path'
// 报告路径：默认取本脚本同级的 screenshots/test-report.json（main.mjs 的固定落盘位置），
// 可 `node summarize.mjs <路径>` 覆盖。此前这里写死 `d:/桌面/stepby/tests/screenshots/…`
// ——项目改名搬家后该路径早就不存在，脚本起手即 ENOENT，等于一个装着坏零件的"已知工具"。
const file = process.argv[2] || path.join(import.meta.dirname, 'screenshots', 'test-report.json')
if (!fs.existsSync(file)) {
  console.error(`报告文件不存在：${file}（先跑 main.mjs，或把路径作为第一个参数传入）`)
  process.exit(1)
}
const r = JSON.parse(fs.readFileSync(file, 'utf8'))
// b69 起报告里带终局捕获字段，且 `pageErrors` 是**明细数组**不是计数——直接插值会把
// 空数组打印成空串（实测踩过），一律取 `.length`。
const len = (v) => (Array.isArray(v) ? v.length : (v ?? '—'))
console.log(`总计: ${r.total}  通过: ${r.passed}  失败: ${r.failed}`)
console.log(
  `pageerror: ${len(r.pageErrors)}  console: ${len(r.consoleErrors)}  ` +
    `network: ${len(r.networkErrors)}  Toast: ${len(r.suspiciousToasts)}/${len(r.toastTotal)}  ` +
    `hub 未分类 console error: ${r.hubConsoleErrors?.unclassified ?? '—'}（另有资源状态码 ` +
    `${r.hubConsoleErrors?.resourceStatus ?? '—'} 条，已由 network 通道对账）`
)
console.log(`来源: ${file}`)
console.log('---')
const failed = (r.results || []).filter((x) => !x.passed)
const byFeature = {}
for (const f of failed) {
  byFeature[f.feature] = (byFeature[f.feature] || 0) + 1
}
for (const [k, v] of Object.entries(byFeature)) {
  console.log(`Feature ${k}: ${v} 项失败`)
}
console.log('---')
for (const f of failed) {
  console.log(`  [F${f.feature}] ${f.name} - ${f.detail}`)
}
