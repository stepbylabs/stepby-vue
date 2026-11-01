import { describe, expect, it } from 'vitest'
import { credentialTagState, type CredentialFacts } from './ipCredentialState'

/** 四态齐全时的真值表（每一态都必须有且只有一种输入落到它） */
const fact = (over: Partial<CredentialFacts>): CredentialFacts => ({
  available: true,
  present: false,
  unreadable: false,
  configured: false,
  ...over
})

describe('credentialTagState（b145 · N-144-I）', () => {
  it('读失败一律压过其余事实：不得把"没读到"显示成"未配置"', () => {
    // 与"确实没配"唯一不同的输入就是 available —— 结论必须不同，否则等于没修
    expect(credentialTagState(fact({ available: false }))).toBe('unknown')
    expect(credentialTagState(fact({ available: false, configured: true }))).toBe('unknown')
    expect(credentialTagState(fact({ available: false, unreadable: true }))).toBe('unknown')
    expect(credentialTagState(fact({ available: false, present: true }))).toBe('unknown')
    expect(credentialTagState(fact({ available: false }))).not.toBe(credentialTagState(fact({ available: true })))
  })

  it('有密文但解不开 ⇒ unreadable，既不是"未配置"也不是"已就绪"', () => {
    expect(credentialTagState(fact({ present: true, unreadable: true }))).toBe('unreadable')
    // 反向对照：同一条密文能解开时必须是 configured（三态里两态被折成一态就是原缺陷）
    expect(credentialTagState(fact({ present: true, configured: true }))).toBe('configured')
    expect(credentialTagState(fact({}))).toBe('absent')
  })

  it('两个凭据各自判定：一个解不开不得连带另一个', () => {
    const broken = credentialTagState(fact({ present: true, unreadable: true }))
    const healthy = credentialTagState(fact({ present: true, configured: true }))
    expect(broken).toBe('unreadable')
    expect(healthy).toBe('configured')
    expect(broken).not.toBe(healthy)
  })

  it('存量部署的旧语义零漂移：available + configured 仍是"是"', () => {
    expect(credentialTagState(fact({ configured: true }))).toBe('configured')
    expect(credentialTagState(fact({}))).toBe('absent')
  })

  it('退化形状（有密文、能解开、但值为空）按"已存储"读，不得报成"未配置"', () => {
    expect(credentialTagState(fact({ present: true }))).toBe('configured')
  })
})
