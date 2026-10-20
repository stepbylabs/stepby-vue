import type { PageDomain, BaseEntity, AjaxResult } from '../common'

/** 通知公告分页查询参数 */
export interface NoticeQueryParams extends PageDomain {
  /** 公告标题 */
  noticeTitle?: string
  /** 操作人员 */
  createBy?: string
  /** 公告类型 */
  noticeType?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/**
 * 通知公告信息
 *
 * 契约单一事实源：`src/types/api/generated/SysNotice.ts`（ts-rs 从后端生成），
 * 字段名与可空性以该文件为准；本接口同时充当新增/修改的请求体（故保留 BaseEntity 的可选项）。
 */
export interface SysNotice extends BaseEntity {
  /** 公告编号 */
  noticeId?: number
  /** 多租户归属（后端实发且非空；0 = 平台租户） */
  tenantId?: number
  /** 公告标题 */
  noticeTitle?: string
  /** 公告类型（1通知 2公告） */
  noticeType?: '1' | '2'
  /** 公告内容 */
  noticeContent?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
  /**
   * 当前用户是否已读。b79 P3 起由**服务端逐行下发**：`/system/notice/list` 与 `/listTop`
   * 的行是 `NoticeRowVo`（公告本体 flatten + `isRead`），值取自 `sys_notice_read` 的
   * (notice_id, user_id) 行。
   *
   * 修前该字段只存在于前端内存（store 乐观更新写入），刷新后由 `listTop.isRead` 重建的
   * `readIds` 恒为空 ⇒ 已读的行全部退回「未读」，而同一时刻铃铛 `unreadCount`（服务端算的）
   * 显示 0，两个界面互相矛盾。缺省仍按未读处理（可选字段，兼容旧响应）。
   */
  isRead?: boolean
  /** 新增时是否同步通过邮件通知（仅 add 请求提交，对应后端 NoticeDto.notify_email；响应不含） */
  notifyEmail?: boolean
}

/** 顶部公告列表响应 */
export interface SysNoticeTopResult extends AjaxResult<SysNotice[]> {
  /** 未读公告数 */
  unreadCount: number
}

/** 公告已读用户查询参数 */
export interface NoticeReadUserQueryParams extends PageDomain {
  /** 公告编号 */
  noticeId?: number
  /** 关键字（登录名/用户名） */
  searchValue?: string
}

/** 公告已读用户 */
export interface NoticeReadUser {
  /** 用户编号 */
  userId?: number
  /** 用户账号 */
  userName?: string
  /** 用户昵称 */
  nickName?: string
  /** 部门名称 */
  deptName?: string
  /** 手机号码 */
  phonenumber?: string
  /** 阅读时间 */
  readTime?: string
}
