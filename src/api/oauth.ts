import request from '@/utils/request'
import type {
  AjaxResult,
  TableDataInfo,
  OauthProvider,
  OauthProviderQueryParams,
  OauthProviderForm,
  EnabledOauthProvider,
  OauthAuthorizeResult,
  MyOauthBinding
} from '@/types'

// ==================== 公开接口（免鉴权） ====================

// 登录页启用提供商列表
export function listEnabledProviders(): Promise<AjaxResult<EnabledOauthProvider[]>> {
  return request({
    url: '/oauth2/providers',
    headers: { isToken: false },
    method: 'get'
  })
}

// 生成授权 URL（前端拿到后 window.location.href 跳转第三方）
export function getAuthorizeUrl(providerCode: string): Promise<OauthAuthorizeResult> {
  return request({
    url: '/oauth2/authorize',
    headers: { isToken: false },
    method: 'get',
    params: { providerCode }
  })
}

// ==================== 提供商管理（受保护，system:oauth:provider:*） ====================

// 分页查询提供商
export function listOauthProviders(query: OauthProviderQueryParams): Promise<TableDataInfo<OauthProvider>> {
  return request({
    url: '/system/oauth/provider/list',
    method: 'get',
    params: query
  })
}

// 查询提供商详情
export function getOauthProvider(providerId: number | string): Promise<AjaxResult<OauthProvider>> {
  return request({
    url: '/system/oauth/provider/' + providerId,
    method: 'get'
  })
}

// 新增提供商
export function addOauthProvider(data: OauthProviderForm): Promise<AjaxResult<OauthProvider>> {
  return request({
    url: '/system/oauth/provider',
    method: 'post',
    data
  })
}

// 修改提供商
export function updateOauthProvider(data: OauthProviderForm): Promise<AjaxResult<OauthProvider>> {
  return request({
    url: '/system/oauth/provider',
    method: 'put',
    data
  })
}

// 批量删除提供商
export function delOauthProvider(providerIds: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/oauth/provider/' + providerIds,
    method: 'delete'
  })
}

// 启停提供商
export function toggleOauthProvider(providerId: number | string, enabled: string): Promise<AjaxResult> {
  return request({
    url: `/system/oauth/provider/${providerId}/status`,
    method: 'put',
    params: { enabled }
  })
}

// ==================== 绑定管理（受保护，仅登录） ====================

// 当前账号第三方绑定列表
export function listMyBindings(): Promise<AjaxResult<MyOauthBinding[]>> {
  return request({
    url: '/oauth2/my-bindings',
    method: 'get'
  })
}

// 绑定第三方身份（handoff + 登录态）
export function bindOauth(handoff: string): Promise<AjaxResult<{ provider: string; nickname: string | null }>> {
  return request({
    url: '/oauth2/bind',
    method: 'post',
    data: { handoff }
  })
}

// 解绑第三方身份
export function unbindOauth(provider: string): Promise<AjaxResult> {
  return request({
    url: '/oauth2/unbind',
    method: 'delete',
    params: { provider }
  })
}
