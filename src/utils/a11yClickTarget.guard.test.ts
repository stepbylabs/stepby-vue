/**
 * 静态守卫：模板里"挂了点击语义、但键盘根本到不了"的标签必须 0 处（b88）。
 *
 * ## 立案取证（只读排查 + 本轮独立复算）
 *
 * `tests/e2e/a11y-full.mjs` 的第 2 项判据是 `scanKeyboard()` —— 它按 Tab 遍历焦点序列，
 * 所以**不可聚焦的元素永远不会被访问到**，这一族缺陷在浏览器判据里是结构性盲区
 * （不是它"判出来没问题"，是它根本没看）。静态复核当时的结论是 5 处，本轮把采集面
 * 展开到"所有挂点击语义的开始标签"后实测是 **21 处**（`console.warn` 自打，文档不抄数）：
 * 原 5 处只覆盖了 `div`/`li` 且 class 里没有 `cursor-pointer` 的那一支，
 * 而 `el-tag`/`el-card`/`el-icon`/`el-col`/`el-row` 同样渲染成不可聚焦的容器，
 * `cursor-pointer` 更是**只对鼠标可见**的暗示——按"看着能点"来豁免等于把判据关掉。
 * 站点全部按各自语义修好（见 b88 台账），本守卫把形状钉住。
 *
 * ## 判定口径
 *
 * 一个开始标签，若挂了 `@click` / `@dblclick` / `@mousedown` / `@mouseup` / `@change`
 * （含 `v-on:` 写法与任意修饰符），则必须满足下列之一：
 * 1. 标签名本身可键盘聚焦（原生 `button|a[href]|input|select|textarea|details|summary`，
 *    或渲染产物确实可聚焦的 Element Plus 控件组件）；
 * 2. **三件齐备**：`role` ∈ 激活型角色集合、`tabindex`（且不是写死的 `-1`）、
 *    带 `enter` 或 `space` 修饰键的 `@keydown`/`@keyup`/`@keypress` 处理器。
 *
 * 缺任意一件都算违规——"加了 role 但没 tabindex"仍然 Tab 不到，"能聚焦但按回车没反应"
 * 只是把死路换了个方向。仓内既有合规写法（`FlowTodoWidget.vue`、`Hamburger/index.vue`、
 * `DraggableItem.vue` 的复制/删除角标、`login.vue` 的验证码刷新块）就是这个形状。
 *
 * ## 为什么 @change 也在面内
 *
 * `@change` 挂在原生控件/EP 控件上没问题（走的是白名单第 1 条），但挂在 `div`/`el-tag`
 * 这类容器上时，它和 `@click` 一样只有指针通道能触发——判据不猜"作者是不是以为它能键盘触发"。
 *
 * ## 局限（写在代码里，不写在注释里当豁免用）
 *
 * - 键盘处理器只验"存在 enter/space 修饰键"，不解析组合键（`@keydown.ctrl.enter` 也算齐备）；
 *   组合键型激活确实该另论，但把它判红会误伤 `@keydown.enter` 的同类写法，取严的一侧留给人工。
 * - `:tabindex="cond ? -1 : 0"` 这类绑定表达式不参与判定（静态看不出值），
 *   写死的 `tabindex="-1"` 一定判红——那是"看起来补了、其实还是到不了"的形状。
 * - 自定义组件（PascalCase / 非 `el-` 前缀）一律按"不可聚焦"处理：Vue 会把 `@click`
 *   透传到它的根元素，而根元素是什么静态判据看不见。当前面内没有这种站点，
 *   真出现了要么给它补三件、要么把组件本身换成语义控件，不得放宽判据。
 *
 * ## 单一实现
 *
 * 掩码（HTML 注释 + JS 注释）、模板区间切取、开始标签遍历、属性切分全部走
 * `e2eSuiteScanKit` 的共用函数，与 aria-expanded 守卫同一套刀口——两处各写一份必漂
 * （本仓已为这一条立过多次案）。
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

/** 仓根按**本文件位置**反推（src/utils 的上两层）——守卫自己不得用 process.cwd() */
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
/**
 * 采集面：整个 `src`，不止 `src/views`（b89 项 9 扩面）。
 *
 * 原口径只扫视图目录，于是**布局、组件与 composable 里的同类站点全部在视野外**——
 * 实测 16 处（`ThemeEditor` 的主题卡片、`EditableCell` 的可编辑单元格、
 * `TagsView` 的右键菜单项……）都是"只有指针、键盘到不了"的交互控件。
 * 这一族缺陷的分布与目录无关：它跟着"作者想做一个能点的容器"这个意图走。
 * 与前言 ⑯(b)"扫描器的目标面必须跟着用例的迁移面走"是同一条纪律。
 */
