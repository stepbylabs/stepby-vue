#!/usr/bin/env node
/**
 * 把 `vite build --mode embedded` 的产物镜像进后端嵌入目录。
 *
 * 为什么需要这个脚本（b100 立项）：
 * 1. 原配方是 `cp -r dist/. ../stepby-axum/frontend-dist/`——**合并语义**，
 *    hash 换名的旧 chunk 永远留在目标目录（实测 3 份入口 chunk、83MB）；
 * 2. `dist` 里的 `.map` 会被一起拷进去，而嵌入档由 rust-embed **原样对外服务**
 *    ⇒ `/static/js/index-*.js.map` 可被匿名下载（实测 200 / 20,805,274 字节）。
 *    vite embedded 档已不产 map（vite.config.ts），本脚本再排除一次并断言 0 个，
 *    历史残留与手工拷贝都进不来；
 * 3. 复制后要证明"入口 chunk 真的在目标目录里"——index.html 指向的 chunk 不存在时
 *    服务端只会回 SPA HTML，症状是白屏而非 404。
 *
 * b101 补的三条失败安全（每一条都对应一次"先破坏、后报错"的可能）：
 * - 源侧除 index.html 外还要校验**入口 chunk 文件真实存在**，且文件清单在清空目标
 *   **之前**算好——残缺 dist 不得先把可服务的旧产物删掉再失败；
 * - 复制后做**文件集合对账**（不只是 index/entry 两个点），中途丢文件必然红；
 * - `fail()` 抛 `SyncError` 而不是 `process.exit`，失败路径可被单测覆盖
 *   （`src/utils/embeddedSync.test.ts`），入口在 main 里统一打印 `[FATAL]` 并退出 1。
 *
 * 用法：
 *   pnpm run sync:embedded            # 镜像复制（先清空目标内容）
 *   pnpm run check:embedded           # 只校验目标目录现状（构建后/跑测前）
 *
 * 目录解析：本地三仓布局（../stepby-axum/frontend-dist）优先；
 * CI 布局（stepby-vue 位于 axum 仓库根下）回落到 ../frontend-dist。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VUE_ROOT = path.resolve(HERE, '..')
const DIST = path.join(VUE_ROOT, 'dist')

export class SyncError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SyncError'
  }
}

/** 按布局解析嵌入产物目录；解析不到返回 null（调用方 fail-closed） */
export function resolveTarget(vueRoot = VUE_ROOT) {
  const local = path.join(vueRoot, '..', 'stepby-axum', 'frontend-dist')
  const ci = path.join(vueRoot, '..', 'frontend-dist')
  if (fs.existsSync(path.join(vueRoot, '..', 'stepby-axum', 'Cargo.toml'))) return local
  if (fs.existsSync(path.join(vueRoot, '..', 'Cargo.toml'))) return ci
  return null
}

/** 从 index.html 里取入口 chunk 的相对路径（/static/js/index-xxxx.js → static/js/index-xxxx.js） */
export function entryChunkFromIndex(html) {
  const m = [...html.matchAll(/\bsrc="\/(static\/js\/[^"']+\.js)"/g)].map((x) => x[1])
  if (m.length === 0) return null
  // 多入口不可判定：入口只应有一个（本仓 codeSplitting:false 单 chunk）
  const unique = [...new Set(m)]
  return unique.length === 1 ? unique[0] : null
}

function fail(msg) {
  throw new SyncError(msg)
}

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, base, out)
    else out.push(path.relative(base, abs).split(path.sep).join('/'))
  }
  return out
}

function countMaps(dir) {
  if (!fs.existsSync(dir)) return 0
  return walk(dir).filter((p) => p.toLowerCase().endsWith('.map')).length
}

