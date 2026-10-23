/**
 * 静态守卫：`tests/**` 下的脚本不得用 `process.cwd()` 反推仓库根 / 落盘目录（b83）。
 *
 * ## 规则与本批的实证
 *
 * AGENTS《测试门禁全景》② 立的是"判据脚本的**默认输入**必须从脚本位置反推本仓根"。
 * 本批踩到的是它的**镜像面**——判据的**输出**也按 cwd 落盘：
 * `main.mjs` 的 `screenshotDir: path.resolve('screenshots')` 从 `stepby-vue/` 启动写
 * `stepby-vue/screenshots/`，从 `tests/e2e/` 启动写 `tests/e2e/screenshots/`；
 * 而所有消费方（`click-failure-audit` / `endpoint-coverage` / `request-storm`）按**脚本位置**
 * 只读后者 ⇒ 主套件的全量断面（`main-clickfails.json`、`test-report.json`、`_metrics_5xx_baseline.json`）
 * 分居两棵树，判据读到的可能是上一轮、也可能根本没有（这一支由 fail-closed 兜住，
 * 但 `--metrics` 那一支读到了**旧断面**却毫无提示）。RUN-RECIPE §3 明确
 * `cd stepby-vue/tests/e2e && node main.mjs`，而本批多条命令从仓根跑——两种启动目录都合法，
 * 于是同一份代码在两个目录里各自"正常"。同族四处一并收口：`capture-kit` 的 `shotDir` 默认值、
 * `deep-e2e` M83 的 `_tmp` 夹具目录、`perf-throttle-check` 的 `perf-budget.json`、
 * `validate-phone-redirect` 与 `diag-pages` 的根目录。
 *
 * ## 边界（为什么不扩到 src 下的守卫）
 *
 * `src/utils/*.guard.test.ts` 也用 `process.cwd()`，但它们只在 vitest 下执行，
 * vitest 的进程目录由 `vitest.config.ts` 所在目录决定（只有"从仓根跑 npx vitest"一种入口），
 * 且 `collectMjs()` 拿到错根时是 `ENOENT` 抛出而不是返回空集 ⇒ 不存在"静默读旧树"这一支。
 * 本判据只管**有两个合法启动目录**的 `tests/` 树，不做全仓文风税。
 *
 * ## 刀口自证
 *
 * 掩码用共用的 `muteNonCode`（默认口径：注释/字符串/正则全置空），因此本文件与
 * `capture-kit.mjs` 头部那些"旧写法长什么样"的说明不会被当成违规；
 * 活性由"往真实文件末尾追加一条合成 `process.cwd()` 必须被抓到"来证，
 * 另有一条"只在注释里提到 process.cwd 的对照源码必须 0 命中"的反证。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectMjs, lineHits, muteNonCode, EXCLUDED_DIRS } from './e2eSuiteScanKit'

/** 仓根按**本文件位置**反推（src/utils 的上两层）——守卫自己不得重蹈被禁的写法 */
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TESTS_DIR = resolve(VUE_ROOT, 'tests')

const CWD_RE = /\bprocess\s*\.\s*cwd\s*\(/g

/** `process.cwd()` 的行号（1-based，掩码保持等长所以行号可信） */
export function findCwdUses(src: string): number[] {
  return lineHits(muteNonCode(src), CWD_RE)
}

const testFiles = collectMjs(TESTS_DIR, '', EXCLUDED_DIRS)

describe('e2e 路径锚定守卫 · 规则：tests/ 下禁 process.cwd()', () => {
  it('扫描面自证：入口与嵌套目录都收进来，_tmp/产物目录不进来', () => {
    for (const must of [
      'e2e/main.mjs',
      'e2e/deep-e2e.mjs',
      'e2e/capture-kit.mjs',
      'e2e/e2e/run/runner.mjs',
      'e2e/click-failure-audit.mjs',
      'validate-phone-redirect.mjs'
    ]) {
      expect(testFiles, `扫描面必须包含 ${must}`).toContain(must)
    }
    expect(testFiles.length, '扫描面体量探针（tests/ 下 .mjs 数量）').toBeGreaterThanOrEqual(40)
    expect(testFiles.some((f) => f.includes('_tmp/'))).toBe(false)
    expect(testFiles.some((f) => f.includes('screenshots/'))).toBe(false)
    expect(testFiles.some((f) => f.includes('node_modules/'))).toBe(false)
  })

  it('真实树：process.cwd() 必须 0 处（路径一律锚定脚本位置）', () => {
    const violations: string[] = []
    let maskedByteCheck = 0
    for (const rel of testFiles) {
      const src = readFileSync(resolve(TESTS_DIR, rel), 'utf8')
      const masked = muteNonCode(src)
      // 长度不变式：掩码后行号仍可信，否则"报在第 12 行"这句话本身就是错的
      expect(masked.length, `${rel} 掩码后长度必须与原文相等`).toBe(src.length)
      maskedByteCheck++
      const lines = findCwdUses(src)
      if (lines.length) violations.push(`${rel}:${lines.join(',')}`)
    }
    expect(maskedByteCheck, '每个被扫文件都要做长度对账').toBe(testFiles.length)
    expect(violations, `cwd 反推路径的站点：\n${violations.join('\n')}`).toEqual([])
    // 面大小由守卫自己打（b86）：文档抄一次就漂一次，而漂了没有任何东西会红
    console.warn(`[e2eCwdPath] 扫描面 ${testFiles.length} 个 .mjs / 长度对账 ${maskedByteCheck} 个文件 / cwd 站点 0 处`)
  })

  it('刀口活性：真实文件末尾追加一条合成违规必须被抓到', () => {
    // 差异法：不需要知道"正确计数是多少"——在文件末尾追加，掩码器若在此之前仍处于
    // 错误的字符串/模板态，这条就看不见，当场红（同 e2eClickPolicy 那条自证）。
    let caught = 0
    for (const rel of testFiles) {
      const src = readFileSync(resolve(TESTS_DIR, rel), 'utf8')
      const planted = `${src}\nconst __cwdGuardProbe = process.cwd()\n`
      const hits = findCwdUses(planted)
      if (hits.length > findCwdUses(src).length) caught++
    }
    expect(caught, '每条合成违规都必须让命中数 +1').toBe(testFiles.length)
  })

  it('反证：只在注释/字符串里提到 process.cwd() 不得算违规', () => {
    const commented = "// 旧写法 path.resolve(process.cwd(), 'screenshots') 会漂移\nconst a = 1\n"
    expect(findCwdUses(commented)).toEqual([])
    const inString = "const msg = '不要写 process.cwd()'\n"
    expect(findCwdUses(inString)).toEqual([])
    // 反证本身必须真含关键字，否则这条只是空跑（同 §测试门禁 ⑥ 的"必须证明条件确实成立"）
    expect(commented).toContain('process.cwd')
    expect(inString).toContain('process.cwd')
  })
})
