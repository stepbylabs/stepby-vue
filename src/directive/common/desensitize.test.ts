/**
 * v-desensitize 敏感数据脱敏指令单元测试
 *
 * 重点回归（安全审查轮修复）：beforeMount 必须记录 `_desensitized` 基线。
 * 缺陷真相：基线缺失时每次 updated（父组件任意重渲染触发）都把已脱敏结果
 * 当作"新原文"重新走脱敏——显示值因各规则对自身输出幂等而侥幸不变，但
 * `_rawContent`（原始内容仅存内存的契约）被已脱敏值污染、每次 patch 冗余
 * 重算，且行为依赖规则幂等巧合（规则一旦调整为非幂等立即劣化为数据破坏）。
 */

import { describe, expect, it } from 'vitest'
import directive, { desensitize } from './desensitize'
import type { DesensitizeType } from './desensitize'
import type { DirectiveBinding } from 'vue'

interface TestEl {
  textContent: string
  _rawContent?: string
  _desensitized?: string
  attrs: Record<string, string>
}

/** 最小元素假体：textContent 直接赋值 + setAttribute 落到 attrs 便于断言 */
function makeEl(text: string): HTMLElement {
  const el = { textContent: text, attrs: {} } as TestEl
  const host = el as unknown as HTMLElement
  host.setAttribute = (key: string, value: string) => {
    el.attrs[key] = value
  }
  return host
}

function binding(value: string | { type: string }): DirectiveBinding {
  return { value } as unknown as DirectiveBinding
}

describe('DESSENSITIZE_RULES 纯函数', () => {
  it('email 保留首字符（星数 = 原名长-1）+ 域名', () => {
    // 'alice' 5 字符 → 'a' + 4 星
    expect(desensitize('alice@example.com', { type: 'email' })).toBe('a****@example.com')
    // 单字符名 → 单星
    expect(desensitize('b@test.com', { type: 'email' })).toBe('*@test.com')
    // 无 @ 时原样返回（不破坏非邮箱文本）
    expect(desensitize('not-an-email', { type: 'email' })).toBe('not-an-email')
  })

  it('phone / idCard / bankCard 规则输出形态', () => {
    expect(desensitize('13812348888', { type: 'phone' })).toBe('138****8888')
    expect(desensitize('110101199001011234', { type: 'idCard' })).toBe('110101********1234')
    expect(desensitize('6222020200112233', { type: 'bankCard' })).toBe('6222 **** **** 2233')
  })

  it('address 保留前 6 码元 + min(剩余,10) 定长掩码', () => {
    // 12 码元：substring(0,6)='北京市朝阳区' + 6 星
    expect(desensitize('北京市朝阳区建国路99号', { type: 'address' })).toBe('北京市朝阳区******')
  })

  it('各规则对自身输出幂等（updated 二次处理显示值不变的现实前提）', () => {
    const cases: Array<[string, { type: DesensitizeType }]> = [
      ['alice@example.com', { type: 'email' }],
      ['北京市朝阳区建国路99号', { type: 'address' }],
      ['13812348888', { type: 'phone' }],
      ['110101199001011234', { type: 'idCard' }],
      ['6222020200112233', { type: 'bankCard' }],
      ['张三丰', { type: 'name' }]
    ]
    for (const [input, opts] of cases) {
      const once = desensitize(input, opts)
      expect(desensitize(once, opts)).toBe(once)
    }
  })
})

describe('v-desensitize 指令生命周期', () => {
  it('beforeMount：脱敏写入 DOM，原始内容仅存内存，并记录已脱敏基线', () => {
    const el = makeEl('alice@example.com')
    directive.beforeMount!(el, binding('email'))
    expect(el.textContent).toBe('a****@example.com')
    const dEl = el as unknown as TestEl
    expect(dEl._rawContent).toBe('alice@example.com')
    expect(dEl._desensitized).toBe('a****@example.com')
    expect(dEl.attrs['title']).toBeTruthy()
  })

  it('核心回归：数据未变化时 updated 不得污染 _rawContent（email）', () => {
    const el = makeEl('alice@example.com')
    directive.beforeMount!(el, binding('email'))
    // 模拟父组件重渲染但文本未变化（Vue 不重写 textContent，updated 被调用）
    directive.updated!(el, binding('email'))
    expect(el.textContent).toBe('a****@example.com')
    const dEl = el as unknown as TestEl
    // 基线修复后：命中"文本 = 已脱敏结果"短路分支，_rawContent 保持原文不被污染
    expect(dEl._rawContent).toBe('alice@example.com')
    // 连续多次 patch 行为稳定
    directive.updated!(el, binding('email'))
    directive.updated!(el, binding('email'))
    expect(el.textContent).toBe('a****@example.com')
    expect(dEl._rawContent).toBe('alice@example.com')
  })

  it('核心回归：数据未变化时 updated 行为稳定（address，含中文码元语义）', () => {
    const el = makeEl('北京市朝阳区建国路99号')
    directive.beforeMount!(el, binding('address'))
    expect(el.textContent).toBe('北京市朝阳区******')
    directive.updated!(el, binding('address'))
    directive.updated!(el, binding('address'))
    expect(el.textContent).toBe('北京市朝阳区******')
    expect((el as unknown as TestEl)._rawContent).toBe('北京市朝阳区建国路99号')
  })

  it('数据变化时 updated 以新原文重新脱敏并刷新基线', () => {
    const el = makeEl('alice@example.com')
    directive.beforeMount!(el, binding('email'))
    // Vue 响应式更新把新原文写入 textContent
    el.textContent = 'bob.smith@test.com'
    directive.updated!(el, binding('email'))
    expect(el.textContent).toBe('b********@test.com')
    // 新基线同步刷新：_rawContent 跟随新原文，再次空 patch 不扰动
    const dEl = el as unknown as TestEl
    expect(dEl._rawContent).toBe('bob.smith@test.com')
    directive.updated!(el, binding('email'))
    expect(el.textContent).toBe('b********@test.com')
    expect(dEl._rawContent).toBe('bob.smith@test.com')
  })

  it('对象参数形态不受基线修复影响', () => {
    const el = makeEl('110101199001011234')
    directive.beforeMount!(el, binding({ type: 'idCard' }))
    expect(el.textContent).toBe('110101********1234')
    directive.updated!(el, binding({ type: 'idCard' }))
    expect(el.textContent).toBe('110101********1234')
  })
})
