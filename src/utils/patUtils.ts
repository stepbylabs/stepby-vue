/**
 * 个人访问令牌（PAT）纯函数工具
 *
 * 供个人中心自助页与管理员页共享，逻辑与后端 scope 语义保持一致，便于单测覆盖。
 */

/** 到期展示状态：never=永不过期；expired=已过期；soon=7 天内到期；active=正常有效 */
export type ExpiryStatus = 'never' | 'expired' | 'soon' | 'active'

/** 解析后端返回的 "YYYY-MM-DD HH:mm:ss"（服务器本地 naive 时间）为 Date；无法解析返回 null */
export function parsePatTime(s?: string | null): Date | null {
  if (!s) return null
  const normalized = s.trim().replace(' ', 'T')
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 计算令牌到期信息。
 * @param expiresAt 过期时间字符串（null/空表示永不过期）
 * @param now 参照当前时间（注入以便单测确定化）
 * @param soonDays 判定"即将到期"的天数阈值，默认 7
 */
export function computeExpiryInfo(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
  soonDays = 7
): { status: ExpiryStatus; days: number | null } {
  if (!expiresAt) return { status: 'never', days: null }
  const exp = parsePatTime(expiresAt)
  if (!exp) return { status: 'never', days: null }
  const ms = exp.getTime() - now.getTime()
  const days = Math.ceil(ms / 86_400_000)
  if (ms <= 0) return { status: 'expired', days: 0 }
  if (days <= soonDays) return { status: 'soon', days }
  return { status: 'active', days }
}

/** 是否已吊销（status='1'） */
export function isRevoked(status?: string | null): boolean {
  return status === '1'
}

/** 到期状态对应的 Element Plus tag 类型 */
export function expiryTagType(status: ExpiryStatus): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'expired':
      return 'danger'
    case 'soon':
      return 'warning'
    case 'never':
      return 'info'
    default:
      return 'success'
  }
}

/** scope 概览：含全权 "*:*:*" 时标记为全权，否则原样返回集合 */
export function summarizeScopes(scopes: string[]): { all: boolean; list: string[] } {
  const all = scopes.includes('*:*:*')
  return { all, list: all ? ['*:*:*'] : [...scopes] }
}
