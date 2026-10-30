/**
 * 静态守卫：**含表单的 `<el-dialog>` 必须绑 `:before-close`**（b135）。
 *
 * ## 立案取证（本轮独立复算，条数一律由本文件自打）
 *
 * Element Plus 的对话框默认 `closeOnClickModal: true` / `closeOnPressEscape: true`
 * （`node_modules/element-plus/es/components/dialog/src/dialog.mjs:137-138`），右上角 ×、
 * 点遮罩、按 Esc 三条通道**都汇入 `handleClose()` → `beforeClose`**
 * （`.../dialog/src/use-dialog.mjs:105-113`）。也就是说：
 * - 只写 `:close-on-click-modal="false"` 只封了三条里的一条，**Esc 与 × 仍然全开**；
 * - 页脚「取消」按钮直接 `visible = false` **根本不走 `beforeClose`**（那是程序内改 v-model）。
 * 于是「表单改了一半按 Esc」会静默丢弃输入，且没有任何一处告诉用户改动还在内存里。
 *
 * ## 判定口径
 *
 * 模板块内的每个 `<el-dialog>` 块（按同名标签深度配对，支持嵌套）：
 * - 块内出现 `el-form-item` ⇒ 认定它是**表单类对话框**，开始标签必须出现
 *   `:before-close` 或 `v-bind:before-close`（用属性切分读，不用子串匹配——
 *   子串会被别的属性值"提到"而误判为已接线）；缺 ⇒ 违规并报行号。
 * - 块内没有 `el-form-item` 的（纯展示 / 纯表格视图）不判：它们没有"正在编辑的内容"。
 *
 * 判"接线"而不判"某个具体实现"：`useDialogDirtyGuard`（b135 公共件）与
 * `useCrudTable` 的 `beforeDialogClose` 都是合规接线，守卫不规定用哪一个。
 *
 * ## 豁免表
 *
 * 只读查看类对话框（搜索框是纯筛选、不落库也不改变任何状态）登记在此，逐条带理由；
 * **条目必须仍命中**——某天它接上了 `:before-close`，这条豁免就该被删掉（报红提醒撤销），
 * 否则豁免表会随页面演进而变成"永久放行"。
 *
 * ## 已知局限（写在代码里，不当豁免用）
 *
 * - 裁剪框类（`userAvatar.vue` 的 vue-cropper）没有 `el-form-item`，结构上不在采集面内；
 *   它已按"换过图片才脏"接了同一条 `:before-close`，但**裁剪框缩放/旋转不单独计入**——
 *   那是预览动作，为它弹确认会成为噪声。
 * - 判据只看"绑了属性"，不看处理器内部是否真的比较了脏值（那属行为，由
 *   `useDialogDirtyGuard.test.ts` 的 9 例与 e2e 的 Esc 交互判据承担）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectByExt, lineNumberAt, plantInVueTemplate, splitTagAttrs, vueTemplateRegion } from './e2eSuiteScanKit'

/** 仓根按**本文件位置**反推（src/utils 的上两层）——守卫自己不得用 process.cwd() */
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * 豁免：只读查看类对话框（无"正在编辑的内容"）。
 *
 * `notice/ReadUsers.vue` 是"谁读过这条公告"的查看器：搜索框只改变本地查询条件，
 * 表格是纯展示，关闭它不丢失任何可提交的东西。
 */
const ALLOWLIST: Record<string, string> = {
  'views/system/notice/ReadUsers.vue':
    '只读查看对话框：搜索框只改本地筛选条件、表格是纯展示，关闭不丢失任何可提交内容（且无保存动作）'
}

const MIN_VUE_FILES = 180
const MIN_FORM_DIALOGS = 40

export interface DialogBlock {
  /** 在**掩码后模板文本**中的起始下标 */
  start: number
  /** 结束下标（含 `</el-dialog>`）；未闭合时为文本长度 */
  end: number
  /** 开始标签原文（`<el-dialog …>`） */
  openTag: string
  /** 嵌套在它内部、已单独成块的对话框（判定"自己有没有表单"时要先剔掉） */
  children: DialogBlock[]
}

/** 从 `at` 处的 `<` 起取到属性区收尾的 `>`（引号内的 `>` 当数据跳过） */
function openTagOf(text: string, at: number): string {
  let i = at
  while (i < text.length) {
    const c = text[i]
    if (c === '"' || c === "'") {
      const q = c
      i++
      while (i < text.length && text[i] !== q) i++
    } else if (c === '>') {
      return text.slice(at, i + 1)
    }
    i++
  }
  return text.slice(at)
}

