import {
  isExternal,
  validUsername,
  validEmail,
  isPathMatch,
  isEmpty,
  isHttp,
  validURL,
  validLowerCase,
  validUpperCase,
  validAlphabets,
  isString,
  isArray
} from '@/utils/validate'

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
// validUsername 用户名校验
// ============================================================================
describe('validUsername', () => {
  it('admin 是合法用户名', () => {
    expect(validUsername('admin')).toBe(true)
  })

  it('editor 是合法用户名', () => {
    expect(validUsername('editor')).toBe(true)
  })

  it('其他字符串不是合法用户名', () => {
    expect(validUsername('guest')).toBe(false)
    expect(validUsername('superadmin')).toBe(false)
  })

  it('带空格的用户名会被 trim 后校验', () => {
    expect(validUsername('  admin  ')).toBe(true)
  })

  it('空字符串不是合法用户名', () => {
    expect(validUsername('')).toBe(false)
  })

  it('大小写敏感', () => {
    expect(validUsername('Admin')).toBe(false)
    expect(validUsername('ADMIN')).toBe(false)
  })
})

// ============================================================================
// validEmail 邮箱校验
// ============================================================================
describe('validEmail', () => {
  it('标准邮箱格式', () => {
    expect(validEmail('test@example.com')).toBe(true)
    expect(validEmail('user.name@domain.org')).toBe(true)
  })

  it('含子域的邮箱', () => {
    expect(validEmail('user@sub.domain.com')).toBe(true)
  })

  it('含 + 号的邮箱', () => {
    expect(validEmail('user+tag@gmail.com')).toBe(true)
  })

  it('无 @ 符号不是合法邮箱', () => {
    expect(validEmail('testexample.com')).toBe(false)
  })

  it('无域名不是合法邮箱', () => {
    expect(validEmail('test@')).toBe(false)
  })

  it('无用户名不是合法邮箱', () => {
    expect(validEmail('@example.com')).toBe(false)
  })

  it('空字符串不是合法邮箱', () => {
    expect(validEmail('')).toBe(false)
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
// validURL URL 校验
// ============================================================================
describe('validURL', () => {
  it('标准 http URL', () => {
    expect(validURL('http://example.com')).toBe(true)
  })

  it('标准 https URL', () => {
    expect(validURL('https://example.com/path')).toBe(true)
  })

  it('含端口的 URL', () => {
    expect(validURL('http://example.com:8080/page')).toBe(true)
  })

  it('ftp 协议 URL', () => {
    expect(validURL('ftp://files.example.com')).toBe(true)
  })

  it('非 URL 字符串', () => {
    expect(validURL('not a url')).toBe(false)
  })

  it('空字符串不是合法 URL', () => {
    expect(validURL('')).toBe(false)
  })
})

// ============================================================================
// validLowerCase / validUpperCase / validAlphabets
// ============================================================================
describe('validLowerCase', () => {
  it('纯小写字母', () => {
    expect(validLowerCase('abc')).toBe(true)
  })

  it('含大写字母', () => {
    expect(validLowerCase('aBc')).toBe(false)
  })

  it('含数字', () => {
    expect(validLowerCase('abc123')).toBe(false)
  })

  it('空字符串', () => {
    expect(validLowerCase('')).toBe(false)
  })
})

describe('validUpperCase', () => {
  it('纯大写字母', () => {
    expect(validUpperCase('ABC')).toBe(true)
  })

  it('含小写字母', () => {
    expect(validUpperCase('AbC')).toBe(false)
  })

  it('含数字', () => {
    expect(validUpperCase('ABC123')).toBe(false)
  })

  it('空字符串', () => {
    expect(validUpperCase('')).toBe(false)
  })
})

describe('validAlphabets', () => {
  it('纯字母（混合大小写）', () => {
    expect(validAlphabets('AbC')).toBe(true)
  })

  it('纯小写字母', () => {
    expect(validAlphabets('abc')).toBe(true)
  })

  it('纯大写字母', () => {
    expect(validAlphabets('ABC')).toBe(true)
  })

  it('含数字', () => {
    expect(validAlphabets('abc123')).toBe(false)
  })

  it('空字符串', () => {
    expect(validAlphabets('')).toBe(false)
  })
})

// ============================================================================
// isString / isArray
// ============================================================================
describe('isString', () => {
  it('字符串字面量', () => {
    expect(isString('hello')).toBe(true)
  })

  it('String 对象', () => {
    expect(isString(new String('hello'))).toBe(true)
  })

  it('数字不是字符串', () => {
    expect(isString(123)).toBe(false)
  })

  it('数组不是字符串', () => {
    expect(isString(['a'])).toBe(false)
  })

  it('null 不是字符串', () => {
    expect(isString(null)).toBe(false)
  })
})

describe('isArray', () => {
  it('数组字面量', () => {
    expect(isArray([1, 2, 3])).toBe(true)
  })

  it('空数组', () => {
    expect(isArray([])).toBe(true)
  })

  it('字符串不是数组', () => {
    expect(isArray('abc')).toBe(false)
  })

  it('对象不是数组', () => {
    expect(isArray({ a: 1 })).toBe(false)
  })

  it('null 不是数组', () => {
    expect(isArray(null)).toBe(false)
  })
})