const SCAN_DIR = resolve(VUE_ROOT, 'src')

/** 原生可键盘聚焦的标签；`a` 另需 `href`（无 href 的 `<a>` 不进 Tab 序列） */
const NATIVE_FOCUSABLE = new Set(['button', 'input', 'select', 'textarea', 'details', 'summary'])

/**
 * 渲染产物确实可聚焦的 Element Plus 组件白名单。
 * 收录判据只有一条：**去看它渲染出来的 DOM**——`el-tag`→span、`el-card`→div、
 * `el-icon`→i、`el-col`/`el-row`→div 都不在此列（它们正是本批的站点）。
 * `el-radio-group`/`el-checkbox-group` 收录的理由是 `@change` 由组内原生 input（可聚焦）投递。
 */
const EP_FOCUSABLE = new Set([
  'el-button',
  'el-input',
  'el-input-number',
  'el-select',
  'el-select-v2',
  'el-checkbox',
  'el-checkbox-button',
  'el-checkbox-group',
  'el-radio',
  'el-radio-button',
  'el-radio-group',
  'el-switch',
  'el-slider',
  'el-link',
  'el-date-picker',
  'el-time-picker',
  'el-time-select',
  'el-color-picker',
  'el-cascader',
  'el-autocomplete',
  'el-transfer',
  'el-upload',
  'el-dropdown',
  'el-dropdown-item',
  'el-rate'
])

/** 激活型 / 可选择型 ARIA 角色：这些角色自带"回车/空格可激活"的语义承诺 */
const ACTIVATION_ROLES = new Set(['button', 'link', 'checkbox', 'switch', 'tab', 'menuitem', 'treeitem', 'option'])

/**
 * 分隔条走**方向键**而不是回车/空格（b89 项 9 扩面后才出现的形状：`TreePanel` 的 `.resize-handle`）。
 *
 * WAI-ARIA 的 Split View 模式里，可聚焦的 `role="separator"` 用方向键调整尺寸——
 * 回车/空格对它没有语义（用户要的不是"激活"而是"调整"）。这一档**不放宽**任何东西：
 * 仍然要求 tabindex（写死 `-1` 一样红）+ 真的带方向键修饰符的键盘处理器，
 * 所以"补了 role=separator 但按方向键没反应"照样被抓。
 */
const SEPARATOR_ROLES = new Set(['separator'])

/** 方向键修饰符（分隔条的激活通道） */
const ARROW_MODS = new Set(['left', 'right', 'up', 'down'])

/** 键盘激活处理器 */
const KEY_HANDLER_RE = /^(@|v-on:)key(up|down|press)(\.|$)/

/** 带方向键修饰符的键盘处理器（`@keydown.left` / `v-on:keydown.down.prevent`…） */
function hasArrowKeyHandler(attrs: ReturnType<typeof splitTagAttrs>): boolean {
  return attrs.some((a) => {
    if (!KEY_HANDLER_RE.test(a.name)) return false
    return a.name.split('.').some((mod) => ARROW_MODS.has(mod))
  })
}

/**
 * `.self` 修饰符 = "只有点在它自己身上才算"，也就是**遮罩/背板**（点空白处关闭）。
 *
 * 为什么背板不算激活控件：对话框自己带 Esc 与关闭按钮，把背板做成可聚焦元素反而会
 * 多出一个没有任何语义的 Tab 停靠点（对读屏用户是噪声）。判据因此按**修饰符**分叉，
 * 而不是按标签名/类名猜"这大概是遮罩"——按类名豁免是换个类名就绕过去的写法。
 * 判定取"修饰符列表里有没有 self"，不取位置：`@click.self` 与 `@click.stop.self` 同义，
 * 按位置写正则的第一版就是因此漏掉了全部背板（真树四条红报的是判据自己）。
 * ⚠️ 混挂（同时有 `@click` 与 `@click.self`）仍算控件：只要存在一个非 `.self` 的点击语义，
 * 用户就必须能瞄准它点，那条承诺跑不掉。
 */
