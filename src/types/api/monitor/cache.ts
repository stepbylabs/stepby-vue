/** 定时任务信息 */
export interface SysCache {
  /** 缓存名称 */
  cacheName?: string
  /** 缓存键名 */
  cacheKey?: string
  /** 缓存内容 */
  cacheValue?: string
  /** 备注 */
  remark?: string
}

/** 热 key（大内存键）项 */
export interface HotKey {
  /** 键名 */
  key: string
  /** 键类型 */
  keyType: string
  /** 内存占用（字节） */
  memoryBytes: number
}

/** 缓存前缀内存统计项 */
export interface CachePrefixStat {
  /** 缓存前缀 */
  cacheName: string
  /** 键数量 */
  keyCount: number
  /** 内存占用（字节） */
  memoryBytes: number
}
