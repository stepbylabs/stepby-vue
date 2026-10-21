/**
 * 静态守卫：e2e 套件不得使用 `force: true` 点击（b81 N-8），并自证扫描面与刀口本身。
 *
 * ## 规则
 *
 * 缺陷形态：`locator.click({ force: true })` 跳过 Playwright 的 actionability 检查，
 * 按坐标直接派发事件。Tour 遮罩、残留对话框、加载遮罩在场时，事件会打在**遮挡物**上，
 * 而调用方常写成 `.catch(() => {})` 或只看"点了没报错"——"点了没反应"于是被记成一次
 * 成功点击。b81 M87 的 `落地=force` 且可见行 `8→8` 就是该形态的实证。
 *
 * 正确写法：普通 `locator.click()`，失败时先 `dismissTour` / 等遮罩再重试；对零宽 input
 * （EP select/radio）点它所属的可见 wrapper / label；最后才用 `el.click()` DOM 兜底，
 * 且调用方必须有独立的状态/请求断言。
 *
 * ## 为什么本批**不加**"禁 ElementHandle"那条静态规则（写了又删的取舍）
 *
 * 点击取证通道 `tests/e2e/capture-kit.mjs` 把补丁打在 `_Frame.prototype` 上，实测
 * `handle.click()` **不**经 Frame，是独立的一面 ⇒ 当时看上去只能立法禁掉它。
 * 但那条规则的刀口会落在 `waitForSelector` 上——实测 deep-e2e 一个文件里就有 19 处，
 * 绝大多数只是等待、与点击无关。为写法约束去改 19 处真实站点，属于"拿功能改动付文风税"。
 * **把通道补上比立法更稳**：`_ElementHandle.prototype` 也打了补丁（选择器已在那一刻
 * 消耗掉，故记 `<ElementHandle>`，归因走 `handle._frame._page`），并由
 * `probeClickChannel` 每轮跑批自证三条面各记 1 条。运行时看得见，就不需要静态禁。
 *
 * ## 刀口自己必须是判据对象（b83 实测的第二条）
 *
 * 上一版的掩码器只认 `//`、`/* * /`、引号三种边界，**不认正则字面量与模板插值**。
 * 于是套件里任何"正则里带引号"（`/['"]/`）或"模板插值里带引号"
 * （`` `x: ${v.replace(/'/g, '')}` ``）都会让引号奇偶错位，从那里开始**把后面的真代码
 * 当字符串吞掉**：实测 `.waitForSelector(` 在原文里有 19 处、掩码后剩 **0** 处，
 * 而掩码长度与原文逐字节相等（所以行号看起来还是对的，错位完全不可见）。
 * 这条守卫当时报的"违规 0 处"因此**不是证据**。
 *
 * 修法不是"再人工核对一次"，而是让刀口自己必须每次证明看得见东西：
 * `每个被扫文件末尾插入一条合成违规，必须被抓到`——掩码器若在文件尾部仍处于错误的
 * 字符串态，插入的那条就看不见，当场红（差异法：不需要知道正确计数是多少）。
 * 另加两条长度不变式与一条正则/模板的直接合成用例。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectMjs, lineHits, muteNonCode, E2E_DIR } from './e2eSuiteScanKit'

const ROOT = process.cwd()

const CLICK_FAMILY = 'click|check|uncheck|tap|hover|dblclick'
const FORCE_CLICK_RE = new RegExp(`\\.(?:${CLICK_FAMILY})\\(\\s*\\{[^}]*\\bforce\\s*:\\s*true`, 'g')
const CLICK_CALL_RE = new RegExp(`\\.(?:${CLICK_FAMILY})\\(`, 'g')

/** 违规行号（1-based）：点击族的 `force: true` 选项 */
export function findForceClicks(src: string): number[] {
  return lineHits(muteNonCode(src), FORCE_CLICK_RE)
}

/** 点击调用总数（体量探针，防扫描面静默变空） */
export function countClickCalls(src: string): number {
  return lineHits(muteNonCode(src), CLICK_CALL_RE).length
}

const suiteFiles = collectMjs(resolve(ROOT, E2E_DIR), '')

