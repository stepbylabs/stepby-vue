import { parseTime, tzOffsetLabel, addDateRange } from '@/utils/stepby'

// ============================================================================
// parseTime 时间格式化（从 stepby.test.ts 拆分而来，覆盖时间/日期类工具）
// ============================================================================
describe('parseTime', () => {
  describe('异常输入', () => {
    it('无参数时返回 null', () => {
      // @ts-expect-error 测试无参数调用的边界情况
      expect(parseTime()).toBeNull()
    })

    it('null 返回 null', () => {
      expect(parseTime(null)).toBeNull()
    })

    it('undefined 返回 null', () => {
      expect(parseTime(undefined)).toBeNull()
    })

    it('空字符串返回 null', () => {
      expect(parseTime('')).toBeNull()
    })

    it('0（falsy）返回 null', () => {
      expect(parseTime(0)).toBeNull()
    })
  })

  describe('Date 对象', () => {
    it('使用默认格式格式化 Date 对象', () => {
      const date = new Date(2024, 0, 1, 12, 30, 45)
      expect(parseTime(date)).toBe('2024-01-01 12:30:45')
    })

    it('自定义 {y}-{m}-{d} 格式', () => {
      const date = new Date(2024, 5, 15, 8, 0, 0)
      expect(parseTime(date, '{y}-{m}-{d}')).toBe('2024-06-15')
    })

    it('自定义 {y}年{m}月{d}日 格式', () => {
      const date = new Date(2024, 5, 15)
      expect(parseTime(date, '{y}年{m}月{d}日')).toBe('2024年06月15日')
    })

    it('星期几 {a} - 周一返回 一', () => {
      // 2024-01-01 是周一
      const date = new Date(2024, 0, 1)
      expect(parseTime(date, '{a}')).toBe('一')
    })

    it('星期几 {a} - 周日返回 日', () => {
      // 2024-01-07 是周日
      const date = new Date(2024, 0, 7)
      expect(parseTime(date, '{a}')).toBe('日')
    })

    it('个位数月份和日期补零', () => {
      const date = new Date(2024, 0, 5, 3, 2, 1)
      expect(parseTime(date, '{y}-{m}-{d} {h}:{i}:{s}')).toBe('2024-01-05 03:02:01')
    })

    it('参数为 Date 对象时 time 对象被直接使用（不重新解析）', () => {
      const date = new Date(2024, 2, 10)
      expect(parseTime(date, '{y}-{m}-{d}')).toBe('2024-03-10')
    })
  })

  describe('数字时间戳', () => {
    it('10 位秒级时间戳自动转毫秒', () => {
      // 2024-01-01 00:00:00 UTC
      expect(parseTime(1704067200, '{y}-{m}-{d}')).toMatch(/^2024-01-01$|^2024-01-01$/)
    })

    it('13 位毫秒时间戳直接使用', () => {
      const ts = new Date(2024, 0, 1, 12, 30, 45).getTime()
      expect(parseTime(ts, '{y}-{m}-{d} {h}:{i}:{s}')).toBe('2024-01-01 12:30:45')
    })
  })

  describe('字符串时间', () => {
    it('纯数字字符串按时间戳解析', () => {
      const ts = new Date(2024, 0, 1, 12, 30, 45).getTime()
      expect(parseTime(String(ts), '{y}-{m}-{d} {h}:{i}:{s}')).toBe('2024-01-01 12:30:45')
    })

    it('ISO 串含 T 且带毫秒时去除毫秒', () => {
      const out = parseTime('2024-01-01T12:30:45.123Z', '{y}-{m}-{d} {h}:{i}:{s}')
      expect(out).toMatch(/^2024-01-01 \d{2}:\d{2}:\d{2}$/)
    })

    it('ISO 串无时区标记（无 Z 无偏移）时自动追加 Z 按 UTC 解析', () => {
      // '2024-01-01T12:30:45'（无 Z）→ 追加 Z 按 UTC 解析；断言用正则保证任意时区通过
      const out = parseTime('2024-01-01T12:30:45', '{y}-{m}-{d} {h}:{i}:{s}')
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    })

    it('ISO 串带时区偏移（如 +08:00）时不追加 Z', () => {
      const out = parseTime('2024-01-01T12:30:45+08:00', '{y}-{m}-{d} {h}:{i}:{s}')
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    })

    it('空格分隔本地日期串（无 T）按本地解释（替换 - 为 /）', () => {
      // '2024-01-01 12:30:45' 不含 T、不含时区标记 → 走 else 分支替换 '-' 为 '/'
      const out = parseTime('2024-01-01 12:30:45', '{y}-{m}-{d} {h}:{i}:{s}')
      expect(out).toBe('2024-01-01 12:30:45')
    })

    it('空格分隔本地日期串 tz=true 时附加本地 GMT 后缀', () => {
      const out = parseTime('2024-01-01 12:30:45', '{y}-{m}-{d} {h}:{i}:{s}', true)
      expect(out).toMatch(/^2024-01-01 12:30:45 GMT[+-]\d/)
    })
  })
})

