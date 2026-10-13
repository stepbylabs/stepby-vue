import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/i18n：passwordRule 内部 t() 直接取 i18n.global.t
const { t } = vi.hoisted(() => ({
  t: vi.fn((key: string) => `T:${key}`)
}))
vi.mock('@/i18n', () => ({
  default: { global: { t } }
}))

// Mock @/plugins/cache：pwdChrtype 模块级初值从 cache.session 读取
const { sessionGet, sessionSet } = vi.hoisted(() => ({
  sessionGet: vi.fn((): string | null => null),
  sessionSet: vi.fn()
}))
vi.mock('@/plugins/cache', () => ({
  default: { session: { get: sessionGet, set: sessionSet } }
}))

// 模块级 pwdChrType 状态跨用例共享，重置注册表后动态导入保证隔离
let mod: typeof import('./passwordRule')

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  sessionGet.mockReturnValue(null)
  mod = await import('./passwordRule')
})

describe('utils/passwordRule 密码强度规则', () => {
  describe('setPwdChrType', () => {
    it('写入模块级状态并同步到 sessionStorage', () => {
      mod.setPwdChrType('3')
      expect(mod.usePasswordRule().pwdChrType.value).toBe('3')
      expect(sessionSet).toHaveBeenCalledWith('pwdChrtype', '3')
    })

    it('空值回落为 0（任意字符）', () => {
      mod.setPwdChrType('')
      expect(mod.usePasswordRule().pwdChrType.value).toBe('0')
      expect(sessionSet).toHaveBeenCalledWith('pwdChrtype', '0')
    })

    it('模块初值来自 cache.session（pwdChrtype 已缓存时生效）', async () => {
      vi.resetModules()
      sessionGet.mockReturnValue('4')
      mod = await import('./passwordRule')
      expect(mod.usePasswordRule().pwdChrType.value).toBe('4')
    })
  })

  describe('pwdValidator（默认密码校验）', () => {
    it('包含必填、长度、字符三条规则，消息来自 i18n', () => {
      const rules = mod.usePasswordRule().pwdValidator.value
      expect(rules).toHaveLength(3)
      expect(rules[0]).toMatchObject({ required: true, message: 'T:passwordRule.required', trigger: 'blur' })
      expect(rules[1]).toMatchObject({ min: 6, max: 20, message: 'T:passwordRule.lengthRange', trigger: 'blur' })
      expect(rules[2].message).toBe('T:passwordRule.illegalChars')
    })

    it('chrtype=1 → 纯数字正则', () => {
      mod.setPwdChrType('1')
      const rule = mod.usePasswordRule().pwdValidator.value[2]
      expect(rule.pattern.test('123456')).toBe(true)
      expect(rule.pattern.test('12a456')).toBe(false)
      expect(rule.message).toBe('T:passwordRule.digitsOnly')
    })

    it('chrtype=2 → 纯字母正则', () => {
      mod.setPwdChrType('2')
      const rule = mod.usePasswordRule().pwdValidator.value[2]
      expect(rule.pattern.test('abcABC')).toBe(true)
      expect(rule.pattern.test('abc123')).toBe(false)
      expect(rule.message).toBe('T:passwordRule.lettersOnly')
    })

    it('chrtype=3 → 字母 + 数字同时包含', () => {
      mod.setPwdChrType('3')
      const rule = mod.usePasswordRule().pwdValidator.value[2]
      expect(rule.pattern.test('abc123')).toBe(true)
      expect(rule.pattern.test('abcdef')).toBe(false)
      expect(rule.pattern.test('123456')).toBe(false)
      expect(rule.pattern.test('abc12_')).toBe(false)
      expect(rule.message).toBe('T:passwordRule.lettersAndDigits')
    })

    it('chrtype=4 → 字母 + 数字 + 特殊字符同时包含', () => {
      mod.setPwdChrType('4')
      const rule = mod.usePasswordRule().pwdValidator.value[2]
      expect(rule.pattern.test('abc123@')).toBe(true)
      expect(rule.pattern.test('abc123')).toBe(false)
      expect(rule.pattern.test('abc@#')).toBe(false)
      expect(rule.pattern.test('123@#')).toBe(false)
      // 特殊字符白名单外的字符（如 <）不允许
      expect(rule.pattern.test('abc123<')).toBe(false)
      expect(rule.message).toBe('T:passwordRule.lettersDigitsSpecial')
    })

    it('未知 chrtype → 回落 0（任意字符但禁非法符号）', () => {
      mod.setPwdChrType('9')
      const rule = mod.usePasswordRule().pwdValidator.value[2]
      expect(rule.pattern.test('abc123!')).toBe(true)
      expect(rule.pattern.test('abc<1')).toBe(false)
      expect(rule.message).toBe('T:passwordRule.illegalChars')
    })
  })

  describe('pwdPromptValidator（prompt 弹窗校验函数）', () => {
    it('空值或长度不在 6-20 → 长度提示', () => {
      const fn = mod.usePasswordRule().pwdPromptValidator
      expect(fn('')).toBe('T:passwordRule.lengthRange')
      expect(fn('12345')).toBe('T:passwordRule.lengthRange')
      expect(fn('a'.repeat(21))).toBe('T:passwordRule.lengthRange')
    })

    it('包含非法字符（chrtype=0 规则）→ 非法字符提示', () => {
      const fn = mod.usePasswordRule().pwdPromptValidator
      expect(fn('abc123"x')).toBe('T:passwordRule.illegalChars')
      expect(fn('abc123|x')).toBe('T:passwordRule.illegalChars')
    })

    it('合法密码 → 返回 undefined（通过）', () => {
      const fn = mod.usePasswordRule().pwdPromptValidator
      expect(fn('abc123')).toBeUndefined()
    })

    it('固定使用 rules[0]，不随 pwdChrType 变化', () => {
      mod.setPwdChrType('1') // 即便全局策略是纯数字
      const fn = mod.usePasswordRule().pwdPromptValidator
      // 纯数字对 rules[0] 是合法的（无非法字符）
      expect(fn('123456')).toBeUndefined()
    })
  })

  describe('infoPwdValidator（个人中心密码校验）', () => {
    it('使用 new 前缀消息与当前 chrtype 的正则', () => {
      mod.setPwdChrType('3')
      const rules = mod.usePasswordRule().infoPwdValidator.value
      expect(rules[0]).toMatchObject({ required: true, message: 'T:passwordRule.newRequired', trigger: 'blur' })
      expect(rules[1]).toMatchObject({ min: 6, max: 20, message: 'T:passwordRule.newLengthRange', trigger: 'blur' })
      expect(rules[2].pattern.test('abc123')).toBe(true)
      expect(rules[2].pattern.test('abcdef')).toBe(false)
    })
  })

  describe('registerPwdValidator（注册页密码校验）', () => {
    it('固定强制字母 + 数字（chrtype 3），不随全局 pwdChrType 变化', () => {
      mod.setPwdChrType('0')
      const rules = mod.usePasswordRule().registerPwdValidator.value
      expect(rules[0]).toMatchObject({ required: true, message: 'T:passwordRule.pleaseEnter', trigger: 'blur' })
      expect(rules[1]).toMatchObject({ min: 6, max: 20, message: 'T:passwordRule.userLengthRange', trigger: 'blur' })
      // P1 修复语义：纯数字/纯字母的弱密码不允许注册
      expect(rules[2].pattern.test('123456')).toBe(false)
      expect(rules[2].pattern.test('abcdef')).toBe(false)
      expect(rules[2].pattern.test('abc123')).toBe(true)
    })
  })
})
