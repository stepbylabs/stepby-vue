// src/utils/fieldPerm.test.ts
// 字段级权限 M3 纯函数单测：矩阵勾选→保存参数组装 + field-hidden 过滤列
import { describe, it, expect } from 'vitest'
import {
  FIELD_PERM_TABLES,
  toCheckedMap,
  buildHiddenFields,
  isColumnVisible
} from './fieldPerm'

describe('FIELD_PERM_TABLES（白名单契约）', () => {
  it('首期仅 sys_user 表，白名单为 phonenumber/email', () => {
    expect(Object.keys(FIELD_PERM_TABLES)).toEqual(['sys_user'])
    expect(FIELD_PERM_TABLES.sys_user.map((f) => f.fieldKey)).toEqual(['phonenumber', 'email'])
    expect(FIELD_PERM_TABLES.sys_user.every((f) => f.labelKey.startsWith('role.fieldPerm.fields.'))).toBe(true)
  })
})

describe('toCheckedMap（查询响应 → 勾选状态）', () => {
  it('hidden=true 映射为勾选，hidden=false/缺失 映射为不勾选', () => {
    const map = toCheckedMap([
      { fieldKey: 'phonenumber', hidden: true },
      { fieldKey: 'email', hidden: false }
    ])
    expect(map).toEqual({ phonenumber: true, email: false })
  })
  it('null/undefined → 空映射', () => {
    expect(toCheckedMap(null)).toEqual({})
    expect(toCheckedMap(undefined)).toEqual({})
  })
  it('跳过缺失 fieldKey 的脏数据条目', () => {
    const map = toCheckedMap([
      { fieldKey: '', hidden: true },
      { fieldKey: 'email', hidden: true }
    ] as never[])
    expect(map).toEqual({ email: true })
  })
})

describe('buildHiddenFields（矩阵勾选 → 保存参数组装）', () => {
  it('仅收集勾选（true）的字段，按白名单顺序输出', () => {
    const checked = { phonenumber: true, email: false }
    expect(buildHiddenFields(['phonenumber', 'email'], checked)).toEqual(['phonenumber'])
  })
  it('全勾选 → 全量 hiddenFields', () => {
    const checked = { phonenumber: true, email: true }
    expect(buildHiddenFields(['phonenumber', 'email'], checked)).toEqual(['phonenumber', 'email'])
  })
  it('全不勾 → 空数组（全量覆盖语义：空数组 = 全部取消隐藏）', () => {
    expect(buildHiddenFields(['phonenumber', 'email'], {})).toEqual([])
  })
  it('勾选状态中超出白名单的键被忽略（防脏数据入库）', () => {
    const checked = { phonenumber: true, email: false, hacked: true }
    expect(buildHiddenFields(['phonenumber', 'email'], checked)).toEqual(['phonenumber'])
  })
})

describe('isColumnVisible（单列最终可见性 = 偏好 × 字段权限）', () => {
  it('偏好可见且未被隐藏 → true', () => {
    expect(isColumnVisible('phonenumber', true, ['email'])).toBe(true)
  })
  it('被字段级权限隐藏 → false（即使偏好可见）', () => {
    expect(isColumnVisible('phonenumber', true, ['phonenumber', 'email'])).toBe(false)
  })
  it('列显隐偏好关闭 → false（字段权限不影响该结论）', () => {
    expect(isColumnVisible('phonenumber', false, [])).toBe(false)
    expect(isColumnVisible('phonenumber', false, null)).toBe(false)
  })
  it('隐藏集为 null/undefined 视为不隐藏', () => {
    expect(isColumnVisible('email', true, null)).toBe(true)
    expect(isColumnVisible('email', true, undefined)).toBe(true)
  })
})
