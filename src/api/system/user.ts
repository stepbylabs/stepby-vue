import request from '@/utils/request'
import { parseStrEmpty } from '@/utils/yebot'
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
  TreeSelect
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
 * 强制刷新部门树下拉缓存（下次调用 deptTreeSelect 时会重新请求后端）
 *
 * 用途：用户在部门管理页新增/修改/删除部门后，可通过此方法让其它页面立即拿到最新数据
 */
export function refreshDeptTreeSelect(): void {
  invalidateApiCache(DEPT_TREE_CACHE_KEY)
}
