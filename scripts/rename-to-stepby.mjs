// 项目改名：stepby -> stepby（代码标识符 / 文案 / 示例域名与邮箱）。幂等，可重跑。
// 排除：.git / node_modules / target / dist / coverage
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const roots = [
  'D:/Projects/stepby/stepby-axum',
  'D:/Projects/stepby/stepby-vue',
  'D:/Projects/stepby/deploy',
  'D:/Projects/stepby/docs'
]
const EXCLUDE_DIR = new Set([
  '.git', 'node_modules', 'target', 'dist', 'coverage', '.pnpm-store', 'frontend-dist', 'logs'
])
const EXCLUDE_FILE = /(^|\\)(pnpm-lock\.yaml|\.-env|_commit_msg\.txt)$/
const TEXT_EXT = /\.(rs|ts|vue|tsx|js|mjs|json|yml|yaml|toml|md|html|scss|css|svg|sql|sh|ps1|txt)$/

// 顺序敏感：域名/邮箱先替换（含 stepby 子串），再替换裸词
const pairs = [
  [/stepby\.dev/g, 'stepby.tzkj.net'],
  [/admin@stepby\.dev/g, 'stepby@tzkj.net'],
  [/stepby@stepby\.dev/g, 'stepby@tzkj.net'],
  [/STEPBY/g, 'STEPBY'],
  [/Stepby/g, 'Stepby'],
  [/stepby/g, 'stepby']
]

let fileCount = 0
let hitCount = 0
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (EXCLUDE_DIR.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { walk(p); continue }
    if (!TEXT_EXT.test(name)) continue
    if (EXCLUDE_FILE.test(p)) continue
    const src = readFileSync(p, 'utf-8')
    let out = src
    for (const [re, to] of pairs) out = out.replace(re, to)
    if (out !== src) {
      writeFileSync(p, out)
      fileCount++
      hitCount += 1
      console.log('OK', p.replace('D:/Projects/stepby/', ''))
    }
  }
}
for (const r of roots) walk(r)
console.log(`files changed = ${fileCount}`)
