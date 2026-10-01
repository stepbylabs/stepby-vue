import i18n from '@/i18n'

/**
 * 错误码 → i18n key 映射表
 *
 * 调用 getErrorMessage(code) 会根据当前 i18n 语言返回对应翻译。
 * 不要直接访问 errorCode[code]，请使用 getErrorMessage(code)。
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

/**
 * 根据错误码获取国际化错误消息
 * @param code 错误码（字符串或数字），未匹配时返回 default 对应消息
 */
export function getErrorMessage(code: string | number): string {
  const key = errorCodeKeyMap[String(code)] || errorCodeKeyMap['default']
  return i18n.global.t(key)
}

// 兼容旧用法：errorCode[code] 仍可访问，但返回 i18n key 而非翻译文本
// 调用方应迁移到 getErrorMessage(code)
const errorCode: Record<string, string> = new Proxy(errorCodeKeyMap, {
  get(target, prop: string): string {
    return i18n.global.t(target[prop] || target['default'])
  }
})

export default errorCode
