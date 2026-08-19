import request from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'

// ====== 慢请求 / 慢 SQL ======

export interface SlowRequestRecord {
  /** HTTP 方法 */
  method: string
  /** 请求路径（路由模板） */
  path: string
  /** 响应状态码 */
  status: number
  /** 耗时（毫秒） */
  durationMs: number
  /** 发生时间（RFC3339） */
  at: string
}

export interface TopPath {
  path: string
  count: number
  avgMs: number
  maxMs: number
}

export interface SlowStats {
  /** 缓冲内当前条数 */
  count: number
  /** 平均耗时（毫秒） */
  avgMs: number
  /** 最大耗时（毫秒） */
  maxMs: number
  /** 耗时超过 1s 的条数 */
  over1s: number
  /** 当前阈值（毫秒） */
  thresholdMs: number
  /** Top 慢接口（按出现次数降序） */
  topPaths: TopPath[]
}

// ====== 错误聚合 ======

export interface ErrorEntry {
  requestId: string
  path: string
  message: string
  module: string
  level: string
  at: string
}

export interface StatBucket {
  name: string
  count: number
}

export interface ErrorStats {
  total: number
  byModule: StatBucket[]
  byLevel: StatBucket[]
}

// ====== Redis 运行指标 ======

export interface RedisStats {
  /** 进程运行秒数 */
  uptimeSeconds: string
  /** 已连接客户端数 */
  connectedClients: string
  /** 已使用内存字节 */
  usedMemoryBytes: string
  /** 峰值内存字节 */
  usedMemoryPeakBytes: string
  /** 命中键数 */
  keyspaceHits: string
  /** 未命中键数 */
  keyspaceMisses: string
  /** 累计处理命令数 */
  totalCommandsProcessed: string
  /** 累计网络输入字节 */
  totalNetInputBytes: string
  /** 累计网络输出字节 */
  totalNetOutputBytes: string
  /** 当前数据库键数量 */
  dbSize: string
}

// ====== 查询参数 ======

export interface SlowQueryParams {
  pageNum: number
  pageSize: number
}

export interface ErrorLogQueryParams {
  module?: string
  level?: string
  pageNum: number
  pageSize: number
}

// ====== API 函数 ======

// 慢请求列表（分页）
export function listSlowSql(params: SlowQueryParams): Promise<TableDataInfo<SlowRequestRecord>> {
  return request({
    url: '/monitor/slow-sql/list',
    method: 'get',
    params
  })
}

// 慢请求聚合统计
export function slowSqlStats(): Promise<AjaxResult<SlowStats>> {
  return request({
    url: '/monitor/slow-sql/stats',
    method: 'get'
  })
}

// 清空慢请求缓冲
export function clearSlowSql(): Promise<AjaxResult<{ cleared: number }>> {
  return request({
    url: '/monitor/slow-sql/clear',
    method: 'delete'
  })
}

// 错误日志列表（按 module/level 过滤 + 分页）
export function listErrorLog(params: ErrorLogQueryParams): Promise<TableDataInfo<ErrorEntry>> {
  return request({
    url: '/monitor/error-log/list',
    method: 'get',
    params
  })
}

// 错误聚合统计
export function errorLogStats(): Promise<AjaxResult<ErrorStats>> {
  return request({
    url: '/monitor/error-log/stats',
    method: 'get'
  })
}

// 清空错误缓冲
export function clearErrorLog(): Promise<AjaxResult<{ cleared: number }>> {
  return request({
    url: '/monitor/error-log/clear',
    method: 'delete'
  })
}

// Redis 运行指标
export function redisStats(): Promise<AjaxResult<RedisStats>> {
  return request({
    url: '/monitor/redis/stats',
    method: 'get'
  })
}
