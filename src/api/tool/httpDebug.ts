import request from '@/utils/request'
import type { AjaxResult } from '@/types'

// 请求头单项
export interface HttpDebugHeader {
  name: string
  value: string
}

// 调试请求 DTO（与后端 sys_http_debug_service::HttpDebugDto 对齐）
export interface HttpDebugRequest {
  method: string
  url: string
  headers: HttpDebugHeader[]
  body?: string
  timeoutSecs?: number
}

// 调试结果 VO（与后端 HttpDebugVo 对齐）
export interface HttpDebugResult {
  status: number
  statusText?: string
  headers: { name: string; value: string }[]
  body: string
  timeMs: number
  sizeBytes: number
  redirected: number
  error?: string
}

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const

// 执行一次调试请求（服务端转发 + SSRF 防护）
export function executeHttpDebug(data: HttpDebugRequest): Promise<AjaxResult<HttpDebugResult>> {
  return request({
    url: '/tool/http-debug/execute',
    method: 'post',
    data
  })
}

export { ALLOWED_METHODS }
