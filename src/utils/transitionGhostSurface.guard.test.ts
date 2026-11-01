import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * b131 真机取证：列表区的「骨架屏 ↔ el-table」被包在 `<Transition name="fade" mode="out-in">`
 * 里，Vue 在 leave 开始时就卸载旧表（事件处理器随之失效），DOM 却要等 0.28s 过渡结束才移除
 * ⇒ 这段窗口内旧表格**看得见、命中得到、点了没反应**（探针实测：同一时刻行内「删除」也不
 * 弹确认框、无任何请求，700ms 后再点全部正常；F52「编辑对话框回填原昵称」因此稳定失败）。
 *
 * 判据只钉一条语义：**离场元素不得可交互**。留个形状锁，防止有人把它当"多余样式"删掉——
 * 删掉后所有浏览器判据仍然会绿（Playwright 只做命中测试，不检查监听器是否还在），
 * 于是"点了没反应"会再次变成只有用户能发现的缺陷。
 *
 * 读规则块而不是全文 `includes`：注释里也会出现 `pointer-events: none`（就在本文件上方），
 * 全文匹配等于让注释替样式作证。
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

/** 取所有「选择器列表包含 target」的规则块的声明体（SCSS 里这些块没有嵌套，按花括号配对取） */
function ruleBodies(css: string, target: string): string[] {
  const out: string[] = []
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped))) {
    // 花括号之间可能混入上游的 `$var: x;` 声明（它们没有花括号，于是被并进"选择器"段），
    // 取最后一个 `;` 之后的部分才是真选择器列表。
    const selectorText = m[1].split(';').pop() ?? ''
    const selectors = selectorText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (selectors.includes(target)) out.push(m[2])
  }
  return out
}

