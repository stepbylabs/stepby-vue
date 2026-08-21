import request from '@/utils/request'
import { download } from '@/utils/request'
import type {
  WebHookQueryParams,
  WebHookLogQueryParams,
  SysWebHook,
  SysWebHookLog,
  DeliveryResult,
  AjaxResult,
  TableDataInfo
} from '@/types'

// 分页查询回调配置
export function listWebHook(query: WebHookQueryParams): Promise<TableDataInfo<SysWebHook>> {
  return request({
    url: '/monitor/webHook/list',
    method: 'get',
    params: query
  })
}

// 查询回调配置详细
export function getWebHook(id: number | string): Promise<AjaxResult<SysWebHook>> {
  return request({
    url: '/monitor/webHook/' + id,
    method: 'get'
  })
}

// 新增回调配置
export function addWebHook(data: SysWebHook): Promise<AjaxResult> {
  return request({
    url: '/monitor/webHook',
    method: 'post',
    data: data
  })
}

// 修改回调配置
export function updateWebHook(data: SysWebHook): Promise<AjaxResult> {
  return request({
    url: '/monitor/webHook',
    method: 'put',
    data: data
  })
}

// 批量删除回调配置
export function delWebHook(ids: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/monitor/webHook/' + ids,
    method: 'delete'
  })
}

// 回调启停
export function changeWebHookStatus(id: number | string, status: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/webHook/' + id + '/status',
    method: 'put',
    data: { status: status }
  })
}

// 手动测试推送
export function testWebHook(
  id: number | string,
  data: { eventType?: string; payload?: unknown }
): Promise<AjaxResult<DeliveryResult>> {
  return request({
    url: '/monitor/webHook/' + id + '/test',
    method: 'post',
    data: data
  })
}

// 导出回调配置
export function exportWebHook(query: WebHookQueryParams): void {
  download('/monitor/webHook/export', { ...query }, `web_hook_${new Date().getTime()}.xlsx`)
}

// ==================== 推送记录 ====================

// 分页查询推送记录
export function listWebHookLog(query: WebHookLogQueryParams): Promise<TableDataInfo<SysWebHookLog>> {
  return request({
    url: '/monitor/webHook/log/list',
    method: 'get',
    params: query
  })
}

// 删除推送记录（单条或批量）
export function delWebHookLog(ids: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/monitor/webHook/log/' + ids,
    method: 'delete'
  })
}

// 清空推送记录
export function cleanWebHookLog(): Promise<AjaxResult> {
  return request({
    url: '/monitor/webHook/log/clean',
    method: 'delete'
  })
}

// 重试推送记录（单条或批量）
export function retryWebHookLog(ids: number | string | Array<number | string>): Promise<AjaxResult<{ count: number }>> {
  return request({
    url: '/monitor/webHook/log/' + ids + '/retry',
    method: 'post'
  })
}

// 导出推送记录
export function exportWebHookLog(query: WebHookLogQueryParams): void {
  download('/monitor/webHook/log/export', { ...query }, `web_hook_log_${new Date().getTime()}.xlsx`)
}
