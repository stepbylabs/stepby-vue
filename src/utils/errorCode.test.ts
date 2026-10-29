/**
 * 错误码映射的**取不到语义**（b125）。
 *
 * 旧实现是 Proxy：任何键都返回 `default` 的译文，于是"未登记"与"已登记"在调用点
 * 长得一模一样，`errorCode[code] || data.msg || …` 的中段因此永不执行。
 * 这里的判据只有一条：**未登记必须回 undefined**，让调用方知道没拿到映射。
 */
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { defaultErrorMessage, translateErrorCode } from '@/utils/errorCode'

const t = i18n.global.t

describe('translateErrorCode', () => {
  it('已登记的标准码返回当前语言文案', () => {
    expect(translateErrorCode(400)).toBe(t('errorCode.400'))
    expect(translateErrorCode(429)).toBe(t('errorCode.429'))
    expect(translateErrorCode(503)).toBe(t('errorCode.503'))
  })

  it('未登记码返回 undefined（不得回落 default）', () => {
    expect(translateErrorCode(1234)).toBeUndefined()
    expect(translateErrorCode(601)).toBeUndefined()
    expect(translateErrorCode(1003)).toBeUndefined()
    // 'default' 是兜底入口，不是一个可以被"查到"的业务码
    expect(translateErrorCode(Number.NaN)).toBeUndefined()
  })

  it('非数值码一律 undefined（body.code 契约是数字，字符串不猜）', () => {
    expect(translateErrorCode('500')).toBeUndefined()
    expect(translateErrorCode(null)).toBeUndefined()
    expect(translateErrorCode(undefined)).toBeUndefined()
    expect(translateErrorCode(Number.POSITIVE_INFINITY)).toBeUndefined()
  })

  it('兜底文案永远可翻译且非空', () => {
    expect(defaultErrorMessage()).toBe(t('errorCode.default'))
    expect(defaultErrorMessage().trim()).not.toBe('')
  })
})
