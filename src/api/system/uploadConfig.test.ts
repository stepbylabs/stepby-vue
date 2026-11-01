/**
 * `buildCredentialPatch` 的结局表（b146）。
 *
 * 为什么单独判这个纯函数：页面级用例（uploadConfigPage.test.ts）只能证明"最终发出去的
 * 载荷里没有空串"，而这一族的病根是**「不带」与「带空串」被当成同一种指令**——
 * 后端对 `accessKey: ""` 的写法是"写入空值"（⇒ 回落到出厂值），对不发这个字段的写法
 * 才是"不动那一列"。判据必须钉到"键在不在"这一层，否则实现退化成 `accessKey: undefined`
 * （键存在、值 undefined，JSON.stringify 会丢掉它 ⇒ 侥幸还对）或 `''`（直接错）都看不出来。
 *
 * 四条各挡一种退化：都留空 / 半填 / 全填且 trim / 只有空白字符。
 */
import { describe, expect, it } from 'vitest'

import { buildCredentialPatch } from './uploadConfig'

describe('buildCredentialPatch：留空 = 不发这个字段', () => {
  it('两个都留空 ⇒ 载荷是空对象（一个键都不带）', () => {
    expect(buildCredentialPatch('', '')).toEqual({})
    expect(Object.keys(buildCredentialPatch('', ''))).toEqual([])
  })

  it('只有空白字符 ⇒ 同样不发（trim 之后为空就是"没填"，不是"填了空格"）', () => {
    const patch = buildCredentialPatch('   ', '\t\n')
    expect(Object.keys(patch)).toEqual([])
  })

  it('半填 ⇒ 只带填了的那一个键', () => {
    const onlyAk = buildCredentialPatch('new-ak', '')
    expect(onlyAk).toEqual({ accessKey: 'new-ak' })
    expect('secretKey' in onlyAk).toBe(false)

    const onlySk = buildCredentialPatch('', 'new-sk')
    expect(onlySk).toEqual({ secretKey: 'new-sk' })
    expect('accessKey' in onlySk).toBe(false)
  })

  it('全填 ⇒ 两个都带且各自 trim', () => {
    expect(buildCredentialPatch('  ak  ', ' sk ')).toEqual({ accessKey: 'ak', secretKey: 'sk' })
  })
})
