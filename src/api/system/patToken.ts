import request from '@/utils/request'
import type { AjaxResult, TableDataInfo, PageDomain, SysPat, CreatePatDto, CreatePatResult } from '@/types'

// ==================== 个人访问令牌：自助接口（仅登录，恒操作本人） ====================

// 我的令牌列表
export function listMyTokens(query: PageDomain): Promise<TableDataInfo<SysPat>> {
  return request({
    url: '/system/user/profile/tokens',
    method: 'get',
    params: query
  })
}

// 我可授予的 scope 选项（来自当前用户权限集）
export function getScopeOptions(): Promise<AjaxResult<string[]>> {
  return request({
    url: '/system/user/profile/tokens/scopes',
    method: 'get'
  })
}

// 新建令牌（返回一次性明文 token，仅此一次）
export function createToken(data: CreatePatDto): Promise<AjaxResult<CreatePatResult>> {
  return request({
    url: '/system/user/profile/tokens',
    method: 'post',
    data
  })
}

// 吊销我的令牌
export function revokeMyToken(patId: string): Promise<AjaxResult> {
  return request({
    url: '/system/user/profile/tokens/' + patId,
    method: 'delete'
  })
}
