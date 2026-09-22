import request from '@/utils/request'
import type {
  AjaxResult,
  TableDataInfo,
  SsoClient,
  SsoClientQueryParams,
  SsoClientForm,
  SsoClientCreateResult,
  SsoConsentForm
} from '@/types'

// ==================== SSO 客户端管理（受保护，system:oauth:client:*） ====================

// 分页查询已注册客户端
export function listSsoClients(query: SsoClientQueryParams): Promise<TableDataInfo<SsoClient>> {
  return request({
    url: '/system/oauth/client/list',
    method: 'get',
    params: query
  })
}

// 查询客户端详情（内部主键 ssoClientId）
export function getSsoClient(ssoClientId: number | string): Promise<AjaxResult<SsoClient>> {
  return request({
    url: '/system/oauth/client/' + ssoClientId,
    method: 'get'
  })
}

// 新增客户端（一次性返回明文 clientSecret）
export function addSsoClient(data: SsoClientForm): Promise<AjaxResult<SsoClientCreateResult>> {
  return request({
    url: '/system/oauth/client',
    method: 'post',
    data
  })
}

// 修改客户端（不接收密钥回传）
export function updateSsoClient(data: SsoClientForm): Promise<AjaxResult<SsoClient>> {
  return request({
    url: '/system/oauth/client',
    method: 'put',
    data
  })
}

// 批量删除客户端
export function delSsoClient(ids: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/oauth/client/' + ids,
    method: 'delete'
  })
}

// 启停客户端
export function toggleSsoClient(ssoClientId: number | string, enabled: string): Promise<AjaxResult> {
  return request({
    url: `/system/oauth/client/${ssoClientId}/status`,
    method: 'put',
    params: { enabled }
  })
}

// ==================== 同意页（受保护，仅登录） ====================

// 批准 / 拒绝授权，返回 { redirect }（RP 回跳地址，含 code 或 error）
export function submitSsoConsent(data: SsoConsentForm): Promise<AjaxResult<{ redirect: string }>> {
  return request({
    url: '/sso/consent',
    method: 'post',
    data
  })
}
