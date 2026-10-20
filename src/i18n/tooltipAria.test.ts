import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

/**
 * tooltip 文案 ↔ 按钮可访问名 一致性静态守卫（b81）。
 *
 * 起因：代码生成页同步按钮 tooltip 是「同步」，`aria-label` 却指向「刷新」；生成代码按钮
 * tooltip 是「生成代码」，`aria-label` 却是「下载」。图标按钮没有可见文本，读屏用户只能听到
 * aria-label ⇒ 播报的动作与实际点击的动作不一致。a11y 全站门禁只检查"有没有名字"，
 * 抓不到"名字是错的"；运行时采集也看不到（DOM 合法、请求成功）。
 *
 * 判据只覆盖 `<el-tooltip :content="t('A')">` 紧邻 `<el-button :aria-label="t('B')">` 这一形态，
 * 且比较**解析后的文案**而不是键名：`common.preview` 与 `gen.btn.preview` 键名不同但都是「预览」，
 * 要求键名相同会制造无意义噪声。键名相同而文案不同（例如某语言包写错）也同样被抓——
 * 比较值比比较键更接近"用户听到什么"。
 *
 * 误报边界：tooltip 是**弹窗标题**、aria 是**行内动作**时，两者语义是包含关系而非矛盾
 * （角色页的「选择用户」/「分配角色」），这类必须在 ALLOW 表带理由登记；新出现的不一致
 * 一律红，逼人先判断是缺陷还是可接受差异。
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..')

const ALLOW: Record<string, string> = {
  'role.selectUser.title|user.assignRoles':
    'tooltip 是选择用户弹窗的标题（选择用户），aria 是行内动作（分配角色）——语义包含，不是错误播报'
}

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__snapshots__') continue
      yield* walk(fp)
    } else if (e.name.endsWith('.vue')) {
      yield fp
    }
  }
}

function resolveKey(root: unknown, key: string): string | undefined {
  let cur = root
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

export interface PairMismatch {
  tooltipKey: string
  ariaKey: string
  tooltipValue?: string
  ariaValue?: string
}

/**
 * 从单个 .vue 源码文本中抽出 (tooltip 键, aria 键) 对并判定。
 * 导出给自检用：同一判据必须能在合成违规上转红，否则"全绿"没有意义。
 */
export function collectMismatches(sourceText: string, locale: unknown = zhCN): PairMismatch[] {
  const re = /<el-tooltip[^>]*:content="t\('([^']+)'\)"[^>]*>\s*<el-button[^>]*:aria-label="t\('([^']+)'\)"/g
  const out: PairMismatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sourceText))) {
    const [, tooltipKey, ariaKey] = m
    const tooltipValue = resolveKey(locale, tooltipKey)
    const ariaValue = resolveKey(locale, ariaKey)
    // 双列都缺键时交给 i18n 键完整性守卫（它扫全部 t() 字面量）；这里只判"都存在且不等"
    if (tooltipValue === undefined || ariaValue === undefined) continue
    if (tooltipValue === ariaValue) continue
    if (ALLOW[`${tooltipKey}|${ariaKey}`]) continue
    out.push({ tooltipKey, ariaKey, tooltipValue, ariaValue })
  }
  return out
}

describe('tooltip 与 aria-label 文案一致性', () => {
  it('全仓不存在未登记的"播报动作 ≠ 实际动作"（zh/en 双侧）', () => {
    const bad: Array<PairMismatch & { file: string; locale: string }> = []
    for (const fp of walk(SRC)) {
      const rel = path.relative(SRC, fp).replace(/\\/g, '/')
      const text = fs.readFileSync(fp, 'utf8')
      // 两侧都判：只判 zh 会漏掉"中文恰好同义、英文一个词写错"的漂移
      for (const [locale, data] of [
        ['zh', zhCN],
        ['en', enUS]
      ] as const) {
        for (const m of collectMismatches(text, data)) bad.push({ ...m, file: rel, locale })
      }
    }
    expect(
      bad.map(
        (b) =>
          `${b.file} [${b.locale}]: tooltip ${b.tooltipKey}="${b.tooltipValue}" vs aria ${b.ariaKey}="${b.ariaValue}"`
      )
    ).toEqual([])
  })

  it('判据自身：同值不同键不报、不同值必报、允许表生效、跨行属性可解析', () => {
    const src = (tooltip: string, aria: string) =>
      `<el-tooltip :content="t('${tooltip}')" placement="top">\n  <el-button\n    link\n    :aria-label="t('${aria}')"\n  ></el-button>\n</el-tooltip>`

    // 键名不同、文案相同（common.preview / gen.btn.preview）⇒ 不报
    expect(collectMismatches(src('common.preview', 'gen.btn.preview'))).toEqual([])
    // 文案不同 ⇒ 必须报（gen 页修复前的真实形态）
    const bad = collectMismatches(src('gen.btn.sync', 'gen.btn.refresh'))
    expect(bad).toHaveLength(1)
    expect(bad[0]).toMatchObject({ tooltipKey: 'gen.btn.sync', ariaKey: 'gen.btn.refresh' })
    // 允许表登记过的语义包含关系 ⇒ 不报
    expect(collectMismatches(src('role.selectUser.title', 'user.assignRoles'))).toEqual([])
    // 键不存在 ⇒ 本判据跳过（缺键由 i18n 键完整性守卫负责），不得在这里误报
    expect(collectMismatches(src('no.such.tooltip', 'no.such.aria'))).toEqual([])
  })
})
