import request from '@/utils/request'
import type { AjaxResult, MessagePref, MessagePrefForm } from '@/types'

// ==================== 个人消息偏好 / 免打扰（仅登录，操作对象为当前用户） ====================

// 查询当前用户消息偏好 / 免打扰
export function getMessagePref(): Promise<AjaxResult<MessagePref>> {
  return request({
    url: '/system/profile/pref',
    method: 'get'
  })
}

// 更新当前用户消息偏好 / 免打扰（仅传入需要覆盖的字段）
export function updateMessagePref(data: MessagePrefForm): Promise<AjaxResult<MessagePref>> {
  return request({
    url: '/system/profile/pref',
    method: 'put',
    data
  })
}
