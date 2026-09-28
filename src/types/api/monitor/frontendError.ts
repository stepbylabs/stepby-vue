import type { PageDomain, BaseEntity } from '../common'

/** 前端异常分页查询参数 */
export interface FrontendErrorQueryParams extends PageDomain {
  /** 严重级别 */
  level?: string
  /** 来源 */
  source?: string
  /** 错误名/指标名（模糊） */
  name?: string
  /** 设备类型分桶（FCP-011）：mobile / tablet / desktop */
  deviceType?: string
  /** 时间范围 */
  params?: {
    beginTime?: string
    endTime?: string
  }
  /**
   * 按租户筛选（`[ui].tenant_filter` 决定前端是否给出入口）
   *
   * 仅用于**收窄**：后端与行级 `tenant_scope` 相与（AND），传他租户 id 只会得到空集。
   */
  tenantId?: number
}

/** 前端异常/性能记录 */
export interface SysFrontendError extends BaseEntity {
  /** 记录 ID */
  id?: number
  /** 严重级别：error / warning / info */
  level?: string
  /** 来源：vue / global / unhandledrejection / resource / api / download / vital / other */
  source?: string
  /** 错误名 / 指标名 */
  name?: string
  /** 错误信息 / 指标摘要 */
  message?: string
  /** 堆栈 */
  stack?: string
  /** 发生页面 URL */
  pageUrl?: string
  /** User-Agent */
  userAgent?: string
  /** 设备类型分桶（FCP-011）：mobile / tablet / desktop */
  deviceType?: string
  /** 视口宽 */
  viewWidth?: number
  /** 视口高 */
  viewHeight?: number
  /** 性能指标数值（errors 为空） */
  value?: number
  /** 上报用户名 */
  userName?: string
  /** 创建时间 */
  createTime?: string
}

/** 来源分布统计项 */
export interface FrontendErrorSourceCount {
  source: string
  count: number
}

/** 每日 error 统计项 */
export interface FrontendErrorDailyCount {
  date: string
  count: number
}

/** 概览统计响应 */
export interface FrontendErrorStats {
  bySource: FrontendErrorSourceCount[]
  daily: FrontendErrorDailyCount[]
}
