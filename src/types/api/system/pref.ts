/**
 * 个人中心消息偏好 / 免打扰 类型
 * 对应后端 PrefVo（camelCase）与 PrefUpdateDto。
 */

/** 消息偏好 / 免打扰 出参（PrefVo） */
export interface MessagePref {
  userId: number
  /** 是否接收公告邮件：'1' 是（默认）'0' 否 */
  emailNotify: '0' | '1'
  /** 是否接收站内信通知：'1' 是（默认）'0' 否 */
  sysmsgNotify: '0' | '1'
  /** 是否接收通知公告：'1' 是（默认）'0' 否 */
  announceNotify: '0' | '1'
  /** 是否启用免打扰：'0' 否（默认）'1' 是 */
  dndEnabled: '0' | '1'
  /** 免打扰开始时间（HH:MM） */
  dndStart: string
  /** 免打扰结束时间（HH:MM） */
  dndEnd: string
}

/** 消息偏好 / 免打扰 更新参数（PrefUpdateDto，全部可选，传字段仅覆盖） */
export interface MessagePrefForm {
  emailNotify?: '0' | '1'
  sysmsgNotify?: '0' | '1'
  announceNotify?: '0' | '1'
  dndEnabled?: '0' | '1'
  dndStart?: string
  dndEnd?: string
}
