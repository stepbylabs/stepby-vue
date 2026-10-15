import i18n from '@/i18n'

/**
 * 错误码 → i18n key 映射表
 *
 * 直接访问 errorCode[code] 会返回当前 i18n 语言对应的翻译文本（见下方 Proxy）。
 */
const errorCodeKeyMap: Record<string, string> = {
  '400': 'errorCode.400',
  '401': 'errorCode.401',
  '403': 'errorCode.403',
  '404': 'errorCode.404',
  '409': 'errorCode.409',
  '422': 'errorCode.422',
  '429': 'errorCode.429',
  '500': 'errorCode.500',
  '503': 'errorCode.503',
  default: 'errorCode.default'
}

// errorCode[code] 访问时按当前 i18n 语言实时翻译（Proxy get 钩子），
// 未命中映射表的 code 回退 default 文案。
const errorCode: Record<string, string> = new Proxy(errorCodeKeyMap, {
  get(target, prop: string): string {
    return i18n.global.t(target[prop] || target['default'])
  }
})

export default errorCode
