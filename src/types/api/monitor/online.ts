import type { PageDomain } from '../common'

/** 在线用户分页查询参数 */
export interface OnlineQueryParams extends PageDomain {
  /** 登录地址 */
  ipaddr?: string;
  /** 用户名称 */
  userName?: string;
  /** 租户筛选（仅平台操作者有效；租户操作者恒为本租户，见 §27.13.2 分层视图） */
  tenantId?: number;
}

/** 在线用户信息 */
export interface SysUserOnline {
  /** 会话编号 */
  tokenId?: string;
  /** 部门名称 */
  deptName?: string;
  /** 用户名称 */
  userName?: string;
  /** 登录IP */
  ipaddr?: string;
  /** 登录地址 */
  loginLocation?: string;
  /** 浏览器类型 */
  browser?: string;
  /** 操作系统 */
  os?: string;
  /** 登录时间 */
  loginTime?: number;
  /** 所属租户 ID（0 = 平台租户） */
  tenantId?: number;
  /** 所属租户名称（平台租户为「平台」） */
  tenantName?: string;
}