/**
 * 按同名标签深度配对切出所有 `<el-dialog>` 块。
 *
 * 用深度而不是 `indexOf('</el-dialog>')`：对话框可以嵌套（本仓确有内嵌在表格空态里的
 * 二次确认框），取第一个闭合会把外层提前截断，从而**漏判外层后半段的表单控件**。
 * 未闭合的块截到文本末尾并照常参与判定（结构坏掉时宁可判红，不静默放过）。
 */
export function dialogBlocks(text: string): DialogBlock[] {
  const roots: DialogBlock[] = []
  const stack: { index: number; openTag: string; children: DialogBlock[] }[] = []
  const re = /<el-dialog(?=[\s>/])|<\/el-dialog>/g
  let m: RegExpExecArray | null
  const pop = (end: number): void => {
    const top = stack.pop()
    if (!top) return
    const block: DialogBlock = { start: top.index, end, openTag: top.openTag, children: top.children }
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(block)
    else roots.push(block)
  }
  while ((m = re.exec(text))) {
    if (m[0].startsWith('</')) pop(m.index + m[0].length)
    else stack.push({ index: m.index, openTag: openTagOf(text, m.index), children: [] })
  }
  // 未闭合：从内向外补到文本末尾，照常参与判定（结构坏掉时宁可判红，不静默放过）
  while (stack.length) pop(text.length)
  return roots
}

/** 展平（含嵌套层），判定要逐个对话框各判各的 */
export function flattenBlocks(blocks: DialogBlock[]): DialogBlock[] {
  return blocks.flatMap((b) => [b, ...flattenBlocks(b.children)])
}

/**
 * 该对话框**自己**的内容：剔掉嵌套在里面的其他对话框。
 *
 * 不剔的话，一个纯展示的外层对话框只要里面开着一个表单子对话框，就会被判成"表单类"，
 * 然后因为它没有 `:before-close` 而误红——判据要判的是"这一层有没有自己的表单"。
 */
function ownBody(text: string, block: DialogBlock): string {
  let out = ''
  let cursor = block.start
  for (const child of [...block.children].sort((a, b) => a.start - b.start)) {
    out += text.slice(cursor, child.start)
    cursor = child.end
  }
  return out + text.slice(cursor, block.end)
}

export interface ScanResult {
  file: string
  /** 该文件里被判为"表单类"的对话框个数 */
  formDialogs: number
  /** 缺 `:before-close` 的表单类对话框（行号为**原文件**行号） */
  missing: { file: string; line: number }[]
}

/** 扫描单个 `.vue` 源文件（相对 `src/` 的 posix 路径用于报错与豁免匹配） */
export function scanVueSource(file: string, raw: string): ScanResult {
  const region = vueTemplateRegion(raw)
  if (!region) return { file, formDialogs: 0, missing: [] }
  const { code, lineOffset } = region
  let formDialogs = 0
  const missing: { file: string; line: number }[] = []
  for (const block of flattenBlocks(dialogBlocks(code))) {
    if (!/<el-form-item(?=[\s>/])/.test(ownBody(code, block))) continue
    formDialogs++
    const attrs = splitTagAttrs(block.openTag.replace(/^<el-dialog/, '').replace(/>$/, ''))
    const bound = attrs.some((a) => a.name === ':before-close' || a.name === 'v-bind:before-close')
    if (!bound) missing.push({ file, line: lineNumberAt(code, block.start) + lineOffset })
  }
  return { file, formDialogs, missing }
}

