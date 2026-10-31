import { describe, expect, it } from 'vitest'
import { applySortChange, normalizeSortOrder, resolveSortChange } from '@/utils/sortDirection'

/**
 * 立案的实测断面（b140，真机探针）：列表页 `<SkeletonTable v-if="loading">` + `<el-table v-else>`
 * 使表格每次取数都重新挂载，EP 的排序状态随之退回 `default-sort`，于是**同一个表头连点三次，
 * 报给页面的方向一次都不变**（实测 `isAsc` 三连 `ascending`，`aria-sort` 还停在 `descending`）。
 * 下面这组用例就是把那三连点原样喂进来 —— 修好之后必须交替。
 */
describe('sortDirection：表头点击的方向裁定', () => {
  it('① normalizeSortOrder 认两种风格，认不出一律 undefined', () => {
    expect(normalizeSortOrder('ascending')).toBe('ascending')
    expect(normalizeSortOrder('asc')).toBe('ascending')
    expect(normalizeSortOrder('ASC')).toBe('ascending')
    expect(normalizeSortOrder('descending')).toBe('descending')
    expect(normalizeSortOrder('desc')).toBe('descending')
    // 「取不到」不得被读成「有方向」（与 Number(null) === 0 同族）
    expect(normalizeSortOrder(undefined)).toBeUndefined()
    expect(normalizeSortOrder(null)).toBeUndefined()
    expect(normalizeSortOrder('')).toBeUndefined()
    expect(normalizeSortOrder('weird')).toBeUndefined()
  })

  it('② 规则 1：EP 报"取消排序"或没有列名 ⇒ 清空（后端回退默认排序）', () => {
    expect(resolveSortChange({ prop: 'loginTime', order: null }, { prop: 'loginTime', order: 'ascending' })).toBeNull()
    expect(resolveSortChange({ prop: null, order: 'ascending' }, { prop: 'loginTime', order: 'ascending' })).toBeNull()
  })

  it('③ 规则 2：换列时照 EP 给的方向走，不做反转', () => {
    expect(
      resolveSortChange({ prop: 'userName', order: 'ascending' }, { prop: 'loginTime', order: 'ascending' })
    ).toEqual({ prop: 'userName', order: 'ascending' })
  })

  it('④ 规则 3：同列且 EP 给的方向与当前参数相同 ⇒ 取反（重挂载洗状态那一型）', () => {
    expect(
      resolveSortChange({ prop: 'loginTime', order: 'ascending' }, { prop: 'loginTime', order: 'ascending' })
    ).toEqual({ prop: 'loginTime', order: 'descending' })
    // 当前参数是三字母风格也必须认，否则 URL 恢复后规则 3 结构性失效
    expect(resolveSortChange({ prop: 'operTime', order: 'asc' }, { prop: 'operTime', order: 'asc' })).toEqual({
      prop: 'operTime',
      order: 'descending'
    })
  })

  it('⑤ 规则 4：EP 自己就给了反向（表格没重挂载的场合）⇒ 不得二次翻转', () => {
    expect(
      resolveSortChange({ prop: 'loginTime', order: 'descending' }, { prop: 'loginTime', order: 'ascending' })
    ).toEqual({ prop: 'loginTime', order: 'descending' })
  })

  it('⑥ 真机三连点：修前一次都不变，修后必须交替', () => {
    const target = { orderByColumn: undefined as string | undefined, isAsc: undefined as string | undefined }
    const before: (string | undefined)[] = []
    const after: (string | undefined)[] = []
    // 修前的形状：直接把 EP 的值写进参数（HEAD 写法）
    const legacy = { orderByColumn: undefined as string | undefined, isAsc: undefined as string | undefined }
    for (let i = 0; i < 3; i++) {
      // 重挂载后 EP 每次都从 default-sort（descending）轮转 ⇒ 每报回来都是 ascending
      legacy.isAsc = 'ascending'
      legacy.orderByColumn = 'loginTime'
      before.push(legacy.isAsc)
      applySortChange(target, { prop: 'loginTime', order: 'ascending' })
      after.push(target.isAsc)
    }
    expect(before, '修前：三连点方向一次都没变（这正是缺陷）').toEqual(['ascending', 'ascending', 'ascending'])
    expect(after, '修后：同列再点必须翻转').toEqual(['ascending', 'descending', 'ascending'])
  })

  it('⑦ applySortChange 的两种参数风格与"清空"结局', () => {
    const ep = { orderByColumn: undefined as string | undefined, isAsc: undefined as string | undefined }
    expect(applySortChange(ep, { prop: 'createTime', order: 'descending' })).toEqual({
      prop: 'createTime',
      order: 'descending'
    })
    expect(ep.orderByColumn).toBe('createTime')
    expect(ep.isAsc).toBe('descending')

    const short = { orderByColumn: undefined as string | undefined, isAsc: undefined as string | undefined }
    applySortChange(short, { prop: 'operTime', order: 'ascending' }, 'short')
    expect(short.isAsc).toBe('asc')
    applySortChange(short, { prop: 'operTime', order: 'ascending' }, 'short')
    expect(short.isAsc, '同列再点必须翻成 desc').toBe('desc')

    applySortChange(short, { prop: 'operTime', order: null }, 'short')
    expect(short, '取消排序必须两个参数都清空').toEqual({ orderByColumn: undefined, isAsc: undefined })
  })

  it('⑧ 页面还没有排序参数时不得翻转（规则 3 的前提是"这一列已经下发过同一方向"）', () => {
    // 首点：current 全空 ⇒ 照 EP 给的方向走。若这里也翻转，用户第一次点"访问时间"会拿到降序，
    // 而后端默认排序恰恰是降序 —— 那会把"点了没反应"换成另一种点不动。
    expect(resolveSortChange({ prop: 'loginTime', order: 'ascending' }, {})).toEqual({
      prop: 'loginTime',
      order: 'ascending'
    })
    // 取消排序之后参数被清空（规则 1），再点同一列回到"首点"语义，不得被上一次的方向翻转
    const target = { orderByColumn: 'loginTime' as string | undefined, isAsc: 'ascending' as string | undefined }
    applySortChange(target, { prop: 'loginTime', order: null })
    expect(target).toEqual({ orderByColumn: undefined, isAsc: undefined })
    expect(applySortChange(target, { prop: 'loginTime', order: 'ascending' })).toEqual({
      prop: 'loginTime',
      order: 'ascending'
    })
  })
})
