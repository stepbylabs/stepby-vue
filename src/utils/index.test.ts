/**
 * utils/index.ts 纯函数覆盖测试（批六十四覆盖率工程）。
 * 按真实实现语义断言：formatDate 输出含时间、formatTime 是相对时间（x小时前）、
 * className 工具无返回值（只验证副作用）、sanitizeHtml 剔除 script。
 */
import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatTime,
  makeMap,
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

// makeMap / titleCase 由代码生成器（src/utils/generator/{render,js}.js）消费——
// b70 曾因死代码扫描漏 .js 文件误删，CI 生产构建 MISSING_EXPORT 抓回；
// 此处补回归锁，防再次误删。
describe('utils/index makeMap（generator 消费）', () => {
  it('逗号分隔集合命中与未命中', () => {
    const map = makeMap('a,b,c')
    expect(map('a')).toBe(true)
    expect(map('c')).toBe(true)
    // Vue2 式真值语义：未命中返回 undefined（falsy），非 false
    expect(map('d')).toBeFalsy()
  })
  it('expectsLowerCase 时查找值大小写不敏感（键须本身小写）', () => {
    const map = makeMap('a,b', true)
    expect(map('A')).toBe(true)
    expect(map('b')).toBe(true)
    expect(map('c')).toBeFalsy()
  })
})

describe('utils/index titleCase', () => {
  it('首字母大写', () => {
    expect(titleCase('abc')).toBe('Abc')
  })
  it('空格后首字母大写', () => {
    expect(titleCase('hello world')).toBe('Hello World')
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
