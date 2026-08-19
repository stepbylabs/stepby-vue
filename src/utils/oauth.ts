// 第三方登录前端辅助工具

/** sessionStorage 中待绑定第三方身份的 key（授权回调返回 handoff 时归档，密码登录成功后消费） */
export const PENDING_HANDOFF_KEY = 'oauth_pending_handoff'

/**
 * 读取并清除待绑定的第三方 handoff（一次性）。
 *
 * 流程：第三方回调 /oauth-login?handoff=xxx → 归档到 sessionStorage；
 * 用户随后用账号密码登录成功（login.vue）→ 调用本函数取出 handoff → bindOauth。
 */
export function takePendingHandoff(): string | null {
  try {
    const handoff = sessionStorage.getItem(PENDING_HANDOFF_KEY)
    if (handoff) {
      sessionStorage.removeItem(PENDING_HANDOFF_KEY)
    }
    return handoff
  } catch {
    return null
  }
}