/** 校验目标目录：index.html / 入口 chunk 存在，且 0 个 .map */
export function checkTarget(target) {
  if (!target || !fs.existsSync(target)) {
    return { ok: false, reason: `嵌入产物目录不存在：${target ?? '<未解析到>'}` }
  }
  const indexPath = path.join(target, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: `${target}/index.html 不存在（后端 build.rs 会直接失败）` }
  }
  const entry = entryChunkFromIndex(fs.readFileSync(indexPath, 'utf8'))
  if (!entry) {
    return { ok: false, reason: 'index.html 中解析不到唯一入口 chunk（/static/js/index-*.js）' }
  }
  if (!fs.existsSync(path.join(target, entry))) {
    return { ok: false, reason: `index.html 指向的入口 chunk 不存在：${entry}` }
  }
  const maps = countMaps(target)
  if (maps !== 0) {
    return { ok: false, reason: `嵌入产物含 ${maps} 个 .map（会随二进制对外下发）` }
  }
  return { ok: true, entry, files: walk(target).length }
}

export function sync(source = DIST, target = resolveTarget()) {
  if (!target || path.basename(target) !== 'frontend-dist') {
    fail(`拒绝写入：目标目录不是 frontend-dist（${target ?? '<未解析到>'}）`)
  }
  if (!source || !fs.existsSync(path.join(source, 'index.html'))) {
    fail(`源产物缺失：${source}/index.html（先跑 pnpm run build:embedded）`)
  }
  const entry = entryChunkFromIndex(fs.readFileSync(path.join(source, 'index.html'), 'utf8'))
  if (!entry) fail('源 index.html 中解析不到唯一入口 chunk')
  if (!fs.existsSync(path.join(source, entry))) {
    fail(`源入口 chunk 不存在：${source}/${entry}（dist 不完整，先重新构建）`)
  }

  // 清单在清空目标**之前**算好：walk 抛错时目标仍是上一份可服务的产物
  const all = walk(source)
  const files = all.filter((rel) => !rel.toLowerCase().endsWith('.map'))
  const skippedMaps = all.length - files.length

  fs.mkdirSync(target, { recursive: true })
  // 只清内容、保留目录本身：build.rs 检查目录存在，删除目录在句柄被占用时会失败
  for (const name of fs.readdirSync(target)) {
    fs.rmSync(path.join(target, name), { recursive: true, force: true })
  }

  let copied = 0
  for (const rel of files) {
    const dst = path.join(target, rel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(path.join(source, rel), dst)
    copied += 1
  }

  const verdict = checkTarget(target)
  if (!verdict.ok) fail(`同步后校验失败：${verdict.reason}`)
  // 集合对账：index/entry 只是两个点，复制途中丢掉其它资源时上面那条看不出来
  const expected = [...files].sort()
  const actual = walk(target).sort()
  const same = expected.length === actual.length && expected.every((rel, i) => rel === actual[i])
  if (!same) {
    const missing = expected.filter((rel) => !actual.includes(rel)).slice(0, 5)
    const extra = actual.filter((rel) => !expected.includes(rel)).slice(0, 5)
    fail(
      `同步后文件集合不一致：期望 ${expected.length} 个，实际 ${actual.length} 个` +
        `（缺 ${missing.join(', ') || '无'}；多 ${extra.join(', ') || '无'}）`
    )
  }

  console.log(
    `[OK] embedded 产物已镜像：${copied} 个文件（跳过 ${skippedMaps} 个 .map）→ ${target}\n` +
      `     入口 chunk=${entry}，目标内 .map=0，共 ${verdict.files} 个文件`
  )
  return { copied, skippedMaps, entry }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const target = resolveTarget()
    if (process.argv.includes('--check')) {
      const verdict = checkTarget(target)
      if (!verdict.ok) fail(`嵌入产物校验失败：${verdict.reason}`)
      console.log(`[OK] 嵌入产物可服务：入口 chunk=${verdict.entry}，.map=0，共 ${verdict.files} 个文件 → ${target}`)
    } else {
      sync(DIST, target)
    }
  } catch (err) {
    if (err instanceof SyncError) {
      console.error(`[FATAL] ${err.message}`)
      process.exit(1)
    }
    throw err
  }
}
