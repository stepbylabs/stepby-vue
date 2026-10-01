import request from '@/utils/request'
import type { OperlogQueryParams, SysOperLog, AjaxResult, TableDataInfo } from '@/types'

// 查询操作日志列表
export function list(query: OperlogQueryParams): Promise<TableDataInfo<SysOperLog>> {
  return request({
    url: '/monitor/operlog/list',
    method: 'get',
    params: query
  })
}

// 删除操作日志
export function delOperlog(operId: number | number[]): Promise<AjaxResult> {
  return request({
    url: '/monitor/operlog/' + operId,
    method: 'delete'
  })
}

// 清空操作日志
export function cleanOperlog(): Promise<AjaxResult> {
  return request({
    url: '/monitor/operlog/clean',
    method: 'delete'
  })
}

// 查询审计合规报告数据（用于导出 PDF）
export function getComplianceReport(days: number): Promise<AjaxResult<unknown>> {
  return request({
    url: `/monitor/operlog/compliance-report?days=${days}`,
    method: 'get'
  })
}

// 查询异常操作告警状态
export function getAlarmStatus(params?: Record<string, unknown>): Promise<AjaxResult<unknown>> {
  return request({
    url: '/monitor/operlog/alarm-status',
    method: 'get',
    params
  })
}
