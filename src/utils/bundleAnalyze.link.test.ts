// src/utils/bundleAnalyze.link.test.ts
// Bundle 体积分析档（`npm run build:analyze`）全链路契约守卫（批七十六）。
//
// 实证动机（本守卫不是"预防性"的，而是被一次真实翻案钉出来的）：
// `docs/performance.md` §1.3 与 `docs/optimization/OPTIMIZATION_PLAN_ROUNDS101-102.md`
// 早就写着 "✅ 已修复：npm run build:analyze → dist/stats.html"，但 e2e 功能 41 的
// Perf-2 断言实测 **env=false, flag=false** —— `.env.analyze` 根本不存在：
// 它诞生于 `.gitignore` 老规则"忽略 `.env.*` + 只逐个 `!` 放行"的年代，于是从未进过
// 仓库（同一个失误先后吞掉 `.env.embedded`（批七十五）与 `.env.analyze`（本轮）），
// 磁盘副本又被删除。缺了它，`viteEnv.VITE_ANALYZE` 永远取不到 `true` ⇒
// `vite/plugins/index.ts` 的闸门永不打开 ⇒ 这条"已完成"的优化其实整条是断的。
//
// 本守卫钉四件事：模式文件在库、闸门条件与产物路径与文档一致、`.gitignore` 不再靠枚举
// 白名单、以及**判据本身可证伪**（用老规则跑同一个模拟器必须给出"被忽略"）。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '../../')

function readRequired(rel: string): string {
  const fp = path.join(PKG_ROOT, rel)
  if (!fs.existsSync(fp)) {
    throw new Error(`${rel} 读不到输入：${fp}（校验没有跑，不得当成通过）`)
  }
  return fs.readFileSync(fp, 'utf8')
}

/** dotenv 口径的最小解析：去 BOM、跳注释与空行、`KEY = value`、剥外层引号 */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    out[key] = value
  }
  return out
}

/**
 * gitignore 语义的最小仿真（只覆盖本仓用到的形态）：
 * 规则按顺序匹配、**最后一条生效**；不含 `/` 的模式按文件名匹配；`!` 前缀为放行。
 * 这不是完整实现，只用于把"白名单枚举 vs 默认放行"这一处判据机械化。
 */
function isIgnoredBy(patterns: string[], file: string): boolean {
  const base = path.posix.basename(file)
  let ignored = false
  for (const raw of patterns) {
    const p = raw.trim()
    if (!p || p.startsWith('#')) continue
    const negated = p.startsWith('!')
    const body = negated ? p.slice(1) : p
    if (body.includes('/')) continue // 本仓 env 规则都是根级无斜杠模式
    const re = new RegExp('^' + body.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    if (re.test(base)) ignored = !negated
  }
  return ignored
}

function envRuleBlock(gitignore: string): string[] {
  const lines = gitignore.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === '.env' || l.trim() === '!.env.*')
  expect(start, '.gitignore 里找不到 env 规则块（起始行 .env 或 !.env.*）').toBeGreaterThanOrEqual(0)
  // 规则块以第一条空行结束
  const block: string[] = []
  for (let i = Math.min(start, lines.length - 1); i < lines.length; i++) {
    if (!lines[i].trim() && block.length) break
    block.push(lines[i])
  }
  return block
}

describe('build:analyze 档的四段链路（模式文件 → 闸门 → 产物路径 → 文档）', () => {
  const analyze = parseEnv(readRequired('.env.analyze'))
  const prod = parseEnv(readRequired('.env.production'))

  it('VITE_ANALYZE 必须为 true（闸门唯一判据）', () => {
    expect(analyze.VITE_ANALYZE, '缺 VITE_ANALYZE ⇒ visualizer 永不启用').toBe('true')
  })

  it('.env.analyze 除 VITE_ANALYZE 外逐字对齐 .env.production（分析的就是上线包）', () => {
    for (const key of ['VITE_APP_TITLE', 'VITE_APP_ENV', 'VITE_APP_BASE_API', 'VITE_BUILD_COMPRESS']) {
      expect(prod[key], `.env.production 缺 ${key}`).toBeTruthy()
      expect(analyze[key], `.env.analyze 的 ${key} 与生产不一致`).toBe(prod[key])
    }
    const extra = Object.keys(analyze).filter((k) => k !== 'VITE_ANALYZE' && !(k in prod))
    expect(extra, `.env.analyze 多出生产没有的键：${extra.join(', ')}`).toEqual([])
  })

  it('package.json 的 build:analyze 走 mode=analyze（决定读哪个 .env.<mode>）', () => {
    const pkg = JSON.parse(readRequired('package.json')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.scripts['build:analyze']).toBe('vite build --mode analyze')
    expect(pkg.devDependencies['rollup-plugin-visualizer'], '可视化插件依赖缺失').toBeTruthy()
  })

  it('vite/plugins/index.ts 的闸门判据与 visualizer 的产物路径都写死在文档口径上', () => {
    const index = readRequired('vite/plugins/index.ts')
    expect(index).toContain('viteEnv.VITE_ANALYZE === \'true\'')
    expect(index).toContain('createVisualizer()')

    const plugin = readRequired('vite/plugins/visualizer.ts')
    // 实测：filename 写成裸 'stats.html' 时产物落在**包根**（resolve 以 cwd 为基准，
    // 不是 rollup 的 output.dir），既与 performance.md §1.3 的 `dist/stats.html` 相反，
    // 又把 2 MB 报告丢在 git 跟踪范围内（.gitignore 只忽略 dist/）。
    const m = plugin.match(/filename:\s*'([^']+)'/)
    expect(m, 'visualizer.ts 未显式给出 filename').not.toBeNull()
    expect(m![1], `filename 必须落在 dist/ 下，实际 ${m![1]}`).toBe('dist/stats.html')
    expect(plugin).toContain('gzipSize: true')
    expect(plugin).toContain('brotliSize: true')
  })

  it('文档里承诺的产物路径与插件实际写出的一致（防"文档说已完成、链路其实断"）', () => {
    const doc = readRequired('docs/performance.md')
    expect(doc).toContain('npm run build:analyze')
    expect(doc).toContain('dist/stats.html')
    // 报告必须由 .env.analyze 驱动，文档也要点明这一点（本轮就是缺这句让人误判）
    expect(doc).toContain('.env.analyze')
  })
})

