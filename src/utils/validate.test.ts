import { isExternal, isPathMatch, isEmpty, isHttp, toPositiveInt, verifyImageMagicBytes } from '@/utils/validate'
import { afterEach, vi } from 'vitest'

/** 构造内存 File：bytes 为文件内容，name 用于扩展名白名单判断 */
function makeFile(bytes: number[], name: string): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' })
}

/** 用可解析 File 内容的 MockFileReader 替换全局 FileReader（jsdom 默认不读取内容） */
function stubFileReader(): void {
  class MockFileReader {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    result: ArrayBuffer | null = null
    readAsArrayBuffer(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf
          this.onload?.()
        })
        .catch(() => this.onerror?.())
    }
  }
  vi.stubGlobal('FileReader', MockFileReader)
}

/** 用拒绝读取的 MockFileReader 覆盖，模拟文件读取失败（onerror 分支） */
function stubFileReaderError(): void {
  class ErrorFileReader {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    result: ArrayBuffer | null = null
    readAsArrayBuffer(): void {
      this.onerror?.()
    }
  }
  vi.stubGlobal('FileReader', ErrorFileReader)
}

// ============================================================================
// isExternal 外链判断
// ============================================================================
describe('isExternal', () => {
  it('http 链接为外链', () => {
    expect(isExternal('http://example.com')).toBe(true)
  })

  it('https 链接为外链', () => {
    expect(isExternal('https://example.com')).toBe(true)
  })

  it('mailto 链接为外链', () => {
    expect(isExternal('mailto:test@example.com')).toBe(true)
  })

  it('tel 链接为外链', () => {
    expect(isExternal('tel:13800138000')).toBe(true)
  })

  it('相对路径不是外链', () => {
    expect(isExternal('/system/user')).toBe(false)
  })

  it('路由 name 不是外链', () => {
    expect(isExternal('system')).toBe(false)
  })

  it('空字符串不是外链', () => {
    expect(isExternal('')).toBe(false)
  })
})

// ============================================================================
// isPathMatch 路径匹配
// ============================================================================
describe('isPathMatch', () => {
  it('精确匹配', () => {
    expect(isPathMatch('/system/user', '/system/user')).toBe(true)
  })

  it('* 匹配单层任意字符', () => {
    expect(isPathMatch('/system/*', '/system/user')).toBe(true)
  })

  it('* 不匹配跨层路径', () => {
    // * 被转换为 [^/]*，不匹配 /
    expect(isPathMatch('/system/*', '/system/user/list')).toBe(false)
  })

  it('** 匹配多层路径', () => {
    expect(isPathMatch('/system/**', '/system/user/list')).toBe(true)
  })

  it('? 匹配单个非斜杠字符', () => {
    expect(isPathMatch('/system/?ser', '/system/user')).toBe(true)
    expect(isPathMatch('/system/?ser', '/system/userr')).toBe(false)
  })

  it('不匹配时返回 false', () => {
    expect(isPathMatch('/system/user', '/system/role')).toBe(false)
  })
})

// ============================================================================
// isEmpty 空值判断
// ============================================================================
describe('isEmpty', () => {
  it('null 为空', () => {
    expect(isEmpty(null)).toBe(true)
  })

  it('undefined 为空', () => {
    expect(isEmpty(undefined)).toBe(true)
  })

  it('空字符串为空', () => {
    expect(isEmpty('')).toBe(true)
  })

  it('"undefined" 字符串为空', () => {
    expect(isEmpty('undefined')).toBe(true)
  })

  it('非空字符串不为空', () => {
    expect(isEmpty('hello')).toBe(false)
  })

  it('0 不被判断为空（严格判断，不进行类型转换）', () => {
    // 改进：isEmpty 现在使用严格判断，0 不再被误判为空
    expect(isEmpty(0)).toBe(false)
  })

  it('false 不被判断为空（严格判断，不进行类型转换）', () => {
    // 改进：isEmpty 现在使用严格判断，false 不再被误判为空
    expect(isEmpty(false)).toBe(false)
  })

  it('空数组不被判断为空（严格判断，不进行类型转换）', () => {
    // 改进：isEmpty 现在使用严格判断，[] 不再被误判为空
    expect(isEmpty([])).toBe(false)
  })
})

// ============================================================================
// isHttp HTTP 协议判断
// ============================================================================
describe('isHttp', () => {
  it('http:// 链接', () => {
    expect(isHttp('http://localhost:8080')).toBe(true)
  })

  it('https:// 链接', () => {
    expect(isHttp('https://example.com')).toBe(true)
  })

  it('非 http 链接', () => {
    expect(isHttp('/system/user')).toBe(false)
  })

  it('ftp 链接不是 http', () => {
    expect(isHttp('ftp://files.example.com')).toBe(false)
  })

  it('空字符串', () => {
    expect(isHttp('')).toBe(false)
  })
})

