import { describe, it, expect } from 'vitest'
import {
  sanitizeUserPrefs,
  resolveTableColumns,
  USER_PREFS_KEYS,
  DEFAULT_USER_PREFS,
  type UserPrefs
} from '@/utils/userPrefs'

describe('sanitizeUserPrefs', () => {
  it('非对象（原始类型）应返回空对象', () => {
    expect(sanitizeUserPrefs(42)).toEqual({})
    expect(sanitizeUserPrefs('string')).toEqual({})
    expect(sanitizeUserPrefs(true)).toEqual({})
    expect(sanitizeUserPrefs(undefined)).toEqual({})
  })

  it('null 应返回空对象', () => {
    expect(sanitizeUserPrefs(null)).toEqual({})
  })

  it('仅含已知键的对象应原样返回这些键', () => {
    const input = {
      defaultPageSize: 20,
      defaultSortOrder: 'asc' as const,
      autoRefreshInterval: 30,
      followSystemDark: true,
      tableDensity: 'compact' as const,
      timezone: 'UTC',
      customHotkeys: { search: 'ctrl_k' },
      watermarkEnabled: true,
      sessionTimeout: 15,
      tableColumns: { 'system:user': ['userName'] },
      mobileTableCards: true
    }
    const result = sanitizeUserPrefs(input)
    expect(result).toEqual(input)
    // 返回结果键集合应等于 USER_PREFS_KEYS
    expect(Object.keys(result).sort()).toEqual([...USER_PREFS_KEYS].sort())
  })

  it('D8: mobileTableCards 默认为 false（默认安全=横滚策略），白名单可透传开启值', () => {
    expect(DEFAULT_USER_PREFS.mobileTableCards).toBe(false)
    const result = sanitizeUserPrefs({ mobileTableCards: true })
    expect(result.mobileTableCards).toBe(true)
    const off = sanitizeUserPrefs({ mobileTableCards: false })
    expect(off.mobileTableCards).toBe(false)
  })

  it('含未知键的对象应只保留白名单字段', () => {
    const input = {
      defaultPageSize: 20,
      evilKey: 'should-be-dropped',
      anotherUnknown: 123,
      timezone: 'Asia/Tokyo'
    }
    const result = sanitizeUserPrefs(input)
    expect(result).toEqual({ defaultPageSize: 20, timezone: 'Asia/Tokyo' })
    expect('evilKey' in result).toBe(false)
    expect('anotherUnknown' in result).toBe(false)
  })

  it('部分已知键（稀疏对象）应只返回存在的已知键', () => {
    const input = { watermarkEnabled: true }
    const result = sanitizeUserPrefs(input)
    expect(result).toEqual({ watermarkEnabled: true })
    expect(Object.keys(result)).toHaveLength(1)
  })

  it('应防御原型污染：__proto__ 等未知键不被复制且原型不被污染', () => {
    const before = (Object.prototype as Record<string, unknown>).polluted
    const input = JSON.parse(
      '{"defaultPageSize":5,"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}'
    )
    const result = sanitizeUserPrefs(input)
    // 已知键保留
    expect(result.defaultPageSize).toBe(5)
    // 结果仅含白名单自有键：危险键（__proto__ / constructor）绝未被当作自有属性写入
    expect(Object.keys(result)).toEqual(['defaultPageSize'])
    expect((result as Record<string, unknown>).polluted).toBeUndefined()
    // 全局 Object.prototype 未被污染（核心防护目标）
    expect((Object.prototype as Record<string, unknown>).polluted).toBe(before)
    expect((Object.prototype as Record<string, unknown>).x).toBeUndefined()
  })

  it('白名单内键即使类型不符也会被原样复制（类型校验由调用方负责）', () => {
    const input = { defaultPageSize: 'not-a-number' as unknown, timezone: 12345 as unknown }
    const result = sanitizeUserPrefs(input)
    expect((result as Record<string, unknown>).defaultPageSize).toBe('not-a-number')
    expect((result as Record<string, unknown>).timezone).toBe(12345)
  })

  it('DEFAULT_USER_PREFS 应包含全部白名单键', () => {
    for (const key of USER_PREFS_KEYS) {
      expect(key in DEFAULT_USER_PREFS).toBe(true)
    }
    expect(Object.keys(DEFAULT_USER_PREFS).length).toBe(USER_PREFS_KEYS.length)
  })
})

// 确保 UserPrefs 类型在编译期可用（防止误删导出）
export type _CheckUserPrefs = UserPrefs

describe('resolveTableColumns（UX-7 列显隐偏好解析）', () => {
  const cols = [
    { key: 'userName' },
    { key: 'nickName' },
    { key: 'status', defaultVisible: false },
    { key: 'createTime' }
  ]

  it('无存档时应返回 defaultVisible !== false 的列', () => {
    expect(resolveTableColumns(undefined, cols)).toEqual(['userName', 'nickName', 'createTime'])
  })

  it('有存档时按列定义顺序返回「存档 ∩ 现有列」', () => {
    expect(resolveTableColumns(['createTime', 'userName'], cols)).toEqual(['userName', 'createTime'])
  })

  it('存档含已被删除的列时应自动丢弃脏 key', () => {
    expect(resolveTableColumns(['userName', 'ghostColumn'], cols)).toEqual(['userName'])
  })

  it('存档为空数组时应至少保留第一列（避免空表格）', () => {
    expect(resolveTableColumns([], cols)).toEqual(['userName'])
  })

  it('全部列都默认隐藏时应至少保留第一列', () => {
    const hidden = [{ key: 'a', defaultVisible: false }, { key: 'b', defaultVisible: false }]
    expect(resolveTableColumns(undefined, hidden)).toEqual(['a'])
  })
})
