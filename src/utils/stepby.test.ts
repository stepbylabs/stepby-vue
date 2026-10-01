import { sprintf, parseStrEmpty, mergeRecursive, transParams, getNormalPath, blobValidate } from '@/utils/stepby'

// ============================================================================
// 说明
// ============================================================================
// 本文件聚焦 stepby.ts 中此前未被测试覆盖的工具函数：
//   sprintf / parseStrEmpty / mergeRecursive / transParams / getNormalPath / blobValidate
// 时间类工具（parseTime/tzOffsetLabel/addDateRange）见 stepby.time.test.ts；
// 字典与树类工具（selectDictLabel/selectDictLabels/handleTree）见 stepby.dictTree.test.ts。

// ============================================================================
// sprintf 字符串格式化（%s 占位符）
// ============================================================================
describe('sprintf', () => {
  it('无参数调用返回原字符串', () => {
    expect(sprintf('hello')).toBe('hello')
  })

  it('单个 %s 被替换为参数', () => {
    expect(sprintf('hello %s', 'world')).toBe('hello world')
  })

  it('多个 %s 按顺序替换', () => {
    expect(sprintf('%s-%s-%s', 'a', 'b', 'c')).toBe('a-b-c')
  })

  it('数字参数被转为字符串', () => {
    expect(sprintf('num=%s', 42)).toBe('num=42')
  })

  it('布尔参数被转为字符串', () => {
    expect(sprintf('bool=%s', true)).toBe('bool=true')
  })

  it('对象参数调用 String() 转换', () => {
    expect(sprintf('obj=%s', { a: 1 })).toBe('obj=[object Object]')
  })

  it('缺少参数时返回空字符串（flag 置 false）', () => {
    expect(sprintf('%s %s', 'only')).toBe('')
  })

  it('第一个参数即对应第一个 %s（rest 参数从 0 开始）', () => {
    expect(sprintf('%s', 'a', 'b')).toBe('a')
  })

  it('多参数中多余参数被忽略', () => {
    expect(sprintf('%s', 'a', 'b', 'c')).toBe('a')
  })

  it('undefined 参数导致返回空字符串', () => {
    expect(sprintf('%s', undefined)).toBe('')
  })

  it('null 参数被转换为字符串 "null"', () => {
    expect(sprintf('%s', null)).toBe('null')
  })
})

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
// mergeRecursive 数据合并（深合并）
// ============================================================================
describe('mergeRecursive', () => {
  it('普通字段直接覆盖', () => {
    const source = { a: 1, b: 2 }
    const target = { b: 3 }
    expect(mergeRecursive(source, target)).toEqual({ a: 1, b: 3 })
  })

  it('嵌套对象递归合并', () => {
    const source = { a: { x: 1, y: 2 } }
    const target = { a: { y: 9, z: 3 } }
    expect(mergeRecursive(source, target)).toEqual({ a: { x: 1, y: 9, z: 3 } })
  })

  it('source 缺少嵌套对象时用空对象承接', () => {
    const source = {}
    const target = { a: { b: 1 } }
    expect(mergeRecursive(source, target)).toEqual({ a: { b: 1 } })
  })

  it('目标字段为数组时直接覆盖（非深合并）', () => {
    const source = { list: [1, 2] }
    const target = { list: [3] }
    expect(mergeRecursive(source, target)).toEqual({ list: [3] })
  })

  it('目标字段为 null 时直接覆盖', () => {
    const source = { a: 1 }
    const target = { a: null }
    expect(mergeRecursive(source, target)).toEqual({ a: null })
  })

  it('返回原 source 对象（引用一致）', () => {
    const source = { a: 1 }
    const target = { b: 2 }
    expect(mergeRecursive(source, target)).toBe(source)
  })

  it('多层级深层合并', () => {
    const source = { a: { b: { c: 1, keep: 'x' } } }
    const target = { a: { b: { c: 2, extra: true } } }
    expect(mergeRecursive(source, target)).toEqual({ a: { b: { c: 2, keep: 'x', extra: true } } })
  })

  it('读取目标属性抛异常时走 catch 兜底分支', () => {
    // 构造首次属性访问抛异常的 Proxy，触发 try 内异常 → catch 分支再次读取成功赋值
    let calls = 0
    const target = new Proxy(
      { a: 1 },
      {
        get(t, prop, r) {
          calls++
          if (calls === 1) {
            throw new Error('first access throws')
          }
          return Reflect.get(t, prop, r)
        }
      }
    )
    const source: Record<string, unknown> = {}
    mergeRecursive(source, target as Record<string, unknown>)
    expect(source.a).toBe(1)
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
