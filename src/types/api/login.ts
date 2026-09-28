import type { AjaxResult } from './common'
import type { SysUser } from './system/user'

/** 登录响应 */
export interface LoginInfoResult extends AjaxResult {
  /** 令牌 */
  token: string
}

/** 用户信息响应 */
export interface UserInfoResult extends AjaxResult {
  /** 用户信息 */
  user: SysUser
  /** 角色数据 */
  roles: string[]
  /** 权限数据 */
  permissions: string[]
  /** 密码加密类型（对齐后端 pwd_chrtype） */
  pwdChrtype?: string
  /** 初始密码是否提醒修改 */
  isDefaultModifyPwd?: boolean
  /** 密码是否过期 */
  isPasswordExpired?: boolean
  /**
   * 业务列表页是否显示「所属租户」归属列
   *
   * 由后端按 `[ui].show_tenant_column`（`auto` | `always` | `never`）结合操作者租户上下文
   * **算好后下发**（`auto` = 仅平台操作者可见 = 历史行为）。前端不做二次推断，
   * 避免"平台/租户"判定散落两处而漂移。
   */
  showTenantColumn?: boolean
  /**
   * 业务列表页是否显示「按租户筛选」入口
   *
   * 由后端按 `[ui].tenant_filter`（`off` | `platform` | `always`）结合操作者租户上下文
   * **算好后下发**（`off` = 不提供入口 = 历史行为）。前端不做二次推断，
   * 避免"平台/租户"判定散落两处而漂移。
   *
   * ⚠️ 该筛选仅用于**收窄**：后端把显式 `tenantId` 与行级 `tenant_scope` **相与**（AND），
   * 故它不构成安全边界 —— 租户即便手工传他租户 id 也只会得到空集。
   */
  showTenantFilter?: boolean
  /**
   * 用户管理页是否显示「匿名化（GDPR）」入口
   *
   * 由后端按能力位 `privacy.user_erasure`（`off` | `precheck` | `full`）结合操作者租户上下文
   * **算好后下发**（`off` 或非平台操作者 = 不提供入口 = 历史行为）。前端只消费不推断，
   * 避免"平台/租户 + 能力位"判定散落两处而漂移（也不会造出"菜单可见但请求 404"的假入口）。
   *
   * ⚠️ 匿名化**不可逆**（PII 置换 + 凭据全吊销），前端必须二次确认。
   */
  showUserErasure?: boolean
  /**
   * 个人中心是否显示「通行密钥（Passkey）」页签
   *
   * 由后端按能力位 `auth.webauthn`（**与 WebAuthn 端点守卫同一判据**）算好后下发：
   * 关闭态后端对 `/system/user/webauthn/*` 一律 404。前端只消费不推断，
   * 避免造出「页签可见但请求 404」的假入口。
   */
  showPasskey?: boolean
}

/** 验证码响应 */
export interface CaptchaInfoResult extends AjaxResult {
  /** 验证码缓存key */
  uuid: string
  /** 验证码图片Base64 */
  img: string
  /** 验证码开关 */
  captchaEnabled: boolean
  /** 注册开关（后端从 sys.account.registerUser 读取，前端据此控制"立即注册"链接显示） */
  registerEnabled?: boolean
  /**
   * WebAuthn / Passkey 登录开关
   *
   * 后端按能力位 `auth.webauthn`（**与 WebAuthn 端点守卫同一判据**）算好后下发。
   * 前端据此控制登录页「通行密钥登录」入口显示，避免探测 `/login/webauthn/*` 触发 404
   * 控制台错误（与 `registerEnabled` 同一动机）。
   */
  webauthnEnabled?: boolean
}

/** 注册提交信息 */
export interface RegisterForm {
  username: string
  password: string
  confirmPassword: string
  code: string
  uuid: string
}

/** 登录提交信息 */
export interface LoginForm {
  username: string
  password: string
  rememberMe?: boolean | string
  code: string
  uuid: string
  /** TOTP 动态验证码（P0-4：已启用多因子的用户登录时必填） */
  totpCode?: string
}
