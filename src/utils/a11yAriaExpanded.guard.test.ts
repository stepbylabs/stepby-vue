/**
 * 静态守卫：以"布尔取反"方式切换展开态的点击控件必须绑定 `:aria-expanded`（b88）。
 *
 * ## 立案取证
 *
 * `src/views` 全树 `aria-expanded` 修复前出现 **0 次**，而模板里"布尔取反型"点击控件有 4 处
 * （数量由本守卫自打的采集面承担，文档不抄数）：`@click="x = !x"` 这种写法读屏软件完全听不见
 * 状态——按下去以后焦点没变、可访问名没变、没有任何 ARIA 属性变化，用户只能从"箭头图标转了没有"
 * 猜自己现在是展开还是收起（而那个图标恰恰是装饰性的）。
 * 站点全部按语义修好：`ai/panel`、`monitor/frontendError`、`monitor/job/JobStatsPanel` 三处是
 * 真·展开区，绑 `:aria-expanded` 并用 `aria-controls` + `id` 关联被控区域；`login.vue` 的
 * 明文/掩码切换不是展开区，走下面的**条件型豁免**（`aria-pressed`）。
 *
 * ## 判定口径
 *
 * 一个开始标签，若它的**点击语义属性值**（`@click` / `@change` 等，见 `isClickSemanticAttr`）
 * 形如 `X = !X`（两侧同一标识符自取反；`X.value` 取基名 `X`），则同一标签必须绑定
 * `:aria-expanded` / `v-bind:aria-expanded`，且表达式必须**引用被切换的那个状态名**——
 * 绑一个不相干的量（`:aria-expanded="other"`）与写死 `aria-expanded="false"` 都不算声明，
 * 因为二者都不随这次点击变化。
 *
 * 已知局限（写在代码旁，不当豁免用）：
 * - `X = !Y`（用另一个量派生，不是自切换）不进面：它没有"点击即翻转"的承诺，判它要求
 *   aria-expanded 属于误报。
 * - 只扫模板里的点击属性，`<script>` 里的 `multiple.value = !selection.length` 一类
 *   选中态计算不参与（那不是控件的展开态）。
 *
 * ## 豁免表（条件型，不是白名单）
 *
 * `aria-expanded` 的语义是"本控件展开/收起了一块受控区域"。登录页的眼睛图标切换的是输入框的
 * `type`（明文/掩码），没有任何区域被展开——那里正确的属性是 `aria-pressed`（toggle button）。
 * 这类站点走豁免表，但豁免**不放宽判据**：
 * ① 条目逐条自足（`why` 不短于登记下限、不得用"同上"这类跨条目指代）；
 * ② 只有当该标签**确实绑定了** `requiresAttr` 时豁免才成立，条件不成立照常判违规；
 * ③ 条目本轮没有被任何站点用到 ⇒ 报"未命中，应撤销"（登记了却没人用=废条目）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectByExt,
  forEachStartTag,
  isClickSemanticAttr,
  lineNumberAt,
  plantInVueTemplate,
  splitTagAttrs,
  vueTemplateRegion,
  EXCLUDED_DIRS
} from './e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VIEWS_DIR = resolve(VUE_ROOT, 'src/views')

/** 自取反形状：`a = !a` / `a.value = !a.value` / `ui.open = !ui.open` */
const SELF_NEGATION_RE = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=\s*!\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/
/** 展开态声明必须是**绑定**形式（写死的 aria-expanded 不随点击变化） */
const EXPANDED_ATTRS = [':aria-expanded', 'v-bind:aria-expanded']

/** 登记下限：与 `producer-kit` / `endpoint-coverage` 那几把表同一口径（四处最严值 12） */
const MIN_WHY_LENGTH = 12

interface StateAttrExemption {
  /** 相对 `src/views` 的路径 */
  file: string
  /** 被自取反的状态基名（`.value` 与点号前缀已剥） */
  state: string
  /** 必须存在才生效的替代状态属性（绑定形式） */
  requiresAttr: string
  /** 逐条自足的理由（禁止跨条目指代） */
  why: string
}

