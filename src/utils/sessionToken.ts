/**
 * 会话 token 的本地标识（b124）
 *
 * 原实现内联在 `MySessionPanel.vue`：`crypto.subtle.digest('SHA-256', …)` 的**拒绝没有被接住**。
 * 浏览器给的能力是"会抛错的通道"而不是可用的 API（b111/b112 同一族）：`subtle` 存在但
 * `digest` 被策略拒绝（权限策略、内核裁剪、企业 FIPS 配置）时，async 函数里的拒绝会直接逸出，
 * 整个"我的会话"面板取数链断在算哈希这一步——而这页本来就有降级路径（非安全上下文时用尾 8 位）。
 * 现在把"能力缺失"与"能力拒绝"视为同一档：降级 + 让页面显示 `degradedHint`。
 */
export interface TokenIdentifier {
  hash: string
  /** true = 尾 8 位弱匹配（可能碰撞），页面必须显示降级提示 */
  degraded: boolean
}

const TAIL = 8

export async function identifyToken(token: string, subtle: SubtleCrypto | undefined): Promise<TokenIdentifier> {
  if (!subtle) return { hash: token.slice(-TAIL), degraded: true }
  try {
    const data = new TextEncoder().encode(token)
    const hashBuffer = await subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return { hash: hashArray.map((b) => b.toString(16).padStart(2, '0')).join(''), degraded: false }
  } catch {
    // 拒绝不等于"这页不能看"：降级标识 + 提示条，其余功能照常
    return { hash: token.slice(-TAIL), degraded: true }
  }
}
