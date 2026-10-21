/**
 * 静态守卫：e2e 点击不得使用 `force: true`（b81 N-8）。
 *
 * 缺陷形态：`locator.click({ force: true })` 跳过 Playwright 的 actionability 检查，
 * 按坐标直接派发事件。Tour 遮罩、残留对话框、加载遮罩在场时，事件会打在**遮挡物**上，
 * 而调用方常写成 `.catch(() => {})` 或只看"点了没报错"——"点了没反应"于是被记成一次
 * 成功点击。b81 M87 的 `落地=force` 且可见行 `8→8` 就是该形态的实证。
 *
 * 正确写法：
 * - 普通 `locator.click()`，失败时先 `dismissTour` / 等遮罩再重试；
 * - 对零宽 input（EP select/radio）点它所属的可见 wrapper / label；
 * - 最后才用 `el.click()` DOM 兜底，且调用方必须有独立的状态/请求断言。
 *
 * 判据扫 `main.mjs`、`deep-e2e.mjs`、`modules/**` 与两个 diag 脚本里
 * `.click/.check` 选项对象的 `force: true`；注释与字符串先掩码，防"文档反例"误报。
 * 双向对照组：合成违规必须转红；`fs.rmSync(..., { force: true })` 这类非点击用法
 * 与注释里的 `force: true` 必须零误报。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const MODULES_DIR = resolve(ROOT, 'tests/e2e/modules')
const SUITE_FILES = [
  'tests/e2e/main.mjs',
  'tests/e2e/deep-e2e.mjs',
  'tests/e2e/diag-download.mjs',
  'tests/e2e/diag-menu-icon.mjs',
  ...readdirSync(MODULES_DIR)
    .filter((n) => n.endsWith('.mjs'))
    .map((n) => `tests/e2e/modules/${n}`)
]

/** 注释与字符串置空（保留换行与长度），避免文档反例/选择器文本被当成代码。 */
function muteNonCode(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (c === '/' && next === '*') {
      out += '  '
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < src.length) {
        out += '  '
        i += 2
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += ' '
      i++
      while (i < src.length) {
        if (src[i] === '\\') {
          out += '  '
          i += 2
          continue
        }
        if (src[i] === quote) {
          out += ' '
          i++
          break
        }
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** 返回违规行号（1-based）：仅 `.click/.check(...{ ... force: true ... })` 形态。 */
export function findForceClicks(src: string): number[] {
  const masked = muteNonCode(src)
  const re = /\.(?:click|check)\(\s*\{[^}]*\bforce\s*:\s*true/g
  const hits: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(masked))) {
    hits.push(masked.slice(0, m.index).split('\n').length)
  }
  return hits
}

describe('e2e 点击策略：禁止 force: true', () => {
  it('全部套件与诊断脚本零 force 点击', () => {
    const violations: string[] = []
    let clickCount = 0
    for (const rel of SUITE_FILES) {
      const src = readFileSync(resolve(ROOT, rel), 'utf8')
      clickCount += (muteNonCode(src).match(/\.(?:click|check)\(/g) || []).length
      for (const line of findForceClicks(src)) violations.push(`${rel}:${line}`)
    }
    // 防空转：文件被挪走/选择器改名时，扫描面不能静默变成 0 个点击。
    expect(clickCount).toBeGreaterThan(200)
    expect(violations).toEqual([])
  })

  it('合成违规必须被抓到（双向控制组）', () => {
    expect(findForceClicks(`await btn.click({ force: true })`)).toEqual([1])
    expect(findForceClicks(`await page\n  .locator('.x')\n  .check({ timeout: 3000, force: true })`)).toEqual([3])
  })

  it('非点击用法与注释里的反例必须零误报', () => {
    expect(findForceClicks(`fs.rmSync(dir, { recursive: true, force: true })`)).toEqual([])
    expect(findForceClicks(`fs.rmSync(p, { force: true })`)).toEqual([])
    expect(findForceClicks(`// 反例：btn.click({ force: true })\n/* .check({ force: true }) */`)).toEqual([])
    expect(findForceClicks(`await btn.click({ force: false })`)).toEqual([])
  })
})
