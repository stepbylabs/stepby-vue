import { describe, it, expect } from 'vitest'
import { sanitizeForPrint } from '@/utils/sanitizeHtml'

/** 用 HTML 字符串构造一个根元素（取首个子元素），便于测试 */
function fromHTML(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container.firstElementChild as HTMLElement
}

describe('sanitizeForPrint', () => {
  it('正常内容应保留', () => {
    const el = fromHTML('<div>hello world</div>')
    const out = sanitizeForPrint(el)
    expect(out).toContain('hello world')
  })

  it('应移除 <script> 元素及其内容（防 XSS 执行）', () => {
    const el = fromHTML('<div>hi<script>alert(1)</script></div>')
    const out = sanitizeForPrint(el)
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  it('应移除 <iframe> 元素', () => {
    const el = fromHTML('<div>before<iframe src="evil.com"></iframe>after</div>')
    const out = sanitizeForPrint(el)
    expect(out).not.toContain('<iframe')
    expect(out).toContain('before')
    expect(out).toContain('after')
  })

  it('应移除 <style>/<link>/<meta> 等危险/无关元素', () => {
    const el = fromHTML(
      '<div><style>.x{color:red}</style><link rel="stylesheet" href="a.css"><meta name="x" content="y">content</div>'
    )
    const out = sanitizeForPrint(el)
    expect(out).not.toContain('<style')
    expect(out).not.toContain('<link')
    expect(out).not.toContain('<meta')
    expect(out).toContain('content')
  })

  it('应剥离顶层元素的 on* 事件属性', () => {
    const el = fromHTML('<div onclick="evil()" onload="x()">x</div>')
    const out = sanitizeForPrint(el)
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onload')
    expect(out).toContain('>x</div>')
  })

  it('应剥离任意嵌套深度的 on* 事件属性', () => {
    const el = fromHTML('<div><span onmouseover="a()"><b onfocus="b()">y</b></span></div>')
    const out = sanitizeForPrint(el)
    expect(out).not.toContain('onmouseover')
    expect(out).not.toContain('onfocus')
    expect(out).toContain('y')
  })

  it('应保留良性（非 on*）属性', () => {
    const el = fromHTML('<div data-foo="bar" id="main">z</div>')
    const out = sanitizeForPrint(el)
    expect(out).toContain('data-foo="bar"')
    expect(out).toContain('id="main"')
    expect(out).toContain('z')
  })

  it('应保留嵌套后代元素中的良性属性（内层 on* 过滤 false 分支）', () => {
    const el = fromHTML('<div><span data-idx="1" class="x">y</span></div>')
    const out = sanitizeForPrint(el)
    expect(out).toContain('data-idx="1"')
    expect(out).toContain('class="x"')
    expect(out).toContain('y')
  })

  it('综合：富文本中的脚本与事件属性应被清除，文本与结构保留', () => {
    const el = fromHTML(
      '<article><h1>Title</h1><p onclick="steal()">para<script>exfil()</script></p><ul><li>item</li></ul></article>'
    )
    const out = sanitizeForPrint(el)
    expect(out).toContain('Title')
    expect(out).toContain('para')
    expect(out).toContain('item')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('exfil()')
    expect(out).not.toContain('onclick')
  })
})
