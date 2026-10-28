/**
 * 静态守卫：把 Blob 存成文件只能经 `@/utils/saveBlob` 这一条通道（b112）。
 *
 * ## 立案取证（本轮 `git grep` HEAD 实测，不是推断）
 *
 * 改造前 `src/**` 有 **8 个下载点 / 3 种写法**，三种都各有各的坏法：
 *
 * | 形状 | 站点 | 坏在哪 |
 * |---|---|---|
 * | `createObjectURL` → `a.click()` → **同步** `revokeObjectURL` | `ai/panel`（CSV）、`monitor/aiHistory`（xlsx）、`monitor/operlog`（归档 JSONL） | 三处都不把 anchor 挂进文档；回收抢在浏览器读 URL 之前 ⇒ Safari/Firefox 拿到 0 字节/失败（Chrome 上完全正常）；`click()` 抛错时 URL 永久泄漏 |
 * | data URL 直接塞 `a.href` | `composables/useEchartsWidget`（图表 PNG） | 整张 base64 进 DOM 属性；点完立刻报"图表已下载"——落盘不可观测，那是假成功；失败无出口 |
 * | 直连 `file-saver` | `utils/request.download`、`plugins/download.saveAs`、`api/system/auditChange`、`api/system/backup` | 回收时机对，但保存失败无人接（后两处把异常直接穿给页面；auditChange 的契约测试 mock 掉了 file-saver ⇒ 失败分支结构上测不到） |
 *
 * 另有共性缺陷：**0 字节载荷当成功**（服务端导出失败却回 200 时，八处都会交出一个
 * 打不开的空文件）。单点通道把这三件事一次改掉：空载荷判失败、抛错折算成 `false`、
 * 回收时机交给 `file-saver`（它 40s 后才 revoke）。
 *
 * ## 判据
 *
 * 1. `URL.createObjectURL` / `URL.revokeObjectURL` 只允许出现在通道与**一条已登记豁免**
 *    （`views/system/file/index.vue` 的 PDF 在线预览：URL 要活着给 iframe 用，且已有
 *    `revokePdfUrl()` 在关窗/卸载时回收——它要的不是"保存文件"，是"给 iframe 一个地址"）；
 * 2. `from 'file-saver'` / `require('file-saver')` 只允许出现在通道（`types/global.d.ts`
 *    里的 `declare module 'file-saver'` 是类型声明，不是依赖入口，不判）；
 * 3. 手搓锚点下载（`.download = …`）**零处**：这条形状一旦回来，上面三条缺陷就跟着回来。
 *
 * 另有接线反查：本批改造过的每个下载点都必须真的 import 了这条通道，不得"删掉旧实现就完事"
 * （删掉不接线 = 按钮静默失效）。豁免条目必须**仍命中**（失效的豁免要报撤销，同 §㉘）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  blankOutsideVueScripts,
  collectByExt,
  EXCLUDED_DIRS,
  lineNumberAt,
  muteComments,
  muteNonCode,
  plantInVueScript
} from './e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

/** 通道本身（相对 `src`）：唯一允许 import file-saver 的地方 */
const CHANNEL_FILE = 'utils/saveBlob.ts'

/**
 * object URL 的唯一豁免：PDF 在线预览。
 *
 * 它要的不是"保存文件"而是"给 iframe 一个可寻址的地址"，所以必须让 URL 活着；
 * 回收走页面自己的 `revokePdfUrl()`（关窗/切换时调用）。**它不是漏网的下载点**——
 * 该页的下载走 `download.name(...)`（`/common/download` 代理）。
 */
const OBJECT_URL_EXEMPTION = 'views/system/file/index.vue'

const RAW_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bURL\s*\.\s*createObjectURL\b/g, label: 'URL.createObjectURL' },
  { re: /\bURL\s*\.\s*revokeObjectURL\b/g, label: 'URL.revokeObjectURL' },
  // 手搓锚点下载：`a.download = …`（`=` 后紧跟 `=` 是比较，不算赋值）
  { re: /\.\s*download\s*=(?!=)/g, label: 'anchor.download 赋值' }
]

interface Consumer {
  file: string
  /** 该调用点接的哪个出口 */
  fn: 'saveBlob' | 'saveDataUrl'
  why: string
}

