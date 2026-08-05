/** API 限流配置信息 */
export interface SysRateLimit {
  /** 主键 ID */
  id: number
  /** 路由前缀（"*" 表示全局默认） */
  routePattern: string
  /** 桶容量（突发请求上限） */
  capacity: number
  /** 每秒补充令牌数 */
  refillPerSecond: number
  /** 是否启用 */
  enabled: boolean
  /** 描述 */
  description?: string
  /** 创建时间 */
  createTime?: string
  /** 创建者 */
  createBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 更新者 */
  updateBy?: string
}

/** 限流配置分页查询参数 */
export interface RateLimitQueryParams {
  pageNum: number
  pageSize: number
  routePattern?: string
  enabled?: boolean
}
