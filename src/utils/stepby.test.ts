import { parseStrEmpty, transParams, getNormalPath, blobValidate } from '@/utils/stepby'

// ============================================================================
// 说明
// ============================================================================
// 本文件聚焦 stepby.ts 中此前未被测试覆盖的工具函数：
//   parseStrEmpty / transParams / getNormalPath / blobValidate
// 时间类工具（parseTime/tzOffsetLabel/addDateRange）见 stepby.time.test.ts；
// 字典与树类工具（selectDictLabel/selectDictLabels/handleTree）见 stepby.dictTree.test.ts。

// ============================================================================
// parseStrEmpty 转换字符串（undefined/null 等转为空串）
// ============================================================================
describe('parseStrEmpty', () => {
  it('undefined 返回空字符串', () => {
    expect(parseStrEmpty(undefined)).toBe('')
  })

  it('null 返回空字符串', () => {
    expect(parseStrEmpty(null)).toBe('')
  })

  it('字符串 "undefined" 返回空字符串', () => {
    expect(parseStrEmpty('undefined')).toBe('')
  })

  it('字符串 "null" 返回空字符串', () => {
    expect(parseStrEmpty('null')).toBe('')
  })

  it('空字符串返回空字符串', () => {
    expect(parseStrEmpty('')).toBe('')
  })

  it('falsy 数值 0 返回空字符串', () => {
    expect(parseStrEmpty(0)).toBe('')
  })

  it('正常字符串原样返回', () => {
    expect(parseStrEmpty('hello')).toBe('hello')
  })

  it('数字转为字符串', () => {
    expect(parseStrEmpty(123)).toBe('123')
  })

  it('对象转为字符串', () => {
    expect(parseStrEmpty({ a: 1 })).toBe('[object Object]')
  })
})

// ============================================================================
// transParams 参数处理（序列化查询串）
// ============================================================================
describe('transParams', () => {
  it('空对象返回空字符串', () => {
    expect(transParams({})).toBe('')
  })

  it('简单键值对序列化并以 & 结尾', () => {
    expect(transParams({ name: '张三' })).toBe('name=%E5%BC%A0%E4%B8%89&')
  })

  it('多个键值对按顺序拼接', () => {
    expect(transParams({ a: '1', b: '2' })).toBe('a=1&b=2&')
  })

  it('null / undefined / 空字符串值被跳过', () => {
    expect(transParams({ a: null, b: undefined, c: '', d: 'keep' })).toBe('d=keep&')
  })

  it('对象值展开为 [key]=value 形式', () => {
    expect(transParams({ filter: { status: '1', type: '2' } })).toBe('filter%5Bstatus%5D=1&filter%5Btype%5D=2&')
  })

  it('对象值中空字段被跳过', () => {
    expect(transParams({ filter: { a: '', b: 'x' } })).toBe('filter%5Bb%5D=x&')
  })

  it('特殊字符被 encodeURIComponent 编码', () => {
    expect(transParams({ q: 'a&b=c' })).toBe('q=a%26b%3Dc&')
  })

  it('数字值被转字符串', () => {
    expect(transParams({ num: 42 })).toBe('num=42&')
  })

  it('布尔值被转字符串', () => {
    expect(transParams({ flag: true })).toBe('flag=true&')
  })
})

// ============================================================================
// getNormalPath 返回项目路径（去重斜杠、去尾部斜杠）
// ============================================================================
describe('getNormalPath', () => {
  it('空字符串原样返回', () => {
    expect(getNormalPath('')).toBe('')
  })

  it('字符串 "undefined" 原样返回', () => {
    expect(getNormalPath('undefined')).toBe('undefined')
  })

  it('普通路径原样返回', () => {
    expect(getNormalPath('/system/user')).toBe('/system/user')
  })

  it('首部双斜杠被替换为单斜杠', () => {
    expect(getNormalPath('//system/user')).toBe('/system/user')
  })

  it('去除尾部斜杠', () => {
    expect(getNormalPath('/system/user/')).toBe('/system/user')
  })

  it('路径中部双斜杠仅首个被替换（实现行为）', () => {
    // String.replace('//', '/') 只替换第一个匹配
    expect(getNormalPath('/system//user')).toBe('/system/user')
  })

  it('根路径 / 去除尾斜杠后为空串', () => {
    expect(getNormalPath('/')).toBe('')
  })

  it('单层双斜杠路径归一化', () => {
    expect(getNormalPath('//dashboard')).toBe('/dashboard')
  })
})

// ============================================================================
// blobValidate 验证是否为 blob 格式
// ============================================================================
describe('blobValidate', () => {
  it('application/json 类型返回 false', () => {
    const blob = new Blob(['{}'], { type: 'application/json' })
    expect(blobValidate(blob)).toBe(false)
  })

  it('application/json;charset=utf-8 类型返回 false', () => {
    const blob = new Blob(['{}'], { type: 'application/json;charset=utf-8' })
    expect(blobValidate(blob)).toBe(false)
  })

  it('其他 blob 类型返回 true', () => {
    const blob = new Blob(['xlsx-data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    expect(blobValidate(blob)).toBe(true)
  })

  it('text/plain 类型返回 true', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    expect(blobValidate(blob)).toBe(true)
  })
})