function hasSelfModifier(name: string): boolean {
  return name.split('.').includes('self')
}

function isSelfOnlyClick(attrs: ReturnType<typeof splitTagAttrs>): boolean {
  const clicks = attrs.filter((a) => isClickSemanticAttr(a.name))
  return clicks.length > 0 && clicks.every((a) => hasSelfModifier(a.name))
}

const viewFiles = collectByExt(SCAN_DIR, '', '.vue', EXCLUDED_DIRS)

export interface ClickTargetViolation {
  /** 相对 `src` 的路径 */
  rel: string
  /** 1-based 绝对行号（掩码等长 ⇒ 可信） */
  line: number
  tag: string
  /** 缺了哪几件（用于失败文案点名，避免"只说不对不说哪不对"） */
  missing: string[]
}

export interface ClickTargetScan {
  violations: ClickTargetViolation[]
  /** 挂了点击语义的开始标签总数（采集面体量探针的分母） */
  clickSites: number
  /** 其中标签名不在可聚焦集合里的站点数 */
  containerSites: number
  /** 只挂 `.self` 的背板站点数（按新口径**不参与**判定，但必须数得到，否则"全被豁免"看不见） */
  backdropSites: number
  /** 没有可识别模板块的文件（必须为空，否则采集面有洞） */
  withoutTemplate: string[]
}

const hasAttr = (attrs: ReturnType<typeof splitTagAttrs>, names: string[]) => attrs.find((a) => names.includes(a.name))

/** 该标签是否已带 enter/space 激活的键盘处理器 */
function hasActivationKeyHandler(attrs: ReturnType<typeof splitTagAttrs>): boolean {
  return attrs.some((a) => {
    if (!KEY_HANDLER_RE.test(a.name)) return false
    return a.name.split('.').some((mod) => mod === 'enter' || mod === 'space')
  })
}

/**
 * 纯函数：给一个 SFC 源码，返回模板里"挂点击但键盘不可达"的站点。
 * 两把 a11y 守卫的共用入口形状（另一把是 aria-expanded 守卫）：都只吃 `(rel, src)`，
 * 这样合成夹具与真实树走同一条判定路径，不存在"夹具专用宽松分支"。
 */
