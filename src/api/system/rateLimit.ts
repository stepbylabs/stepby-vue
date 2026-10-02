import request from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'
import type { SysRateLimit, RateLimitQueryParams } from '@/types'

// 类型重新导出，保持现有 import 路径 '@/api/system/rateLimit' 可用
export type { SysRateLimit, RateLimitQueryParams }

// 查询限流配置列表
export function listRateLimit(query: RateLimitQueryParams): Promise<TableDataInfo<SysRateLimit>> {
  return request({
    url: '/system/rateLimit/list',
    method: 'get',
    params: query
  })
}

// 查询限流配置详细
export function getRateLimit(id: number): Promise<AjaxResult<SysRateLimit>> {
  return request({
    url: '/system/rateLimit/' + id,
    method: 'get'
  })
}

// 新增限流配置
export function addRateLimit(data: SysRateLimit): Promise<AjaxResult> {
  return request({
    url: '/system/rateLimit',
    method: 'post',
    data: data
  })
}

// 修改限流配置
export function updateRateLimit(data: SysRateLimit): Promise<AjaxResult> {
  return request({
    url: '/system/rateLimit',
    method: 'put',
    data: data
  })
}

// 删除限流配置
export function delRateLimit(id: number | string): Promise<AjaxResult> {
  return request({
    url: '/system/rateLimit/' + id,
    method: 'delete'
  })
}
