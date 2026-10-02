import request from '@/utils/request'
import type {
  ReportQueryParams,
  SubQueryParams,
  SysReport,
  SysReportSub,
  ReportSnapshot,
  PushSummary,
  AjaxResult,
  TableDataInfo
} from '@/types'

// ==================== 报表定义 ====================

// 分页查询报表定义
export function listReport(query: ReportQueryParams): Promise<TableDataInfo<SysReport>> {
  return request({
    url: '/system/report/list',
    method: 'get',
    params: query
  })
}

// 查询报表定义详细
export function getReport(reportId: number | string): Promise<AjaxResult<SysReport>> {
  return request({
    url: '/system/report/' + reportId,
    method: 'get'
  })
}

// 新增报表定义
export function addReport(data: SysReport): Promise<AjaxResult<SysReport>> {
  return request({
    url: '/system/report',
    method: 'post',
    data: data
  })
}

// 修改报表定义
export function updateReport(data: SysReport): Promise<AjaxResult<SysReport>> {
  return request({
    url: '/system/report',
    method: 'put',
    data: data
  })
}

// 批量删除报表定义（级联逻辑删除其下订阅）
export function delReport(reportIds: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/report/' + reportIds,
    method: 'delete'
  })
}

// 报表启停
export function changeReportStatus(reportId: number | string, status: string): Promise<AjaxResult> {
  return request({
    url: '/system/report/' + reportId + '/status',
    method: 'put',
    data: { status: status }
  })
}

// 手动预览报表快照（不落库、不推送）
export function previewReport(reportId: number | string): Promise<AjaxResult<ReportSnapshot>> {
  return request({
    url: '/system/report/' + reportId + '/preview',
    method: 'post'
  })
}

// ==================== 报表订阅 ====================

// 分页查询报表订阅
export function listSub(query: SubQueryParams): Promise<TableDataInfo<SysReportSub>> {
  return request({
    url: '/system/report/sub/list',
    method: 'get',
    params: query
  })
}

// 查询订阅详细
export function getSub(subId: number | string): Promise<AjaxResult<SysReportSub>> {
  return request({
    url: '/system/report/sub/' + subId,
    method: 'get'
  })
}

// 新增报表订阅
export function addSub(data: SysReportSub): Promise<AjaxResult<SysReportSub>> {
  return request({
    url: '/system/report/sub',
    method: 'post',
    data: data
  })
}

// 修改报表订阅
export function updateSub(data: SysReportSub): Promise<AjaxResult<SysReportSub>> {
  return request({
    url: '/system/report/sub',
    method: 'put',
    data: data
  })
}

// 批量删除报表订阅
export function delSub(subIds: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/report/sub/' + subIds,
    method: 'delete'
  })
}

// 订阅启停
export function changeSubStatus(subId: number | string, status: string): Promise<AjaxResult> {
  return request({
    url: '/system/report/sub/' + subId + '/status',
    method: 'put',
    data: { status: status }
  })
}

// 手动触发订阅推送（立即生成快照并投递）
export function runSub(subId: number | string): Promise<AjaxResult<PushSummary>> {
  return request({
    url: '/system/report/sub/' + subId + '/run',
    method: 'post'
  })
}