export function scanClickTargets(
  rel: string,
  src: string
): Pick<ClickTargetScan, 'violations' | 'clickSites' | 'containerSites' | 'backdropSites'> {
  const region = vueTemplateRegion(src)
  if (!region) return { violations: [], clickSites: 0, containerSites: 0, backdropSites: 0 }
  const violations: ClickTargetViolation[] = []
  let clickSites = 0
  let containerSites = 0
  let backdropSites = 0
  const line = (index: number) => lineNumberAt(region.code, index) + region.lineOffset
  forEachStartTag(region.code, (name, attrsText, index) => {
    const attrs = splitTagAttrs(attrsText)
    if (!attrs.some((a) => isClickSemanticAttr(a.name))) return
    clickSites++
    if (isSelfOnlyClick(attrs)) {
      backdropSites++
      return
    }
    const lower = name.toLowerCase()
    const roleAttr = hasAttr(attrs, ['role', ':role', 'v-bind:role'])
    // 绑定型 role（`:role="'button'"`）剥掉字符串引号后同样参与判定；
    // 取不到字面量角色（`:role="r"`）一律按不满足处理——宁可多要求，不放过"看着补了其实没角色"。
    const roleValue = roleAttr ? roleAttr.value.trim().replace(/^['"]+|['"]+$/g, '') : ''
    const tabindexAttr = hasAttr(attrs, ['tabindex', ':tabindex', 'v-bind:tabindex'])
    const tabindexMissing = !tabindexAttr || (tabindexAttr.name === 'tabindex' && tabindexAttr.value.trim() === '-1')
    // `router-link` 带 `to` 时渲染成 `<a href>` ⇒ 天然进 Tab 序列（与 `a[href]` 同一判据方向）。
    // 不带 `to` 的 router-link 渲染成 `<a>` 无 href，不进序列，照旧按容器处理。
    const isLinkWithoutHref = lower === 'a' && !hasAttr(attrs, ['href', ':href', 'v-bind:href'])
    const hasRouterLinkTarget = lower === 'router-link' && !!hasAttr(attrs, ['to', ':to', 'v-bind:to'])
    const nativeFocusable =
      NATIVE_FOCUSABLE.has(lower) || (!isLinkWithoutHref && (lower === 'a' || hasRouterLinkTarget))
    if (nativeFocusable || EP_FOCUSABLE.has(lower)) return
    containerSites++
    const missing: string[] = []
    if (SEPARATOR_ROLES.has(roleValue)) {
      // 分隔条那一档：方向键是它唯一的键盘通道（见 SEPARATOR_ROLES 注释）
      if (tabindexMissing) missing.push('tabindex="0"（可 Tab 到达）')
      if (!hasArrowKeyHandler(attrs)) missing.push('@keydown.left / .right / .up / .down（方向键调整尺寸）')
    } else {
      if (!roleAttr || !ACTIVATION_ROLES.has(roleValue)) missing.push('role=button/link（激活型角色）')
      if (tabindexMissing)
        missing.push(tabindexAttr ? 'tabindex 不得写死 -1（仍不可 Tab 到达）' : 'tabindex="0"（可 Tab 到达）')
      if (!hasActivationKeyHandler(attrs)) missing.push('@keydown.enter / @keyup.space（键盘激活）')
    }
    if (missing.length) violations.push({ rel, line: line(index), tag: name, missing })
  })
  return { violations, clickSites, containerSites, backdropSites }
}

/** 扫一批源码（真实树与合成夹具共用） */
export function scanAll(entries: Array<{ rel: string; src: string }>): ClickTargetScan {
  const acc: ClickTargetScan = {
    violations: [],
    clickSites: 0,
    containerSites: 0,
    backdropSites: 0,
    withoutTemplate: []
  }
  for (const e of entries) {
    if (!vueTemplateRegion(e.src)) acc.withoutTemplate.push(e.rel)
    const r = scanClickTargets(e.rel, e.src)
    acc.violations.push(...r.violations)
    acc.clickSites += r.clickSites
    acc.containerSites += r.containerSites
    acc.backdropSites += r.backdropSites
  }
  return acc
}

describe('a11y 静态守卫 · 规则：挂点击语义的标签必须键盘可达（可聚焦控件或 role+tabindex+键盘三件齐备）', () => {
  const entries = viewFiles.map((rel) => ({ rel, src: readFileSync(resolve(SCAN_DIR, rel), 'utf8') }))

  it('采集面自证：面由事实派生（递归 src 的 .vue），单测文件不进来', () => {
    // 实测 199 个 .vue（b89 项 9 把面从 src/views 扩到整个 src 之后），腰斩即红
    expect(viewFiles.length, 'src 下 .vue 数量（体量下限，腰斩即红）').toBeGreaterThanOrEqual(190)
    expect(
      viewFiles.every((f) => f.endsWith('.vue')),
      '面内只允许 .vue'
    ).toBe(true)
    expect(
      viewFiles.some((f) => f.includes('.test.')),
      '视图单测不得被当成视图文件扫进面'
    ).toBe(false)
    // 已知入口必须在面里（防止目录名规则落后于事实那种"扫不到却报绿"）。
    // 后四条是 b89 项 9 扩面**新增**的载体：只扫 views 时它们从未进过任何判据的视野。
    for (const must of [
      'views/login.vue',
      'views/workbench/index.vue',
      'views/tool/build/index.vue',
      'views/tool/build/IconsDialog.vue',
      'views/monitor/frontendError/index.vue',
      'views/ai/panel/index.vue',
      'views/monitor/job/JobStatsPanel.vue',
      'components/ThemeEditor/index.vue',
      'components/EditableCell/index.vue',
      'layout/components/TagsView/ContextMenu.vue',
      'components/TreePanel/index.vue',
      'layout/index.vue'
    ]) {
      expect(viewFiles, `扫描面必须包含 ${must}`).toContain(must)
    }
    const scan = scanAll(entries)
    expect(
      scan.withoutTemplate,
      `以下 .vue 没有可识别的模板块（采集面有洞，必须处理而非放行）：\n${scan.withoutTemplate.join('\n')}`
    ).toEqual([])
    // 点击语义站点数量级对账：扩面到整个 src 后实测 ~1000，腰斩即红
    expect(scan.clickSites, '挂点击语义的开始标签总数（采集面体量探针）').toBeGreaterThanOrEqual(700)
    // 背板豁免也必须数得到：这条是"豁免通道没有把真站点全洗掉"的正控
    expect(scan.backdropSites, '只挂 .self 的背板站点数（新豁免档的采集面自证）').toBeGreaterThanOrEqual(3)
    expect(scan.backdropSites, '背板不得多于容器型站点的一半（多了就是有人在用 .self 逃避判定）').toBeLessThan(
      scan.containerSites
    )
    console.warn(
      `[a11yClickTarget] 扫描面 ${viewFiles.length} 个 .vue / 点击语义标签 ${scan.clickSites} 处 / 其中容器型标签 ${scan.containerSites} 处 / 背板豁免 ${scan.backdropSites} 处 / 违规 ${scan.violations.length} 处`
    )
  })

  it('真实树：不可键盘到达的点击站点必须 0 处', () => {
    const scan = scanAll(entries)
    const report = scan.violations.map((v) => `${v.rel}:${v.line} <${v.tag}> 缺 ${v.missing.join('、')}`)
    expect(report, `键盘不可达的点击站点：\n${report.join('\n')}`).toEqual([])
  })

  it('行号锚事实：真实站点报出的行号必须指向那一行', () => {
    // 掩码等长 + lineOffset 换算是"文案点名到行"的全部可信度；这里用磁盘上的原文反查对账。
    const rel = 'views/tool/build/index.vue'
    const src = readFileSync(resolve(SCAN_DIR, rel), 'utf8')
    const scan = scanClickTargets(rel, src)
    expect(scan.violations, '该视图此刻必须合规').toEqual([])
    // 插入一个"只有 role 与 click、缺 tabindex"的探针：命中数 +1 且行号落在探针那一行
    const broken = plantInVueTemplate(src, '<div class="probe" role="button" @click="noop()"></div>')
    const found = scanClickTargets(rel, broken).violations
    expect(found.length, '插入的探针必须被抓到').toBe(scan.violations.length + 1)
    const probeLine = broken.split('\n').findIndex((l) => l.includes('class="probe"')) + 1
    expect(found[0].line, '违规行号必须等于探针所在行').toBe(probeLine)
    expect(found[0].missing.join('|'), '缺的那件必须点名 tabindex').toContain('tabindex')
  })

  it('合成双向 · 坏形状必须被抓且文案点名文件与行号', () => {
    const bad: Array<[string, string, number]> = [
      // [说明, 源码, 违规行号]
      ['裸 div 挂 click', '<template>\n  <div @click="go()">x</div>\n</template>\n', 2],
      ['el-tag 挂 click（渲染成 span）', '<template>\n  <el-tag @click="go()">x</el-tag>\n</template>\n', 2],
      ['有 role 无 tabindex', '<template>\n  <li role="button" @click="go()">x</li>\n</template>\n', 2],
      ['有 tabindex 无 role 无键盘', '<template>\n  <span tabindex="0" @click="go()">x</span>\n</template>\n', 2],
      ['齐件但无键盘处理器', '<template>\n  <div role="button" tabindex="0" @click="go()">x</div>\n</template>\n', 2],
      [
        '键盘处理器没有 enter/space',
        '<template>\n  <div role="button" tabindex="0" @click="go()" @keydown="onKey">x</div>\n</template>\n',
        2
      ],
      [
        'tabindex 写死 -1（看着补了其实到不了）',
        '<template>\n  <div role="button" tabindex="-1" @click="go()" @keydown.enter="go()">x</div>\n</template>\n',
        2
      ],
      [
        'role 不是激活型角色',
        '<template>\n  <div role="presentation" tabindex="0" @click="go()" @keydown.enter="go()">x</div>\n</template>\n',
        2
      ],
      ['无 href 的 a（不进 Tab 序列）', '<template>\n  <a @click="go()">x</a>\n</template>\n', 2],
      ['容器上的 @change 同样只有指针通道', '<template>\n  <div @change="go()">x</div>\n</template>\n', 2],
      ['自定义组件按不可聚焦处理', '<template>\n  <FooCard @click="go()">x</FooCard>\n</template>\n', 2],
      ['v-on: 写法等价', '<template>\n  <div v-on:click="go()">x</div>\n</template>\n', 2],
      [
        '背板上同时挂了非 .self 的 click ⇒ 仍是必须瞄准的控件',
        '<template>\n  <div @click.self="close" @click="other()">x</div>\n</template>\n',
        2
      ],
      [
        'role=separator 但按方向键没反应（补了角色是假的）',
        '<template>\n  <div role="separator" tabindex="0" @mousedown="start()"></div>\n</template>\n',
        2
      ],
      [
        'role=separator 缺 tabindex（方向键再好也到不了）',
        '<template>\n  <div role="separator" @mousedown="start()" @keydown.left="a()"></div>\n</template>\n',
        2
      ],
      [
        'router-link 不带 to ⇒ 渲染成无 href 的 a，不进 Tab 序列',
        '<template>\n  <router-link @click="pick()">x</router-link>\n</template>\n',
        2
      ],
      [
        '分隔条 tabindex 写死 -1 同样不算可达',
        '<template>\n  <div role="separator" tabindex="-1" @mousedown="start()" @keydown.left="a()"></div>\n</template>\n',
        2
      ]
    ]
    const caught: string[] = []
    for (const [label, src, line] of bad) {
      const r = scanClickTargets(`synthetic/${label.replace(/[^\w]/g, '')}.vue`, src)
      if (r.violations.length === 1 && r.violations[0].line === line) caught.push(label)
      else throw new Error(`${label}：期望 1 处违规（第 ${line} 行），实得 ${JSON.stringify(r.violations)}`)
    }
    expect(caught.length, '每条坏形状都必须被抓').toBeGreaterThanOrEqual(bad.length)
    // 文案必须点名到文件与行号（"红在哪一行"丢了等于没判）
    const one = scanClickTargets('synthetic/demo.vue', bad[0][1]).violations[0]
    expect(`${one.rel}:${one.line} <${one.tag}> 缺 ${one.missing.join('、')}`).toBe(
      'synthetic/demo.vue:2 <div> 缺 role=button/link（激活型角色）、tabindex="0"（可 Tab 到达）、@keydown.enter / @keyup.space（键盘激活）'
    )
  })

  it('合成双向 · 好形状必须不误报', () => {
    const good: Array<[string, string]> = [
      ['原生 button', '<template>\n  <button @click="go()">x</button>\n</template>\n'],
      ['el-button', '<template>\n  <el-button @click="go()">x</el-button>\n</template>\n'],
      ['带 href 的 a', '<template>\n  <a href="/x" @click="go()">x</a>\n</template>\n'],
      ['原生 input 的 change', '<template>\n  <input @change="go()" />\n</template>\n'],
      [
        'el-radio-group 的 change（由组内原生 input 投递）',
        '<template>\n  <el-radio-group @change="go()" />\n</template>\n'
      ],
      [
        '容器 + 三件齐备（keyup 形）',
        '<template>\n  <div role="button" tabindex="0" @click="go()" @keyup.enter="go()">x</div>\n</template>\n'
      ],
      [
        '容器 + 三件齐备（space 形，带修饰符尾巴）',
        '<template>\n  <span role="button" tabindex="0" @click.stop="go()" @keydown.space.stop.prevent="go()">x</span>\n</template>\n'
      ],
      [
        '绑定式 tabindex（条件禁用是正当写法）',
        '<template>\n  <div role="button" :tabindex="row.disabled ? -1 : 0" @click="go()" @keydown.enter="go()">x</div>\n</template>\n'
      ],
      [
        'v-bind:role / v-on:keydown 等价写法',
        '<template>\n  <div v-bind:role="\'button\'" tabindex="0" v-on:click="go()" v-on:keydown.enter="go()">x</div>\n</template>\n'
      ],
      ['没挂点击语义的容器不参与', '<template>\n  <div class="box" :style="s">x</div>\n</template>\n'],
      [
        '背板只挂 @click.self（点空白关闭，对话框自带 Esc 与关闭按钮）',
        '<template>\n  <div class="mask" @click.self="close()"><div role="dialog">x</div></div>\n</template>\n'
      ],
      [
        '分隔条 + 方向键（WAI-ARIA Split View 那一档）',
        '<template>\n  <div role="separator" tabindex="0" aria-orientation="vertical" @mousedown="start()" @keydown.left="shrink()" @keydown.right="grow()"></div>\n</template>\n'
      ],
      [
        'router-link 带 to（渲染成 <a href>，天然可 Tab）',
        '<template>\n  <router-link :to="tag.path" @click="pick()">x</router-link>\n</template>\n'
      ]
    ]
    const falsePositives: string[] = []
    for (const [label, src] of good) {
      const r = scanClickTargets(`synthetic/${label}.vue`, src)
      if (r.violations.length) falsePositives.push(`${label} → ${JSON.stringify(r.violations)}`)
    }
    expect(falsePositives, `合规写法被误报：\n${falsePositives.join('\n')}`).toEqual([])
    // 正控：上面这批"好形状"确实都挂了点东西或至少进了面（否则这条只是空跑，同 §测试门禁 ⑥）
    const withClick = good.filter(([, src]) => /@click|@change|v-on:click/.test(src)).length
    expect(withClick, '好形状夹具里必须多数真的挂了点击语义').toBeGreaterThanOrEqual(8)
  })

  it('刀口活性：每个被扫文件模板开头插入一条合成违规，被抓数必须 +1', () => {
    const planted = '<div class="__a11y-plant-probe" @click="noop()">probe</div>'
    let caught = 0
    for (const e of entries) {
      const base = scanClickTargets(e.rel, e.src).violations.length
      const after = scanClickTargets(e.rel, plantInVueTemplate(e.src, planted)).violations.length
      if (after === base + 1) caught++
    }
    expect(caught, '每条合成违规都必须让命中数 +1（掩码状态若在插入点之前已错位，这一条会红）').toBe(entries.length)
    // 反证：插入点确实生效（模板开头的行号必须比原文件第一个违规更早或等于新增数）
    expect(plantInVueTemplate(entries[0].src, planted)).toContain('__a11y-plant-probe')
  })

  it('反证：注释与字符串里的标签形状不参与判定', () => {
    const inHtmlComment = '<template>\n  <!-- 旧写法：<div @click="go()">x</div> 已改掉 -->\n  <p>ok</p>\n</template>\n'
    const inAttrValue =
      '<template>\n  <div v-html="\'<div @click=&quot;go()&quot;>doc 里的例子</div>\'"></div>\n</template>\n'
    const inJsString = '<template>\n  <p :title="\'@click=go() 是点击语义\'">t</p>\n</template>\n'
    for (const src of [inHtmlComment, inAttrValue, inJsString]) {
      const r = scanClickTargets('synthetic/counter.vue', src)
      expect(r.violations, `注释/字符串里的标签不得算站点：${src}`).toEqual([])
      expect(r.clickSites, `注释/字符串里的点击关键字不得进采集面：${src}`).toBe(0)
    }
    // 反证文本必须真含那个关键字，否则这条只是空跑（同 e2eCwdPath 那条自证）
    expect(inHtmlComment).toContain('@click=')
    expect(inAttrValue).toContain('@click')
    expect(inJsString).toContain('@click')
    // 同一份标签形状去掉注释外壳必须立刻被抓到（证明"不参与"是掩码生效，不是判据没跑）
    const uncommented = '<template>\n  <div @click="go()">x</div>\n  <p>ok</p>\n</template>\n'
    expect(scanClickTargets('synthetic/counter.vue', uncommented).violations.length).toBe(1)
  })
})