const STATE_ATTR_EXEMPTIONS: StateAttrExemption[] = [
  {
    file: 'login.vue',
    state: 'passwordVisible',
    requiresAttr: ':aria-pressed',
    why: '登录页眼睛图标切换的是输入框 type（明文/掩码），不展开任何区域；aria-expanded 会播报"已展开"而屏幕上没有受控区可读，切换型按钮的正确属性是 aria-pressed，故该站点按 :aria-pressed 声明状态。'
  }
]

/** `a.value` / `ui.open` → 基名，用于校验 aria-expanded 引用了同一个量 */
function baseStateName(identifier: string): string {
  const parts = identifier.split('.').filter(Boolean)
  if (parts.length > 1 && parts[parts.length - 1] === 'value') parts.pop()
  return parts[parts.length - 1] ?? identifier
}

export interface DisclosureStateViolation {
  rel: string
  line: number
  tag: string
  /** 被切换的状态基名 */
  state: string
  /** 缺什么（写进失败文案，避免只说"不对"不说"哪不对"） */
  missing: string
}

export interface DisclosureStateScan {
  violations: DisclosureStateViolation[]
  /** 面内的自取反点击控件数（采集面体量探针的分母） */
  toggleSites: number
  /** 其中已声明状态（含条件型豁免命中）的条数 */
  declared: number
  /** 本轮真正被站点用上的豁免（未用满即报撤销） */
  usedExemptions: StateAttrExemption[]
}

/**
 * 纯函数：一个 SFC → 模板里"切换展开态却没声明状态"的站点。
 * 与点击可达守卫同一入口形状（只吃 `rel`/`src`），合成夹具与真实树走同一条判定路径，
 * 不存在"夹具专用宽松分支"。
 */
export function scanDisclosureStates(rel: string, src: string): DisclosureStateScan {
  const acc: DisclosureStateScan = { violations: [], toggleSites: 0, declared: 0, usedExemptions: [] }
  const region = vueTemplateRegion(src)
  if (!region) return acc
  forEachStartTag(region.code, (name, attrsText, index) => {
    const attrs = splitTagAttrs(attrsText)
    let state: string | null = null
    for (const a of attrs) {
      if (!isClickSemanticAttr(a.name)) continue
      const m = SELF_NEGATION_RE.exec(a.value)
      // 只认自取反：两侧标识符必须同形（`a = !b` 是派生，不是切换）
      if (m && m[1] === m[2]) state = baseStateName(m[1])
    }
    if (!state) return
    acc.toggleSites++
    const expanded = attrs.find((a) => EXPANDED_ATTRS.includes(a.name))
    if (expanded && expanded.value.includes(state)) {
      acc.declared++
      return
    }
    // 条件型豁免：必须"该标签确实带着替代属性"才生效
    const exemption = STATE_ATTR_EXEMPTIONS.find(
      (e) => e.file === rel && e.state === state && attrs.some((a) => a.name === e.requiresAttr)
    )
    if (exemption) {
      acc.usedExemptions.push(exemption)
      acc.declared++
      return
    }
    acc.violations.push({
      rel,
      line: lineNumberAt(region.code, index) + region.lineOffset,
      tag: name,
      state,
      missing: expanded
        ? `:aria-expanded 未引用被切换的状态「${state}」（实为 "${expanded.value}"）`
        : `缺 :aria-expanded="${state}"（点击切换展开态却无任何状态声明）`
    })
  })
  return acc
}

function scanAll(entries: Array<{ rel: string; src: string }>): DisclosureStateScan {
  const acc: DisclosureStateScan = { violations: [], toggleSites: 0, declared: 0, usedExemptions: [] }
  for (const e of entries) {
    const r = scanDisclosureStates(e.rel, e.src)
    acc.violations.push(...r.violations)
    acc.toggleSites += r.toggleSites
    acc.declared += r.declared
    acc.usedExemptions.push(...r.usedExemptions)
  }
  return acc
}

