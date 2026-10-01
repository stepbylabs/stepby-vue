import { describe, it, expect } from 'vitest'
import { normalizePhoneNumber, isValidPhoneByRegion, isPossiblePhoneByRegion, formatPhoneByRegion } from './phone'

describe('normalizePhoneNumber', () => {
  it('去除分隔符仅保留数字与 +', () => {
    expect(normalizePhoneNumber('138 0013 8000')).toBe('13800138000')
    expect(normalizePhoneNumber('+86 138-0013-8000')).toBe('+8613800138000')
    expect(normalizePhoneNumber('(010) 1234-5678')).toBe('01012345678')
  })
})

describe('isValidPhoneByRegion - 各地区合法/非法样例', () => {
  it('CN', () => {
    expect(isValidPhoneByRegion('13800138000', 'CN')).toBe(true)
    expect(isValidPhoneByRegion('12345', 'CN')).toBe(false)
  })
  it('HK', () => {
    expect(isValidPhoneByRegion('51234567', 'HK')).toBe(true)
    expect(isValidPhoneByRegion('123', 'HK')).toBe(false)
  })
  it('US', () => {
    expect(isValidPhoneByRegion('2015550123', 'US')).toBe(true)
    expect(isValidPhoneByRegion('123', 'US')).toBe(false)
  })
  it('MO', () => {
    expect(isValidPhoneByRegion('66123456', 'MO')).toBe(true)
    expect(isValidPhoneByRegion('123', 'MO')).toBe(false)
  })
  it('TW', () => {
    expect(isValidPhoneByRegion('0912345678', 'TW')).toBe(true)
    expect(isValidPhoneByRegion('123', 'TW')).toBe(false)
  })
  it('GB', () => {
    expect(isValidPhoneByRegion('7400123456', 'GB')).toBe(true)
    expect(isValidPhoneByRegion('123', 'GB')).toBe(false)
  })
  it('JP', () => {
    expect(isValidPhoneByRegion('09012345678', 'JP')).toBe(true)
    expect(isValidPhoneByRegion('123', 'JP')).toBe(false)
  })
  it('缺省地区回退 CN', () => {
    expect(isValidPhoneByRegion('13800138000', '')).toBe(true)
    expect(isValidPhoneByRegion('', 'CN')).toBe(false)
  })
})

describe('isPossiblePhoneByRegion', () => {
  it('完整合法应判可能', () => {
    expect(isPossiblePhoneByRegion('13800138000', 'CN')).toBe(true)
  })
  it('明显过短应判不可能', () => {
    expect(isPossiblePhoneByRegion('12', 'CN')).toBe(false)
  })
  it('缺省地区回退 CN（region 为空串走 || 兜底）', () => {
    expect(isPossiblePhoneByRegion('13800138000', '')).toBe(true)
    expect(isPossiblePhoneByRegion('12', '')).toBe(false)
  })
})

describe('formatPhoneByRegion', () => {
  it('按地区实时格式化', () => {
    expect(formatPhoneByRegion('1380013', 'CN')).toContain('138')
    expect(formatPhoneByRegion('abc', 'CN')).toBe('') // 归一化后为空
  })
  it('缺省地区回退 CN（region 为空串走 || 兜底）', () => {
    expect(formatPhoneByRegion('1380013', '')).toContain('138')
  })
})

describe('phone - 异常地区/非法输入走 catch 兜底', () => {
  it('未知地区代码时 isValidPhoneByRegion 返回 false（不抛异常）', () => {
    expect(isValidPhoneByRegion('13800138000', 'XX')).toBe(false)
  })

  it('未知地区代码时 isPossiblePhoneByRegion 返回 false（不抛异常）', () => {
    expect(isPossiblePhoneByRegion('13800138000', 'XX')).toBe(false)
  })

  it('未知地区代码时 formatPhoneByRegion 回退为归一化结果（不抛异常）', () => {
    expect(formatPhoneByRegion('138-0013-8000', 'XX')).toBe('13800138000')
  })

  it('空串输入直接返回 false（归一化后为空）', () => {
    expect(isValidPhoneByRegion('', 'CN')).toBe(false)
    expect(isPossiblePhoneByRegion('', 'CN')).toBe(false)
  })
})
