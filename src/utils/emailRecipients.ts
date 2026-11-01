/**
 * 订阅收件人的拆分与格式判定：与**服务端同源**的宽松邮箱尺（b144）。
 *
 * ## 立的案
 *
 * 报表订阅的收件人是一个逗号分隔串，服务端在 `sys_report_service.rs` 里
 * 用 `split_emails` + `is_valid_email` 判它；而前端 `subRules` **完全没有这一项的规则**。
 * 结局是两条：
 * 1. 用户填完点确定 ⇒ 请求出发 ⇒ 服务端 400「收件邮箱格式不正确」⇒ 提示来自拦截器，
 *    表单上没有字段级定位（哪一项错了不知道）；
 * 2. 更要紧的是**反方向**：前端若按"常见邮箱正则"自行收紧（要求域名有点、要求 TLD），
 *    服务端**本来接受**的值会被挡住——AGENTS《前端外部输入归一规范》判据 2 明说
 *    "顺手把非法值也当合法"和"为安全把合法值也挡掉"都是缺陷。本仓的自托管 SMTP
 *   （如 `root@localhost`、`ops@mail`）正是服务端接受、通用正则拒绝的形态。
 *
 * ## 因此这里的规则是"镜像"而不是"更严"
 *
 * 逐条对应服务端实现：
 * - `split_emails`：按 `,` 拆分 → 每段 `trim()` → 丢掉空段；
 * - `is_valid_email`：必须含 `@`，且 `@` 不在首、不在尾，且**不含半角空格**。
 *   没有点号要求、没有 TLD 要求、允许多个 `@`（`a@b@c` 服务端接受，这里同样接受）。
 *
 * 一致性由 `emailRecipients.test.ts` 的**同一张用例表**在两侧各自验证，并由
 * `emailMirror.guard.test.ts` 跨仓读 Rust 源码钉住"这张表确实被服务端测过"
 * （读不到文件即失败——"取不到"不得读成"没有约束"，与 `pageSizeLimit.guard` 同口径）。
 */
import type { FormItemRule } from 'element-plus'

/** 服务端 `split_emails`：按逗号拆分、逐段去空白、丢弃空项（保持顺序，不判格式）。 */
export function splitRecipients(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** 服务端 `is_valid_email`：含 @、@ 不在首尾、不含半角空格。除此之外不做任何要求。 */
export function isRecipientValid(email: string): boolean {
  const at = email.indexOf('@')
  if (at <= 0) return false
  if (at >= email.length - 1) return false
  return !email.includes(' ')
}

/** 拆分后判定，返回**不合法的那几项**（表单文案要点名到具体收件人，而不是只说"格式不对"）。 */
export function invalidRecipients(value: string | null | undefined): string[] {
  return splitRecipients(value).filter((item) => !isRecipientValid(item))
}

/**
 * 订阅保存的收件人判据（与服务端 `push_email == "1"` 分支逐条同形）：
 * 选了邮件通道 ⇒ 至少一项，且每一项都合法。
 */
export function recipientProblem(value: string | null | undefined): 'empty' | 'invalid' | null {
  const list = splitRecipients(value)
  if (list.length === 0) return 'empty'
  return invalidRecipients(value).length > 0 ? 'invalid' : null
}

/**
 * Element Plus 表单规则工厂：两个订阅入口（报表页内联的订阅小节 / 订阅管理页）共用一份，
 * 避免"同一件事写两遍、两遍严格度不同"（AGENTS ㉘）。
 *
 * `enabled` 传"当前是否勾了邮件通道"——没勾时服务端根本不看这个字段（前端也不该拦），
 * 勾了才判。文案要点名具体是哪几个收件人不合法，只说"格式不对"等于让人整串重打。
 */
export function recipientRule(
  enabled: () => boolean,
  messages: { empty: string; invalid: (bad: string[]) => string }
): FormItemRule {
  return {
    // 必须自定义校验而不是 required：`required` 会把"整串为空"和"含非法项"混成一句，
    // 且不会跑 trim/拆分口径（`" , , "` 在 required 眼里是非空字符串 ⇒ 放行后服务端 400）
    validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
      if (!enabled()) return callback()
      const problem = recipientProblem(typeof value === 'string' ? value : String(value ?? ''))
      if (problem === 'empty') return callback(new Error(messages.empty))
      if (problem === 'invalid') return callback(new Error(messages.invalid(invalidRecipients(String(value ?? '')))))
      return callback()
    },
    trigger: 'blur'
  }
}