/** 同一条豁免可能被同文件多个站点重复命中，去重后才是"命中条目数" */
function dedupeExemptions(list: StateAttrExemption[]): StateAttrExemption[] {
  const seen = new Set<string>()
  const out: StateAttrExemption[] = []
  for (const e of list) {
    const key = `${e.file}#${e.state}#${e.requiresAttr}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

const viewFiles = collectByExt(VIEWS_DIR, '', '.vue', EXCLUDED_DIRS)

describe('a11y 静态守卫 · 规则：布尔取反型点击控件必须绑定 :aria-expanded（并引用被切换的状态）', () => {
  const entries = viewFiles.map((rel) => ({ rel, src: readFileSync(resolve(VIEWS_DIR, rel), 'utf8') }))

  it('采集面自证：面由事实派生（递归 src/views 的 .vue），切换型站点确实扫得出来', () => {
    expect(viewFiles.length, 'src/views 下 .vue 数量（体量下限，腰斩即红）').toBeGreaterThanOrEqual(100)
    expect(
      viewFiles.every((f) => f.endsWith('.vue')),
      '面内只允许 .vue'
    ).toBe(true)
    expect(
      viewFiles.some((f) => f.includes('.test.')),
      '视图单测不得被当成视图文件扫进面'
    ).toBe(false)
    for (const must of [
      'login.vue',
      'ai/panel/index.vue',
      'monitor/frontendError/index.vue',
      'monitor/job/JobStatsPanel.vue'
    ]) {
      expect(viewFiles, `扫描面必须包含 ${must}`).toContain(must)
    }
    const scan = scanAll(entries)
    // 实测 4 处；取零头作下限——整块采集失效才红，判据本身仍由"真实树 0 违规"那条把关
    expect(scan.toggleSites, '布尔取反型点击控件数量（采集面体量探针）').toBeGreaterThanOrEqual(3)
    expect(scan.declared, '声明数必须等于站点数（少于即有站点没被数进来，采集面与结论不同源）').toBe(scan.toggleSites)
    console.warn(
      `[a11yAriaExpanded] 扫描面 ${entries.length} 个 .vue / 布尔取反型点击控件 ${scan.toggleSites} 处 / 已声明状态 ${scan.declared} 处（其中条件型豁免命中 ${dedupeExemptions(scan.usedExemptions).length} 条）/ 违规 0 处`
    )
  })

  it('真实树：切换展开态而不声明状态的控件必须 0 处', () => {
    const scan = scanAll(entries)
    const report = scan.violations.map((v) => `${v.rel}:${v.line} <${v.tag}> ${v.missing}`)
    expect(report, `未声明展开态的切换控件：\n${report.join('\n')}`).toEqual([])
  })

  it('豁免表自证：条目逐条自足、file 在面内、且本轮确实被用到（未命中即撤销）', () => {
    const scan = scanAll(entries)
    const shorts = STATE_ATTR_EXEMPTIONS.filter((e) => e.why.trim().length < MIN_WHY_LENGTH)
    expect(
      shorts.map((e) => e.file),
      '豁免理由不得短于登记下限'
    ).toEqual([])
    const pointers = STATE_ATTR_EXEMPTIONS.filter((e) => /同上|同上一条|见另一条|参见另/.test(e.why))
    expect(
      pointers.map((e) => e.file),
      '豁免理由必须逐条自足（跨条目指代等于没登记）'
    ).toEqual([])
    const faces = new Set(entries.map((e) => e.rel))
    for (const e of STATE_ATTR_EXEMPTIONS) {
      expect(faces.has(e.file), `豁免登记的视图不在采集面里：${e.file}`).toBe(true)
      expect(
        e.requiresAttr.startsWith(':') || e.requiresAttr.startsWith('v-bind:'),
        `替代属性必须是绑定形式：${e.requiresAttr}`
      ).toBe(true)
    }
    const used = dedupeExemptions(scan.usedExemptions)
    const unused = STATE_ATTR_EXEMPTIONS.filter((e) => !used.includes(e))
    expect(
      unused.map((e) => `${e.file}#${e.state}`),
      `登记了但本轮没有站点用到 ⇒ 应撤销的豁免条目`
    ).toEqual([])
    // 正控：本轮确实命中过至少一条（否则"未命中 0 条"这条判据是空跑，同 §测试门禁 ⑥）
    expect(used.length, '本轮至少应命中一条条件型豁免（login.vue 的明文/掩码切换）').toBeGreaterThanOrEqual(1)
  })

  it('合成双向 · 坏形状必须被抓且文案点名文件与行号', () => {
    const bad: Array<[string, string, number, string]> = [
      [
        '切换却不声明',
        '<template>\n  <el-button @click="open = !open">x</el-button>\n</template>\n',
        2,
        '缺 :aria-expanded'
      ],
      [
        '写死 aria-expanded（不随点击变化）',
        '<template>\n  <div aria-expanded="false" @click="open = !open">x</div>\n</template>\n',
        2,
        '缺 :aria-expanded'
      ],
      [
        '绑了但引用另一个量',
        '<template>\n  <button :aria-expanded="other" @click="open = !open">x</button>\n</template>\n',
        2,
        '未引用被切换的状态「open」'
      ],
      [
        'ref 取值也要引用基名',
        '<template>\n  <el-button :aria-expanded="flag" @click="open = !open">x</el-button>\n</template>\n',
        2,
        '未引用被切换的状态「open」'
      ],
      [
        '@change 上的自取反同样要声明',
        '<template>\n  <el-select @change="open = !open" />\n</template>\n',
        2,
        '缺 :aria-expanded'
      ],
      [
        '键盘处理器不算声明',
        '<template>\n  <button @click="collapsed = !collapsed" @keydown.enter="collapsed = !collapsed">x</button>\n</template>\n',
        2,
        '缺 :aria-expanded'
      ],
      [
        '三件齐备也不等于声明状态',
        '<template>\n  <div role="button" tabindex="0" @click="show = !show" @keydown.enter="show = !show">x</div>\n</template>\n',
        2,
        '缺 :aria-expanded'
      ],
      [
        '多行标签也要看得到（报标签起始行）',
        '<template>\n  <el-button\n    link\n    @click="tables = !tables"\n  >\n    x\n  </el-button>\n</template>\n',
        2,
        '缺 :aria-expanded'
      ]
    ]
    const messages: string[] = []
    for (const [label, src, line, expectText] of bad) {
      const r = scanDisclosureStates(`synthetic/${label}.vue`, src)
      if (r.violations.length !== 1) throw new Error(`${label}：期望 1 处违规，实得 ${JSON.stringify(r.violations)}`)
      const v = r.violations[0]
      if (v.line !== line) throw new Error(`${label}：期望第 ${line} 行，实得 ${v.line}`)
      if (!v.missing.includes(expectText)) throw new Error(`${label}：文案应含「${expectText}」，实得「${v.missing}」`)
      messages.push(`${v.rel}:${v.line} <${v.tag}> ${v.missing}`)
    }
    expect(messages.length, '每条坏形状都必须被抓').toBe(bad.length)
    // 文案必须能指到文件与行（"红在哪一行"丢了等于没判）
    expect(messages[0]).toMatch(/^synthetic\/切换却不声明\.vue:2 <el-button> 缺 :aria-expanded="open"/)
  })

  it('合成双向 · 好形状必须不误报', () => {
    const good: Array<[string, string, string]> = [
      [
        '直接绑定同名状态',
        '<template>\n  <el-button :aria-expanded="open" @click="open = !open">x</el-button>\n</template>\n',
        'synthetic/a.vue'
      ],
      [
        '取反绑定（折叠语义相反也算声明）',
        '<template>\n  <button :aria-expanded="!collapsed" @click="collapsed = !collapsed">x</button>\n</template>\n',
        'synthetic/b.vue'
      ],
      [
        'v-bind: 写法',
        '<template>\n  <div v-bind:aria-expanded="open" @click="open = !open">x</div>\n</template>\n',
        'synthetic/c.vue'
      ],
      [
        'ref 取值引用基名',
        '<template>\n  <el-button :aria-expanded="open.value" @click="open = !open">x</el-button>\n</template>\n',
        'synthetic/d.vue'
      ],
      [
        '嵌套状态',
        '<template>\n  <div :aria-expanded="ui.statsOpen" @click="ui.statsOpen = !ui.statsOpen">x</div>\n</template>\n',
        'synthetic/e.vue'
      ],
      [
        '非切换的点击不进面',
        '<template>\n  <el-button @click="load()">x</el-button>\n</template>\n',
        'synthetic/f.vue'
      ],
      [
        '单向派生（a = !b）不进面',
        '<template>\n  <div @click="visible = !hidden">x</div>\n</template>\n',
        'synthetic/g.vue'
      ],
      [
        '脚本里的取反不参与（只扫模板点击属性）',
        '<template>\n  <el-button @click="toggle">x</el-button>\n</template>\n<script setup lang="ts">\nconst collapsed = ref(false)\nfunction toggle(): void {\n  collapsed.value = !collapsed.value\n}\n</script>\n',
        'synthetic/h.vue'
      ],
      [
        '条件型豁免：明文/掩码切换按 aria-pressed 声明',
        '<template>\n  <el-icon role="button" tabindex="0" :aria-pressed="passwordVisible" @click="passwordVisible = !passwordVisible">x</el-icon>\n</template>\n',
        'login.vue'
      ]
    ]
    const falsePositives: string[] = []
    for (const [label, src, rel] of good) {
      const r = scanDisclosureStates(rel, src)
      if (r.violations.length) falsePositives.push(`${label} → ${JSON.stringify(r.violations)}`)
    }
    expect(falsePositives, `合规写法被误报：\n${falsePositives.join('\n')}`).toEqual([])
    // 正控：这批好形状里多数真的是"切换型站点"，否则全 0 违规也可以是"一条都没扫出来"
    const toggles = good.filter(([, src, rel]) => scanDisclosureStates(rel, src).toggleSites > 0).length
    expect(toggles, '好形状夹具里必须多数真的是切换型站点').toBeGreaterThanOrEqual(5)
    // 豁免那条必须"计入站点 + 计入声明 + 计入命中"三处同数（只算声明不算命中=判据空转）
    const exempt = scanDisclosureStates('login.vue', good[8][1])
    expect([exempt.toggleSites, exempt.declared, exempt.usedExemptions.length, exempt.violations.length]).toEqual([
      1, 1, 1, 0
    ])
  })

  it('豁免击穿面：站点没带替代属性时豁免不得生效（否则等于把判据关掉）', () => {
    const withoutPressed =
      '<template>\n  <el-icon @click="passwordVisible = !passwordVisible">x</el-icon>\n</template>\n'
    const r = scanDisclosureStates('login.vue', withoutPressed)
    expect(r.violations.length, '缺 :aria-pressed 时该站点必须照常判违规').toBe(1)
    expect(r.usedExemptions.length, '条件不成立时豁免不得计为命中').toBe(0)
    // 状态名不同不得吃同一条豁免（豁免按 file + state 精确匹配）
    const otherState = '<template>\n  <el-icon :aria-pressed="foo" @click="foo = !foo">x</el-icon>\n</template>\n'
    expect(scanDisclosureStates('login.vue', otherState).violations.length).toBe(1)
    // 别的视图文件也不得吃这条豁免（不是全树通配）
    const otherFile =
      '<template>\n  <el-icon :aria-pressed="passwordVisible" @click="passwordVisible = !passwordVisible">x</el-icon>\n</template>\n'
    expect(scanDisclosureStates('register.vue', otherFile).violations.length).toBe(1)
  })

  it('刀口活性：每个被扫文件模板开头插入一条合成违规，被抓数必须 +1', () => {
    const planted = '<el-button class="__a11y-expand-plant" @click="plantOpen = !plantOpen">probe</el-button>'
    let caught = 0
    for (const e of entries) {
      const base = scanDisclosureStates(e.rel, e.src).violations.length
      const after = scanDisclosureStates(e.rel, plantInVueTemplate(e.src, planted)).violations.length
      if (after === base + 1) caught++
    }
    expect(caught, '每条合成违规都必须让命中数 +1（掩码状态若在插入点之前已错位，这一条会红）').toBe(entries.length)
    expect(plantInVueTemplate(entries[0].src, planted)).toContain('__a11y-expand-plant')
  })

  it('反证：HTML 注释里的切换写法不算站点', () => {
    const commented =
      '<template>\n  <!-- 旧写法：<el-button @click="open = !open">x</el-button> 已补 :aria-expanded -->\n</template>\n'
    const r = scanDisclosureStates('synthetic/counter.vue', commented)
    expect(r.violations).toEqual([])
    expect(r.toggleSites, '注释里的取反写法不得进采集面').toBe(0)
    // 反证文本必须真含关键字，否则这条只是空跑
    expect(commented).toContain('@click="open = !open"')
    expect(commented).toContain('aria-expanded')
    // 同一形状去掉注释外壳必须立刻被抓到（证明"不算站点"是掩码生效，不是判据没跑）
    expect(
      scanDisclosureStates(
        'synthetic/counter.vue',
        '<template>\n  <el-button @click="open = !open">x</el-button>\n</template>\n'
      ).violations.length
    ).toBe(1)
  })
})
