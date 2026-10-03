import type { PageDomain } from '../common'

/** 变更留痕分页查询参数（对应后端 AuditChangeQueryDto） */
export interface AuditChangeQueryParams extends PageDomain {
  /** 被变更的表名（精确） */
  tableName?: string
  /** 被变更行的主键值（精确） */
  rowPk?: string
  /** 变更动作（INSERT / UPDATE / DELETE） */
  action?: string
  /** 操作人用户名（模糊） */
  operatorName?: string
}

/**
 * 变更留痕记录（后端生成类型 re-export）
 *
 * - changedFields：JSON 数组字符串（如 ["status","del_flag"]）
 * - beforeData / afterData：JSON 对象字符串（INSERT/DELETE 时可为 null；敏感列打码 "***"）
 */
export type SysAuditChange = import('@/types/api/generated/SysAuditChange').SysAuditChange
