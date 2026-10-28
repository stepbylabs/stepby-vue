/**
 * 静态守卫：剪贴板写入只能经 `@/utils/clipboard` 这一条通道（b111）。
 *
 * ## 立案取证（本轮 `git grep` HEAD 实测，不是推断）
 *
 * 改造前 `src/**` 有 **11 个文件 / 11 份实现 / 17 个用户入口**各自写剪贴板，姿势互不相同：
 *
 * | 形状 | 站点 | 坏在哪 |
 * |---|---|---|
 * | 忽略 `execCommand` 返回值 | `directive/common/copyText.ts`、`monitor/frontendError/detail.vue`、`monitor/operlog/detail.vue` | 剪贴板没写进去也弹"复制成功"——用户粘贴出来是上一次的内容 |
 * | 只调 `navigator.clipboard`、无降级 | `tool/about`、`tool/build`、`tool/http-debugger`、`tool/shortcuts`、`system/tenant/TenantDomainPanel` | 该 API **只在安全上下文存在**：自托管 `http://<内网IP>` 打开时是 `undefined`，这五处永远复制不了 |
 * | 连存在性都没判 | `system/file/index.vue` 的"复制链接" | http 部署下在事件处理器里同步抛 `TypeError` ⇒ ErrorBoundary 接管，整页被卸载 |
 * | 没有 `updated` 钩子 | 同上指令 | `gen/preview` 切换语言页签后仍复制上一个文件的内容 |
 * | 语义正确、只是各写各的 | `patToken`、`oauth/client` | 不是缺陷，本批并入单一通道 |
 *
 * ## 判据
 *
 * 掩码后的代码视图里出现 `(window.)?navigator?.clipboard`、`document.execCommand`、
 * `document['execCommand']`、`const { clipboard } = navigator` 任一形状 ⇒ 违规。
 * 唯一允许的文件 = 通道本身（`utils/clipboard.ts`）。
 *
 * 另有两条**接线反查**（"有判据没接线"与"接了线没判据"是同一族的两个方向）：
 * ① 通道自身必须真的含两条路径（现代 API + `execCommand`），否则"唯一通道"是个空壳；
 * ② 改造过的每个调用点必须真的 import 了这条通道 / 用 `v-copyText`，不得"删掉旧实现就完事"
 *   （删掉不接线 = 按钮静默失效，比原来的假成功更难发现）。
 *
 * 面：递归 `src/**` 的 `.ts` + `.vue`（`.vue` 只取 `<script>` 区间，理由同 `webStorage.guard.test.ts`：
 * Vue 3 实例代理不回落全局对象，模板里取不到 `navigator`，且 `globalProperties` 不挂它）。
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
  plantInVueScript,
  vueTemplateRegion
} from './e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

/** 通道本身的文件名（相对 `src`）——唯一允许裸写剪贴板的地方 */
const CHANNEL_FILE = 'utils/clipboard.ts'

/**
 * 裸访问判据。
 *
 * 四种形状各自对应一种真实绕过写法（改前改后都在仓里出现过）：
 * - `navigator.clipboard` / `navigator?.clipboard`：可选链是"看起来做了防御"的常见写法，
 *   而它在 `navigator.clipboard === undefined` 时只是把 `.writeText` 变成 `undefined` 调用，
 *   照样抛 TypeError（`file` 页就是这一形状）；
 * - `window.navigator.clipboard`：只要检出 `navigator.clipboard` 就算命中，前缀不参与；
 * - `document.execCommand` 与**方括号写法**：降级通道的两种入口。方括号那次不能按字面
 *   `document['execCommand']` 去匹配——掩码器会把字符串内容抹成空格，字面正则永远打不中
 *   （本用例第一版就是这么错的）。改用"字符串键调用"的形状 `document[<被抹空>](…)`：
 *   掩码后它长成 `document[   ](`，既能抓到方括号写法，也不会误报 `document.querySelector`；
 * - `const { clipboard } = navigator`：解构别名，取到的值与真站点等价。
 *
 * **已知局限**：`document['exec' + 'Command']` 这类动态拼接与任意表达式键属控制流可达性，
 * 静态判据不判（同 `e2e_flag_discipline` R1 的边界：判它要么误报一片要么写成一堆特例）；
 * 该形状由 review 兜底，不是"没想过"。
 */