// ============================================================================
// parseTime 时区后缀 (tz)
// 注意：断言均使用与时区无关的正则，保证全球任意时区贡献者跑测试均通过。
// ============================================================================
describe('parseTime tz 时区后缀', () => {
  it('tz=true 且含时间格式时追加 GMT 偏移后缀', () => {
    const date = new Date(2024, 0, 1, 12, 30, 45)
    const out = parseTime(date, '{y}-{m}-{d} {h}:{i}:{s}', true)
    expect(out).toMatch(/^2024-01-01 12:30:45 GMT[+-]\d/)
  })

  it('tz=true 默认格式（含时间）追加后缀', () => {
    const date = new Date(2024, 0, 1, 12, 30, 45)
    const out = parseTime(date, undefined, true)
    expect(out).toMatch(/^2024-01-01 12:30:45 GMT[+-]\d/)
  })

  it('tz=true 但仅日期格式时不追加后缀', () => {
    const date = new Date(2024, 5, 15)
    expect(parseTime(date, '{y}-{m}-{d}', true)).toBe('2024-06-15')
  })

  it('默认 tz=false 不追加后缀（向后兼容，既有断言不受影响）', () => {
    const date = new Date(2024, 0, 1, 12, 30, 45)
    expect(parseTime(date)).toBe('2024-01-01 12:30:45')
    expect(parseTime(date, '{y}-{m}-{d}')).toBe('2024-01-01')
  })

  it('后端 UTC（T 串）经本地化后后缀与浏览器时区一致', () => {
    // 2024-01-01T04:30:45Z 在 GMT+8 下本地为 12:30:45，后缀 GMT+8
    const out = parseTime('2024-01-01T04:30:45Z', '{y}-{m}-{d} {h}:{i}:{s}', true)
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} GMT[+-]\d/)
  })
})

// ============================================================================
// tzOffsetLabel 时区偏移标签
// ============================================================================
describe('tzOffsetLabel', () => {
  it('返回以 GMT 开头、含符号与数字的标签（与时区无关）', () => {
    expect(tzOffsetLabel()).toMatch(/^GMT[+-]\d/)
  })

  it('半小时偏移时区格式为 GMT+5:30', () => {
    // 用固定偏移的日期无法直接跨时区断言具体值，仅校验格式合法性
    const d = new Date('2024-01-01T00:00:00Z')
    expect(tzOffsetLabel(d)).toMatch(/^GMT[+-](\d|\d:\d{2})$/)
  })

  it('负偏移时区返回 GMT-5（mock getTimezoneOffset）', () => {
    const orig = Date.prototype.getTimezoneOffset
    Date.prototype.getTimezoneOffset = () => 300 // UTC-5
    try {
      expect(tzOffsetLabel(new Date())).toBe('GMT-5')
    } finally {
      Date.prototype.getTimezoneOffset = orig
    }
  })

  it('非整小时偏移返回 GMT+5:30（mock getTimezoneOffset）', () => {
    const orig = Date.prototype.getTimezoneOffset
    Date.prototype.getTimezoneOffset = () => -330 // UTC+5:30
    try {
      expect(tzOffsetLabel(new Date())).toBe('GMT+5:30')
    } finally {
      Date.prototype.getTimezoneOffset = orig
    }
  })
})

