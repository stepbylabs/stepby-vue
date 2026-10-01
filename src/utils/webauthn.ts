/**
 * WebAuthn / Passkey 前端工具
 *
 * 后端 `register/start` / `login/start` 直出标准 WebAuthn options，其中
 * `challenge`、`user.id`、`excludeCredentials[].id`、`allowCredentials[].id`
 * 均为 **base64url 字符串**；而 `navigator.credentials.create/get` 需要 `ArrayBuffer`。
 * 本模块负责：
 * - base64url ↔ ArrayBuffer 互转；
 * - 后端 options 深转换为浏览器 API 所需形式（仅转需要的字段）；
 * - `PublicKeyCredential` 结果按后端 DTO 字段回写成 base64url。
 */

import type {
  SerializedCreationOptions,
  SerializedCredentialDescriptor,
  SerializedRequestOptions,
  WebauthnLoginFinishDto,
  WebauthnRegisterFinishDto
} from '@/types/api/webauthn'

/** 浏览器是否支持 WebAuthn（Passkey） */
export function isWebauthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

/**
 * 判断是否为「用户取消 / 中断」类错误。
 *
 * 用户在认证器弹窗上取消、超时或主动中断时会抛 `NotAllowedError`（部分场景 `AbortError`），
 * 这属于正常交互而非故障，调用方应安静返回、不弹错误。
 */
export function isUserCancelled(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  )
}

/** base64url 字符串 → ArrayBuffer（还原 `-`/`_` 并补全 `=` 填充） */
export function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/** ArrayBuffer → base64url 字符串（输出无填充，`+`/`/` 转为 `-`/`_`） */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 凭据描述符：`id` 深转换为 ArrayBuffer */
function toDescriptor(serialized: SerializedCredentialDescriptor): PublicKeyCredentialDescriptor {
  return {
    type: serialized.type as PublicKeyCredentialType,
    id: base64UrlToBuffer(serialized.id),
    transports: serialized.transports as AuthenticatorTransport[] | undefined
  }
}

/**
 * 把 `register/start` 出参深转换为 `navigator.credentials.create` 所需 options。
 *
 * 仅转换 base64url 字段：`challenge`、`user.id`、`excludeCredentials[].id`；
 * 其余（rp / pubKeyCredParams / timeout / authenticatorSelection / attestation）原样透传。
 */
export function toCreationOptions(serialized: SerializedCreationOptions): PublicKeyCredentialCreationOptions {
  const selection = serialized.authenticatorSelection
  return {
    rp: { name: serialized.rp.name, id: serialized.rp.id },
    user: {
      id: base64UrlToBuffer(serialized.user.id),
      name: serialized.user.name,
      displayName: serialized.user.displayName
    },
    challenge: base64UrlToBuffer(serialized.challenge),
    pubKeyCredParams: serialized.pubKeyCredParams.map((param) => ({
      type: param.type as PublicKeyCredentialType,
      alg: param.alg
    })),
    timeout: serialized.timeout,
    excludeCredentials: serialized.excludeCredentials?.map(toDescriptor),
    authenticatorSelection: selection
      ? {
          authenticatorAttachment: selection.authenticatorAttachment as AuthenticatorAttachment | undefined,
          requireResidentKey: selection.requireResidentKey,
          residentKey: selection.residentKey as ResidentKeyRequirement | undefined,
          userVerification: selection.userVerification as UserVerificationRequirement | undefined
        }
      : undefined,
    attestation: serialized.attestation as AttestationConveyancePreference | undefined
  }
}

/**
 * 把 `login/start` 出参深转换为 `navigator.credentials.get` 所需 options。
 *
 * 仅转换 base64url 字段：`challenge`、`allowCredentials[].id`；
 * 其余（rpId / timeout / userVerification）原样透传。
 */
export function toRequestOptions(serialized: SerializedRequestOptions): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64UrlToBuffer(serialized.challenge),
    timeout: serialized.timeout,
    rpId: serialized.rpId,
    allowCredentials: serialized.allowCredentials?.map(toDescriptor),
    userVerification: serialized.userVerification as UserVerificationRequirement | undefined
  }
}

/** `navigator.credentials.create` 结果 → `register/finish` 出参（base64url 回写） */
export function registrationToDto(credential: PublicKeyCredential, name: string | null): WebauthnRegisterFinishDto {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject)
    },
    name
  }
}

/** `navigator.credentials.get` 结果 → `login/finish` 出参（base64url 回写，含 username） */
export function assertionToDto(credential: PublicKeyCredential, username: string): WebauthnLoginFinishDto {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    username,
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null
    }
  }
}