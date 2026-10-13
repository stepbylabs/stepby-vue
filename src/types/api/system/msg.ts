import type { PageDomain, BaseEntity } from '../common'

/** 渠道类型：email 邮件 / sms 短信 / site 站内 */
export type ChannelType = 'email' | 'sms' | 'site'

/** 消息渠道分页查询参数 */
export interface ChannelQueryParams extends PageDomain {
  /** 渠道名称 */
  channelName?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 消息渠道 */
export interface SysMsgChannel extends BaseEntity {
  /** 渠道ID */
  channelId?: number
  /** 渠道名称 */
  channelName?: string
  /** 渠道编码（email/sms/site） */
  channelCode?: string
  /** 渠道类型（email/sms/site） */
  channelType?: string
  /** 渠道配置 JSON（敏感字段如 SMTP 密码已脱敏为 ******） */
  configJson?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 消息模板分页查询参数 */
export interface TemplateQueryParams extends PageDomain {
  /** 模板名称 */
  templateName?: string
  /** 模板编码 */
  templateCode?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 消息模板 */
export interface SysMsgTemplate extends BaseEntity {
  /** 模板ID */
  templateId?: number
  /** 模板名称 */
  templateName?: string
  /** 模板编码 */
  templateCode?: string
  /** 渠道编码（默认 email） */
  channelCode?: string
  /** 模板主题（支持 {{var}} 变量） */
  templateSubject?: string
  /** 模板内容（支持 {{var}} 变量） */
  templateContent?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 发送记录分页查询参数 */
export interface SendLogQueryParams extends PageDomain {
  /** 收件地址 */
  toAddr?: string
  /** 模板编码 */
  templateCode?: string
  /** 渠道编码 */
  channelCode?: string
  /** 状态（0成功 1失败 2待重试） */
  status?: '0' | '1' | '2'
}

/** 发送记录 */
export interface SysMsgSendLog {
  /** 记录ID */
  logId?: number
  /** 模板编码 */
  templateCode?: string
  /** 渠道编码 */
  channelCode?: string
  /** 收件地址 */
  toAddr?: string
  /** 主题 */
  subject?: string
  /** 内容 */
  content?: string
  /** 状态（0成功 1失败 2待重试） */
  status?: '0' | '1' | '2'
  /** 已重试次数 */
  retryCount?: number
  /** 最大重试次数 */
  maxRetryCount?: number
  /** 最后一次错误信息 */
  lastError?: string
  /** 发送时间 */
  sendTime?: string
  /** 创建时间 */
  createTime?: string
}