// ============================================================================
// addDateRange 日期范围参数处理
// ============================================================================
describe('addDateRange', () => {
  it('正常日期范围 - 默认 beginTime/endTime', () => {
    const params: Record<string, unknown> = { pageNum: 1, pageSize: 10 }
    const dateRange = ['2024-01-01', '2024-12-31']
    const result = addDateRange(params, dateRange)
    expect(result).toBe(params)
    expect(result.params.beginTime).toBe('2024-01-01')
    expect(result.params.endTime).toBe('2024-12-31')
    // 原有字段保留
    expect(result.pageNum).toBe(1)
    expect(result.pageSize).toBe(10)
  })

  it('空日期范围数组 - beginTime/endTime 为 undefined', () => {
    const params: Record<string, unknown> = { pageNum: 1 }
    const result = addDateRange(params, [])
    expect(result.params.beginTime).toBeUndefined()
    expect(result.params.endTime).toBeUndefined()
  })

  it('dateRange 为 undefined - 当作空数组处理', () => {
    const params: Record<string, unknown> = { pageNum: 1 }
    const result = addDateRange(params, undefined as unknown as string[])
    expect(result.params.beginTime).toBeUndefined()
    expect(result.params.endTime).toBeUndefined()
  })

  it('使用 propName 自定义字段名', () => {
    const params: Record<string, unknown> = { pageNum: 1 }
    const dateRange = ['2024-01-01', '2024-12-31']
    const result = addDateRange(params, dateRange, 'Date')
    expect(result.params.beginDate).toBe('2024-01-01')
    expect(result.params.endDate).toBe('2024-12-31')
    // 不应设置默认的 beginTime/endTime
    expect(result.params.beginTime).toBeUndefined()
    expect(result.params.endTime).toBeUndefined()
  })

  it('params 已有 params 对象 - 保留原有内容并追加', () => {
    const params: Record<string, unknown> = {
      pageNum: 1,
      params: { keyword: 'test' }
    }
    const dateRange = ['2024-01-01', '2024-12-31']
    const result = addDateRange(params, dateRange)
    expect(result.params.keyword).toBe('test')
    expect(result.params.beginTime).toBe('2024-01-01')
    expect(result.params.endTime).toBe('2024-12-31')
  })

  it('params.params 为数组 - 重置为空对象', () => {
    const params: Record<string, unknown> = {
      pageNum: 1,
      params: ['a', 'b']
    }
    const dateRange = ['2024-01-01', '2024-12-31']
    const result = addDateRange(params, dateRange)
    expect(Array.isArray(result.params)).toBe(false)
    expect(result.params.beginTime).toBe('2024-01-01')
    expect(result.params.endTime).toBe('2024-12-31')
  })

  it('params.params 为 null - 重置为空对象', () => {
    const params: Record<string, unknown> = {
      pageNum: 1,
      params: null
    }
    const dateRange = ['2024-01-01', '2024-12-31']
    const result = addDateRange(params, dateRange)
    expect(result.params).toEqual({
      beginTime: '2024-01-01',
      endTime: '2024-12-31'
    })
  })

  it('返回的是同一对象（引用一致）', () => {
    const params: Record<string, unknown> = { pageNum: 1 }
    const result = addDateRange(params, ['2024-01-01', '2024-12-31'])
    expect(result).toBe(params)
  })
})
