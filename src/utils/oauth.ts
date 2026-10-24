// 第三方登录前端辅助工具
import { getItem, removeItem, setItem } from '@/utils/webStorage'

/** sessionStorage 中待绑定第三方身份的 key（授权回调返回 handoff 时归档，密码登录成功后消费） */
const PENDING_HANDOFF_KEY = 'oauth_pending_handoff'

/**
 * 读取并清除待绑定的第三方 handoff（一次性）。
 *
 * 流程：第三方回调 /oauth-login?handoff=xxx → 归档到会话存储；
 * 用户随后用账号密码登录成功（login.vue）→ 调用本函数取出 handoff → bindOauth。
 */
export function takePendingHandoff(): string | null {
  const handoff = getItem(PENDING_HANDOFF_KEY, 'session')
  if (handoff) {
    removeItem(PENDING_HANDOFF_KEY, 'session')
  }
  return handoff
}

/**
 * 归档 handoff，返回**是否真的存下来了**。
 *
 * 返回值必须被消费（b89 项 8）：隐私模式 / 站点数据被禁时写入是静默失败的，
 * 而调用方原先照样显示"请用账号密码登录后绑定"——用户照做之后绑定无声丢失，
 * 这是"承诺了一个不会发生的结果"。存不下时调用方必须换一句诚实的文案。
 * 刻意**不**把 handoff 回落到 URL：那等于把一个一次性凭据长期留在地址栏、
 * 浏览历史与 Referer 里。
 */
export function stashPendingHandoff(handoff: string): boolean {
  return setItem(PENDING_HANDOFF_KEY, handoff, 'session')
}
