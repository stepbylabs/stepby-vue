import request from '@/utils/request'
import type { AjaxResult } from '@/types'

export interface AiConfigMaskedVo {
  enabled: boolean
  provider: string
  baseUrl: string
  apiKeyMasked: string
  hasApiKey: boolean
  model: string
  allowedTables: string[]
}

export interface AiConfigUpdateForm {
  enabled: boolean
  provider: string
  baseUrl: string
  apiKey?: string
  model: string
  allowedTables: string[]
}

// 读取有效配置（api_key 掩码回显）
export function getAiConfig(): Promise<AjaxResult<AiConfigMaskedVo>> {
  return request({
    url: '/system/aiConfig',
    method: 'get'
  })
}

// 更新配置（api_key 传空/缺省保留原值；热生效）
export function updateAiConfig(form: AiConfigUpdateForm): Promise<AjaxResult> {
  return request({
    url: '/system/aiConfig',
    method: 'put',
    data: form
  })
}

// 连通性测试（独立 10s 超时，返回延迟或错误摘要）
export function testAiConfig(): Promise<AjaxResult<string>> {
  return request({
    url: '/system/aiConfig/test',
    method: 'post',
    timeout: 15000
  })
}
