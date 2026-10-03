import request from '@/utils/request'
import { saveAs } from 'file-saver'
import type { AjaxResult, TableDataInfo } from '@/types'
import type { AuditChangeQueryParams, SysAuditChange } from '@/types'

// ==================== 变更留痕（审计合规域） ====================

// 分页查询变更留痕
export function listAuditChange(query: AuditChangeQueryParams): Promise<TableDataInfo<SysAuditChange>> {
  return request({
    url: '/system/audit-change/list',
    method: 'get',
    params: query
  })
}

// 查询变更留痕详情（含前后快照 JSON 与字段差异清单）
export function getAuditChange(id: number | string): Promise<AjaxResult<SysAuditChange>> {
  return request({
    url: '/system/audit-change/' + id,
    method: 'get'
  })
}

/**
 * 导出变更留痕为 CSV（后端为 GET 下载端点，非表单 POST，故走 GET blob 手动保存）
 * UTF-8 带 BOM，Excel 直接打开不乱码
 */
export function exportAuditChange(query: AuditChangeQueryParams): Promise<Blob> {
  return request({
    url: '/system/audit-change/export',
    method: 'get',
    params: query,
    responseType: 'blob'
  }).then((blob: unknown) => {
    const data = blob instanceof Blob ? blob : new Blob([blob as BlobPart])
    saveAs(data, `audit_change_${new Date().getTime()}.csv`)
    return data
  })
}
