import request from '@/utils/request'
import type { FrontendErrorQueryParams, SysFrontendError, FrontendErrorStats, AjaxResult, TableDataInfo } from '@/types'

// 查询前端异常列表
export function listFrontendError(query: FrontendErrorQueryParams): Promise<TableDataInfo<SysFrontendError>> {
  return request({
    url: '/monitor/frontendError/list',
    method: 'get',
    params: query
  })
}

// 查询前端异常详情
export function getFrontendError(id: number): Promise<AjaxResult<SysFrontendError>> {
  return request({
    url: '/monitor/frontendError/' + id,
    method: 'get'
  })
}

// 删除前端异常
export function delFrontendError(id: number | number[]): Promise<AjaxResult> {
  return request({
    url: '/monitor/frontendError/' + id,
    method: 'delete'
  })
}

// 清空前端异常（可选时间范围，否则按保留期清理）
export function cleanFrontendError(params?: Record<string, unknown>): Promise<AjaxResult> {
  return request({
    url: '/monitor/frontendError/clean',
    method: 'delete',
    params
  })
}

// 概览统计（来源分布 + 每日 error 趋势）
export function getFrontendErrorStats(days: number): Promise<AjaxResult<FrontendErrorStats>> {
  return request({
    url: '/monitor/frontendError/stats',
    method: 'get',
    params: { days }
  })
}
