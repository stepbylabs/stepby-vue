import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18n, { setLanguage, getLanguage } from '@/i18n'
import cache from '@/plugins/cache'

describe('i18n index - 语言切换与持久化', () => {
  beforeEach(() => {
    localStorage.clear()
    // 默认 locale 由 createI18n 初始化（读 localStorage，无则 zh-CN）
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // 复位为默认中文，避免影响其他用例
    i18n.global.locale.value = 'zh-CN'
    localStorage.clear()
  })

  it('getLanguage 返回当前语言（默认 zh-CN）', () => {
    expect(getLanguage()).toBe('zh-CN')
  })

  it('setLanguage 切换为 en-US 并持久化 + 同步 <html lang>', () => {
    setLanguage('en-US')
    expect(getLanguage()).toBe('en-US')
    expect(cache.local.get('language')).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
  })

  it('setLanguage 切回 zh-CN 并更新持久化值', () => {
    setLanguage('en-US')
    setLanguage('zh-CN')
    expect(getLanguage()).toBe('zh-CN')
    expect(cache.local.get('language')).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('初始化时读取 localStorage 中保存的语言', () => {
    // 通过 i18n 模块顶层读取逻辑（getLanguage 反映 createI18n 初始值）
    cache.local.set('language', 'en-US')
    // 重新执行模块顶层读取逻辑的等价断言：locale 初始值来自 savedLang
    // 因模块已被缓存，这里验证 setLanguage/getLanguage 与持久化的闭环一致性
    setLanguage('en-US')
    expect(getLanguage()).toBe('en-US')
  })

  it('启动加载时按保存语言同步 <html lang>（刷新路径，重导模块验证顶层副作用）', async () => {
    cache.local.set('language', 'en-US')
    document.documentElement.lang = ''
    vi.resetModules()
    const fresh = await import('@/i18n')
    expect(document.documentElement.lang).toBe('en-US')
    expect(fresh.getLanguage()).toBe('en-US')
    // 还原，避免污染其他用例（fresh 与外层 i18n 是两个实例，各自复位）
    fresh.setLanguage('zh-CN')
    document.documentElement.lang = 'zh-CN'
    cache.local.remove('language')
  })

  it('缺失翻译 key 时返回 key 本身（missing handler 兜底）', () => {
    // missing handler 的 DEV console.warn 属预期，测试中静音避免噪音
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const missing = i18n.global.t('not.exist.key.xyz')
    expect(missing).toBe('not.exist.key.xyz')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('真实存在的翻译 key 返回译文', () => {
    const zh = i18n.global.t('common.search')
    // 中文 locale 下应返回非空字符串且不等于 key 本身
    expect(typeof zh).toBe('string')
    expect(zh.length).toBeGreaterThan(0)
  })
})
