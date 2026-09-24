import type { SysRole } from './role'
import type { SysDept } from './dept'
import type { SysPost } from './post'
import type { PageDomain, AjaxResult, BaseEntity } from '../common'

/** 用户分页查询参数 */
export interface UserQueryParams extends PageDomain {
  /** 用户名称 */
  userName?: string
  /** 手机号码 */
  phonenumber?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
  /** 部门编号 */
  deptId?: number
  /** 创建时间 */
  params?: {
    beginTime?: string
    endTime?: string
  }
}

/** 角色授权用户分页查询参数 */
export interface AuthUserQueryParams extends UserQueryParams {
  /** 角色编号 */
  roleId?: number
}

/** 用户信息 */
export interface SysUser extends BaseEntity {
  /** 用户ID */
  userId?: number
  /** 部门ID */
  deptId?: number
  /** 用户账号 */
  userName?: string
  /** 用户昵称 */
  nickName?: string
  /** 用户邮箱 */
  email?: string
  /** 手机号码 */
  phonenumber?: string
  /** 手机号国家/地区代码（ISO 3166-1 alpha-2，如 CN/HK/US）。方案 D 多地区化，缺省回退 CN */
  countryCode?: string
  /** 用户性别（0男 1女 2未知） */
  sex?: '0' | '1' | '2'
  /** 用户类型（00:系统用户） */
  userType?: string
  /** 用户头像 */
  avatar?: string
  /** 密码 */
  password?: string
  /** 账号状态（0正常 1停用） */
  status?: '0' | '1'
  /** 部门对象 */
  dept?: SysDept
  /** 角色对象 */
  roles?: SysRole[]
  /** 角色组 */
  roleIds?: number[]
  /** 岗位组 */
  postIds?: number[]
  /** 多部门任职：兼职部门 id 列表（sys_user_dept；列表接口=全部来源，表单接口=仅 admin 来源） */
  deptIds?: number[]
  /** v5-E4：是否已绑定第三方登录身份（sys_oauth_user 存在绑定；仅列表接口返回） */
  oauthBound?: boolean
}

/** 注册信息 */
export interface SysRegister {
  /** 用户账号 */
  userName?: string
  /** 密码 */
  password?: string
  /** 验证码 */
  code?: string
  /** 唯一标识 */
  uuid?: string
}

/** 用户详情查询响应 */
export interface UserFormDataResult extends AjaxResult {
  /** 用户信息 */
  data?: SysUser
  /** 用户的岗位ID列表 */
  postIds?: number[]
  /** 用户的角色ID列表 */
  roleIds?: number[]
  /** 所有角色列表 */
  roles: SysRole[]
  /** 所有岗位列表 */
  posts: SysPost[]
  /** 多部门任职：兼职部门 ID 列表（仅 admin 来源，编辑可改） */
  deptIds?: number[]
  /** v5-D12 Group：SCIM 组联动角色 ID 集合（只读标记，提交不包含） */
  scimRoleIds?: number[]
  /** v5-D12 Group：SCIM 组同步兼职部门 ID 集合（只读标记） */
  scimDeptIds?: number[]
}

/** 用户个人资料响应 */
export interface UserProfileResult extends AjaxResult {
  /** 角色分组 */
  roleGroup: string
  /** 岗位分组 */
  postGroup: string
}

/** 用户头像上传响应 */
export interface UserProfileAvatarResult extends AjaxResult {
  /** 头像地址 */
  imgUrl: string
}

/** 用户授权角色响应 */
export interface UserAuthRoleResult extends AjaxResult {
  /** 用户信息 */
  user: SysUser
  /** 角色列表 */
  roles: SysRole[]
}
