import request, { FILE_DOWNLOAD_TIMEOUT } from '@/utils/request'
import { saveAs } from 'file-saver'
import { ElMessage } from 'element-plus'
import i18n from '@/i18n'
import type { TableDataInfo } from '@/types'
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

/**
 * 导出变更留痕为 CSV（后端为 GET 下载端点，非表单 POST，故走 GET blob 手动保存）
 * UTF-8 带 BOM，Excel 直接打开不乱码
 *
 * 截断提示：后端行数触及 `EXPORT_MAX_ROWS` 时回 `X-Export-Truncated: true`，
 * response 拦截器把它挂到 Blob 的 `_truncated` 上。这里必须消费它——否则审计员
 * 手里是一份"看起来完整"的半份数据（xlsx 族已由通用 download() 弹同一条提示）。
 */
export function exportAuditChange(query: AuditChangeQueryParams): Promise<Blob> {
  return request({
    url: '/system/audit-change/export',
    method: 'get',
    params: query,
    responseType: 'blob',
    // b99：审计导出可达 EXPORT_MAX_ROWS 上限，生成 + 传输超过全局 30s ⇒ 下载族长上限
    timeout: FILE_DOWNLOAD_TIMEOUT
  }).then((blob: unknown) => {
    const data = blob instanceof Blob ? blob : new Blob([blob as BlobPart])
    saveAs(data, `audit_change_${new Date().getTime()}.csv`)
    if ((data as Blob & { _truncated?: boolean })._truncated) {
      ElMessage.warning(i18n.global.t('common.exportTruncated'))
    }
    return data
  })
}
