/**
 * scripts/sync-embedded.mjs（b101）：嵌入产物镜像脚本的失败安全与镜像语义。
 *
 * 覆盖真实实现（脚本导出的纯函数 + sync），不 mock 文件系统：
 * - 镜像：旧 chunk / 旧文件被清掉，.map 被跳过并计数；
 * - 失败安全：源缺 index.html / index 里没有唯一入口 / 入口文件不存在 / 目标名不对
 *   ⇒ 抛 SyncError，且**目标目录保持原样**（不得先把可服务的旧产物删掉再失败）；
 * - 校验：checkTarget 对缺目录 / 缺入口 / 含 .map / 多入口 的判定；
 * - 布局解析：本地三仓与 CI 布局各自命中，解析不到返回 null。
 *
 * 临时目录一律落在 os.tmpdir()（b87 纪律：判据不得往工作树里丢夹具）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SyncError, entryChunkFromIndex, resolveTarget, checkTarget, sync } from '../../scripts/sync-embedded.mjs'

let root: string
let source: string
let target: string

function mk(base: string, rel: string, content = 'x') {
  const abs = path.join(base, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

function indexHtml(chunk = 'static/js/index-AAA.js') {
  return `<!doctype html><html><body><script type="module" src="/${chunk}"></script></body></html>`
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stepby-sync-embedded-'))
  source = path.join(root, 'dist')
  target = path.join(root, 'stepby-axum', 'frontend-dist')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('scripts/sync-embedded（镜像与失败安全）', () => {
  it('镜像语义：清掉旧 chunk、跳过 .map、入口与文件集合逐个对上', () => {
    mk(source, 'index.html', indexHtml())
    mk(source, 'static/js/index-AAA.js', 'console.log(1)')
    mk(source, 'static/css/app.css', 'body{}')
    mk(source, 'static/js/index-AAA.js.map', '{"sources":["a.ts"]}')
    mk(target, 'static/js/index-OLD.js', 'stale')
    mk(target, 'obsolete.txt', 'stale')

    const verdict = sync(source, target)

    expect(verdict).toEqual({ copied: 3, skippedMaps: 1, entry: 'static/js/index-AAA.js' })
    expect(fs.existsSync(path.join(target, 'static/js/index-OLD.js'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'obsolete.txt'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'static/js/index-AAA.js.map'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'static/css/app.css'))).toBe(true)
    const check = checkTarget(target)
    expect(check.ok).toBe(true)
    expect(check.entry).toBe('static/js/index-AAA.js')
    expect(check.files).toBe(3)
  })

  it('源缺 index.html ⇒ 抛错且目标原样（不得先清空再失败）', () => {
    mk(target, 'sentinel.txt', 'keep-me')
    mk(source, 'static/js/index-AAA.js', 'x')
    expect(() => sync(source, target)).toThrow(SyncError)
    expect(() => sync(source, target)).toThrow(/源产物缺失/)
    expect(fs.readFileSync(path.join(target, 'sentinel.txt'), 'utf8')).toBe('keep-me')
  })

  it('index.html 解析不到唯一入口 ⇒ 抛错且目标原样', () => {
    mk(source, 'index.html', '<html><body>no script</body></html>')
    mk(target, 'sentinel.txt', 'keep-me')
    expect(() => sync(source, target)).toThrow(/解析不到唯一入口 chunk/)
    expect(fs.readFileSync(path.join(target, 'sentinel.txt'), 'utf8')).toBe('keep-me')
  })

  it('多入口（两个不同 chunk）不可判定 ⇒ 抛错且目标原样', () => {
    mk(
      source,
      'index.html',
      '<script type="module" src="/static/js/index-AAA.js"></script><script type="module" src="/static/js/index-BBB.js"></script>'
    )
    mk(source, 'static/js/index-AAA.js', 'a')
    mk(source, 'static/js/index-BBB.js', 'b')
    mk(target, 'sentinel.txt', 'keep-me')
    expect(entryChunkFromIndex(fs.readFileSync(path.join(source, 'index.html'), 'utf8'))).toBeNull()
    expect(() => sync(source, target)).toThrow(/解析不到唯一入口 chunk/)
    expect(fs.readFileSync(path.join(target, 'sentinel.txt'), 'utf8')).toBe('keep-me')
  })

  it('入口 chunk 被 index 引用但文件不存在 ⇒ 抛错且目标原样（b101 新增校验）', () => {
    mk(source, 'index.html', indexHtml())
    mk(source, 'static/css/app.css', 'body{}')
    mk(target, 'sentinel.txt', 'keep-me')
    expect(() => sync(source, target)).toThrow(/源入口 chunk 不存在/)
    expect(fs.readFileSync(path.join(target, 'sentinel.txt'), 'utf8')).toBe('keep-me')
  })

  it('目标目录名不是 frontend-dist ⇒ 拒绝写入（防误删别的目录）', () => {
    mk(source, 'index.html', indexHtml())
    mk(source, 'static/js/index-AAA.js', 'x')
    const wrong = path.join(root, 'somewhere-else')
    mk(wrong, 'sentinel.txt', 'keep-me')
    expect(() => sync(source, wrong)).toThrow(/不是 frontend-dist/)
    expect(fs.existsSync(path.join(wrong, 'sentinel.txt'))).toBe(true)
  })
})

describe('scripts/sync-embedded（checkTarget 与布局解析）', () => {
  it('checkTarget：缺目录 / 缺 index / 缺入口 / 含 map / 多入口 各自给出原因', () => {
    expect(checkTarget(null).ok).toBe(false)
    expect(checkTarget(path.join(root, 'missing')).ok).toBe(false)

    const noIndex = path.join(root, 'no-index', 'frontend-dist')
    fs.mkdirSync(noIndex, { recursive: true })
    expect(checkTarget(noIndex).reason).toMatch(/index\.html 不存在/)

    const noEntry = path.join(root, 'no-entry', 'frontend-dist')
    mk(noEntry, 'index.html', indexHtml())
    expect(checkTarget(noEntry).reason).toMatch(/入口 chunk 不存在/)

    const withMap = path.join(root, 'with-map', 'frontend-dist')
    mk(withMap, 'index.html', indexHtml())
    mk(withMap, 'static/js/index-AAA.js', 'x')
    mk(withMap, 'static/js/index-AAA.js.map', '{}')
    expect(checkTarget(withMap).reason).toMatch(/\.map/)

    const multi = path.join(root, 'multi', 'frontend-dist')
    mk(
      multi,
      'index.html',
      '<script src="/static/js/index-AAA.js"></script><script src="/static/js/index-BBB.js"></script>'
    )
    mk(multi, 'static/js/index-AAA.js', 'a')
    mk(multi, 'static/js/index-BBB.js', 'b')
    expect(checkTarget(multi).reason).toMatch(/唯一入口 chunk/)
  })

  it('resolveTarget：本地三仓布局优先，其次 CI 布局，都没有则 null', () => {
    const vueLocal = path.join(root, 'local', 'stepby-vue')
    fs.mkdirSync(vueLocal, { recursive: true })
    mk(path.join(root, 'local'), 'stepby-axum/Cargo.toml', '[package]')
    expect(resolveTarget(vueLocal)).toBe(path.join(root, 'local', 'stepby-axum', 'frontend-dist'))

    const vueCi = path.join(root, 'ci', 'stepby-vue')
    fs.mkdirSync(vueCi, { recursive: true })
    mk(path.join(root, 'ci'), 'Cargo.toml', '[package]')
    expect(resolveTarget(vueCi)).toBe(path.join(root, 'ci', 'frontend-dist'))

    const vueBare = path.join(root, 'bare', 'stepby-vue')
    fs.mkdirSync(vueBare, { recursive: true })
    expect(resolveTarget(vueBare)).toBeNull()
  })
})
