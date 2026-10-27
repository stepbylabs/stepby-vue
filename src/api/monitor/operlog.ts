import request, { FILE_DOWNLOAD_TIMEOUT } from '@/utils/request'
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

// 操作日志链完整性校验结果（GET /monitor/operlog/verify-chain）
export interface ChainVerifyResult {
  /** 参与校验的链节点数 */
  checked: number
  /** 首个校验失败节点的 oper_id（valid=true 时为 null） */
  brokenAtOperId: number | null
  /** 清理缺口段数（批次十九链感知保留：保留期清理的区间由锚点续接校验；0 = 无缺口） */
  gapCount?: number | null
  /** 链是否完整 */
  valid: boolean
}

// 校验操作日志防篡改 HMAC 链完整性（全量，跨租户；批次十九收尾收紧平台专属）
export function verifyChain(): Promise<AjaxResult<ChainVerifyResult>> {
  return request({
    url: '/monitor/operlog/verify-chain',
    method: 'get'
  })
}

// 清理锚点（批次十九）：链感知保留的清理缺口登记行
export interface LogArchiveAnchor {
  anchorId: number
  firstOperId: number
  lastOperId: number
  lastChainHash: string
  deletedCount: number
  mode: string
  archiveObjectKey: string | null
  deletedAt: string
}

// 归档锚点分页列表（平台专属）
export function listArchiveAnchors(params: {
  pageNum?: number
  pageSize?: number
}): Promise<TableDataInfo<LogArchiveAnchor>> {
  return request({
    url: '/monitor/operlog/archive-anchors',
    method: 'get',
    params
  })
}

// 下载归档对象 JSONL（平台专属，octet-stream → Blob）
// b99：归档 JSONL 随日志量增长，传输时长不受服务端处理时长约束 ⇒ 走下载族长上限
export function downloadArchiveFile(anchorId: number): Promise<Blob> {
  return request({
    url: `/monitor/operlog/archive/${anchorId}`,
    method: 'get',
    responseType: 'blob',
    timeout: FILE_DOWNLOAD_TIMEOUT
  })
}
