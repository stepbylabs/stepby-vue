import request from '@/utils/request'
import type { AjaxResult } from '@/types'

/** IP 归属地库状态信息 */
export interface IpLocationStatus {
  /** mmdb 文件是否已加载到内存 */
  mmdbLoaded: boolean
  /** mmdb 文件路径 */
  mmdbPath: string
  /** mmdb 文件大小（字节） */
  mmdbSize: number
  /** mmdb 文件最后修改时间（Unix 时间戳，秒） */
  mmdbModified: number
  /** 是否已启用 ip2region xdb 双库模式 */
  xdbEnabled: boolean
  /** xdb 文件是否存在 */
  xdbLoaded: boolean
  /** xdb 文件路径 */
  xdbPath: string
  /** xdb 文件大小（字节） */
  xdbSize: number
  /** xdb 文件最后修改时间 */
  xdbModified: number
  /** 自动更新 cron 表达式 */
  autoUpdateCron: string
  /** 当前配置的更新源（maxmind / p3terx） */
  currentSource: string
  /** MaxMind Account ID 是否已配置 */
  maxmindAccountIdConfigured: boolean
  /** MaxMind License Key 是否已配置 */
  maxmindLicenseKeyConfigured: boolean
}

/** IP 库管理配置（脱敏视图，仅告知是否已配置凭据） */
export interface IpLocationConfigVo {
  updateSource: string
  maxmindAccountIdConfigured: boolean
  maxmindLicenseKeyConfigured: boolean
  autoUpdateEnabled: boolean
}

/** 保存 IP 库管理配置的请求 DTO */
export interface SaveConfigDto {
  updateSource: string
  /** MaxMind Account ID（空表示保留原值；配合 clearCredentials=true 清空） */
  maxmindAccountId: string
  /** MaxMind License Key（同上） */
  maxmindLicenseKey: string
  autoUpdateEnabled: boolean
  /** 是否清空已存储的 Account ID / License Key */
  clearCredentials: boolean
}

/** IP 库更新结果 */
export interface UpdateResult {
  success: boolean
  elapsedSeconds: number
  source: string
  newSize: number
  newSha256: string
  oldSize: number
  message: string
  timestamp: string
}

/** 查询 IP 库当前状态 */
export function getIpLocationStatus(): Promise<AjaxResult<IpLocationStatus>> {
  return request({
    url: '/system/ipLocation/status',
    method: 'get'
  })
}

/** 读取 IP 库管理配置（脱敏） */
export function getIpLocationConfig(): Promise<AjaxResult<IpLocationConfigVo>> {
  return request({
    url: '/system/ipLocation/config',
    method: 'get'
  })
}

/** 保存 IP 库管理配置（License Key 自动加密存储） */
export function saveIpLocationConfig(data: SaveConfigDto): Promise<AjaxResult> {
  return request({
    url: '/system/ipLocation/config',
    method: 'put',
    data
  })
}

/** 立即触发 IP 库更新（下载+解压+校验+热加载） */
export function updateIpLocationNow(source?: string): Promise<AjaxResult<UpdateResult>> {
  return request({
    url: '/system/ipLocation/update',
    method: 'post',
    params: source ? { source } : undefined
  })
}

/** 仅热加载现有 mmdb 文件（不下载，用于手动替换文件后触发） */
export function reloadIpLocation(): Promise<AjaxResult> {
  return request({
    url: '/system/ipLocation/reload',
    method: 'post'
  })
}
