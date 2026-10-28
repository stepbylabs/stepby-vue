/**
 * 跨标签页广播通道（b122）。
 *
 * 通道本身不产生业务效果，但它是"会话结束/身份变更"唯一的跨页信号——
 * 解析过宽会把畸形存储当成指令，过窄会让合法事件静默丢失，两种都要钉住。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CROSS_TAB_KEY,
  announceIdentityIfChanged,
  announceLanguageChanged,
  announceSessionEnded,
  installCrossTabSync,
  parseCrossTabEvent,
  type CrossTabEvent
} from './crossTab'

function event(partial: Record<string, unknown>): string {
  return JSON.stringify(partial)
}

describe('utils/crossTab', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('parseCrossTabEvent', () => {
    it('三类合法事件各自解析出必要字段', () => {
      expect(parseCrossTabEvent(event({ type: 'session-ended', at: 1, reason: 'logout' }))).toEqual({
        type: 'session-ended',
        at: 1,
        reason: 'logout'
      })
      expect(parseCrossTabEvent(event({ type: 'identity-changed', at: 2, userId: '  u-1 ' }))).toEqual({
        type: 'identity-changed',
        at: 2,
        userId: 'u-1'
      })
      expect(parseCrossTabEvent(event({ type: 'language-changed', at: 3, locale: 'en-US' }))).toEqual({
        type: 'language-changed',
        at: 3,
        locale: 'en-US'
      })
    })

    it('非字符串 / 空串 / 坏 JSON / 非对象一律 null', () => {
      expect(parseCrossTabEvent(null)).toBeNull()
      expect(parseCrossTabEvent(undefined)).toBeNull()
      expect(parseCrossTabEvent('')).toBeNull()
      expect(parseCrossTabEvent('{oops')).toBeNull()
      expect(parseCrossTabEvent('[1,2]')).toBeNull()
      expect(parseCrossTabEvent('"session-ended"')).toBeNull()
    })

    it('未知类型、坏的 at、缺字段、值域外语言一律 null（不被畸形存储驱动）', () => {
      expect(parseCrossTabEvent(event({ type: 'reboot', at: 1 }))).toBeNull()
      expect(parseCrossTabEvent(event({ type: 'session-ended', at: 0, reason: 'logout' }))).toBeNull()
      expect(parseCrossTabEvent(event({ type: 'session-ended', at: Number.NaN, reason: 'logout' }))).toBeNull()
      expect(parseCrossTabEvent(event({ type: 'session-ended', at: 1, reason: 'other' }))).toBeNull()
      expect(parseCrossTabEvent(event({ type: 'identity-changed', at: 1, userId: '   ' }))).toBeNull()
      expect(parseCrossTabEvent(event({ type: 'identity-changed', at: 1 }))).toBeNull()
      expect(parseCrossTabEvent(event({ type: 'language-changed', at: 1, locale: 'fr' }))).toBeNull()
    })
  })

  describe('announce*', () => {
    it('session-ended 写入可被自身解析回来的记录', () => {
      expect(announceSessionEnded('expired')).toBe(true)
      const parsed = parseCrossTabEvent(localStorage.getItem(CROSS_TAB_KEY))
      expect(parsed).toMatchObject({ type: 'session-ended', reason: 'expired' })
    })

    it('语言广播只接受两个已知值（写入侧就不产生畸形）', () => {
      expect(announceLanguageChanged('en-US')).toBe(true)
      expect(parseCrossTabEvent(localStorage.getItem(CROSS_TAB_KEY))).toMatchObject({
        type: 'language-changed',
        locale: 'en-US'
      })
    })

    it('身份未变化时不重复写盘（冷加载不打扰其他标签页）', () => {
      expect(announceIdentityIfChanged('u-1')).toBe(true)
      const first = localStorage.getItem(CROSS_TAB_KEY)
      expect(announceIdentityIfChanged('u-1')).toBe(false)
      expect(localStorage.getItem(CROSS_TAB_KEY)).toBe(first)
      expect(announceIdentityIfChanged('u-2')).toBe(true)
      expect(parseCrossTabEvent(localStorage.getItem(CROSS_TAB_KEY))).toMatchObject({ userId: 'u-2' })
    })

    it('空 userId 不写盘', () => {
      expect(announceIdentityIfChanged('   ')).toBe(false)
      expect(localStorage.getItem(CROSS_TAB_KEY)).toBeNull()
    })
  })

  describe('installCrossTabSync', () => {
    it('只分发频道键上的合法事件，卸载后不再分发', () => {
      const got: CrossTabEvent[] = []
      const off = installCrossTabSync((e) => got.push(e))
      const fire = (key: string, newValue: string | null) => {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: window.localStorage }))
      }
      fire('other-key', event({ type: 'session-ended', at: 1, reason: 'logout' }))
      fire(CROSS_TAB_KEY, 'broken')
      fire(CROSS_TAB_KEY, event({ type: 'language-changed', at: 2, locale: 'zh-CN' }))
      expect(got).toHaveLength(1)
      expect(got[0]).toMatchObject({ type: 'language-changed', locale: 'zh-CN' })
      off()
      fire(CROSS_TAB_KEY, event({ type: 'session-ended', at: 3, reason: 'logout' }))
      expect(got).toHaveLength(1)
    })

    it('键被删除（newValue=null）不当作事件', () => {
      const dispatch = vi.fn()
      const off = installCrossTabSync(dispatch)
      window.dispatchEvent(
        new StorageEvent('storage', { key: CROSS_TAB_KEY, newValue: null, storageArea: window.localStorage })
      )
      expect(dispatch).not.toHaveBeenCalled()
      off()
    })

    it('sessionStorage 上的同名键不参与（sessionStorage 按标签页隔离，同步无效）', () => {
      const dispatch = vi.fn()
      const off = installCrossTabSync(dispatch)
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: CROSS_TAB_KEY,
          newValue: event({ type: 'session-ended', at: 1, reason: 'logout' }),
          storageArea: window.sessionStorage
        })
      )
      expect(dispatch).not.toHaveBeenCalled()
      off()
    })
  })
})