describe('.gitignore 的 env 规则不再依赖枚举白名单', () => {
  const block = envRuleBlock(readRequired('.gitignore'))

  it('.env 本机覆盖项仍被忽略，而任何 .env.<mode> 默认入库', () => {
    expect(isIgnoredBy(block, 'stepby-vue/.env'), '.env 必须继续忽略').toBe(true)
    expect(isIgnoredBy(block, 'stepby-vue/.env.local'), '.env.local 必须继续忽略').toBe(true)
    expect(isIgnoredBy(block, 'stepby-vue/.env.production.local'), '.env.*.local 必须继续忽略').toBe(true)
    for (const f of ['.env.analyze', '.env.embedded', '.env.production', '.env.qwe']) {
      expect(isIgnoredBy(block, 'stepby-vue' + f), `${f} 应可入库`).toBe(false)
    }
  })

  it('判据本身可证伪：历史规则（忽略 .env.* + 只放行 example）在同一模拟器下确实吞掉了新增模式文件', () => {
    // 这就是 .gitignore 注释里记载的老形态（批七十五 .env.embedded、本轮 .env.analyze
    // 两次被同一个规则吞掉）。用它跑同一个模拟器必须给出"被忽略"，否则上面的绿色是虚的。
    const legacy = ['.env', '.env.local', '.env.*.local', '.env.*', '!.env.example']
    for (const f of ['.env.analyze', '.env.embedded', '.env.staging']) {
      expect(isIgnoredBy(legacy, `stepby-vue/${f}`), `老规则下 ${f} 应被吞掉（复现历史失误）`).toBe(true)
    }
    // 已放行的三个老模式文件在老规则下不受影响 ⇒ 对照组真受约束，不是恒假
    expect(isIgnoredBy(legacy, 'stepby-vue/.env.example'), '.example 在老规则下已放行').toBe(false)

    // 顺序敏感性（"最后匹配生效"）也被正确实现：`!.env.*` 与三条忽略行**同时**命中
    // `.env.local`，所以它必须写在前面。写成后置就把本机口令文件反向放行了（要防的泄漏），
    // 现网顺序（放行在前）下它仍被忽略。
    expect(isIgnoredBy(['!.env.*', '.env', '.env.local', '.env.*.local'], 'stepby-vue/.env.analyze')).toBe(false)
    expect(
      isIgnoredBy(['.env', '.env.local', '.env.*.local', '!.env.*'], 'stepby-vue/.env.local'),
      '反序时 .env.local 会被 !.env.* 反向放行（证明顺序判据成立）'
    ).toBe(false)
    expect(
      isIgnoredBy(
        readRequired('.gitignore')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
        'stepby-vue/.env.local'
      ),
      '.env.local 在现网整份 .gitignore 下仍被忽略'
    ).toBe(true)
  })

  it('现网规则顺序正确：先 !.env.* 放行、后三条忽略，且不存在 .env.* 的忽略行', () => {
    const bare = block.map((l) => l.trim())
    expect(bare).toContain('!.env.*')
    expect(bare, '不得再出现无差别忽略 .env.* 的行').not.toContain('.env.*')
    const allowIdx = bare.indexOf('!.env.*')
    for (const ign of ['.env', '.env.local', '.env.*.local']) {
      expect(bare.indexOf(ign), `缺少忽略行 ${ign}`).toBeGreaterThan(-1)
      expect(bare.indexOf(ign), `${ign} 必须排在 !.env.* 之后（最后匹配才生效）`).toBeGreaterThan(allowIdx)
    }
  })
})
