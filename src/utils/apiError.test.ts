/**
 * 失败文案单一出口（b125）。
 *
 * 立的案：`errorCode` 的 Proxy 原先对**任意**键都回 default，导致
 * `errorCode[code] || data.msg || errorCode.default` 的中段结构性不可达 ——
 * 后端给的具体理由永远到不了用户眼前，两个单测还把这条缺陷写成了期望。
 * 这里的判据是**相对优先级**，不是某句具体译文：译文改词不该让判据红。
 */
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { resolveApiErrorMessage } from '@/utils/apiError'

const t = i18n.global.t

describe('resolveApiErrorMessage', () => {
  it('后端 msg 优先：已登记的标准码也不得顶掉更具体的理由', () => {
    expect(resolveApiErrorMessage(429, '导出任务繁忙（export:excel），请 30 秒后重试')).toBe(
      '导出任务繁忙（export:excel），请 30 秒后重试'
    )
    expect(resolveApiErrorMessage(500, '备份文件已被清理')).toBe('备份文件已被清理')
  })

  it('没有后端 msg：已登记码回落按码映射的文案', () => {
    expect(resolveApiErrorMessage(403)).toBe(t('errorCode.403'))
    expect(resolveApiErrorMessage(500, '   ')).toBe(t('errorCode.500'))
    expect(resolveApiErrorMessage(503, '')).toBe(t('errorCode.503'))
  })

  it('未登记业务码：有 msg 用 msg，没有才回 default', () => {
    expect(resolveApiErrorMessage(1234, '自定义业务错误')).toBe('自定义业务错误')
    expect(resolveApiErrorMessage(1234)).toBe(t('errorCode.default'))
    expect(resolveApiErrorMessage(601)).toBe(t('errorCode.default'))
  })

  it('非数值码（网关只给状态文本 / 字段缺失）：仍能用后端 msg，否则 default', () => {
    expect(resolveApiErrorMessage('oops', '上游返回了非 JSON 错误')).toBe('上游返回了非 JSON 错误')
    expect(resolveApiErrorMessage(undefined)).toBe(t('errorCode.default'))
    expect(resolveApiErrorMessage(null)).toBe(t('errorCode.default'))
    expect(resolveApiErrorMessage(Number.NaN)).toBe(t('errorCode.default'))
  })

  it('msg 非字符串（数字 / 对象 / 布尔）不得被当成文案', () => {
    expect(resolveApiErrorMessage(500, 42)).toBe(t('errorCode.500'))
    expect(resolveApiErrorMessage(500, { text: 'x' })).toBe(t('errorCode.500'))
    expect(resolveApiErrorMessage(500, false)).toBe(t('errorCode.500'))
  })

  it('返回的兜底文案永远非空（空串会被界面渲染成空提示）', () => {
    expect(resolveApiErrorMessage(undefined).trim()).not.toBe('')
    expect(resolveApiErrorMessage(9999)).toBe(t('errorCode.default'))
  })
})
