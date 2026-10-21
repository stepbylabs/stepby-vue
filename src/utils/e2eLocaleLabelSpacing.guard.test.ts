/**
 * 静态守卫：e2e 选择器不得使用"无空格形式"的文案标签（b83）。
 *
 * ## 缺陷形态（本批由点击落地通道实测抓到 5 个模块、6 处空判据）
 *
 * 本仓 zh-CN 文案里有一批**字面就带空格**的双字标签：
 * `common.confirm = '确 定'`、`common.cancel = '取 消'`、`common.close = '关 闭'`、
 * `common.login = '登 录'`、`auth.registerNow` 一族里的 `注 册`、`tool.print = '打 印'`
 * （清单不在本文件里手抄，由下面的 `spacedLabelsOf(zh-CN)` 从文案表**现算**）。
 * Playwright 的 `:has-text("取消")` 与 `getByRole({name:/取消/})` 只做"首尾去空白 +
 * 连续空白折成一个空格"的归一，**不会吃掉中间那个空格** ⇒ 这类选择器永远匹配不到元素。
 *
 * 后果不是"点了没反应"这么简单：站点普遍写成 `.click().catch(() => {})`，于是
 * ① 该确认框**从没被回答过**，遮罩一直盖在页面上，污染同模块后续每一步（实测 M18 的
 * "确认对话框出现"其实是上一步没关掉的编辑对话框）；②依赖它的判据**因为没执行而通过**——
 * "取消后列表不变"在"取消成功"与"没人点取消"两种相反状态下都成立（b79 ③ 那条纪律的镜像）。
 *
 * ## 为什么规则是"两种形式都要给"而不是"只准写带空格的"
 *
 * 本仓同一语义在**不同命名空间里字面不同**：`exportDialog.cancel = '取消'`（不带空格，
 * 实测 main.mjs F5 靠它一直是绿的），而 `common.cancel = '取 消'`。只写任一种都会在换个
 * 命名空间后静默失配；逗号并列两种形式**只会多匹配自己那一种真实文案**，不会误伤别的，
 * 所以判据取"同一行内必须同时出现带空格与不带空格两种形式"。
 *
 * ## 为什么按行而不是按"整条选择器串"
 *
 * 掩码器（`e2eSuiteScanKit`）只保证"注释里的反例不算"，要精确取到"包含本次匹配的
 * **那一条字符串字面量**"还得再写一台引号状态机——两台刀口必漂是本仓立过案的。
 * 实测全仓这类写法都是"一条字面量在一行内"，故按行判；真要跨行写选择器时本判据会**误报**，
 * 而误报的修法（把孪生写到同一行）不改变任何行为。
 *
 * ## 刀口自证
 *
 * `spacedLabelsOf` 取不到标签 ⇒ 判据的输入就是空的 ⇒ "0 处违规"毫无意义，所以有下限断言；
 * 每个被扫文件末尾插入一条合成违规必须被抓到（与 force 点击守卫同一把差异法）；
 * `:has-text(` 总量有体量下限，防扫描面静默变空。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectMjs, muteComments, muteNonCode, E2E_DIR } from './e2eSuiteScanKit'
import zhCN from '../i18n/locales/zh-CN'

const ROOT = process.cwd()

/** 形如「确 定」的文案叶子：一个字面空格夹在两个汉字之间 */
const SPACED_LEAF_RE = /^\p{Unified_Ideograph} \p{Unified_Ideograph}$/u

/**
 * 从文案表**现算**带空格的双字标签（不在测试里手抄清单——手抄的清单会随文案改动而漂）。
 *
 * @param tree - i18n 的嵌套对象（zh-CN 聚合导出）
 * @returns 去重并排序后的标签数组，形如 `['关 闭', '登 录', ...]`
 */
export function spacedLabelsOf(tree: unknown): string[] {
  const out = new Set<string>()
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      if (SPACED_LEAF_RE.test(node)) out.add(node)
      return
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) walk(v)
    }
  }
  walk(tree)
  return [...out].sort()
}