/** 接线反查表：本批改造过的全部下载点（逐条自足，"同上"等于没登记） */
const CONSUMERS: Consumer[] = [
  {
    file: 'utils/request.ts',
    fn: 'saveBlob',
    why: '通用 download() 导出链：空载荷/保存失败此前无人判，成功提示的截断警告也要按保存结果让位'
  },
  {
    file: 'plugins/download.ts',
    fn: 'saveBlob',
    why: '文件下载插件：/common/download 与 zip 两个入口都经此代理，失败必须落到 errorHub'
  },
  {
    file: 'api/system/auditChange.ts',
    fn: 'saveBlob',
    why: '审计导出：契约测试 mock 了 file-saver，保存失败这一支此前结构上不存在'
  },
  {
    file: 'api/system/backup.ts',
    fn: 'saveBlob',
    why: '备份下载：0 字节备份被当成功交付，用户拿到一个打不开的 .sql'
  },
  {
    file: 'views/ai/panel/index.vue',
    fn: 'saveBlob',
    why: 'AI 结果 CSV：手搓 anchor + 同步 revoke，抛错还会穿给点击处理器让整页被卸载'
  },
  {
    file: 'views/monitor/aiHistory/index.vue',
    fn: 'saveBlob',
    why: 'AI 管理历史 xlsx：保存失败原先落在 catch 之外，用户只看到 loading 结束'
  },
  {
    file: 'views/monitor/operlog/index.vue',
    fn: 'saveBlob',
    why: '操作日志归档 JSONL：链式 .then 里保存失败没有任何出口（catch 只写 DEV 日志）'
  },
  {
    file: 'composables/useEchartsWidget.ts',
    fn: 'saveDataUrl',
    why: '图表 PNG：data URL 塞 href，且点击后立刻报"图表已下载"——落盘不可观测的假成功'
  }
]

function walkFiles(relDir: string): string[] {
  return [
    ...collectByExt(SRC_DIR, relDir, '.ts', EXCLUDED_DIRS),
    ...collectByExt(SRC_DIR, relDir, '.vue', EXCLUDED_DIRS)
  ].sort()
}

function isTestFile(rel: string): boolean {
  return rel.endsWith('.test.ts') || rel.endsWith('.spec.ts')
}

const FACE: string[] = walkFiles('').filter((rel) => !isTestFile(rel) && rel !== CHANNEL_FILE)

function maskedView(rel: string, src: string): string {
  return muteNonCode(rel.endsWith('.vue') ? blankOutsideVueScripts(src) : src)
}

interface Hit {
  rel: string
  line: number
  label: string
}

/** 纯判据：真实树与合成夹具共用同一条路径 */
export function scanRawDownload(rel: string, src: string): Hit[] {
  const masked = maskedView(rel, src)
  const hits: Hit[] = []
  for (const { re, label } of RAW_PATTERNS) {
    const scan = new RegExp(re.source, 'g')
    let m: RegExpExecArray | null
    while ((m = scan.exec(masked))) {
      const line = lineNumberAt(masked, m.index)
      // 豁免只看"文件 + 形状"：别处的 createObjectURL 不跟着豁免
      if (label !== 'anchor.download 赋值' && rel === OBJECT_URL_EXEMPTION) continue
      hits.push({ rel, line, label })
    }
  }
  return hits
}