// ============================================================================
// verifyImageMagicBytes 图片 magic bytes 校验（FE-002）
// ============================================================================
describe('verifyImageMagicBytes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PNG magic bytes 通过校验', async () => {
    stubFileReader()
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d], 'a.png')
    expect(await verifyImageMagicBytes(file)).toBe(true)
  })

  it('JPEG magic bytes（FF D8 FF）通过校验', async () => {
    stubFileReader()
    const file = makeFile([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46], 'a.jpg')
    expect(await verifyImageMagicBytes(file)).toBe(true)
  })

  it('GIF magic bytes（GIF8）通过校验', async () => {
    stubFileReader()
    const file = makeFile([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00], 'a.gif')
    expect(await verifyImageMagicBytes(file)).toBe(true)
  })

  it('扩展名匹配但 magic bytes 不匹配返回 false', async () => {
    stubFileReader()
    const file = makeFile([0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 'fake.png')
    expect(await verifyImageMagicBytes(file)).toBe(false)
  })

  it('扩展名不在白名单直接返回 false（不读文件头）', async () => {
    stubFileReader()
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a.txt')
    expect(await verifyImageMagicBytes(file)).toBe(false)
  })

  it('allowedTypes 白名单之外的合法图片类型返回 false', async () => {
    stubFileReader()
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a.png')
    expect(await verifyImageMagicBytes(file, ['jpeg'])).toBe(false)
  })

  it('文件内容不足 8 字节时仍按已有字节判定', async () => {
    stubFileReader()
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a], 'short.png')
    expect(await verifyImageMagicBytes(file)).toBe(false)
  })

  it('文件读取失败（FileReader onerror）时返回 false', async () => {
    stubFileReaderError()
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a.png')
    expect(await verifyImageMagicBytes(file)).toBe(false)
  })

  it('文件名以点结尾时扩展名取空串并判非法', async () => {
    stubFileReader()
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'photo.')
    expect(await verifyImageMagicBytes(file)).toBe(false)
  })

  it('allowedTypes 含未知类型（不在 magic 表）时返回 false', async () => {
    stubFileReader()
    const file = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a.png')
    expect(await verifyImageMagicBytes(file, ['bmp'])).toBe(false)
  })
})

// ============================================================================
// toPositiveInt 深链数字参数消毒闸（批七十三 轮 16 接线，此前只有 routeParamNumber
// 守卫测试间接引用它，闸本身的取值契约没有单测 ⇒ 改坏正则或去掉 isSafeInteger 都不会红）
// ============================================================================
describe('toPositiveInt', () => {
  /** 非正整数一律归 0：闸的产出永远是"可直接拼进请求的数"，不是 undefined/NaN */
  const toZero: Array<[string, unknown]> = [
    ['空串', ''],
    ['零', '0'],
    ['负号', '-1'],
    ['小数', '1.5'],
    ['科学计数', '1e3'],
    ['前导空格', ' 4'],
    ['尾随空格', '4 '],
    ['加号', '+4'],
    ['十六进制', '0x4'],
    ['非数字串', 'abc'],
    ['数值溢出（超出安全整数）', '9007199254740992'],
    ['数字 0', 0],
    ['负数', -1],
    ['小数（number）', 2.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['null', null],
    ['undefined', undefined],
    ['布尔', true],
    ['数组（不 coercion）', ['5']],
    ['对象（不 coercion）', { toString: () => '5' }]
  ]
  for (const [label, input] of toZero) {
    it(`${label} ⇒ 0`, () => {
      expect(toPositiveInt(input)).toBe(0)
    })
  }

  it('正整数字符串与数字都按值保留', () => {
    expect(toPositiveInt('7')).toBe(7)
    expect(toPositiveInt('007')).toBe(7)
    expect(toPositiveInt(7)).toBe(7)
    // 恰好等于最大安全整数仍保留（闸只挡"会变成 float 丢精度"的那一侧）
    expect(toPositiveInt('9007199254740991')).toBe(9007199254740991)
  })

  it('产出值可直接拼进请求（不出现 NaN / undefined / 空串）', () => {
    for (const [, input] of toZero) {
      const out = toPositiveInt(input)
      expect(Number.isSafeInteger(out)).toBe(true)
      expect(out).toBeGreaterThanOrEqual(0)
    }
  })
})
