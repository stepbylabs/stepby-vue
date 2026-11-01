import request, { LONG_TASK_TIMEOUT } from '@/utils/request'
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
  /**
   * 管理配置是否真的读到了（b145）。
   * false 时下面五个凭据/源字段全是默认值——界面**不得**据此显示"未启用/未配置"，
   * 必须显式标"未取到"（AGENTS ㊷：失败与没有必须可区分）。
   */
  configAvailable: boolean
  /** 库里是否有 Account ID 密文 */
  accountIdPresent: boolean
  /** Account ID 有密文但解不开（主密钥缺失/已轮换/密文损坏） */
  accountIdUnreadable: boolean
  /** 库里是否有 License Key 密文 */
  licenseKeyPresent: boolean
  /** License Key 有密文但解不开 */
  licenseKeyUnreadable: boolean
}

/** IP 库管理配置（脱敏视图，仅告知是否已配置凭据） */
export interface IpLocationConfigVo {
  updateSource: string
  maxmindAccountIdConfigured: boolean
  maxmindLicenseKeyConfigured: boolean
  autoUpdateEnabled: boolean
  /** 库里是否有 Account ID 密文（b145） */
  accountIdPresent: boolean
  /** Account ID 有密文但解不开 */
  accountIdUnreadable: boolean
  /** 库里是否有 License Key 密文 */
  licenseKeyPresent: boolean
  /** License Key 有密文但解不开 */
  licenseKeyUnreadable: boolean
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

/**
 * 立即触发 IP 库更新（下载+解压+校验+热加载）。
 *
 * 服务端在这一条路由上等待的下载预算是 300s（`ip_location_service.rs::IP_DOWNLOAD_TIMEOUT_SECS`），
 * 而它挂在请求层的长任务档里（b140）；本调用点必须显式给长任务上限——不写就是全局 30s，
 * 客户端先撤 ⇒ 连接断开 ⇒ 服务端 handler 被丢弃、下载停在中间态、更新锁留到 TTL。
 */
export function updateIpLocationNow(source?: string): Promise<AjaxResult<UpdateResult>> {
  return request({
    url: '/system/ipLocation/update',
    method: 'post',
    params: source ? { source } : undefined,
    timeout: LONG_TASK_TIMEOUT
  })
}

/** 仅热加载现有 mmdb 文件（不下载，用于手动替换文件后触发） */
export function reloadIpLocation(): Promise<AjaxResult> {
  return request({
    url: '/system/ipLocation/reload',
    method: 'post'
  })
}

/** 仅热加载 ip2region xdb 文件（不下载，用于手动替换文件后触发） */
export function reloadIpXdb(): Promise<AjaxResult> {
  return request({
    url: '/system/ipLocation/reloadXdb',
    method: 'post'
  })
}
