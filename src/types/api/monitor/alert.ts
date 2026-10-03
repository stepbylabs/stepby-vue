import type { PageDomain } from '../common'

/** 告警规则实体（后端生成类型 re-export） */
export type SysAlertRule = import('@/types/api/generated/SysAlertRule').SysAlertRule

/** 告警规则分页查询参数（对应后端 AlertRuleQueryDto） */
export interface AlertRuleQueryParams extends PageDomain {
  /** 规则名称（模糊） */
  name?: string
  /** 指标标识（精确） */
  metric?: string
  /** 启用状态（'1' 启用 / '0' 停用） */
  enabled?: string
}

/** 告警规则新增/修改请求体（对应后端 AlertRuleAddDto / AlertRuleEditDto） */
export interface AlertRuleSaveDto {
  id?: number
  /** 规则名称 */
  name: string
  /** 指标标识（服务端白名单校验） */
  metric: string
  /** 比较器（gt / lt / ge / le） */
  comparator: string
  /** 阈值 */
  threshold: number
  /** 静默期（分钟，0-14400） */
  silentMinutes: number
  /** 通知渠道 ID（空 = 仅记录不发送） */
  notifyChannelId?: number | null
  /** 通知模板 ID */
  notifyTemplateId?: number | null
  /** 是否启用（'1' 启用 / '0' 停用） */
  enabled: string
}

/** 手动评估结果（对应后端 AlertEvaluateResult） */
export interface AlertEvaluateResult {
  /** 指标当前值 */
  metricValue: number
  /** 是否命中阈值并触发 */
  fired: boolean
  /** 结果说明（后端 i18n 文案） */
  reason: string
}