describe('离场元素不得可交互（b131：淡出中的旧表格仍可命中但处理器已失效）', () => {
  it('transition.scss 里 .fade-leave-active 必须声明 pointer-events: none', () => {
    const css = read('src/assets/styles/transition.scss')
    const bodies = ruleBodies(css, '.fade-leave-active')
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.some((b) => /pointer-events\s*:\s*none/.test(b))).toBe(true)
  })

  it('.fade-enter-active 不声明 pointer-events（进入的是当前内容，仍应可点）', () => {
    const css = read('src/assets/styles/transition.scss')
    const bodies = ruleBodies(css, '.fade-enter-active')
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.some((b) => /pointer-events\s*:\s*none/.test(b))).toBe(false)
  })

  it('解析器自身可被证伪：删掉声明必须判定失败', () => {
    const broken = '.fade-enter-active,\n.fade-leave-active {\n  transition: opacity 0.28s;\n}\n'
    const bodies = ruleBodies(broken, '.fade-leave-active')
    expect(bodies.length).toBe(1)
    expect(bodies.some((b) => /pointer-events\s*:\s*none/.test(b))).toBe(false)
  })

  it('注释里出现 pointer-events: none 不算数', () => {
    const commentOnly =
      '/* .fade-leave-active { pointer-events: none } */\n.fade-enter-active,\n.fade-leave-active {\n  transition: opacity 0.28s;\n}\n'
    const bodies = ruleBodies(commentOnly, '.fade-leave-active')
    expect(bodies.some((b) => /pointer-events\s*:\s*none/.test(b))).toBe(false)
  })

  // ==================== 采集面由事实派生：全站 `<Transition name="X"> ====================
  //
  // b131 那条锁只钉了 `transition.scss` 里的 `.fade-leave-active` 一处——而"离场元素仍可命中"
  // 是**任何** leave 过渡的共同形状。b144 在 `BatchActions` 上复发（0.25s 的
  // `.batch-slide-up-leave-active` 没有压指针事件，栏在淡出期间仍可命中却已无对象可清），
  // 而当时的判据**照常绿**：判据只认它自己想到那一处（前言 ⑬/⑯(c) 的同族）。
  // 现在改成派生面：凡模板里有 `<transition name="X">` 且**存在** `.<X>-leave-active` 规则，
  // 那条规则必须压指针事件；没有 leave 规则的（无过渡）不得判红——否则每轮必红、结局是被放宽。
  // 四种标签形状都要进面：`<transition>` / `<Transition>` / `<transition-group>` / `<TransitionGroup>`。
  // 第一版写成 `<(?:transition|Transition)\b`，于是 PascalCase 的 `<TransitionGroup name="icon-grid">`
  // （IconSelect 与 IconsDialog）结构上扫不到——`Transition` 后面紧跟 `G` 没有词边界。
  // 采集面按标签写法枚举必然漏一种形状（㉘"同一句纪律写几遍就有几个严格度"的镜像：
  // 少一种写法就少一片），改由"transition + 可选 group 后缀"派生。
  // `(?<!:)name` 则把绑定型 `:name="x"` 排除在面外：取不到值就不判。
  const NAME_RE = /<(?:[Tt]ransition)(?:-[Gg]roup|[Gg]roup)?\b[^>]*?(?<!:)name\s*=\s*"([^"]+)"[^>]*>/g
  const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

  /** 模板里出现的字面量过渡名（`:name="x"` 取不到值 ⇒ 天然不在面里，不判红） */
  function transitionNames(src: string): string[] {
    const out: string[] = []
    for (const m of src.matchAll(NAME_RE)) if (m[1]) out.push(m[1])
    return [...new Set(out)]
  }
  /** 组件自带 `<style>` 段的合集 */
  function ownStyleBlock(src: string): string {
    return [...src.matchAll(STYLE_RE)].map((m) => m[1]).join('\n')
  }

  /** 纯函数：单文件的幽灵面缺口（真实树与合成夹具共用同一份实现） */
  function ghostGaps(rel: string, vueSource: string, globalCss: string): string[] {
    const names = transitionNames(vueSource)
    if (names.length === 0) return []
    const ownCss = ownStyleBlock(vueSource)
    const out: string[] = []
    for (const name of names) {
      const selector = `.${name}-leave-active`
      const bodies = [...ruleBodies(ownCss, selector), ...ruleBodies(globalCss, selector)]
      // 没有 leave-active 规则 ⇒ 根本没有离场过渡，不得报（合法空态）
      if (bodies.length === 0) continue
      if (!bodies.some((b) => /pointer-events\s*:\s*none/.test(b))) {
        out.push(`${rel}: ${selector} 定义了离场过渡却没有压掉指针事件（淡出期间仍可命中、点了没反应）`)
      }
    }
    return out
  }

  const globalCss = [
    'src/assets/styles/transition.scss',
    'src/assets/styles/index.scss',
    'src/assets/styles/ruoyi.scss'
  ]
    .filter((rel) => {
      try {
        readFileSync(resolve(process.cwd(), rel))
        return true
      } catch {
        return false
      }
    })
    .map((rel) => read(rel))
    .join('\n')

  function walkAllVue(dir: string, out: string[] = []): string[] {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const abs = resolve(dir, ent.name)
      if (ent.isDirectory()) walkAllVue(abs, out)
      else if (ent.name.endsWith('.vue')) out.push(abs)
    }
    return out
  }

  const relOf = (abs: string) =>
    abs
      .slice(resolve(process.cwd()).length + 1)
      .split('\\')
      .join('/')
  const vueFiles = walkAllVue(resolve(process.cwd(), 'src'))
  const transitionFiles = vueFiles
    .map((abs) => ({ rel: relOf(abs), src: readFileSync(abs, 'utf8') }))
    .filter((f) => transitionNames(f.src).length > 0)

  it('派生面：全站字面量 <transition name> 的站点必须都被扫到（采集面自证）', () => {
    const names = [...new Set(transitionFiles.flatMap((f) => transitionNames(f.src)))]
    const withLeaveRule = transitionFiles.filter(
      (f) =>
        ghostGaps(f.rel, f.src, globalCss).length === 0 &&
        transitionNames(f.src).some(
          (n) =>
            ruleBodies(ownStyleBlock(f.src), `.${n}-leave-active`).length +
              ruleBodies(globalCss, `.${n}-leave-active`).length >
            0
        )
    )
    console.warn(
      `[transitionGhostSurface] .vue 采集面 ${vueFiles.length} 个 / 带字面量过渡名的文件 ${transitionFiles.length} 个 / ` +
        `过渡名 ${names.length} 个（${names.join(', ')}）/ 受本判据约束的文件 ${withLeaveRule.length} 个`
    )
    expect(vueFiles.length, `src 下 .vue 采集面 ${vueFiles.length} 个`).toBeGreaterThanOrEqual(200)
    expect(
      transitionFiles.length,
      `带字面量 <transition name> 的文件只有 ${transitionFiles.length} 个（下限 8 ⇒ 派生走偏）`
    ).toBeGreaterThanOrEqual(8)
  })

  it('真实树：任何定义了离场过渡的 name 都必须压掉指针事件（0 违规）', () => {
    const violations = transitionFiles.flatMap((f) => ghostGaps(f.rel, f.src, globalCss))
    expect(violations, `幽灵离场面：\n${violations.join('\n')}`).toEqual([])
  })

  it('合成双向：坏形状必须点名、无 leave 规则与已压制的不得误报', () => {
    const mk = (style: string) =>
      `<template><transition name="zz-slide"><div v-if="ok">x</div></transition></template>\n<script setup></script>\n${style}`
    // 坏：定义了 leave-active 却没压指针
    const bad = mk('<style scoped>.zz-slide-leave-active { transition: all 0.25s; }</style>')
    expect(ghostGaps('bad.vue', bad, '')).toHaveLength(1)
    // 合规：压了指针
    const good = mk('<style scoped>.zz-slide-leave-active { transition: all 0.25s; pointer-events: none; }</style>')
    expect(ghostGaps('good.vue', good, '')).toEqual([])
    // 合法空：根本没有 leave 过渡 ⇒ 不存在幽灵面，不得判红
    const noTransition = mk('<style scoped>.zz-slide-enter-active { transition: all 0.25s; }</style>')
    expect(ghostGaps('none.vue', noTransition, '')).toEqual([])
    // 反例：`:name="dynamicName"` 取不到值 ⇒ 不判（不得把绑定型名字当成缺陷）
    const dynamic = '<template><transition :name="panelAnim"><div>x</div></transition></template>'
    expect(ghostGaps('dyn.vue', dynamic, '')).toEqual([])
    // 形状覆盖：PascalCase 的 `<TransitionGroup>` 必须进面——旧写法把 `Transition` 后面
    // 直接接 `Group` 的情况漏掉了（词边界不成立），`icon-grid` 两处站点因此不在刀口上。
    const groupBad =
      '<template><TransitionGroup name="zz-grid" tag="ul"><li v-for="i in list" :key="i">x</li></TransitionGroup></template>\n<style scoped>.zz-grid-leave-active { transition: all 0.2s; position: absolute; }</style>'
    expect(ghostGaps('group-bad.vue', groupBad, '')).toHaveLength(1)
    const groupGood = groupBad.replace('position: absolute;', 'position: absolute; pointer-events: none;')
    expect(ghostGaps('group-good.vue', groupGood, '')).toEqual([])
    // 跨行写法（真实树里 `name` 常单独换行）也必须进面
    const multiline =
      '<template>\n  <transition\n    name="zz-multi"\n    mode="out-in"\n  >\n    <div>x</div>\n  </transition>\n</template>\n<style scoped>.zz-multi-leave-active { transition: all 0.2s; }</style>'
    expect(ghostGaps('multi.vue', multiline, '')).toHaveLength(1)
    // 全局样式里的声明同样算数（`fade` 正是这一形状）
    const usesFade = mk('').replace('zz-slide', 'fade')
    expect(ghostGaps('fade.vue', usesFade, '.fade-leave-active { pointer-events: none; }')).toEqual([])
    expect(ghostGaps('fade.vue', usesFade, '.fade-leave-active { transition: opacity .2s; }')).toHaveLength(1)
  })

  it('差异法活性：逐文件把 pointer-events 摘掉必须被抓', () => {
    const missed: string[] = []
    let onTheKnife = 0
    for (const f of transitionFiles) {
      const before = ghostGaps(f.rel, f.src, globalCss)
      if (before.length > 0) {
        missed.push(`${f.rel}: 真实树本来就违规（先修产品再谈活性）`)
        continue
      }
      // 只有"确实靠某条 pointer-events 声明通过"的文件才可被判否；
      // 没有 leave 规则的文件本来就该恒绿，摘不动东西也不得算进活性统计。
      const own = ownStyleBlock(f.src)
      const hasLeaveRule = transitionNames(f.src).some(
        (name) =>
          ruleBodies(own, `.${name}-leave-active`).length > 0 ||
          ruleBodies(globalCss, `.${name}-leave-active`).length > 0
      )
      if (!hasLeaveRule) continue
      // 摘声明走正则而不是按字面 `pointer-events: none` 切：写法少一个空格就会"摘了个寂寞"，
      // 那样这条活性用例是虚锁（㉖：变异必须先证明改动确实落进去了）。
      const unpress = (css: string) => css.replace(/pointer-events\s*:\s*none/g, 'pointer-events-removed: none')
      const after = ghostGaps(f.rel, unpress(f.src), unpress(globalCss))
      if (after.length === 0) missed.push(`${f.rel}: 摘掉 pointer-events 未被抓（该文件不在刀口上）`)
      else onTheKnife++
    }
    // 下限取"由事实派生的受约束文件数"，不记 HEAD 的文件数（㉞⑦：记住的数字会把自己变成噪声）。
    console.warn(
      `[transitionGhostSurface] 刀口活性：受约束文件 ${onTheKnife} 个，摘掉声明后全部被抓（ missed=${missed.length}）`
    )
    expect(onTheKnife, '受本判据约束、且确实靠 pointer-events 通过的文件数').toBeGreaterThanOrEqual(50)
    expect(missed, `派生面活性失败：\n${missed.join('\n')}`).toEqual([])
  })
})
