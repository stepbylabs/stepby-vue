import request from '@/utils/request'
import type { AjaxResult, TableDataInfo, SysPat, PatAdminQueryParams } from '@/types'

// ==================== 个人访问令牌：管理员接口（monitor:pat:list / monitor:pat:revoke） ====================

// 全量令牌列表（可选按属主过滤）
export function listPat(query: PatAdminQueryParams): Promise<TableDataInfo<SysPat>> {
  return request({
    url: '/monitor/pat/list',
    method: 'get',
    params: query
  })
}

// 吊销任意令牌
export function revokePat(patId: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/pat/' + patId,
    method: 'delete'
  })
}
