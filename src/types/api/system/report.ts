import type { PageDomain, BaseEntity } from '../common'

/** 报表类型：login_stats 登录统计 / user_stats 用户统计 / msg_stats 消息统计 / custom 自定义 */
export type ReportType = 'login_stats' | 'user_stats' | 'msg_stats' | 'custom'

/** 报表定义分页查询参数 */
export interface ReportQueryParams extends PageDomain {
  /** 报表名称 */
  reportName?: string
  /** 报表编码 */
  reportCode?: string
  /** 报表类型（login_stats/user_stats/msg_stats/custom） */
  reportType?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 报表定义 */
export interface SysReport extends BaseEntity {
  /** 报表ID */
  reportId?: number
  /** 报表编码（唯一） */
  reportCode?: string
  /** 报表名称 */
  reportName?: string
  /** 报表类型（login_stats/user_stats/msg_stats/custom） */
  reportType?: string
  /** 报表配置 JSON */
  config?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 报表订阅分页查询参数 */
export interface SubQueryParams extends PageDomain {
  /** 关联报表ID */
  reportId?: number
  /** 订阅名称 */
  subName?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 报表订阅 */
export interface SysReportSub extends BaseEntity {
  /** 订阅ID */
  subId?: number
  /** 关联报表ID */
  reportId?: number
  /** 订阅名称 */
  subName?: string
  /** 周期 cron 表达式（6 字段，含秒） */
  cron?: string
  /** 是否邮件推送（1=是 0=否） */
  pushEmail?: '0' | '1'
  /** 收件邮箱（逗号分隔） */
  receiveEmail?: string
  /** 是否站内信推送（1=是 0=否） */
  pushSysMsg?: '0' | '1'
  /** 目标用户 id（逗号分隔） */
  receiveUserIds?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
  /** 上次成功执行时间 */
  lastRunTime?: string
}

/** 报表快照（手动预览 / 定时推送共用） */
export interface ReportSnapshot {
  /** 报表编码 */
  reportCode: string
  /** 报表名称 */
  reportName: string
  /** 报表类型 */
  reportType: string
  /** 生成时间 */
  generatedAt: string
  /** 快照数据（按报表类型结构不同） */
  data: Record<string, unknown> | unknown[]
}

/** 订阅推送结果统计 */
export interface PushSummary {
  /** 生成时间 */
  generatedAt: string
  /** 报表名称 */
  reportName: string
  /** 邮件发送数 */
  emailsSent: number
  /** 站内信发送数 */
  siteMsgs: number
}
