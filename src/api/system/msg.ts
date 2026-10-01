import request from '@/utils/request'
import type {
  ChannelQueryParams,
  TemplateQueryParams,
  SendLogQueryParams,
  SysMsgChannel,
  SysMsgTemplate,
  SysMsgSendLog,
  AjaxResult,
  TableDataInfo
} from '@/types'

// ==================== 消息渠道 ====================

// 查询消息渠道列表
export function listChannel(query: ChannelQueryParams): Promise<TableDataInfo<SysMsgChannel>> {
  return request({
    url: '/system/msg/channel/list',
    method: 'get',
    params: query
  })
}

// 查询消息渠道详细
export function getChannel(channelId: number | string): Promise<AjaxResult<SysMsgChannel>> {
  return request({
    url: '/system/msg/channel/' + channelId,
    method: 'get'
  })
}

// 新增消息渠道
export function addChannel(data: SysMsgChannel): Promise<AjaxResult> {
  return request({
    url: '/system/msg/channel',
    method: 'post',
    data: data
  })
}

// 修改消息渠道
export function updateChannel(data: SysMsgChannel): Promise<AjaxResult> {
  return request({
    url: '/system/msg/channel',
    method: 'put',
    data: data
  })
}

// 删除消息渠道
export function delChannel(channelIds: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/msg/channel/' + channelIds,
    method: 'delete'
  })
}

// 渠道连通性测试
export function testChannel(channelId: number | string): Promise<AjaxResult> {
  return request({
    url: '/system/msg/channel/test/' + channelId,
    method: 'post'
  })
}

// ==================== 消息模板 ====================

// 查询消息模板列表
export function listTemplate(query: TemplateQueryParams): Promise<TableDataInfo<SysMsgTemplate>> {
  return request({
    url: '/system/msg/template/list',
    method: 'get',
    params: query
  })
}

// 查询消息模板详细
export function getTemplate(templateId: number | string): Promise<AjaxResult<SysMsgTemplate>> {
  return request({
    url: '/system/msg/template/' + templateId,
    method: 'get'
  })
}

// 新增消息模板
export function addTemplate(data: SysMsgTemplate): Promise<AjaxResult> {
  return request({
    url: '/system/msg/template',
    method: 'post',
    data: data
  })
}

// 修改消息模板
export function updateTemplate(data: SysMsgTemplate): Promise<AjaxResult> {
  return request({
    url: '/system/msg/template',
    method: 'put',
    data: data
  })
}

// 删除消息模板
export function delTemplate(templateIds: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/msg/template/' + templateIds,
    method: 'delete'
  })
}

// ==================== 发送记录 ====================

// 查询发送记录列表
export function listSendLog(query: SendLogQueryParams): Promise<TableDataInfo<SysMsgSendLog>> {
  return request({
    url: '/system/msg/log/list',
    method: 'get',
    params: query
  })
}

// 删除发送记录（单条或批量）
export function delSendLog(logIds: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/msg/log/' + logIds,
    method: 'delete'
  })
}

// 清空发送记录
export function cleanSendLog(): Promise<AjaxResult> {
  return request({
    url: '/system/msg/log/clean',
    method: 'delete'
  })
}

// 重试发送记录（单条或批量）
export function retrySendLog(logIds: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/msg/log/retry/' + logIds,
    method: 'post'
  })
}
