import request from '@/utils/request'
import type { AjaxResult } from '@/types'

/** TOTP 设置响应（生成密钥和二维码） */
export interface TotpSetupResponse {
  /** TOTP secret（Base32 编码，用于手动输入） */
  secret: string
  /** OTP auth URL（otpauth://totp/...） */
  otpauthUrl: string
  /** 二维码图片 Data URL（data:image/png;base64,...） */
  qrCode: string
}

/** TOTP 状态响应 */
export interface TotpStatusResponse {
  /** 是否已启用 TOTP */
  enabled: boolean
}

// TOTP 设置（生成密钥和二维码）
export function setupTotp(): Promise<AjaxResult<TotpSetupResponse>> {
  return request({
    url: '/system/user/totp/setup',
    method: 'post'
  })
}

// TOTP 验证（验证 code 并启用 TOTP，需提供 setup 阶段返回的 secret）
export function verifyTotp(code: string, secret: string): Promise<AjaxResult> {
  return request({
    url: '/system/user/totp/verify',
    method: 'post',
    data: { code, secret }
  })
}

// TOTP 状态查询
export function getTotpStatus(): Promise<AjaxResult<TotpStatusResponse>> {
  return request({
    url: '/system/user/totp/status',
    method: 'get'
  })
}

// TOTP 禁用（需密码 + 验证码双重确认）
export function disableTotp(password: string, code: string): Promise<AjaxResult> {
  return request({
    url: '/system/user/totp/disable',
    method: 'post',
    data: { password, code }
  })
}
