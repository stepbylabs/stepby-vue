// src/views/monitor/operlog/diff.test.ts
// Tier-S #2 字段级审计 diff 前端解析单测
import { describe, it, expect } from 'vitest'
import { parseOperDiff, formatDiffValue, heuristicDiff } from './diff'

describe('formatDiffValue', () => {
  it('字符串原样、null/undefined 空串', () => {
    expect(formatDiffValue('abc')).toBe('abc')
    expect(formatDiffValue('')).toBe('')
    expect(formatDiffValue(null)).toBe('')
    expect(formatDiffValue(undefined)).toBe('')
  })
  it('数字/布尔转字符串', () => {
    expect(formatDiffValue(5)).toBe('5')
    expect(formatDiffValue(true)).toBe('true')
  })
  it('对象/数组 JSON 化', () => {
    expect(formatDiffValue({ a: 1 })).toBe('{"a":1}')
    expect(formatDiffValue([1, 2])).toBe('[1,2]')
  })
})

describe('parseOperDiff（服务端权威 diff）', () => {
  it('空/非法/非数组 → []', () => {
    expect(parseOperDiff(undefined)).toEqual([])
    expect(parseOperDiff('')).toEqual([])
    expect(parseOperDiff(null)).toEqual([])
    expect(parseOperDiff('not json')).toEqual([])
    expect(parseOperDiff('{"field":"x"}')).toEqual([])
  })
  it('正常数组 → DiffItem[]，old/new 格式化', () => {
    const raw = JSON.stringify([
      { field: 'noticeTitle', old: '旧标题', new: '新标题' },
      { field: 'status', old: '0', new: '1' },
      { field: 'orderNum', old: 1, new: 2 }
    ])
    const list = parseOperDiff(raw)
    expect(list).toHaveLength(3)
    expect(list[0]).toEqual({
      field: 'noticeTitle',
      oldVal: '旧标题',
      newVal: '新标题',
      changed: true
    })
    expect(list[2].oldVal).toBe('1')
    expect(list[2].newVal).toBe('2')
  })
  it('空数组 → []', () => {
    expect(parseOperDiff('[]')).toEqual([])
  })
  it('跳过缺失 field 的条目', () => {
    const raw = JSON.stringify([
      { old: 'a', new: 'b' },
      { field: 'x', old: 'a', new: 'b' }
    ])
    expect(parseOperDiff(raw)).toHaveLength(1)
  })
  it('敏感字段脱敏值原样展示', () => {
    const raw = JSON.stringify([{ field: 'password', old: '***', new: '***' }])
    const list = parseOperDiff(raw)
    expect(list[0].oldVal).toBe('***')
    expect(list[0].newVal).toBe('***')
    expect(list[0].changed).toBe(false)
  })
})

describe('heuristicDiff（历史回退）', () => {
  it('对比同名基础字段差异', () => {
    const operParam = JSON.stringify({ name: 'old', age: 1, keep: 'same' })
    const jsonResult = JSON.stringify({ code: 200, data: { name: 'new', age: 1, keep: 'same' } })
    const list = heuristicDiff(operParam, jsonResult)
    const byField = Object.fromEntries(list.map((d) => [d.field, d]))
    expect(byField.name).toEqual({ field: 'name', oldVal: 'old', newVal: 'new', changed: true })
    expect(byField.age).toBeUndefined()
    expect(byField.keep).toBeUndefined()
  })
  it('跳过敏感字段', () => {
    const operParam = JSON.stringify({ password: 'a', token: 'b', nickname: 'x' })
    const jsonResult = JSON.stringify({ data: { password: 'c', token: 'd', nickname: 'y' } })
    const fields = heuristicDiff(operParam, jsonResult).map((d) => d.field)
    expect(fields).toEqual(['nickname'])
  })
  it('非法 JSON → []', () => {
    expect(heuristicDiff('bad', 'still-bad')).toEqual([])
  })
  it('深层对象字段不参与对比', () => {
    const operParam = JSON.stringify({ obj: { a: 1 }, name: 'old' })
    const jsonResult = JSON.stringify({ data: { obj: { a: 2 }, name: 'new' } })
    const fields = heuristicDiff(operParam, jsonResult).map((d) => d.field)
    expect(fields).toEqual(['name'])
  })
})
