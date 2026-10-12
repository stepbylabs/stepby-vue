import request from '@/utils/request'
import type { AjaxResult } from '@/types'

export interface UploadConfigMaskedVo {
  accessKeyMasked: string
  hasAccessKey: boolean
  secretKeyMasked: string
  hasSecretKey: boolean
  endpoint: string
  region: string
  bucket: string
  pathStyle: boolean
  publicEndpoint: string
  backendMode: string
}

export interface UploadConfigUpdateForm {
  accessKey?: string
  secretKey?: string
  endpoint?: string
  region?: string
  bucket?: string
  pathStyle?: boolean
  publicEndpoint?: string
}

// 读取有效配置（access_key / secret_key 掩码回显）
export function getUploadConfig(): Promise<AjaxResult<UploadConfigMaskedVo>> {
  return request({
    url: '/system/uploadConfig',
    method: 'get'
  })
}

// 更新配置（secret_key 传空/缺省保留原值；SSRF 校验 endpoint；热生效）
export function updateUploadConfig(form: UploadConfigUpdateForm): Promise<AjaxResult> {
  return request({
    url: '/system/uploadConfig',
    method: 'put',
    data: form
  })
}

// 连通性测试（ListObjectsV2 探活）
export function testUploadConfig(): Promise<AjaxResult<string>> {
  return request({
    url: '/system/uploadConfig/test',
    method: 'post',
    timeout: 15000
  })
}
