import type { PageDomain } from '../common'

/** 回调配置分页查询参数 */
export interface WebHookQueryParams extends PageDomain {
  /** 回调名称 */
  hookName?: string
  /** 事件类型（逗号分隔 / 多选） */
  eventTypes?: string
  /** 状态（0启用 1停用） */
  status?: string
}

/** 推送记录分页查询参数 */
export interface WebHookLogQueryParams extends PageDomain {
  /** 关联回调 id */
  hookId?: number
  /** 事件类型 */
  eventType?: string
  /** 状态（0成功 1失败） */
  status?: string
}

/** 回调配置（后端生成类型） */
export type SysWebHook = import('@/types/api/generated/SysWebHook').SysWebHook

/** 推送记录（后端生成类型） */
export type SysWebHookLog = import('@/types/api/generated/SysWebHookLog').SysWebHookLog

/** 手动测试推送结果 */
export interface DeliveryResult {
  /** 是否投递成功 */
  ok: boolean
  /** HTTP 状态码 */
  statusCode: number
  /** 响应体 */
  response: string
  /** 错误信息 */
  error?: string
  /** 耗时（毫秒） */
  costMs: number
  /** 落库的推送记录 id */
  logId: number
}
