// stepby-vue/scripts/cdn-warmup.mjs
// CDN/源站缓存预热（R102-CDN-010 配套）：读 dist/index.html 与 dist/static 产物清单，
// 对目标域名逐个发起 GET（受控并发），让 CDN 边缘节点提前回源填充缓存。
// 发布后执行一次即可；无 CDN 时对源站同样可用（触发 nginx gzip_static/br 缓存）。
//
// 用法：
//   node scripts/cdn-warmup.mjs --base https://cdn.example.com [--dir dist] [--concurrency 8] [--timeout 15000]
//
// 契约：
//   - 仅预热 <script>/<link href> 引用的产物 + index.html 自身（与真实首访请求一致）；
//   - 任何单条失败仅记录，不影响整体退出码；全部 2xx/304 → exit 0。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const argOf = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const base = argOf('--base')
if (!base) {
  console.error('用法: node scripts/cdn-warmup.mjs --base https://cdn.example.com [--dir dist] [--concurrency 8]')
  process.exit(1)
}
const dir = argOf('--dir', 'dist')
const concurrency = Number(argOf('--concurrency', '8'))
const timeoutMs = Number(argOf('--timeout', '15000'))
const root = process.cwd()

function walk(dirPath) {
  const out = []
  if (!existsSync(dirPath)) return out
  for (const name of readdirSync(dirPath)) {
    const p = join(dirPath, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const targets = new Set([`${base.replace(/\/$/, '')}/index.html`])
// index.html 内引用的带 hash 产物
const html = readFileSync(join(root, dir, 'index.html'), 'utf-8')
for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
  if (!/\.(js|css|webp|png|jpg|svg|ico|webmanifest)$/.test(m[1])) continue
  targets.add(`${base.replace(/\/$/, '')}${m[1]}`)
}
// 全量静态产物（长缓存 immutable，边缘未命中时回源最贵）
for (const f of walk(join(root, dir, 'static'))) {
  const ext = extname(f).toLowerCase()
  if (!['.js', '.css', '.webp', '.png', '.jpg', '.gif', '.svg', '.woff2'].includes(ext)) continue
  const rel = relative(join(root, dir), f).replace(/\\/g, '/')
  targets.add(`${base.replace(/\/$/, '')}/${rel}`)
}

const urls = [...targets]
console.log(`[cdn-warmup] 目标 ${base}，共 ${urls.length} 个资源，并发 ${concurrency}`)

let ok = 0
let fail = 0
const failures = []
let cursor = 0
async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++]
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal })
      if (res.ok || res.status === 304) ok++
      else {
        fail++
        failures.push(`${res.status} ${url}`)
      }
    } catch (e) {
      fail++
      failures.push(`ERR ${url} (${e.name})`)
    } finally {
      clearTimeout(timer)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
console.log(`[cdn-warmup] 完成：成功 ${ok}，失败 ${fail}`)
for (const f of failures.slice(0, 20)) console.error('  ' + f)
if (failures.length > 20) console.error(`  ...另有 ${failures.length - 20} 条失败`)
process.exit(fail ? 1 : 0)
