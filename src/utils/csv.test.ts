import { describe, expect, it } from 'vitest'
import { csvEscape } from '@/utils/csv'

describe('csvEscape', () => {
  it('普通文本与中文原样返回', () => {
    expect(csvEscape('admin')).toBe('admin')
    expect(csvEscape('张三')).toBe('张三')
    expect(csvEscape('')).toBe('')
  })

  it('null / undefined 落成空单元格', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
  })

  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\tcmd', '\r=1'])('危险起始字符 %j 被前缀单引号中和', (raw) => {
    // 需要引号的形态（\r 开头）整体被双引号包住，撇号紧跟其后
    expect(csvEscape(raw)).toMatch(/^"?'/)
  })

  it('公式单元格同时需要引号时，前缀在引号内且引号翻倍', () => {
    expect(csvEscape('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"')
    expect(csvEscape('=SUM(A1,B1)')).toBe('"\'=SUM(A1,B1)"')
  })

  it('纯数字豁免：负数与科学计数法不得被加前缀', () => {
    expect(csvEscape(-42)).toBe('-42')
    expect(csvEscape('+3.5')).toBe('+3.5')
    expect(csvEscape('-1e3')).toBe('-1e3')
    expect(csvEscape('.5')).toBe('.5')
  })

  it('非十进制形态不得借"数值"豁免（inf / NaN 会被表格当公式名）', () => {
    expect(csvEscape('+inf')).toBe("'+inf")
    expect(csvEscape('-NaN')).toBe("'-NaN")
    expect(csvEscape('+1,000')).toBe('"\'+1,000"')
  })

  it('逗号 / 引号 / 换行按 RFC 4180 加引号（含 \\r）', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('he"llo')).toBe('"he""llo"')
    expect(csvEscape('a\nb')).toBe('"a\nb"')
    expect(csvEscape('a\rb')).toBe('"a\rb"')
  })
})
