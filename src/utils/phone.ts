// 手机号多地区化工具（基于 libphonenumber-js，G18 前端）
//
// 后端 stepby-axum 用 Rust `phonenumber` crate 的 validate_phone_by_region 做权威校验；
// 本文件在前端用 libphonenumber-js 做同判据的客户端校验/格式化，与后端 REGION 对齐
// （均为 ISO 3166-1 alpha-2）。覆盖 200+ 地区，能识别号段合法性与虚构号。
//
// 安装：pnpm add libphonenumber-js（默认 registry = https://registry.npmmirror.com）。
// 早期因本机 npm registry 不可达，曾用正则分流表作为临时实现；现正式替换为库实现。

import {
  isValidPhoneNumber,
  type CountryCode,
} from 'libphonenumber-js'

/** 支持的国家/地区代码（ISO 3166-1 alpha-2），与后端 validate_phone_by_region 对齐 */
export type RegionCode = 'CN' | 'HK' | 'US' | 'MO' | 'TW' | 'GB' | 'JP'

/**
 * 国家/地区下拉选项。
 *
 * `labelKey` 是稳定的 i18n 键（文案唯一事实源在 locales 的 `profile.region.*`），
 * 由消费方用 `t(opt.labelKey)` 解析：本模块是无 i18n 上下文的纯工具，
 * 且硬编码中文会直接把中文国家名漏给 en-US 用户（个人中心是 PII 表单）。
 * `value` 即 ISO 3166-1 alpha-2 地区码，与后端 countryCode 语义不变。
 */
export const REGION_OPTIONS: { value: RegionCode; labelKey: string }[] = [
  { value: 'CN', labelKey: 'profile.region.cn' },
  { value: 'HK', labelKey: 'profile.region.hk' },
  { value: 'US', labelKey: 'profile.region.us' },
  { value: 'MO', labelKey: 'profile.region.mo' },
  { value: 'TW', labelKey: 'profile.region.tw' },
  { value: 'GB', labelKey: 'profile.region.gb' },
  { value: 'JP', labelKey: 'profile.region.jp' },
]

/**
 * 归一化手机号：去除空格、连字符、括号、点号等分隔符，仅保留数字与开头的 + 号。
 * 例如 "138 0013 8000" -> "13800138000"，"+86 138-0013-8000" -> "+8613800138000"。
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return raw
  return raw.replace(/[^\d+]/g, '')
}

/**
 * 按地区校验手机号是否合法（libphonenumber-js，与后端判据一致）。
 * 入参 phone 建议先经 normalizePhoneNumber 归一化；region 缺省回退 CN。
 */
export function isValidPhoneByRegion(phone: string, region: string): boolean {
  const code = (region || 'CN').toUpperCase() as CountryCode
  const cleaned = normalizePhoneNumber(phone)
  if (!cleaned) return false
  try {
    return isValidPhoneNumber(cleaned, code)
  } catch {
    return false
  }
}
