/**
 * IP 库凭据状态的三态判定（b145 · N-144-I）。
 *
 * 立的案：改造前服务端把"凭据存了但解不开"折成空串，于是管理端显示"未配置"——
 * 一个**读失败**被显示成**用户的状态**。修法是分三态，且优先级由这里单点决定
 * （判定口径散落两处必然漂移，AGENTS 开关规范⑤）。
 *
 * 只给状态，不给文案：文案必须由模板里的 `t('...')` 字面量给出，
 * 否则 i18n 键字面量锁（`src/i18n/i18n-keys.test.ts`）看不见它，双语缺键就没人报。
 */
export type CredentialTagState = 'unknown' | 'unreadable' | 'configured' | 'absent'

export interface CredentialFacts {
  /** 管理配置这一路是否真的读到了（`configAvailable`） */
  available: boolean
  /** 库里是否有该字段的密文 */
  present: boolean
  /** 有密文但解不开 */
  unreadable: boolean
  /** 已解密可用（旧字段 `*Configured`，语义保持不变） */
  configured: boolean
}

/**
 * 优先级 unknown > unreadable > configured > absent，方向取"宁可说不知道，也不替用户编一个状态"。
 *
 * - `!available` ⇒ `unknown`：这一路根本没读到，其余三个事实全是默认值，任何结论都是编的；
 * - `unreadable` ⇒ `unreadable`：既不是"未配置"也不是"已就绪"，动作是"重新保存"；
 * - 其余按旧语义走，存量部署显示不变。
 */
export function credentialTagState(f: CredentialFacts): CredentialTagState {
  if (!f.available) return 'unknown'
  if (f.unreadable) return 'unreadable'
  if (f.configured) return 'configured'
  // present 但既不 unreadable 也不 configured 在真实后端不可达（解密成功即 configured）；
  // 落这里说明两侧口径漂了，按"未配置"显示是最不多报一个已就绪的保守读法
  return f.present ? 'configured' : 'absent'
}