const SPACED_LABELS = spacedLabelsOf(zhCN)
/** 不带空格的孪生形式 → 带空格形式 */
const UNSPACED_TO_SPACED = new Map(SPACED_LABELS.map((l) => [l.replace(' ', ''), l]))

/** `:has-text("X")` / `:has-text('X')` 里的那个标签 */
const HAS_TEXT_RE = /:has-text\(\s*(["'])([^"'\n]*)\1/g
/** `getByRole(..., { name: /X/ })` 里整条正则恰好就是一个标签的那种写法 */
const ROLE_NAME_RE = /\bname:\s*\/([^/\n]*)\/[gimsuyd]*/g

/**
 * 返回一行里的违规片段（`标签@来源`）。
 *
 * 判据：出现"不带空格的标签"且**同一行没有**对应的带空格孪生（正则形态还接受
 * 容空格的写法，如 `/取\s*消/`）。
 */
export function spacingViolations(line: string, labels = UNSPACED_TO_SPACED): string[] {
  const bad: string[] = []
  const text = muteComments(line)
  for (const re of [HAS_TEXT_RE, ROLE_NAME_RE]) {
    const scan = new RegExp(re.source, 'g')
    let m: RegExpExecArray | null
    while ((m = scan.exec(text))) {
      const raw = re === HAS_TEXT_RE ? m[2] : m[1]
      const label = raw.trim()
      const spaced = labels.get(label)
      if (!spaced) continue
      // 容空格的正则（`/取\s*消/`）与同行给出孪生都算合格
      const tolerant = re === ROLE_NAME_RE && raw === `${label[0]}\\s*${label[1]}`
      if (tolerant || text.includes(spaced)) continue
      bad.push(`${label}（须同时给「${spaced}」）`)
    }
  }
  return bad
}

/** 全文逐行找违规，返回 `${文件}:${行号}: 标签` 列表 */
export function findSpacingViolations(src: string, rel = ''): string[] {
  const masked = muteComments(src)
  const out: string[] = []
  masked.split('\n').forEach((line, idx) => {
    for (const v of spacingViolations(line)) out.push(`${rel}:${idx + 1}: ${v}`)
  })
  return out
}

const suiteFiles = collectMjs(resolve(ROOT, E2E_DIR), '')

describe('e2e 文案空格守卫 · 规则：带空格标签必须给孪生', () => {
  it('输入自证：标签清单由文案表现算，取不到就不得继续', () => {
    // 「锁的输入非空且形状对」与「锁的结论对」是两件事（AGENTS §测试门禁 ⑬）。
    // 若哪天有人把这些文案改成不带空格，本判据的采集面会**静默变空**，
    // 于是"0 处违规"再也证明不了任何东西——所以先证明标签真的在表里。
    expect(SPACED_LABELS.length).toBeGreaterThanOrEqual(4)
    for (const must of ['确 定', '取 消']) expect(SPACED_LABELS).toContain(must)
    expect([...UNSPACED_TO_SPACED.keys()]).toContain('取消')
    // 反向：不带空格的文案不得进清单（否则会把所有正常写法报成违规）
    expect(SPACED_LABELS.some((l) => !l.includes(' '))).toBe(false)
  })

  it('扫描面自证：套件入口与嵌套目录都收进来，_tmp 不进来', () => {
    for (const must of ['main.mjs', 'deep-e2e.mjs', 'a11y-full.mjs', 'capture-kit.mjs', 'e2e/run/runner.mjs']) {
      expect(suiteFiles, `扫描面必须包含 ${must}`).toContain(must)
    }
    expect(suiteFiles.filter((f) => f.startsWith('modules/')).length).toBeGreaterThan(0)
    expect(suiteFiles.some((f) => f.includes('_tmp/'))).toBe(false)
  })

  it('现网全绿：整个套件不得有"只写无空格形式"的标签', () => {
    let hasTextCount = 0
    const violations: string[] = []
    for (const rel of suiteFiles) {
      const src = readFileSync(resolve(ROOT, E2E_DIR, rel), 'utf8')
      hasTextCount += (muteComments(src).match(/:has-text\(/g) || []).length
      violations.push(...findSpacingViolations(src, rel))
    }
    // 体量下限：选择器写法确实被扫到了（换成"扫不到文件"时本条必须先红）
    expect(hasTextCount, ':has-text( 数量异常，扫描面或掩码器坏了').toBeGreaterThan(200)
    expect(violations, `违规：\n${violations.join('\n')}`).toEqual([])
  })

  it('刀口自证：每个被扫文件末尾插入一条合成违规都必须被抓到', () => {
    const blind: string[] = []
    for (const rel of suiteFiles) {
      const src = readFileSync(resolve(ROOT, E2E_DIR, rel), 'utf8')
      const planted = `${src}\nawait page.locator('button:has-text("取消")').click()\n`
      const hits = findSpacingViolations(planted, rel)
      if (hits.length === 0) blind.push(rel)
      // 长度不变式对 keepStrings 变体同样成立，否则行号不可信
      if (muteComments(planted).length !== planted.length) blind.push(`${rel}（长度不变式破了）`)
      if (muteNonCode(planted).length !== planted.length) blind.push(`${rel}（默认掩码长度不变式破了）`)
    }
    expect(blind, `这些文件的扫描结果不可信`).toEqual([])
  })

  it('合成违规必须被抓到（双向控制组）', () => {
    expect(spacingViolations(`await page.locator('button:has-text("取消")').click()`)).toEqual([
      '取消（须同时给「取 消」）'
    ])
    // 同一行给了孪生 ⇒ 合格（这是修复后的真实写法）
    expect(
      spacingViolations(`'.el-message-box button:has-text("取 消"), .el-message-box button:has-text("取消")'`)
    ).toEqual([])
    // getByRole 的正则形态：整条就是一个无空格标签
    expect(spacingViolations('page.getByRole("button", { name: /取消/ })')).toEqual(['取消（须同时给「取 消」）'])
    // 模板字符串里的选择器同样要看得到（keepStrings 变体存在的意义）
    expect(spacingViolations('const sel = `button:has-text("确定")`')).toEqual(['确定（须同时给「确 定」）'])
  })

  it('合格写法与注释里的反例必须零误报', () => {
    // 容空格的正则写法是本批推荐的另一种合格形态
    expect(spacingViolations('page.getByRole("button", { name: /取\\s*消/ })')).toEqual([])
    // 注释里的反例不得算（main.mjs:1254 那条历史注释就是这个形状）
    expect(spacingViolations('// 不能用 button:has-text("取消")，因为文案是「取 消」')).toEqual([])
    expect(spacingViolations('/* getByRole({ name: /确定/ }) */')).toEqual([])
    // 三字/四字标签不在"带空格文案"集合里 ⇒ 不得误报（EP 的 autoInsert 只对恰好两字生效，
    // 而本判据的输入是文案表本身，不看组件实现）
    expect(spacingViolations(`page.locator('button:has-text("取消授权")')`)).toEqual([])
    expect(spacingViolations(`page.locator('button:has-text("确定导出")')`)).toEqual([])
    // 不带空格的文案（exportDialog.cancel='取消'）出现在**同一行已有孪生**的选择器里不算违规；
    // 而单独出现时按规则就该报——这正是"换个命名空间就静默失配"的那一族
    expect(spacingViolations(`dialog.locator('button:has-text("取 消"), button:has-text("取消")')`)).toEqual([])
    // 与文案无关的 has-text 不得误报
    expect(spacingViolations(`page.locator('button:has-text("新增")')`)).toEqual([])
  })
})
