// WebAuthn / Passkey 入出参类型
//
// 生成类型直接再导出后端 ts-rs 产物（勿在此重复手写字段，以免与后端漂移）；
// options 类型为后端 `serde_json` 直出（handler 出参为 `AjaxResult<serde_json::Value>`），
// 无 ts-rs 生成，故在此按后端 serde 实际形状（camelCase）手写，供前端深转换使用。
// 生成源：stepby-axum/src/service/webauthn_service.rs。

/** 本人 passkey 凭据（自助列表出参） */
export type WebauthnCredentialVo = import('@/types/api/generated/WebauthnCredentialVo').WebauthnCredentialVo

/** Passkey 登录开始请求 */
export type WebauthnLoginStartDto = import('@/types/api/generated/WebauthnLoginStartDto').WebauthnLoginStartDto

/** Passkey 登录完成请求（`navigator.credentials.get` 结果 + username） */
export type WebauthnLoginFinishDto = import('@/types/api/generated/WebauthnLoginFinishDto').WebauthnLoginFinishDto

/** Passkey 注册完成请求（`navigator.credentials.create` 结果 + 名称） */
export type WebauthnRegisterFinishDto = import('@/types/api/generated/WebauthnRegisterFinishDto').WebauthnRegisterFinishDto

/** WebAuthn 凭据描述符（后端直出，`id` 为 base64url 字符串） */
export interface SerializedCredentialDescriptor {
  type: string
  /** base64url 编码的凭据 ID */
  id: string
  transports?: string[]
}

/**
 * `register/start` 出参：PublicKeyCredentialCreationOptions（serde 直出）。
 *
 * `challenge` / `user.id` / `excludeCredentials[].id` 为 **base64url 字符串**，
 * 需经 `toCreationOptions` 深转换为 `ArrayBuffer` 才能交给 `navigator.credentials.create`。
 */
export interface SerializedCreationOptions {
  rp: { name: string; id: string }
  user: { id: string; name: string; displayName: string }
  challenge: string
  pubKeyCredParams: Array<{ type: string; alg: number }>
  timeout?: number
  excludeCredentials?: SerializedCredentialDescriptor[]
  authenticatorSelection?: {
    authenticatorAttachment?: string
    requireResidentKey?: boolean
    residentKey?: string
    userVerification?: string
  }
  attestation?: string
}

/**
 * `login/start` 出参：PublicKeyCredentialRequestOptions（serde 直出）。
 *
 * `challenge` / `allowCredentials[].id` 为 **base64url 字符串**，
 * 需经 `toRequestOptions` 深转换为 `ArrayBuffer` 才能交给 `navigator.credentials.get`。
 */
export interface SerializedRequestOptions {
  challenge: string
  timeout?: number
  rpId: string
  allowCredentials?: SerializedCredentialDescriptor[]
  userVerification?: string
}