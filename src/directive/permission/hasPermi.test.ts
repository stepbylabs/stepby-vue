/**
 * v-hasPermi 指令分支单测（批七十二）
 *
 * 锁死四类行为（均为历史缺陷形态，且全站按钮级权限都依赖本指令）：
 * 1. 入参非数组 / 空数组 ⇒ 隐藏而非抛错（P0-47 白屏回归）；
 * 2. 权限集合为空（未加载 / 无任何授权）⇒ 隐藏，不得因 `some()` 空数组为 false 之外的路径误显示；
 * 3. `*:*:*` 超管通配 ⇒ 显示（前端不得用裸 `permissions.includes()` 判定，否则超管按钮全灭）；
 * 4. **恢复的是元素原始 display 而非 `''`**（P1：原实现写死空串，把 `inline-flex` 按钮
 *    恢复成默认 display，导致权限切换后布局错乱）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import hasPermi from './hasPermi'

const mocks = vi.hoisted(() => ({ permissions: [] as string[] }))

vi.mock('@/store/modules/user', () => ({
  default: () => ({ permissions: mocks.permissions })
}))

/** 带内联 display 的真实元素：jsdom 会把内联样式计入 getComputedStyle */
function makeEl(display = 'inline-flex'): HTMLElement {
  const el = document.createElement('button')
  el.style.display = display
  return el
}

function binding(value: unknown) {
  return { value } as unknown as Parameters<typeof hasPermi.mounted>[1]
}

beforeEach(() => {
  mocks.permissions = []
})

describe('① 入参校验分支', () => {
  it.each([
    ['undefined', undefined],
    ['空数组', []],
    ['非数组字符串', 'system:user:add'],
    ['非数组对象', { perms: 'system:user:add' }]
  ])('value = %s ⇒ 隐藏且不抛错', (_name, value) => {
    const el = makeEl()
    expect(() => hasPermi.mounted(el, binding(value))).not.toThrow()
    expect(el.style.display).toBe('none')
  })

  it('入参非法时即使拥有全部权限也保持隐藏（不得因后续分支误显示）', () => {
    mocks.permissions = ['*:*:*']
    const el = makeEl()
    hasPermi.mounted(el, binding([]))
    expect(el.style.display).toBe('none')
  })
})

describe('② 权限集合为空', () => {
  it('隐藏元素（权限尚未加载完成时的 fail-safe）', () => {
    const el = makeEl()
    hasPermi.mounted(el, binding(['system:user:add']))
    expect(el.style.display).toBe('none')
  })
})

describe('③ 判定矩阵', () => {
  it.each<[string, string[], string[], 'show' | 'hide']>([
    ['超管通配 *:*:* 命中任意键', ['*:*:*'], ['system:user:add'], 'show'],
    ['显式权限命中', ['system:user:add'], ['system:user:add'], 'show'],
    ['多键任一命中即显示', ['system:user:export', 'system:user:add'], ['system:user:add'], 'show'],
    ['未授权隐藏', ['system:user:export'], ['system:user:add'], 'hide'],
    ['空串权限不误命中', [''], ['system:user:add'], 'hide'],
    ['前缀相似不算命中（非 includes 子串匹配）', ['system:user:addx'], ['system:user:add'], 'hide']
  ])('%s', (_name, owned, required, expect_) => {
    mocks.permissions = owned
    const el = makeEl()
    hasPermi.mounted(el, binding(required))
    expect(el.style.display).toBe(expect_ === 'show' ? 'inline-flex' : 'none')
  })
})

describe('④ 原始 display 恢复（P1 回归锁）', () => {
  it('先隐藏后放行 ⇒ 还原 inline-flex，而非写空串退回默认 display', () => {
    const el = makeEl('inline-flex')
    mocks.permissions = []
    hasPermi.mounted(el, binding(['system:user:add']))
    expect(el.style.display).toBe('none')

    mocks.permissions = ['system:user:add']
    hasPermi.updated(el, binding(['system:user:add']))
    // 旧实现此处得到 ''（= 默认 display），EP 的 inline-flex 按钮布局被破坏
    expect(el.style.display, '必须还原缓存的原始 display').toBe('inline-flex')
  })

  it.each(['flex', 'grid', 'inline-block', 'block'])('%s 同样按原值恢复', (display) => {
    const el = makeEl(display)
    mocks.permissions = ['a']
    hasPermi.mounted(el, binding(['a']))
    expect(el.style.display).toBe(display)
  })

  it('原始 display 基线按元素隔离（WeakMap 不得串元素）', () => {
    const a = makeEl('flex')
    const b = makeEl('inline-block')
    mocks.permissions = ['a']
    hasPermi.mounted(a, binding(['a']))
    hasPermi.mounted(b, binding(['a']))
    expect(a.style.display).toBe('flex')
    expect(b.style.display).toBe('inline-block')
  })

  it('隐藏期间基线不被覆盖：反复切换仍恢复到同一个原始值', () => {
    const el = makeEl('grid')
    mocks.permissions = ['a']
    hasPermi.mounted(el, binding(['a']))
    mocks.permissions = []
    hasPermi.updated(el, binding(['a']))
    expect(el.style.display).toBe('none')
    mocks.permissions = ['a']
    hasPermi.updated(el, binding(['a']))
    expect(el.style.display).toBe('grid')
  })
})
