import { describe, it, expect, vi } from 'vitest'

// Mock @/i18n to avoid loading real i18n + pinia heavy deps
const { t, te } = vi.hoisted(() => ({
  t: vi.fn((key: string) => `T:${key}`),
  te: vi.fn((key: string) => key.startsWith('menu.'))
}))
vi.mock('@/i18n', () => ({
  default: { global: { t, te } }
}))

import { translateTitle, useMenuTitle } from './useMenuTitle'

describe('composables/useMenuTitle', () => {
  it('returns empty string for missing meta', () => {
    expect(translateTitle()).toBe('')
    expect(translateTitle(null)).toBe('')
  })

  it('translates when i18nKey exists and is known', () => {
    expect(translateTitle({ i18nKey: 'menu.system', title: 'System' })).toBe('T:menu.system')
    expect(t).toHaveBeenCalledWith('menu.system')
  })

  it('falls back to raw title when i18nKey unknown', () => {
    expect(translateTitle({ i18nKey: 'unknown.key', title: 'Raw' })).toBe('Raw')
  })

  it('falls back to title when no i18nKey', () => {
    expect(translateTitle({ title: 'Dashboard' })).toBe('Dashboard')
  })

  it('returns empty string when neither i18nKey nor title', () => {
    expect(translateTitle({})).toBe('')
  })

  it('falls back to title when t() throws', () => {
    te.mockImplementationOnce(() => true)
    t.mockImplementationOnce(() => {
      throw new Error('compile error')
    })
    expect(translateTitle({ i18nKey: 'menu.boom', title: 'Boom' })).toBe('Boom')
  })

  it('useMenuTitle exposes translateTitle', () => {
    const { translateTitle: fn } = useMenuTitle()
    expect(fn({ title: 'X' })).toBe('X')
  })
})
