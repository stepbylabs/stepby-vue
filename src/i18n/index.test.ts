import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18n, { setLanguage, getLanguage } from '@/i18n'
import { getItem } from '@/utils/webStorage'

describe('i18n index - 语言切换与持久化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // 复位为默认中文，避免影响其他用例
    i18n.global.locale.value = 'zh-CN'
    document.documentElement.lang = 'zh-CN'
    localStorage.clear()
  })

  it('getLanguage 返回当前语言（默认 zh-CN）', () => {
    expect(getLanguage()).toBe('zh-CN')
  })

  it('setLanguage 切换为 en-US 并持久化 + 同步 <html lang>（语言包真的装上）', async () => {
    const result = await setLanguage('en-US')
    expect(result).toEqual({ ok: true, applied: true, persisted: true })
    expect(getLanguage()).toBe('en-US')
    expect(getItem('language')).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
    // 语言包要是没装上，fallbackLocale 会让 t() 回落到中文——这里同时钉住"翻译真的生效"
    expect(i18n.global.t('common.search')).toBe('Search')
  })

  it('setLanguage 切回 zh-CN 并更新持久化值', async () => {
    await setLanguage('en-US')
    await setLanguage('zh-CN')
    expect(getLanguage()).toBe('zh-CN')
    expect(getItem('language')).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(i18n.global.t('common.search')).not.toBe('Search')
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
    expect(zh).not.toBe('common.search')
  })
})
