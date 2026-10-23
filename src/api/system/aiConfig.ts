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

// 连通性测试（独立 15s 超时）：后端这一支是 `AjaxResult::success_msg(&摘要)` ⇒
// 摘要在 **msg**、`data` 结构上缺席，所以载荷类型写 `void`（写 `string` 是在教调用点读 `.data`，
// 而那条路永远 undefined）。台账 b87 §8 取证。
export function testAiConfig(): Promise<AjaxResult<void>> {
  return request({
    url: '/system/aiConfig/test',
    method: 'post',
    timeout: 15000
  })
}