describe('e2e 点击策略守卫 · 规则：禁止 force: true', () => {
  it('扫描面自证：已知入口与嵌套目录都收进来，_tmp 不进来', () => {
    // 这四条锁的是**扫描面本身**。旧形状只枚举 5 个文件（main / deep-e2e / 两个 diag /
    // modules 一层），`a11y-full`、`action-inventory`、`e2e/run/runner.mjs` 从来不在视野内，
    // 而最后那个恰好证明还有嵌套目录——扫描面坏了不会自己报红，只会让判据"看起来更干净"。
    for (const must of [
      'main.mjs',
      'deep-e2e.mjs',
      'a11y-full.mjs',
      'action-inventory.mjs',
      'e2e/run/runner.mjs',
      'click-failure-audit.mjs',
      'capture-kit.mjs'
    ]) {
      expect(suiteFiles, `扫描面必须包含 ${must}`).toContain(must)
    }
    expect(suiteFiles.filter((f) => f.startsWith('modules/')).length).toBeGreaterThan(0)
    expect(suiteFiles.some((f) => f.includes('_tmp/'))).toBe(false)
    expect(suiteFiles.length).toBeGreaterThanOrEqual(40)
  })

  it('全部套件零 force 点击（且点击调用数有下限，防空转）', () => {
    const violations: string[] = []
    let clickCount = 0
    for (const rel of suiteFiles) {
      const src = readFileSync(resolve(ROOT, E2E_DIR, rel), 'utf8')
      clickCount += countClickCalls(src)
      for (const line of findForceClicks(src)) violations.push(`${rel}:${line}`)
    }
    expect(clickCount).toBeGreaterThan(200)
    expect(violations).toEqual([])
  })

  it('刀口自证：每个被扫文件末尾插入一条合成违规都必须被抓到', () => {
    // 差异法——不需要知道"正确计数应该是多少"：掩码器若在文件尾部仍停在错误的字符串态
    // （上一版就是被正则里的引号带偏，从那儿把后面整段代码吞掉），插入的这条就看不见。
    const blind: string[] = []
    for (const rel of suiteFiles) {
      const src = readFileSync(resolve(ROOT, E2E_DIR, rel), 'utf8')
      const planted = `${src}\nawait page.locator('#planted').click({ force: true })\n`
      const hits = findForceClicks(planted)
      if (!hits.length) blind.push(rel)
      // 长度不变式：掩码后必须与原文逐字符等长，否则报出来的行号不可信
      if (muteNonCode(planted).length !== planted.length) blind.push(`${rel}（长度不变式破了）`)
    }
    expect(blind, `这些文件的扫描结果不可信`).toEqual([])
  })

  it('合成违规必须被抓到（双向控制组）', () => {
    expect(findForceClicks('await btn.click({ force: true })')).toEqual([1])
    expect(findForceClicks("await page\n  .locator('.x')\n  .check({ timeout: 3000, force: true })")).toEqual([3])
    // 除 click/check 之外的点击族同样不得漏（旧正则只写 click|check，tap/hover 可绕过）
    expect(findForceClicks('await btn.tap({ force: true })')).toEqual([1])
    expect(findForceClicks('await btn.dblclick({ force: true })')).toEqual([1])
    expect(findForceClicks('await btn.hover({ force: true })')).toEqual([1])
  })

  it('正则字面量与模板插值不得翻转引号状态（上一版吞代码的确切形状）', () => {
    // 引号出现在正则里：上一版在这里进入"字符串"，把后面到下一个引号之间的**代码**全置空
    expect(findForceClicks('const q = /[\'"]/g\nawait btn.click({ force: true })')).toEqual([2])
    // 模板插值里是代码，插值之后仍要继续按代码掩码
    expect(findForceClicks("const s = `x: ${v.replace(/'/g, '')}`\nawait btn.click({ force: true })")).toEqual([2])
    // 除法不是正则起点
    expect(findForceClicks('const half = total / 2\nawait btn.click({ force: true })')).toEqual([2])
    // **嵌套模板**：`${a ? \`b${c}\` : ''}` —— 外层插值里再开一个模板。
    // 上一版用单一全局花括号计数，内层 `${}` 会把外层的计数覆盖掉，外层 `}` 数错之后
    // 整个后续文件都在错误状态下被掩码（实测 run-detached.mjs:153 就是这个形状）。
    expect(findForceClicks('console.log(`A=${x ? `B=${y}` : ""}`)\nawait btn.click({ force: true })')).toEqual([2])
    expect(findForceClicks('const s = `${ a ? `${ b }` : `${ c }` }`\nawait btn.click({ force: true })')).toEqual([2])
    // 这条是**能区分**"插值当普通文本"那种退化的形状：内层模板里带引号（`` `${a ? `b'c` : d}` ``）。
    // 把插值当文本掩掉时，内层那个反引号会**提前关掉外层模板**，接下来的 `b'c` 就落到代码模式里，
    // 那个单引号被当成字符串开头 ⇒ 后面一行真代码被吞掉。
    // 为什么单独钉这一条：本批改完后试过"退化成不压插值"的变异，末尾插入的合成违规**仍然被抓到**
    // （错位自己又对回去了）——说明"末尾插入"这一把刀只看得见一部分退化，
    // 判据的敏感性必须有能区分的用例来证明，不得只靠那一条。
    expect(findForceClicks("const t = `${a ? `b'c` : d}`\nawait btn.click({ force: true })")).toEqual([2])
    expect(findForceClicks('const t = `${a("x")}${b("y")}`\nawait btn.click({ force: true })')).toEqual([2])
  })

  it('非点击用法与注释/字符串里的反例必须零误报', () => {
    expect(findForceClicks('fs.rmSync(dir, { recursive: true, force: true })')).toEqual([])
    expect(findForceClicks('// 反例：btn.click({ force: true })\n/* .check({ force: true }) */')).toEqual([])
    expect(findForceClicks('await btn.click({ force: false })')).toEqual([])
    expect(findForceClicks("const sel = 'text=force: true'")).toEqual([])
    expect(findForceClicks('await btn.click({ timeout: 3000 })')).toEqual([])
  })
})
