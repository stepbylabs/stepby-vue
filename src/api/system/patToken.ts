import request from '@/utils/request'
import type {
  AjaxResult,
  TableDataInfo,
  PageDomain,
  SysPat,
  CreatePatDto,
  CreatePatResult,
  RotateAkResult
} from '@/types'

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

// ==================== 开放 API AK/SK（PAT 扩展域） ====================

// 轮换开放 API SK（新 AK/SK 明文仅本响应返回一次；敏感操作后端独立限流）
export function rotateAk(patId: string): Promise<AjaxResult<RotateAkResult>> {
  return request({
    url: '/system/pat/' + patId + '/rotate-ak',
    method: 'post'
  })
}

// 吊销开放 API AK/SK（清空两列，幂等）
export function revokeAk(patId: string): Promise<AjaxResult> {
  return request({
    url: '/system/pat/' + patId + '/revoke-ak',
    method: 'post'
  })
}
