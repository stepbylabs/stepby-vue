// 一次性批处理：为所有使用 useCrudTable 且含编辑 el-dialog 的页面接入
// beforeDialogClose（UX-5 未保存守卫推广）。幂等：已绑定的跳过。
// 用法：node scripts/apply-unsaved-guard.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import process from 'node:process'

const root = process.cwd() + '/src/views'
const files = globSync(root + '/**/*.vue')
const report = []
let changed = 0

for (const f of files) {
  let src = readFileSync(f, 'utf-8')
  if (!src.includes('useCrudTable')) continue
  if (src.includes(':before-close="beforeDialogClose"')) {
    report.push(`SKIP(already bound) ${f}`)
    continue
  }
  // 只处理含编辑 el-dialog 的页面（v-model="open" 是 useCrudTable 弹窗开关的统一契约）
  if (!/<el-dialog[^>]*v-model="open"/s.test(src)) {
    report.push(`SKIP(no edit dialog) ${f}`)
    continue
  }
  const rel = f.replace(/\\/g, '/')
  const orig = src

  // 1) el-dialog 加 :before-close（首个含 v-model="open" 的 <el-dialog ...> 起始标签内插入）
  src = src.replace(/<el-dialog([^>]*?)v-model="open"/s, (m, attrs) => {
    if (attrs.includes('before-close')) return m
    return `<el-dialog${attrs} :before-close="beforeDialogClose" v-model="open"`
  })

  // 2) 解构追加 beforeDialogClose（锚定解构块中的 getList,，保留各自缩进）
  src = src.replace(/(\n(\s*)getList,)/, `$1\n$2beforeDialogClose,`)

  if (src !== orig) {
    writeFileSync(f, src)
    changed++
    report.push(`OK ${rel}`)
  } else {
    report.push(`NOOP(no anchor) ${rel}`)
  }
}
for (const line of report) console.log(line)
console.log(`changed=${changed}`)
if (changed === 0 && report.some((r) => r.startsWith('NOOP'))) process.exitCode = 1
