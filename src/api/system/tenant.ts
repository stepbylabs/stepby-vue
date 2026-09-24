import request from '@/utils/request'
import type { AjaxResult } from '@/types'

export interface TenantQueryParams {
  tenantName?: string
}

export interface TenantVo {
  deptId: number
  tenantName: string
  leader?: string
  phone?: string
  email?: string
  status?: string
  orderNum?: number
  userCount: number
  createTime?: string
}

export interface TenantForm {
  deptId?: number
  tenantName: string
  leader?: string
  phone?: string
  email?: string
  orderNum?: number
  status?: string
  remark?: string
}

// 查询租户列表（dept 树根=租户，平台根除外）
export function listTenant(query?: TenantQueryParams): Promise<AjaxResult<TenantVo[]>> {
  return request({
    url: '/system/tenant/list',
    method: 'get',
    params: query
  })
}

// 查询租户详情
export function getTenant(deptId: number): Promise<AjaxResult<TenantVo>> {
  return request({
    url: '/system/tenant/' + deptId,
    method: 'get'
  })
}

// 新增租户
export function addTenant(data: TenantForm): Promise<AjaxResult> {
  return request({
    url: '/system/tenant',
    method: 'post',
    data: data
  })
}

// 修改租户
export function updateTenant(data: TenantForm): Promise<AjaxResult> {
  return request({
    url: '/system/tenant',
    method: 'put',
    data: data
  })
}

// 租户启停（停用后该租户用户无法登录）
export function changeTenantStatus(deptId: number, status: string): Promise<AjaxResult> {
  return request({
    url: '/system/tenant/changeStatus',
    method: 'put',
    data: { deptId, status }
  })
}

// 删除租户（租户内仍有用户时拒绝）
export function delTenant(deptId: number): Promise<AjaxResult> {
  return request({
    url: '/system/tenant/' + deptId,
    method: 'delete'
  })
}
