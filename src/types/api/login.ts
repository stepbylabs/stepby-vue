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
}
