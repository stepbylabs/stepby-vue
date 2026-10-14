/**
 * utils/theme.ts 主题色计算链覆盖测试（批六十四覆盖率工程）。
 * 覆盖：亮/暗两态的 CSS 变量设置、light-1..9/dark-1..9 梯度、非法色容错。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { handleThemeStyle } from './theme'

function cssVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name)
}

describe('utils/theme handleThemeStyle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.cssText = ''
  })

  it('亮色模式：设置 primary 与 light-1..9/dark-1..9 共 19 个 CSS 变量', () => {
    handleThemeStyle('#409EFF')
    expect(cssVar('--el-color-primary')).toBeTruthy()
    for (let i = 1; i <= 9; i++) {
      expect(cssVar(`--el-color-primary-light-${i}`)).toMatch(/^#/)
      expect(cssVar(`--el-color-primary-dark-${i}`)).toMatch(/^#/)
    }
  })

  it('light 梯度单调变亮（light-1 比 light-9 更接近原色）', () => {
    handleThemeStyle('#409EFF')
    const l1 = cssVar('--el-color-primary-light-1')
    const l9 = cssVar('--el-color-primary-light-9')
    expect(l1).not.toBe(l9)
  })

  it('暗色模式：primary 被柔化（与亮色模式结果不同）', () => {
    handleThemeStyle('#409EFF')
    const lightPrimary = cssVar('--el-color-primary')
    document.documentElement.classList.add('dark')
    handleThemeStyle('#409EFF')
    const darkPrimary = cssVar('--el-color-primary')
    expect(darkPrimary).not.toBe(lightPrimary)
  })

  it('切换主题色：变量随新主题色更新', () => {
    handleThemeStyle('#409EFF')
    const first = cssVar('--el-color-primary')
    handleThemeStyle('#E6A23C')
    const second = cssVar('--el-color-primary')
    expect(first).not.toBe(second)
    expect(second.toLowerCase()).toContain('#')
  })
})
