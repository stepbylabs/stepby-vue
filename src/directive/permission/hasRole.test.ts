/**
 * v-hasRole 指令分支单测（批七十二）
 *
 * 与 [`hasPermi.test`](./hasPermi.test.ts) 同族：本指令掌控全站"按角色放开"的入口
 * （超管专属面板、平台代管操作区），故必须与 v-hasPermi 保持**完全一致的隐藏/恢复口径**。
 * 锁定点：
 * 1. 入参非数组 / 空数组 ⇒ 隐藏（P0-47 白屏回归）；
 * 2. 角色集合为空 ⇒ 隐藏（冷加载期 fail-safe）；
 * 3. `admin` 超管角色 ⇒ 命中任意角色要求（前端不得裸 `roles.includes()`，否则超管入口全灭）；
 * 4. 恢复原始 display 而非 `''`（P1，与 v-hasPermi 同修）。
 */

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import hasPermi from './hasPermi'
import hasRole from './hasRole'

const mocks = vi.hoisted(() => ({ roles: [] as string[], permissions: [] as string[] }))

vi.mock('@/store/modules/user', () => ({
  default: () => ({ roles: mocks.roles, permissions: mocks.permissions })
}))

function makeEl(display = 'inline-flex'): HTMLElement {
  const el = document.createElement('button')
  el.style.display = display
  return el
}

function binding(value: unknown) {
  return { value } as unknown as Parameters<typeof hasRole.mounted>[1]
}

beforeEach(() => {
  mocks.roles = []
  mocks.permissions = []
})

describe('① 入参校验分支', () => {
  it.each([
    ['undefined', undefined],
    ['空数组', []],
    ['非数组字符串', 'admin'],
    ['非数组对象', { role: 'admin' }]
  ])('value = %s ⇒ 隐藏且不抛错', (_name, value) => {
    const el = makeEl()
    expect(() => hasRole.mounted(el, binding(value))).not.toThrow()
    expect(el.style.display).toBe('none')
  })

  it('入参非法时即使持有 admin 也保持隐藏', () => {
    mocks.roles = ['admin']
    const el = makeEl()
    hasRole.mounted(el, binding([]))
    expect(el.style.display).toBe('none')
  })
})

describe('② 角色集合为空', () => {
  it('隐藏元素（用户信息尚未加载时的 fail-safe）', () => {
    const el = makeEl()
    hasRole.mounted(el, binding(['admin']))
    expect(el.style.display).toBe('none')
  })
})

describe('③ 判定矩阵', () => {
  it.each<[string, string[], string[], boolean]>([
    ['超管 admin 命中任意角色要求', ['admin'], ['tenant:owner'], true],
    ['显式角色命中', ['editor'], ['editor'], true],
    ['多角色任一命中即显示', ['viewer', 'editor'], ['editor'], true],
    ['角色不符隐藏', ['viewer'], ['editor'], false],
    ['空串角色不误命中', [''], ['editor'], false],
    ['前缀相似不算命中', ['editorx'], ['editor'], false],
    ['大小写敏感（ADMIN 不是 admin）', ['ADMIN'], ['admin'], false]
  ])('%s', (_name, owned, required, shouldShow) => {
    mocks.roles = owned
    const el = makeEl()
    hasRole.mounted(el, binding(required))
    expect(el.style.display).toBe(shouldShow ? 'inline-flex' : 'none')
  })
})

describe('④ 原始 display 恢复（P1 回归锁）', () => {
  it('先隐藏后放行 ⇒ 还原缓存的原始 display', () => {
    const el = makeEl('inline-flex')
    mocks.roles = []
    hasRole.mounted(el, binding(['editor']))
    expect(el.style.display).toBe('none')

    mocks.roles = ['editor']
    hasRole.updated(el, binding(['editor']))
    expect(el.style.display, '必须还原原始 display 而非写空串').toBe('inline-flex')
  })

  it('基线按元素隔离', () => {
    const a = makeEl('flex')
    const b = makeEl('block')
    mocks.roles = ['editor']
    hasRole.mounted(a, binding(['editor']))
    hasRole.mounted(b, binding(['editor']))
    expect(a.style.display).toBe('flex')
    expect(b.style.display).toBe('block')
  })
})

describe('⑤ 两指令口径一致（禁止分叉）', () => {
  const drivers = [['v-hasPermi', hasPermi, 'permissions'] as const, ['v-hasRole', hasRole, 'roles'] as const]

  it.each(drivers)('%s：钩子集只有 mounted/updated，且二者同源', (_name, dir) => {
    expect(Object.keys(dir).sort()).toEqual(['mounted', 'updated'])
    // updated 与 mounted 必须走同一判定体（否则权限热切换出现口径漂移）
    const owned = dir === hasPermi ? 'permissions' : 'roles'
    mocks[owned] = ['x']
    const shown = makeEl('flex')
    dir.mounted(shown, binding(['x']))
    const hidden = makeEl('flex')
    dir.mounted(hidden, binding(['y']))
    mocks[owned] = ['x', 'y']
    dir.updated(shown, binding(['x']))
    dir.updated(hidden, binding(['y']))
    expect(shown.style.display).toBe('flex')
    expect(hidden.style.display).toBe('flex')
  })

  it.each(drivers)('%s：入参非法 ⇒ 隐藏（与对侧一致）', (_name, dir) => {
    const el = makeEl()
    dir.mounted(el, binding(undefined))
    expect(el.style.display).toBe('none')
  })
})

describe('⑥ 形状总锁：隐藏必须经基线前置的 hide()', () => {
  // 缺陷形态（b72 实证）：任何一处裸写 `el.style.display = 'none'` 都绕过了基线采集，
  // 使该分支之后再也恢复不回原值 → 入口永久不可见。复现即刻红。
  const sources = [
    ['hasPermi.ts', readFileSync(join(process.cwd(), 'src/directive/permission/hasPermi.ts'), 'utf8')],
    ['hasRole.ts', readFileSync(join(process.cwd(), 'src/directive/permission/hasRole.ts'), 'utf8')]
  ] as const

  it.each(sources)('%s：hide() 先采集基线，且裸写 display:none 仅 1 处', (_name, text) => {
    expect(text, 'hide() 必须先 getOriginalDisplay 再写 none').toMatch(
      /function hide\(el: HTMLElement\): void \{\s*\n\s*getOriginalDisplay\(el\)/
    )
    const bare = text.split('\n').filter((l) => l.includes(".style.display = 'none'"))
    expect(bare, "裸写 display:none 只允许 hide() 内那一行").toHaveLength(1)
  })
})