/** file-saver 依赖入口判据（需要保留字符串，import 路径才看得见） */
export function scanFileSaverImport(src: string): boolean {
  return /from\s+['"]file-saver['"]|require\(\s*['"]file-saver['"]\s*\)/.test(muteComments(src))
}

describe('下载单点守卫：object URL / 手搓锚点 / file-saver 直连只能出现在 utils/saveBlob', () => {
  it('采集面自证：面由事实派生、体量够大、通道文件不在面内', () => {
    expect(FACE.length, 'src 下参与判据的文件数（腰斩即说明目录规则落后于事实）').toBeGreaterThanOrEqual(400)
    expect(
      FACE.filter((r) => r.endsWith('.vue')).length,
      '面内必须有 .vue（否则脚本区间切分那半边从未被执行过）'
    ).toBeGreaterThanOrEqual(50)
    expect(FACE.includes(CHANNEL_FILE), '通道文件必须在面外（它是唯一允许直连 file-saver 的那一处）').toBe(false)
    expect(FACE.includes(OBJECT_URL_EXEMPTION), 'PDF 预览页应在面内（豁免要在面上受检，不是被剔出去）').toBe(true)
    const totalChars = FACE.reduce((acc, rel) => acc + readFileSync(resolve(SRC_DIR, rel), 'utf8').length, 0)
    expect(totalChars, '采集面字符量（防"扫到空集合"那种恒绿）').toBeGreaterThan(100_000)
    console.warn(
      `[blobDownload] 扫描面 ${FACE.length} 个文件（.ts + .vue）/ 裸下载 0 处 / 接线反查 ${CONSUMERS.length} 条`
    )
  })

  it('真实树：object URL 与手搓锚点下载必须 0 处（豁免仅 PDF 预览）', () => {
    const violations: string[] = []
    for (const rel of FACE) {
      for (const hit of scanRawDownload(rel, readFileSync(resolve(SRC_DIR, rel), 'utf8'))) {
        violations.push(`${hit.rel}:${hit.line}（${hit.label}）`)
      }
    }
    expect(violations, `绕过 @/utils/saveBlob 的文件保存：\n${violations.join('\n')}`).toEqual([])
  })

  it('真实树：直连 file-saver 必须 0 处（类型声明不算依赖入口）', () => {
    const violations: string[] = []
    for (const rel of FACE) {
      // types/global.d.ts 的 `declare module 'file-saver'` 不是 import 形状，不会命中；
      // 这里仍逐文件扫，是为了让"新加一处 from 'file-saver'"当场红
      if (scanFileSaverImport(readFileSync(resolve(SRC_DIR, rel), 'utf8'))) violations.push(rel)
    }
    expect(violations, `直连 file-saver 的站点（应改走 @/utils/saveBlob）：\n${violations.join('\n')}`).toEqual([])
  })

  it('豁免必须仍命中：PDF 预览页真的还在用 object URL（失效豁免要报撤销）', () => {
    const src = readFileSync(resolve(SRC_DIR, OBJECT_URL_EXEMPTION), 'utf8')
    const hits = scanRawDownload(OBJECT_URL_EXEMPTION, src)
    // 直接打回原形状（绕过豁免函数）来证明"它确实命中，只是被逐形状豁免"
    const masked = maskedView(OBJECT_URL_EXEMPTION, src)
    expect(masked, 'PDF 预览应含 createObjectURL').toMatch(/\bURL\s*\.\s*createObjectURL\b/)
    expect(masked, 'PDF 预览应含 revokeObjectURL（否则就是泄漏而不是预览）').toMatch(/\bURL\s*\.\s*revokeObjectURL\b/)
    expect(hits, 'PDF 预览页不得出现手搓锚点下载（那条没有豁免）').toEqual([])
  })

  it('通道自身：唯一依赖 file-saver、双出口、含空载荷判据，且没有手搓锚点', () => {
    const src = readFileSync(resolve(SRC_DIR, CHANNEL_FILE), 'utf8')
    const code = muteNonCode(src)
    expect(scanFileSaverImport(src), '通道必须真的用 file-saver（回收时机由它保证）').toBe(true)
    expect(src, '通道必须导出 saveBlob').toMatch(/export\s+function\s+saveBlob\b/)
    expect(src, '通道必须导出 saveDataUrl（图表那条出口）').toMatch(/export\s+function\s+saveDataUrl\b/)
    expect(code, '空载荷必须判失败').toMatch(/blob\s*\.\s*size\s*===\s*0/)
    expect(code, '通道不得自己手搓锚点（那会重新引入同步 revoke 与泄漏）').not.toMatch(/\.\s*download\s*=(?!=)/)
    expect(code, '通道不得自建 object URL').not.toMatch(/\bURL\s*\.\s*createObjectURL\b/)
  })

  it('接线反查：每个改造过的下载点都必须真的接上这条通道', () => {
    const problems: string[] = []
    for (const c of CONSUMERS) {
      expect(FACE, `接线反查表里的 ${c.file} 必须真在采集面内`).toContain(c.file)
      const src = readFileSync(resolve(SRC_DIR, c.file), 'utf8')
      const code = muteComments(c.file.endsWith('.vue') ? blankOutsideVueScripts(src) : src)
      if (!/from\s+['"]@\/utils\/saveBlob['"]/.test(code)) problems.push(`${c.file}: 未 import @/utils/saveBlob`)
      if (!new RegExp(`\\b${c.fn}\\s*\\(`).test(code)) problems.push(`${c.file}: 未调用 ${c.fn}()`)
      if (!c.why || c.why.trim().length < 12) problems.push(`${c.file}: 接线理由不合格（空/半句等于没登记）`)
    }
    expect(problems, `接线反查失败：\n${problems.join('\n')}`).toEqual([])
  })

  it('合成双向 · 三类裸写形状全部必须被抓且报出真实行号', () => {
    const cases: Array<[string, string, number, string]> = [
      ['createObjectURL', 'const u = URL.createObjectURL(blob)\n', 1, 'synthetic/probe.ts'],
      ['revokeObjectURL', 'URL.revokeObjectURL(u)\n', 1, 'synthetic/probe.ts'],
      ['手搓锚点', "const a = document.createElement('a')\na.download = 'x.csv'\na.click()\n", 2, 'synthetic/probe.ts'],
      [
        'vue 脚本里',
        '<template>\n  <p>t</p>\n</template>\n\n<script setup lang="ts">\nURL.createObjectURL(b)\n</script>\n',
        6,
        'synthetic/Probe.vue'
      ]
    ]
    for (const [label, src, line, rel] of cases) {
      const hits = scanRawDownload(rel, src)
      expect(hits.length, `${label}：期望 1 处`).toBe(1)
      expect(hits[0].line, `${label}：行号必须落在裸写那一行`).toBe(line)
    }
  })

  it('合成双向 · 注释、字符串、调用而非赋值、比较形状不得算违规', () => {
    const cases: Array<[string, string]> = [
      ['行注释', '// 原先这里是 URL.createObjectURL(blob) + 同步 revoke\nconst a = 1\n'],
      ['块注释', '/** a.download = name 已被本批收敛到 saveBlob */\nconst a = 1\n'],
      ['字符串字面量', "console.warn('不要直接 URL.createObjectURL')\n"],
      ['插件调用而非锚点', 'download.name(row.fileName, false)\n'],
      ['比较而非赋值', 'if (el.download === name) { ok() }\n'],
      ['i18n 文案', "const tip = 'Download started'\n"],
      [
        'vue 模板属性文本',
        '<template>\n  <a title="a.download = x 是反例" href="#">t</a>\n</template>\n<script setup lang="ts">\nconst a = 1\n</script>\n'
      ]
    ]
    for (const [label, src] of cases) {
      const rel = label.startsWith('vue') ? 'synthetic/Counter.vue' : 'synthetic/counter.ts'
      expect(scanRawDownload(rel, src), `反例形状被当成违规：${label}\n${src}`).toEqual([])
      expect(src).toMatch(/createObjectURL|download|Download/i)
    }
    // 同一形状去掉注释外壳必须立刻被抓（证"不参与"是掩码生效，不是判据没跑）
    expect(scanRawDownload('synthetic/counter.ts', 'URL.createObjectURL(blob)\n').length).toBe(1)
  })

  it('刀口活性：每个能承载违规的被扫文件插入一条合成违规，命中数必须 +1', () => {
    const planted = "URL.createObjectURL(new Blob(['__blob_download_probe__']))"
    let caught = 0
    const noScriptRegion: string[] = []
    const exempted: string[] = []
    const missed: string[] = []
    for (const rel of FACE) {
      const src = readFileSync(resolve(SRC_DIR, rel), 'utf8')
      const base = scanRawDownload(rel, src).length
      const mutated = rel.endsWith('.vue') ? plantInVueScript(src, planted) : `${src}\n${planted}\n`
      if (rel.endsWith('.vue') && mutated === src) {
        noScriptRegion.push(rel)
        continue
      }
      expect(maskedView(rel, mutated).length, `掩码改变了 ${rel} 的长度 ⇒ 报出的行号不再可信`).toBe(mutated.length)
      if (rel === OBJECT_URL_EXEMPTION) {
        // 豁免页不参与这条（它的 createObjectURL 形状本来就被放行），另用一条锚点形状证明刀口还在；
        // 必须经 plantInVueScript 插进 <script> 区间——追加到文件尾会落在模板之后、被掩码器正确地抹掉
        const anchorMutated = plantInVueScript(
          mutated,
          "const b = document.createElement('a')\nb.download = '__probe__'"
        )
        if (anchorMutated !== mutated && scanRawDownload(rel, anchorMutated).length === base + 1) caught++
        else exempted.push(rel)
        continue
      }
      if (scanRawDownload(rel, mutated).length === base + 1) caught++
      else missed.push(rel)
    }
    for (const rel of noScriptRegion) {
      expect(
        /<script\b/i.test(readFileSync(resolve(SRC_DIR, rel), 'utf8')),
        `${rel} 有 <script> 却没插进探针 ⇒ 活性自证的刀口坏了`
      ).toBe(false)
    }
    expect(exempted, '豁免页的锚点形状必须照常被抓（否则豁免把整页的刀口关掉了）').toEqual([])
    expect(caught, `每条合成违规都必须让命中数 +1；未被抓住的文件：${missed.join(', ') || '(无)'}`).toBe(
      FACE.length - noScriptRegion.length
    )
    console.warn(
      `[blobDownload] 活性自证覆盖 ${caught}/${FACE.length} 个文件（另 ${noScriptRegion.length} 个无 <script> 区间，逐条核对过成因）`
    )
  })
})
