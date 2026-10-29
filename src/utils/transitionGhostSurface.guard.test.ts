import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
})