function scanAll(): { vueFiles: number; results: ScanResult[] } {
  const files = collectByExt(VUE_ROOT, 'src', '.vue')
  // 报错与豁免表都用 `views/...` 形态（`src/` 前缀只用于定位绝对路径）
  const results = files.map((f) => scanVueSource(f.replace(/^src\//, ''), readFileSync(resolve(VUE_ROOT, f), 'utf8')))
  return { vueFiles: files.length, results }
}

describe('dialogCloseSemantics 守卫：表单类 el-dialog 必须绑 :before-close', () => {
  it('真实树：除豁免外，缺 :before-close 的表单对话框为 0', () => {
    const { vueFiles, results } = scanAll()
    const dialogs = results.reduce((n, r) => n + r.formDialogs, 0)
    const all = results.flatMap((r) => r.missing)
    const violations = all.filter((m) => !(m.file in ALLOWLIST))
    // 采集面自证：扫不到文件 / 一个表单对话框都没数出来，都不得读成"干净"
    expect(vueFiles).toBeGreaterThanOrEqual(MIN_VUE_FILES)
    expect(dialogs).toBeGreaterThanOrEqual(MIN_FORM_DIALOGS)
    expect(
      violations,
      `缺 :before-close 的表单对话框（Esc / 遮罩 / × 会静默丢弃输入）：\n${violations
        .map((v) => `  ${v.file}:${v.line}`)
        .join('\n')}`
    ).toEqual([])
  })

  it('豁免表：每条必须仍命中，且理由自足（≥12 字符、不得写"同上"）', () => {
    const { results } = scanAll()
    const missingKeys = new Set(results.flatMap((r) => r.missing).map((m) => m.file))
    for (const [file, why] of Object.entries(ALLOWLIST)) {
      expect(missingKeys.has(file), `${file} 已接上 :before-close ⇒ 撤销这条豁免`).toBe(true)
      expect(why.trim().length, `${file} 的豁免理由太短（需 ≥12 字符）`).toBeGreaterThanOrEqual(12)
      expect(/^同上/.test(why.trim()), `${file} 的豁免理由不得写"同上"`).toBe(false)
    }
  })

  it('合成双向：四种接线形状各判各的（含注释里提到不算、整块注释不算、嵌套外层不吞内层）', () => {
    const cases: { name: string; src: string; expectMissing: number; expectForm: number }[] = [
      {
        name: '有表单、无 before-close ⇒ 必抓',
        src: '<template><el-dialog v-model="a"><el-form-item /></el-dialog></template>',
        expectMissing: 1,
        expectForm: 1
      },
      {
        name: '有表单、绑了 :before-close ⇒ 不抓（合规反例）',
        src: '<template><el-dialog v-model="a" :before-close="close"><el-form-item /></el-dialog></template>',
        expectMissing: 0,
        expectForm: 1
      },
      {
        name: 'v-bind: 写法同样算接线',
        src: '<template><el-dialog v-bind:before-close="close"><el-form-item /></el-dialog></template>',
        expectMissing: 0,
        expectForm: 1
      },
      {
        name: '纯展示对话框（无 el-form-item）不进采集面',
        src: '<template><el-dialog v-model="a"><el-table :data="rows" /></el-dialog></template>',
        expectMissing: 0,
        expectForm: 0
      },
      {
        name: '注释里写了 :before-close 但属性没绑 ⇒ 照常抓',
        src: '<template><el-dialog v-model="a"><!-- :before-close="close" --><el-form-item /></el-dialog></template>',
        expectMissing: 1,
        expectForm: 1
      },
      {
        name: '整块对话框被注释掉 ⇒ 不算站点',
        src: '<template><!-- <el-dialog v-model="a"><el-form-item /></el-dialog> --></template>',
        expectMissing: 0,
        expectForm: 0
      },
      {
        name: '嵌套：外层已接线、内层没接 ⇒ 只抓内层',
        src:
          '<template><el-dialog v-model="a" :before-close="close"><el-form-item />' +
          '<el-dialog v-model="b"><el-form-item /></el-dialog></el-dialog></template>',
        expectMissing: 1,
        expectForm: 2
      }
    ]
    for (const c of cases) {
      const r = scanVueSource('synthetic.vue', c.src)
      expect(r.missing.length, c.name).toBe(c.expectMissing)
      expect(r.formDialogs, c.name).toBe(c.expectForm)
    }
  })

  it('差异法活性：给每个含对话框的真实文件插一条合成违规，命中必须恰好 +1', () => {
    const { results } = scanAll()
    const withDialogs = results.filter((r) => r.formDialogs > 0).map((r) => r.file)
    expect(withDialogs.length).toBeGreaterThanOrEqual(MIN_FORM_DIALOGS / 2)
    for (const file of withDialogs) {
      const raw = readFileSync(resolve(VUE_ROOT, 'src', file), 'utf8')
      const before = scanVueSource(file, raw).missing.length
      const planted = plantInVueTemplate(raw, '<el-dialog v-model="probe"><el-form-item /></el-dialog>')
      expect(planted, `${file}: 合成违规没插进模板区（plantInVueTemplate 未命中）`).not.toBe(raw)
      const after = scanVueSource(file, planted).missing.length
      expect(after, `${file}: 插入合成违规后命中数未 +1`).toBe(before + 1)
    }
  })
})
