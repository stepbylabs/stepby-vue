/**
 * 密码强度规则
 * 根据参数 chrtype 动态生成校验规则
 *
 * chrtype 说明：
 *   0 - 任意字符（默认）
 *   1 - 纯数字（0-9）
 *   2 - 纯字母（a-z / A-Z）
 *   3 - 字母 + 数字（必须同时包含）
 *   4 - 字母 + 数字 + 特殊字符（必须同时包含，特殊字符：~!@#$%^&*()-=_+）
 */

import cache from '@/plugins/cache'
import i18n from '@/i18n'

// 密码限制类型（模块级 ref，初次从 cache 读取；后续登录后通过 setPwdChrType 同步）
const pwdChrType: Ref<string> = ref(cache.session.get('pwdChrtype') || '0')

/**
 * 更新密码字符类型（user store 在 getInfo 后调用，确保登录后规则实时生效）
 * 同时同步到 sessionStorage，避免刷新后丢失
 */
export function setPwdChrType(val: string): void {
  const v = val || '0'
  pwdChrType.value = v
  cache.session.set('pwdChrtype', v)
}

// 各类型对应的正则、错误提示（使用函数确保 i18n 响应式）
function getPwdRules(): Record<string, { pattern: RegExp; message: string }> {
  const t = i18n.global.t
  return {
    '0': { pattern: /^[^<>"'|\\]+$/, message: t('passwordRule.illegalChars') },
    '1': { pattern: /^[0-9]+$/, message: t('passwordRule.digitsOnly') },
    '2': { pattern: /^[a-zA-Z]+$/, message: t('passwordRule.lettersOnly') },
    '3': { pattern: /^(?=.*[a-zA-Z])(?=.*[0-9])[a-zA-Z0-9]+$/, message: t('passwordRule.lettersAndDigits') },
    '4': {
      pattern: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[~!@#$%^&*()\-=_+])[A-Za-z\d~!@#$%^&*()\-=_+]+$/,
      message: t('passwordRule.lettersDigitsSpecial')
    }
  }
}

export function usePasswordRule() {
  // 默认密码校验
  const pwdValidator = computed(() => {
    const rules = getPwdRules()
    const rule = rules[pwdChrType.value] || rules['0']
    return [
      { required: true, message: i18n.global.t('passwordRule.required'), trigger: 'blur' },
      { min: 6, max: 20, message: i18n.global.t('passwordRule.lengthRange'), trigger: 'blur' },
      { pattern: rule.pattern, message: rule.message, trigger: 'blur' }
    ]
  })
  // 校验prompt的inputValidator函数
  const pwdPromptValidator = (value: string) => {
    const rules = getPwdRules()
    const rule = rules['0']
    if (!value || value.length < 6 || value.length > 20) {
      return i18n.global.t('passwordRule.lengthRange')
    }
    if (!rule.pattern.test(value)) {
      return rule.message
    }
  }
  // 个人中心密码校验
  const infoPwdValidator = computed(() => {
    const rules = getPwdRules()
    const rule = rules[pwdChrType.value] || rules['0']
    return [
      { required: true, message: i18n.global.t('passwordRule.newRequired'), trigger: 'blur' },
      { min: 6, max: 20, message: i18n.global.t('passwordRule.newLengthRange'), trigger: 'blur' },
      { pattern: rule.pattern, message: rule.message, trigger: 'blur' }
    ]
  })
  // 注册页面密码校验
  // P1 修复：注册强制"字母 + 数字"（chrtype 3），避免 6 位纯数字/纯字母弱密码直接注册；
  // 此前固定用 rules['0']（仅禁非法字符），与登录后 setPwdChrType 的强策略不一致。
  const registerPwdValidator = computed(() => {
    const rules = getPwdRules()
    const rule = rules['3']
    return [
      { required: true, message: i18n.global.t('passwordRule.pleaseEnter'), trigger: 'blur' },
      { min: 6, max: 20, message: i18n.global.t('passwordRule.userLengthRange'), trigger: 'blur' },
      { pattern: rule.pattern, message: rule.message, trigger: 'blur' }
    ]
  })

  return {
    pwdChrType,
    pwdValidator,
    infoPwdValidator,
    pwdPromptValidator,
    registerPwdValidator
  }
}
