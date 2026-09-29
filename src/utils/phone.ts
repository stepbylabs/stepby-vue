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
  isPossiblePhoneNumber,
  AsYouType,
  type CountryCode,
} from 'libphonenumber-js'

/** 支持的国家/地区代码（ISO 3166-1 alpha-2），与后端 validate_phone_by_region 对齐 */
export type RegionCode = 'CN' | 'HK' | 'US' | 'MO' | 'TW' | 'GB' | 'JP'

/** 国家/地区下拉选项（label 含国际区号，便于用户选择） */
export const REGION_OPTIONS: { label: string; value: RegionCode }[] = [
  { label: '中国 (+86)', value: 'CN' },
  { label: '中国香港 (+852)', value: 'HK' },
  { label: '美国/加拿大 (+1)', value: 'US' },
  { label: '中国澳门 (+853)', value: 'MO' },
  { label: '中国台湾 (+886)', value: 'TW' },
  { label: '英国 (+44)', value: 'GB' },
  { label: '日本 (+81)', value: 'JP' },
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

/**
 * 轻量可能性校验（不要求完整合法，适合输入过程中实时反馈，减少误报）。
 */
export function isPossiblePhoneByRegion(phone: string, region: string): boolean {
  const code = (region || 'CN').toUpperCase() as CountryCode
  const cleaned = normalizePhoneNumber(phone)
  if (!cleaned) return false
  try {
    return isPossiblePhoneNumber(cleaned, code)
  } catch {
    return false
  }
}

/**
 * 按地区实时格式化（AsYouTypeFormatter），用于输入框展示。
 * 例如 "1380013" -> "138 0013"。出错时回退为归一化结果。
 */
export function formatPhoneByRegion(phone: string, region: string): string {
  const code = (region || 'CN').toUpperCase() as CountryCode
  try {
    const formatter = new AsYouType(code)
    return formatter.input(normalizePhoneNumber(phone))
  } catch {
    return normalizePhoneNumber(phone)
  }
}
