import { describe, it, expect } from 'vitest'
import { parsePatTime, computeExpiryInfo, isRevoked, expiryTagType, summarizeScopes } from './patUtils'

describe('patUtils.parsePatTime', () => {
  it('解析后端 naive 时间字符串', () => {
    const d = parsePatTime('2026-09-22 10:30:00')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(8) // 0-based：9 月
    expect(d!.getDate()).toBe(22)
    expect(d!.getHours()).toBe(10)
  })
  it('空/非法输入返回 null', () => {
    expect(parsePatTime(null)).toBeNull()
    expect(parsePatTime('')).toBeNull()
    expect(parsePatTime('not-a-date')).toBeNull()
  })
})

describe('patUtils.computeExpiryInfo', () => {
  const now = new Date('2026-09-22T00:00:00')
  it('无过期时间 → never', () => {
    expect(computeExpiryInfo(null, now)).toEqual({ status: 'never', days: null })
    expect(computeExpiryInfo(undefined, now)).toEqual({ status: 'never', days: null })
    expect(computeExpiryInfo('', now)).toEqual({ status: 'never', days: null })
  })
  it('已过期 → expired, days=0', () => {
    expect(computeExpiryInfo('2026-09-21 00:00:00', now)).toEqual({ status: 'expired', days: 0 })
  })
  it('刚好到期边界（ms<=0）→ expired', () => {
    expect(computeExpiryInfo('2026-09-22 00:00:00', now)).toEqual({ status: 'expired', days: 0 })
  })
  it('3 天后 → soon', () => {
    const info = computeExpiryInfo('2026-09-25 00:00:00', now)
    expect(info.status).toBe('soon')
    expect(info.days).toBe(3)
  })
  it('30 天后 → active', () => {
    const info = computeExpiryInfo('2026-10-22 00:00:00', now)
    expect(info.status).toBe('active')
    expect(info.days).toBe(30)
  })
  it('阈值可自定义', () => {
    expect(computeExpiryInfo('2026-09-25 00:00:00', now, 2).status).toBe('active')
    expect(computeExpiryInfo('2026-09-25 00:00:00', now, 5).status).toBe('soon')
  })
  it('非法过期串降级为 never', () => {
    expect(computeExpiryInfo('garbage', now)).toEqual({ status: 'never', days: null })
  })
})

describe('patUtils.isRevoked', () => {
  it("status='1' 视为已吊销", () => {
    expect(isRevoked('1')).toBe(true)
    expect(isRevoked('0')).toBe(false)
    expect(isRevoked(null)).toBe(false)
    expect(isRevoked(undefined)).toBe(false)
  })
})

describe('patUtils.expiryTagType', () => {
  it('映射到 Element Plus tag 类型', () => {
    expect(expiryTagType('expired')).toBe('danger')
    expect(expiryTagType('soon')).toBe('warning')
    expect(expiryTagType('never')).toBe('info')
    expect(expiryTagType('active')).toBe('success')
  })
})

describe('patUtils.summarizeScopes', () => {
  it('全权 scope 归并为单一项', () => {
    const r = summarizeScopes(['*:*:*', 'system:user:list'])
    expect(r.all).toBe(true)
    expect(r.list).toEqual(['*:*:*'])
  })
  it('受限 scope 原样返回副本', () => {
    const src = ['system:config:list', 'monitor:*:*']
    const r = summarizeScopes(src)
    expect(r.all).toBe(false)
    expect(r.list).toEqual(src)
    expect(r.list).not.toBe(src) // 返回新数组，不泄漏入参
  })
})
