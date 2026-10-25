/**
 * 静态守卫：外链判定只允许走 `utils/validate.ts` 的三个命名出口
 * （`isExternal` / `isHttp` / `isAbsoluteUrl`）。
 *
 * 缺陷形态（b89 N-D 盘查实测）：六处旁通写法里至少三处是**真坏行为**——
 * `//host` 被 `replace(/\/+/g,'/')` 折叠成 `/host` 后当站内路由（CommandPalette 菜单收集）、
 * `tel:`/`mailto:` 落进 `router.push` ⇒ 404 页（全局搜索）、
 * `p.indexOf('http')` 在协议相对支返回 -1 ⇒ `slice(-1)` 只把最后一个字符交给 `window.open`
 * （HeaderSearch，b89 已修）。口径散落每多一处，就会多一种"看着像外链判断、实际判错"的写法。
 *
 * 判定对象是**代码**：注释与文档里的反例不算（`muteComments` 与其它守卫共用同一台状态机），
 * 字符串/正则字面量保留（被检形态本身就含字面量）。
 *
 * 双向对照组：
 * - 三类合成违规（startsWith / indexOf / 正则字面量）必须全部转红；
 * - 命名出口、注释里的反例、入参校验（http-debugger / webHook）不得误报；
 * - 豁免条目必须仍然命中，否则报"豁免已失效"（豁免腐化 = 判据悄悄放行）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { muteComments } from '@/utils/e2eSuiteScanKit'

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 允许出现旁通写法的文件与理由（逐条自足；未命中即失效） */
export const EXTERNAL_JUDGMENT_EXEMPTIONS: Record<string, string> = {
  'utils/validate.ts': '单一事实源本身：isHttp 的 indexOf/startsWith 与 isAbsoluteUrl 的锚定正则',
  'views/tool/http-debugger/index.vue': '入参校验，语义相反：必须绝对 http(s)，刻意拒绝 // 与 tel:（不是"是否外链"）',
  'views/system/webHook/index.vue': '表单规则，语义同上：webhook 地址必须绝对 http(s)',
  'components/HeaderSearch/index.vue': '偏移量计算而非判定：入参已由 isHttp 判过，-1 分支已显式处理（b89 修复）'
}

const PROHIBITED = [
  { id: 'startsWith', re: /\.startsWith\(\s*['"]https?[:'"]/ },
  { id: 'indexOf', re: /\.indexOf\(\s*['"]https?[:'"]/ },
  { id: 'regexHttp', re: /\^https\?:\\\/\\\// },
  { id: 'regexProtocolRelative', re: /\^\(https\?:\)\?\\\/\\\// }
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p)
  }
  return out
}

export interface ExternalHit {
  file: string
  line: number
  pattern: string
  text: string
}

/** 纯判据：一个文件源码 → 旁通写法命中（真实树与合成夹具共用同一路径） */
export function scanExternalJudgments(rel: string, src: string): ExternalHit[] {
  const masked = muteComments(src)
  const lines = masked.split('\n')
  const rawLines = src.split('\n')
  const hits: ExternalHit[] = []
  lines.forEach((line, idx) => {
    for (const p of PROHIBITED) {
      if (p.re.test(line)) {
        hits.push({ file: rel, line: idx + 1, pattern: p.id, text: rawLines[idx].trim() })
      }
    }
  })
  return hits
}

const files = walk(SRC_ROOT).map((abs) => ({
  rel: relative(SRC_ROOT, abs).replace(/\\/g, '/'),
  src: readFileSync(abs, 'utf8')
}))

describe('外链判定形状锁', () => {
  it('真实树：命名出口之外不得有旁通写法（豁免逐条带理由）', () => {
    expect(files.length).toBeGreaterThan(300)
    const violations = files
      .flatMap((f) => scanExternalJudgments(f.rel, f.src))
      .filter((h) => !(h.file in EXTERNAL_JUDGMENT_EXEMPTIONS))
    expect(
      violations,
      `外链判定散落（请改用 utils/validate.ts 的 isExternal / isHttp / isAbsoluteUrl）：\n${violations
        .map((v) => `${v.file}:${v.line} [${v.pattern}] ${v.text}`)
        .join('\n')}`
    ).toEqual([])
  })

  it('豁免条目必须仍然命中（豁免腐化 = 判据悄悄放行）', () => {
    for (const [rel, why] of Object.entries(EXTERNAL_JUDGMENT_EXEMPTIONS)) {
      const abs = join(SRC_ROOT, rel)
      expect(existsSync(abs), `豁免指向的文件不存在：${rel}（${why}）`).toBe(true)
      const hits = scanExternalJudgments(rel, readFileSync(abs, 'utf8'))
      expect(hits.length, `豁免已失效，应撤下：${rel}（理由：${why}）`).toBeGreaterThan(0)
    }
  })

  it('合成违规：三类写法必须全部被抓', () => {
    const samples = [
      `const external = path.startsWith('http')`,
      `const offset = p.indexOf('http')`,
      `const isAbs = /^https?:\\/\\//i.test(url)`,
      `const isAbs2 = /^(https?:)?\\/\\//i.test(url)`
    ]
    const got = samples.flatMap((s) => scanExternalJudgments('synthetic.ts', s).map((h) => h.pattern))
    expect(new Set(got)).toEqual(new Set(['startsWith', 'indexOf', 'regexHttp', 'regexProtocolRelative']))
  })

  it('合规写法与注释反例不得误报', () => {
    const clean = [
      `const a = isExternal(path)`,
      `const b = isHttp(url)`,
      `const c = isAbsoluteUrl(url)`,
      `// 反例（注释不算代码）：path.startsWith('http')`,
      `/* 反例：/^https?:\\/\\//i.test(x) */`
    ].join('\n')
    expect(scanExternalJudgments('clean.ts', clean)).toEqual([])
  })

  it('命中行号必须指向真实行（掩码保持等长）', () => {
    const src = ['const ok = 1', '// comment', `const x = u.startsWith('http')`].join('\n')
    const [hit] = scanExternalJudgments('line.ts', src)
    expect(hit.line).toBe(3)
  })
})
