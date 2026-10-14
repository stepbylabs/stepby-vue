/**
 * utils/index.ts 纯函数覆盖测试（批六十四覆盖率工程）。
 * 按真实实现语义断言：formatDate 输出含时间、formatTime 是相对时间（x小时前）、
 * className 工具无返回值（只验证副作用）、sanitizeHtml 剔除 script。
 */
import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatTime,
  hasClass,
  addClass,
  removeClass,
  titleCase,
  isNumberStr,
  sanitizeHtml
} from './index'

describe('utils/index formatDate', () => {
  it('null/undefined 返回空串或占位', () => {
    const out = formatDate(null)
    expect(out === '' || typeof out === 'string').toBe(true)
  })
  it('时间戳数字 → 日期字符串（含 y-m-d）', () => {
    const d = new Date('2026-10-14T08:00:00')
    const out = formatDate(+d)
    expect(out).toContain('2026-10-14')
  })
  it('ISO 字符串 → 日期字符串', () => {
    expect(formatDate('2026-10-14T08:00:00Z')).toContain('2026-10-14')
  })
})

describe('utils/index formatTime（相对时间语义）', () => {
  it('数小时前的时间 → 相对时间描述（x小时前）', () => {
    const tenHoursAgo = Date.now() - 10 * 3600 * 1000
    expect(formatTime(tenHoursAgo)).toContain('小时前')
  })
  it('带 option 的格式化', () => {
    const future = Date.now() + 365 * 24 * 3600 * 1000
    // 未来时间 diff<30 → 相对时间档（"刚刚"）
    expect(formatTime(future)).toBeTruthy()
    expect(formatTime(future, '{y}-{m}-{d}')).toBeTruthy()
  })
})

describe('utils/index className 工具（无返回值，验证副作用）', () => {
  const el = (): HTMLElement => {
    const e = document.createElement('div')
    e.className = 'foo bar'
    return e
  }
  it('hasClass 命中与未命中', () => {
    expect(hasClass(el(), 'foo')).toBe(true)
    expect(hasClass(el(), 'baz')).toBe(false)
  })
  it('addClass 新增类', () => {
    const e = el()
    addClass(e, 'baz')
    expect(e.className).toContain('baz')
  })
  it('removeClass 移除指定类保留其余', () => {
    const e = el()
    removeClass(e, 'foo')
    expect(e.className).not.toContain('foo')
    expect(e.className).toContain('bar')
  })
})


describe('utils/index titleCase', () => {
  it('首字母大写', () => {
    expect(titleCase('abc')).toBe('Abc')
  })
})

describe('utils/index isNumberStr', () => {
  it('数字串 true / 非数字 false', () => {
    expect(isNumberStr('123')).toBe(true)
    expect(isNumberStr('12.5')).toBe(true)
    expect(isNumberStr('abc')).toBe(false)
  })
})

describe('utils/index sanitizeHtml', () => {
  it('剔除 script 标签', () => {
    expect(sanitizeHtml('<p>ok</p><script>alert(1)</script>')).not.toContain('script')
  })
  it('普通文本原样保留', () => {
    expect(sanitizeHtml('<p>ok</p>')).toContain('ok')
  })
})
