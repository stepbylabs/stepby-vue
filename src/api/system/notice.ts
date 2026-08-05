import request from '@/utils/request'
import type {
  NoticeQueryParams,
  NoticeReadUserQueryParams,
  SysNotice,
  NoticeReadUser,
  SysNoticeTopResult,
  AjaxResult,
  TableDataInfo
} from '@/types'

// 查询公告列表
export function listNotice(query: NoticeQueryParams): Promise<TableDataInfo<SysNotice>> {
  return request({
    url: '/system/notice/list',
    method: 'get',
    params: query
  })
}

// 查询公告详细
export function getNotice(noticeId: number | string): Promise<AjaxResult<SysNotice>> {
  return request({
    url: '/system/notice/' + noticeId,
    method: 'get'
  })
}

// 新增公告
export function addNotice(data: SysNotice): Promise<AjaxResult> {
  return request({
    url: '/system/notice',
    method: 'post',
    data: data
  })
}

// 修改公告
export function updateNotice(data: SysNotice): Promise<AjaxResult> {
  return request({
    url: '/system/notice',
    method: 'put',
    data: data
  })
}

// 删除公告
export function delNotice(noticeId: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/notice/' + noticeId,
    method: 'delete'
  })
}

// 首页顶部公告列表（带已读状态）
export function listNoticeTop(): Promise<SysNoticeTopResult> {
  return request({
    url: '/system/notice/listTop',
    method: 'get'
  })
}

// 标记公告已读
export function markNoticeRead(noticeId: number): Promise<AjaxResult> {
  return request({
    url: '/system/notice/markRead',
    method: 'post',
    params: { noticeId }
  })
}

// 批量标记已读
export function markNoticeReadAll(ids: string): Promise<AjaxResult> {
  return request({
    url: '/system/notice/markReadAll',
    method: 'post',
    params: { ids }
  })
}

// 标记当前用户所有未读公告为已读（跨页"全部已读"，服务端查询所有未读并标记）
// 与 markNoticeReadAll 的区别：前者需要前端传入具体 IDs（仅当前页），本接口服务端处理所有未读
export function markAllUnreadNoticeRead(): Promise<AjaxResult<number>> {
  return request({
    url: '/system/notice/markAllUnreadRead',
    method: 'post'
  })
}

// 查询公告已读用户列表
export function listNoticeReadUsers(query: NoticeReadUserQueryParams): Promise<TableDataInfo<NoticeReadUser>> {
  return request({
    url: '/system/notice/readUsers/list',
    method: 'get',
    params: query
  })
}
