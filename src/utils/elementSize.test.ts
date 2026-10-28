/**
 * 组件尺寸解析的回归锁（b113）。
 *
 * 立的案：`App.vue` 原先读 `Cookies.get('size')`（非响应式）而 store 里的 `size`
 * 从未被消费 ⇒ 尺寸切换只能整页刷新。本文件钉住纯函数的两条语义：
 * 1. 值域外/缺失一律归一成 `''`（未设置），不得把任意串喂给 Element Plus；
 * 2. 有合法偏好时尊重用户，没有时桌面 `default` / 手机 `large`。
 */
import { describe, expect, it } from 'vitest'
import { ELEMENT_SIZES, normalizeElementSize, resolveElementSize } from './elementSize'

describe('normalizeElementSize', () => {
  it('三档合法值原样返回', () => {
    expect(ELEMENT_SIZES.map((s) => normalizeElementSize(s))).toEqual(['large', 'default', 'small'])
  })

  it('首尾空白归一后仍合法', () => {
    expect(normalizeElementSize('  small ')).toBe('small')
  })

  it('非法串/非字符串一律归一成空（不得透传给 Element Plus）', () => {
    for (const bad of ['huge', '', '   ', 'Large', 'default;', null, undefined, 42, {}, []]) {
      expect(normalizeElementSize(bad)).toBe('')
    }
  })
})

describe('resolveElementSize', () => {
  it('用户显式选择优先，且与视口无关', () => {
    expect(resolveElementSize('small', false)).toBe('small')
    expect(resolveElementSize('small', true)).toBe('small')
    expect(resolveElementSize('large', true)).toBe('large')
  })

  it('未设置：桌面 default、手机 large（与改造前 cookie 缺失时的表现一致）', () => {
    expect(resolveElementSize('', false)).toBe('default')
    expect(resolveElementSize('', true)).toBe('large')
    expect(resolveElementSize(null, true)).toBe('large')
  })

  it('非法值等同未设置（fail-safe：宁可按视口兜底，也不把怪值传给组件库）', () => {
    expect(resolveElementSize('gigantic', false)).toBe('default')
    expect(resolveElementSize('gigantic', true)).toBe('large')
  })
})
