import type { BaseEntity } from './common'

/** 第三方登录提供商（列表出参，clientSecret 已被后端脱敏） */
export interface OauthProvider extends BaseEntity {
  providerId: number
  /** 提供商编码（github/gitee/wecom/oidc，唯一） */
  providerCode: string
  providerName: string
  /** 提供商类型（github/gitee/wecom/oidc） */
  providerType: string
  clientId: string
  /** Client Secret（后端脱敏出参，表单编辑时留空表示不修改） */
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  userInfoUrl: string
  scope: string
  /** 回调地址（为空时后端按请求 Host 动态生成） */
  redirectUri: string
  /** 首次登录是否自动创建本地账号（1=是 0=否） */
  autoCreateUser: string
  /** 是否启用（0=停用 1=启用） */
  enabled: string
  displayOrder: number
}

/** 提供商分页查询参数 */
export interface OauthProviderQueryParams {
  pageNum: number
  pageSize: number
  providerName?: string
  providerCode?: string
  providerType?: string
  enabled?: string
}

/** 提供商新增/编辑提交表单 */
export interface OauthProviderForm {
  providerId?: number
  providerCode: string
  providerName: string
  providerType: string
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  userInfoUrl: string
  scope: string
  redirectUri: string
  autoCreateUser?: string
  enabled?: string
  displayOrder?: number
  remark?: string
}

/** 登录页展示的启用提供商（不带 secret） */
export interface EnabledOauthProvider {
  providerId: number
  providerCode: string
  providerName: string
  /** 跳转授权 URL */
  authorizeUrl: string
  redirectUri: string
}

/** 授权 URL 响应 */
export interface OauthAuthorizeResult {
  authorizeUrl: string
}

/** 当前账号已绑定的第三方身份 */
export interface MyOauthBinding {
  provider: string
  providerName: string
  providerUserId: string
  nickname?: string | null
  avatar?: string | null
  email?: string | null
  lastLoginTime?: string | null
}
