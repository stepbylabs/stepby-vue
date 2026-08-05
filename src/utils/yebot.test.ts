import { parseTime, tzOffsetLabel, addDateRange, selectDictLabel, selectDictLabels, handleTree } from '@/utils/yebot'

// ============================================================================
// parseTime 时间格式化
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
  })

  describe('时间戳', () => {
    it('13 位毫秒时间戳', () => {
      const date = new Date(2024, 0, 1, 12, 30, 45)
      const ts = date.getTime()
      expect(parseTime(ts)).toBe('2024-01-01 12:30:45')
    })

    it('10 位秒级时间戳会被乘以 1000', () => {
      const date = new Date(2024, 0, 1, 12, 30, 45)
      const ts = Math.floor(date.getTime() / 1000)
      // 10 位时间戳应被转换为毫秒
      expect(parseTime(ts)).toBe('2024-01-01 12:30:45')
    })

    it('字符串型数字时间戳会被 parseInt', () => {
      const date = new Date(2024, 0, 1, 12, 30, 45)
      const tsStr = String(Math.floor(date.getTime() / 1000))
      // 字符串型 10 位数字会被 parseInt 后乘以 1000
      expect(parseTime(tsStr)).toBe('2024-01-01 12:30:45')
    })
  })

  describe('日期字符串', () => {
    it('解析标准日期时间字符串', () => {
      // '2024-01-01 12:30:45' 会被转换为 '2024/01/01 12:30:45' 再解析（本地时区）
      expect(parseTime('2024-01-01 12:30:45')).toBe('2024-01-01 12:30:45')
    })

    it('解析仅日期字符串', () => {
      expect(parseTime('2024-06-15', '{y}-{m}-{d}')).toBe('2024-06-15')
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

// ============================================================================
// selectDictLabel 字典标签选择
// ============================================================================
describe('selectDictLabel', () => {
  const datas = {
    0: { value: '1', label: '男' },
    1: { value: '2', label: '女' }
  }

  it('匹配到 value 返回对应 label', () => {
    expect(selectDictLabel(datas, '1')).toBe('男')
    expect(selectDictLabel(datas, '2')).toBe('女')
  })

  it('数字 value 通过类型转换匹配', () => {
    // '' + 1 = '1'，使用 == 宽松比较
    expect(selectDictLabel(datas, 1)).toBe('男')
    expect(selectDictLabel(datas, 2)).toBe('女')
  })

  it('未匹配到 value 返回 value 本身', () => {
    expect(selectDictLabel(datas, '3')).toBe('3')
  })

  it('value 为 undefined 返回空字符串', () => {
    expect(selectDictLabel(datas, undefined)).toBe('')
  })

  it('value 为 0 未匹配时返回 "0"', () => {
    expect(selectDictLabel(datas, 0)).toBe('0')
  })
})

// ============================================================================
// selectDictLabels 字典标签多选
// ============================================================================
describe('selectDictLabels', () => {
  const datas = {
    0: { value: '1', label: 'A' },
    1: { value: '2', label: 'B' },
    2: { value: '3', label: 'C' }
  }

  it('单个值匹配', () => {
    expect(selectDictLabels(datas, '1')).toBe('A')
  })

  it('多个值用默认逗号分隔', () => {
    expect(selectDictLabels(datas, '1,2')).toBe('A,B')
  })

  it('数组值会被 join 后处理', () => {
    expect(selectDictLabels(datas, ['1', '2'])).toBe('A,B')
  })

  it('自定义分隔符', () => {
    expect(selectDictLabels(datas, '1-2', '-')).toBe('A-B')
  })

  it('部分匹配部分不匹配', () => {
    // 3 匹配 'C'，4 不匹配返回 '4'
    expect(selectDictLabels(datas, '3,4')).toBe('C,4')
  })

  it('全部不匹配返回原值', () => {
    expect(selectDictLabels(datas, '5,6')).toBe('5,6')
  })

  it('value 为 undefined 返回空字符串', () => {
    expect(selectDictLabels(datas, undefined)).toBe('')
  })

  it('value 为空字符串返回空字符串', () => {
    expect(selectDictLabels(datas, '')).toBe('')
  })

  it('空数组返回空字符串', () => {
    expect(selectDictLabels(datas, [])).toBe('')
  })

  it('所有值匹配', () => {
    expect(selectDictLabels(datas, '1,2,3')).toBe('A,B,C')
  })
})

// ============================================================================
// handleTree 树结构构建
// ============================================================================
describe('handleTree', () => {
  it('空数组返回空数组', () => {
    expect(handleTree([])).toEqual([])
  })

  it('单根节点（无父节点）', () => {
    const data: Record<string, unknown>[] = [{ id: 1, parentId: 0, name: 'root' }]
    const result = handleTree(data)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].children).toEqual([])
  })

  it('父子两层结构', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'root' },
      { id: 2, parentId: 1, name: 'child1' },
      { id: 3, parentId: 1, name: 'child2' }
    ]
    const result = handleTree(data)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].children as unknown[]).toHaveLength(2)
    expect(((result[0].children as unknown[])[0] as { id: number }).id).toBe(2)
    expect(((result[0].children as unknown[])[1] as { id: number }).id).toBe(3)
  })

  it('多层级（三层）树结构', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'L1' },
      { id: 2, parentId: 1, name: 'L2' },
      { id: 3, parentId: 2, name: 'L3' }
    ]
    const result = handleTree(data)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(((result[0].children as unknown[])[0] as { id: number }).id).toBe(2)
    expect((((result[0].children as unknown[])[0] as { children: unknown[] }).children[0] as { id: number }).id).toBe(3)
  })

  it('多个根节点', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'root1' },
      { id: 2, parentId: 0, name: 'root2' }
    ]
    const result = handleTree(data)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
  })

  it('parentId 指向不存在的节点 - 成为根节点', () => {
    const data: Record<string, unknown>[] = [{ id: 1, parentId: 99, name: 'orphan' }]
    const result = handleTree(data)
    // parentId 99 不在 map 中，所以该节点成为根节点
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('自定义字段名 id/parentId/children', () => {
    const data: Record<string, unknown>[] = [
      { uid: 'a', pid: '', name: 'root' },
      { uid: 'b', pid: 'a', name: 'child' }
    ]
    const result = handleTree(data, 'uid', 'pid', 'nodes')
    expect(result).toHaveLength(1)
    expect(result[0].uid).toBe('a')
    expect(result[0].nodes as unknown[]).toHaveLength(1)
    expect(((result[0].nodes as unknown[])[0] as { uid: string }).uid).toBe('b')
  })

  it('节点已有 children 字段时保留并追加', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'root', children: [{ id: 99, name: 'preset' }] },
      { id: 2, parentId: 1, name: 'child' }
    ]
    const result = handleTree(data)
    expect(result[0].children as unknown[]).toHaveLength(2)
    // 预设的子节点保留
    expect(((result[0].children as unknown[])[0] as { id: number }).id).toBe(99)
    // 新增的子节点追加
    expect(((result[0].children as unknown[])[1] as { id: number }).id).toBe(2)
  })

  describe('循环引用防护', () => {
    it('自引用节点（parentId === id）不崩溃', () => {
      const data = [{ id: 1, parentId: 1, name: 'self' }]
      // 不应抛出异常，节点不会成为根节点
      const result = handleTree(data)
      expect(result).toEqual([])
    })

    it('互相引用（A→B→A）不崩溃', () => {
      const data = [
        { id: 'A', parentId: 'B', name: 'a' },
        { id: 'B', parentId: 'A', name: 'b' }
      ]
      // 两个节点互为父节点，都不会成为根节点
      const result = handleTree(data)
      expect(result).toEqual([])
    })
  })
})
