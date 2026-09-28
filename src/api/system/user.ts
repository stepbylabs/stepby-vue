import request from '@/utils/request'
import { parseStrEmpty } from '@/utils/stepby'
import { cachedApi, invalidateApiCache } from '@/utils/apiCache'
import type {
  UserQueryParams,
  UserFormDataResult,
  UserProfileResult,
  UserAuthRoleResult,
  UserProfileAvatarResult,
  SysUser,
  SysUserRoles,
  AjaxResult,
  TableDataInfo,
  TreeSelect,
  UserErasureReport
} from '@/types'

// 查询用户列表
export function listUser(query: UserQueryParams): Promise<TableDataInfo<SysUser>> {
  return request({
    url: '/system/user/list',
    method: 'get',
    params: query
  })
}

// 查询用户详细
export function getUser(userId?: number): Promise<UserFormDataResult> {
  return request({
    url: '/system/user/' + parseStrEmpty(userId),
    method: 'get'
  })
}

// 新增用户
export function addUser(data: SysUser): Promise<AjaxResult> {
  return request({
    url: '/system/user',
    method: 'post',
    data: data
  })
}

// 修改用户
export function updateUser(data: SysUser): Promise<AjaxResult> {
  return request({
    url: '/system/user',
    method: 'put',
    data: data
  })
}

// 删除用户
export function delUser(userId: number | number[]): Promise<AjaxResult> {
  return request({
    url: '/system/user/' + userId,
    method: 'delete'
  })
}

/**
 * GDPR 用户匿名化**预检**（dry-run，只读）。
 *
 * 能力位 `privacy.user_erasure` ≥ `precheck` 且操作者为平台管理员时可用；
 * 否则后端返回 404（关闭态端点表现为"不存在"）。返回将被置换的字段清单与受影响凭据计数。
 */
export function anonymizeUserPrecheck(userId: number): Promise<AjaxResult<UserErasureReport>> {
  return request({
    url: `/system/user/${userId}/anonymize/precheck`,
    method: 'get'
  })
}

/**
 * GDPR 用户匿名化**执行**（不可逆）。
 *
 * 需能力位档位 = `full` 且操作者为平台管理员。执行后：PII 置换、登录键改为
 * `deleted_{id}`、密码清空、停用 + 软删、全部会话 / PAT / SSO 令牌即时吊销；
 * **审计留痕保留**。幂等（已匿名化的用户重复调用不报错）。
 */
export function anonymizeUser(userId: number): Promise<AjaxResult<UserErasureReport>> {
  return request({
    url: `/system/user/${userId}/anonymize`,
    method: 'post'
  })
}

// 用户密码重置
export function resetUserPwd(userId: number, password: string): Promise<AjaxResult> {
  const data = {
    userId,
    password
  }
  return request({
    url: '/system/user/resetPwd',
    method: 'put',
    data: data
  })
}

// 用户状态修改
export function changeUserStatus(userId: number, status: string): Promise<AjaxResult> {
  const data = {
    userId,
    status
  }
  return request({
    url: '/system/user/changeStatus',
    method: 'put',
    data: data
  })
}

// 查询用户个人信息
export function getUserProfile(): Promise<UserProfileResult> {
  return request({
    url: '/system/user/profile',
    method: 'get'
  })
}

// 修改用户个人信息
export function updateUserProfile(data: SysUser): Promise<AjaxResult> {
  return request({
    url: '/system/user/profile',
    method: 'put',
    data: data
  })
}

// 用户密码重置
export function updateUserPwd(oldPassword: string, newPassword: string): Promise<AjaxResult> {
  const data = {
    oldPassword,
    newPassword
  }
  return request({
    url: '/system/user/profile/updatePwd',
    method: 'put',
    data: data
  })
}

// 用户头像上传
// API-002：FormData 上传必须移除手动 Content-Type，由浏览器自动设置
// multipart/form-data; boundary=...，否则 boundary 丢失导致后端解析失败
export function uploadAvatar(file: FormData | File): Promise<UserProfileAvatarResult> {
  return request({
    url: '/system/user/profile/avatar',
    method: 'post',
    data: file
  })
}

// 查询授权角色
export function getAuthRole(userId: number): Promise<UserAuthRoleResult> {
  return request({
    url: '/system/user/authRole/' + userId,
    method: 'get'
  })
}

// 保存授权角色
export function updateAuthRole(data: SysUserRoles): Promise<AjaxResult> {
  return request({
    url: '/system/user/authRole',
    method: 'put',
    params: data
  })
}

// 部门树缓存 key（全局共享数据，可安全缓存；用户管理 / 角色管理等多处使用）
export const DEPT_TREE_CACHE_KEY = 'system:user:deptTree'

// 查询部门下拉树结构（带 30s TTL 内存缓存 + 并发请求去重，对调用方透明）
export const deptTreeSelect = cachedApi(DEPT_TREE_CACHE_KEY, (): Promise<AjaxResult<TreeSelect>> =>
  request({
    url: '/system/user/deptTree',
    method: 'get'
  })
)

/**
 * 下载用户导入模板（POST 返回 xlsx 字节流）
 */
export function importUserTemplate() {
  return request({
    url: '/system/user/importTemplate',
    method: 'post',
    responseType: 'blob'
  })
}

/**
 * 批量导入用户（上传 xlsx，multipart 字段名 file）
 *
 * - updateSupport=1 时，登录名称已存在的用户走资料更新（不重置密码/角色）
 * - 后端逐行校验，失败行不中断整批，返回 { success, errorList: {rowNum, error}[] }
 */
export function importUserData(file: File, updateSupport = false): Promise<AjaxResult<ImportUserResult>> {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/system/user/importData',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    params: { updateSupport: updateSupport ? 1 : 0 }
  })
}

export interface ImportUserResult {
  success: number
  errorList: { rowNum: number; error: string }[]
}

/**
 * 强制刷新部门树下拉缓存（下次调用 deptTreeSelect 时会重新请求后端）
 *
 * 用途：用户在部门管理页新增/修改/删除部门后，可通过此方法让其它页面立即拿到最新数据
 */
export function refreshDeptTreeSelect(): void {
  invalidateApiCache(DEPT_TREE_CACHE_KEY)
}