const RAW_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bnavigator\s*\??\.\s*clipboard\b/g, label: 'navigator.clipboard' },
  { re: /\bdocument\s*\.\s*execCommand\b/g, label: 'document.execCommand' },
  // 字符串键调用：掩码后 `document['execCommand'](…)` 变成 `document[   ](…`，
  // 这正是方括号写法在**代码视图**里唯一还留下的痕迹（见文件头"已知局限"）
  { re: /\bdocument\s*\[\s*\]\s*\(/g, label: 'document[字符串键](…)' },
  { re: /\{\s*clipboard\s*\}\s*=\s*(?:window\s*\.\s*)?navigator\b/g, label: '解构 navigator.clipboard' }
]

interface Consumer {
  /** 相对 `src` 的路径 */
  file: string
  /** 该调用点应如何接线（逐条自足：条目集合一变，"同上"就指向另一条） */
  wiring: 'import' | 'directive'
  why: string
}

/**
 * 接线反查表：本批改造过的**全部**调用点。
 * 不含 `totp`/`gen/preview` 的直接写入（它们从来只经指令），但含它们的指令用法——
 * 那正是"旧值"缺陷的现场，必须证明指令仍被真实使用（否则指令单测锁的是一个没人用的通道）。
 */
const CONSUMERS: Consumer[] = [
  {
    file: 'directive/common/copyText.ts',
    wiring: 'import',
    why: '指令本体：复制动作必须走通道拿到真实布尔值，再回调给页面'
  },
  {
    file: 'views/system/file/index.vue',
    wiring: 'import',
    why: '文件页"复制链接"：原本连存在性都没判，http 部署下同步抛 TypeError 卸载整页'
  },
  {
    file: 'views/system/tenant/TenantDomainPanel.vue',
    wiring: 'import',
    why: '租户域名验证值复制：原本只走现代 API，http 部署下永远复制不了'
  },
  {
    file: 'views/system/user/profile/patToken.vue',
    wiring: 'import',
    why: 'PAT 三处密钥复制：原本自带降级，收敛到单一通道以免两份实现漂移'
  },
  {
    file: 'views/system/oauth/client/index.vue',
    wiring: 'import',
    why: 'OAuth clientId/clientSecret 复制：同上，密钥类内容的失败提示必须真实'
  },
  {
    file: 'views/monitor/frontendError/detail.vue',
    wiring: 'import',
    why: '前端错误详情：降级分支原先忽略 execCommand 返回值，没写进去也报成功'
  },
  {
    file: 'views/monitor/operlog/detail.vue',
    wiring: 'import',
    why: '操作日志详情：同一处假成功（参数与结果两个按钮都受影响）'
  },
  {
    file: 'views/tool/about/index.vue',
    wiring: 'import',
    why: '关于页复制系统信息：原本无降级通道'
  },
  {
    file: 'views/tool/build/index.vue',
    wiring: 'import',
    why: '表单构建复制代码：生成物较大，http 部署下原本必然失败'
  },
  {
    file: 'views/tool/http-debugger/index.vue',
    wiring: 'import',
    why: 'HTTP 调试器复制响应：响应体是排障主产物，复制失败必须可见'
  },
  {
    file: 'views/tool/shortcuts/index.vue',
    wiring: 'import',
    why: '快捷键页复制组合键：原本无降级通道'
  },
  {
    file: 'views/system/user/profile/totp.vue',
    wiring: 'directive',
    why: 'TOTP 密钥复制：指令回调现按 ok 分支提示，这是"假成功"的首个受害页'
  },
  {
    file: 'views/tool/gen/preview.vue',
    wiring: 'directive',
    why: '代码生成预览：指令缺 updated 时切换语言页签会复制上一个文件的旧内容'
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

/** 采集面：全 src，剔掉单测与通道本身 */
const FACE: string[] = walkFiles('').filter((rel) => !isTestFile(rel) && rel !== CHANNEL_FILE)

function maskedView(rel: string, src: string): string {
  return muteNonCode(rel.endsWith('.vue') ? blankOutsideVueScripts(src) : src)
}

interface Hit {
  rel: string
  line: number
  label: string
}

/** 纯判据：给一份源码，返回裸剪贴板写入点的行号（真实树与合成夹具共用同一条路径） */
export function scanRawClipboard(rel: string, src: string): Hit[] {
  const masked = maskedView(rel, src)
  const hits: Hit[] = []
  for (const { re, label } of RAW_PATTERNS) {
    const scan = new RegExp(re.source, 'g')
    let m: RegExpExecArray | null
    while ((m = scan.exec(masked))) hits.push({ rel, line: lineNumberAt(masked, m.index), label })
  }
  return hits
}

describe('剪贴板单点守卫：裸 navigator.clipboard / execCommand 只允许出现在 utils/clipboard', () => {
  it('采集面自证：面由事实派生、体量够大、通道文件不在面内', () => {
    expect(FACE.length, 'src 下参与判据的文件数（腰斩即说明目录规则落后于事实）').toBeGreaterThanOrEqual(400)
    expect(
      FACE.filter((r) => r.endsWith('.vue')).length,
      '面内必须有 .vue（否则脚本区间切分那半边从未被执行过）'
    ).toBeGreaterThanOrEqual(50)
    expect(FACE.includes(CHANNEL_FILE), '通道文件必须在面外（它才是允许裸写的那一处）').toBe(false)
    expect(
      FACE.some((r) => isTestFile(r)),
      '单测必须剔除（它们要伪造 navigator.clipboard 才测得了降级）'
    ).toBe(false)
    const totalChars = FACE.reduce((acc, rel) => acc + readFileSync(resolve(SRC_DIR, rel), 'utf8').length, 0)
    expect(totalChars, '采集面字符量（防"扫到空集合"那种恒绿）').toBeGreaterThan(100_000)
    console.warn(
      `[clipboard] 扫描面 ${FACE.length} 个文件（.ts + .vue）/ 裸写入 0 处 / 接线反查 ${CONSUMERS.length} 条`
    )
  })

  it('真实树：面内裸剪贴板写入必须 0 处', () => {
    const violations: string[] = []
    for (const rel of FACE) {
      for (const hit of scanRawClipboard(rel, readFileSync(resolve(SRC_DIR, rel), 'utf8'))) {
        violations.push(`${hit.rel}:${hit.line}（${hit.label}）`)
      }
    }
    expect(violations, `绕过 @/utils/clipboard 的剪贴板写入：\n${violations.join('\n')}`).toEqual([])
  })

  it('通道自身：两条路径都必须在代码里真的存在（否则"唯一通道"是空壳）', () => {
    const src = readFileSync(resolve(SRC_DIR, CHANNEL_FILE), 'utf8')
    // 掩码后判：模块文档里写着这两个词，按原文 contains 会恒真（AGENTS 前言 ⑬）
    const code = muteNonCode(src)
    expect(code, '现代 API 通道必须存在').toMatch(/\bnavigator\s*\.\s*clipboard\b/)
    expect(code, '降级通道必须存在').toMatch(/\bdocument\s*\.\s*execCommand\s*\(/)
    expect(code, '返回值必须是布尔（调用方要据它分支）').toMatch(/Promise<boolean>/)
    expect(src, '通道必须导出 copyText（调用点按此名接线）').toMatch(/export\s+async\s+function\s+copyText\b/)
  })

  it('接线反查：每个改造过的调用点都必须真的接上这条通道 / 这条指令', () => {
    const problems: string[] = []
    for (const c of CONSUMERS) {
      expect(FACE, `接线反查表里的 ${c.file} 必须真在采集面内`).toContain(c.file)
      const src = readFileSync(resolve(SRC_DIR, c.file), 'utf8')
      // 读字面量的掩码变体：import 路径是字符串，全掩码视图里看不见（muteComments 的用途）
      const code = muteComments(c.file.endsWith('.vue') ? blankOutsideVueScripts(src) : src)
      if (c.wiring === 'import') {
        if (!/from\s+['"]@\/utils\/clipboard['"]/.test(code)) problems.push(`${c.file}: 未 import @/utils/clipboard`)
      } else {
        const tpl = vueTemplateRegion(src)
        if (!tpl || !/v-copyText=/.test(tpl.code)) problems.push(`${c.file}: 模板里没有 v-copyText`)
      }
      if (!c.why || c.why.trim().length < 12) problems.push(`${c.file}: 接线理由不合格（空/半句等于没登记）`)
    }
    expect(problems, `接线反查失败：\n${problems.join('\n')}`).toEqual([])
  })

  it('指令必须跟住值：updated 钩子真的把新值写进元素', () => {
    const code = muteNonCode(readFileSync(resolve(SRC_DIR, 'directive/common/copyText.ts'), 'utf8'))
    expect(code, '缺少 updated ⇒ 绑定值变了仍复制挂载那一刻的旧值').toMatch(/\bupdated\s*\(/)
    expect(code, 'updated 必须真的刷新待复制值').toMatch(/\$copyValue\s*=/)
    expect(code, 'updated 也必须刷新回调').toMatch(/\$copyCallback\s*=/)
  })

  it('合成双向 · 七种裸写形状全部必须被抓且报出真实行号', () => {
    const cases: Array<[string, string, number]> = [
      ['现代 API', 'navigator.clipboard.writeText(v)\n', 1],
      ['可选链', 'navigator?.clipboard?.writeText(v)\n', 1],
      ['window 前缀', 'window.navigator.clipboard.writeText(v)\n', 1],
      ['降级通道', "document.execCommand('copy')\n", 1],
      ['方括号写法', "document['execCommand']('copy')\n", 1],
      ['解构别名', 'const { clipboard } = navigator\n', 1],
      [
        'vue 脚本里',
        '<template>\n  <p>t</p>\n</template>\n\n<script setup lang="ts">\nnavigator.clipboard.writeText(v)\n</script>\n',
        6
      ]
    ]
    for (const [label, src, line] of cases) {
      const rel = label.startsWith('vue') ? 'synthetic/Probe.vue' : 'synthetic/probe.ts'
      const hits = scanRawClipboard(rel, src)
      expect(hits.length, `${label}：期望 1 处`).toBe(1)
      expect(hits[0].line, `${label}：行号必须落在裸写那一行`).toBe(line)
    }
  })

  it('合成双向 · 注释、字符串、读剪贴板（粘贴）与模板文本不得算违规', () => {
    const cases: Array<[string, string]> = [
      ['行注释', '// 原先这里是 navigator.clipboard.writeText(x)，没有降级\nconst a = 1\n'],
      ['块注释', "/** document.execCommand('copy') 已被弃用 */\nconst a = 1\n"],
      ['字符串字面量', "console.warn('不要直接调 navigator.clipboard')\n"],
      ['粘贴（读剪贴板）', 'const data = e.clipboardData || window.clipboardData\n'],
      ['i18n 文案', "const tip = 'Copied to clipboard'\n"],
      [
        'vue 模板属性文本',
        '<template>\n  <p title="navigator.clipboard 是反例">t</p>\n</template>\n<script setup lang="ts">\nconst a = 1\n</script>\n'
      ]
    ]
    for (const [label, src] of cases) {
      const rel = label.startsWith('vue') ? 'synthetic/Counter.vue' : 'synthetic/counter.ts'
      expect(scanRawClipboard(rel, src), `反例形状被当成违规：${label}\n${src}`).toEqual([])
      // 反证文本必须真含关键字，否则这条只是空跑
      expect(src).toMatch(/clipboard|execCommand/i)
    }
    // 同一形状去掉注释外壳必须立刻被抓（证"不参与"是掩码生效，不是判据没跑）
    expect(scanRawClipboard('synthetic/counter.ts', 'navigator.clipboard.writeText(x)\n').length).toBe(1)
  })

  it('刀口活性：每个能承载违规的被扫文件插入一条合成违规，命中数必须 +1', () => {
    const planted = "navigator.clipboard.writeText('__clipboard_guard_probe__')"
    let caught = 0
    const noScriptRegion: string[] = []
    const missed: string[] = []
    for (const rel of FACE) {
      const src = readFileSync(resolve(SRC_DIR, rel), 'utf8')
      const base = scanRawClipboard(rel, src).length
      const mutated = rel.endsWith('.vue') ? plantInVueScript(src, planted) : `${src}\n${planted}\n`
      if (rel.endsWith('.vue') && mutated === src) {
        noScriptRegion.push(rel)
        continue
      }
      // 掩码只置空、不删字符 ⇒ 掩码后的行号仍等于原文行号
      expect(maskedView(rel, mutated).length, `掩码改变了 ${rel} 的长度 ⇒ 本用例报出的行号不再可信`).toBe(
        mutated.length
      )
      if (scanRawClipboard(rel, mutated).length === base + 1) {
        caught++
      } else {
        missed.push(rel)
      }
    }
    // 没有 `<script>` 的纯展示 SFC 结构上承载不了调用；但必须逐条核对"真的没有 script"，
    // 否则"探针插失败"会被读成"这个文件不需要覆盖"（AGENTS ⑥）
    for (const rel of noScriptRegion) {
      expect(
        /<script\b/i.test(readFileSync(resolve(SRC_DIR, rel), 'utf8')),
        `${rel} 有 <script> 却没插进探针 ⇒ 活性自证的刀口坏了`
      ).toBe(false)
    }
    expect(caught, `每条合成违规都必须让命中数 +1；未被抓住的文件：${missed.join(', ') || '(无)'}`).toBe(
      FACE.length - noScriptRegion.length
    )
    console.warn(
      `[clipboard] 活性自证覆盖 ${caught}/${FACE.length} 个文件（另 ${noScriptRegion.length} 个无 <script> 区间，逐条核对过成因）`
    )
  })
})
