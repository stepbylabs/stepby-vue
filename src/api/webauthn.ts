import request from '@/utils/request'
import type {
  AjaxResult,
  LoginInfoResult,
  SerializedCreationOptions,
  SerializedRequestOptions,
  WebauthnCredentialVo,
  WebauthnLoginFinishDto,
  WebauthnLoginStartDto,
  WebauthnRegisterFinishDto
} from '@/types'

// ==================== 自助：绑定 / 凭据管理（需登录） ====================

// 开始绑定 passkey，返回给 navigator.credentials.create 的 options（base64url）
export function registerStart(): Promise<AjaxResult<SerializedCreationOptions>> {
  return request({
    url: '/system/user/webauthn/register/start',
    method: 'post',
    headers: { repeatSubmit: false }
  })
}

// 完成绑定（body 为 navigator.credentials.create 结果 + 名称）
export function registerFinish(data: WebauthnRegisterFinishDto): Promise<AjaxResult> {
  return request({
    url: '/system/user/webauthn/register/finish',
    method: 'post',
    data,
    headers: { repeatSubmit: false }
  })
}

// 本人 passkey 凭据列表
export function listCredentials(): Promise<AjaxResult<WebauthnCredentialVo[]>> {
  return request({
    url: '/system/user/webauthn/credentials',
    method: 'get'
  })
}

// 删除本人凭据
export function deleteCredential(credId: number): Promise<AjaxResult> {
  return request({
    url: '/system/user/webauthn/credentials/' + credId,
    method: 'delete'
  })
}

// ==================== 公开：passkey 登录（免鉴权 + 限流） ====================

// 开始 passkey 登录，返回给 navigator.credentials.get 的 options（base64url）
export function webauthnLoginStart(data: WebauthnLoginStartDto): Promise<AjaxResult<SerializedRequestOptions>> {
  return request({
    url: '/login/webauthn/start',
    method: 'post',
    data,
    headers: { isToken: false, repeatSubmit: false }
  })
}

// 完成 passkey 登录：成功即复用既有登录完成链路签发令牌（返回 token）
export function webauthnLoginFinish(data: WebauthnLoginFinishDto): Promise<LoginInfoResult> {
  return request({
    url: '/login/webauthn/finish',
    method: 'post',
    data,
    headers: { isToken: false, repeatSubmit: false }
  })
}