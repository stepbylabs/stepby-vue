import request from '@/utils/request'
import { saveAs } from 'file-saver'
import type { AjaxResult, TableDataInfo } from '@/types'
import type { SysBackupLog, BackupLogQueryParams, BackupCreateVo } from '@/types'

// 类型重新导出，保持现有 import 路径 '@/api/system/backup' 可用
export type { SysBackupLog, BackupLogQueryParams, BackupCreateVo }

// 查询备份日志列表
export function listBackup(query: BackupLogQueryParams): Promise<TableDataInfo<SysBackupLog>> {
  return request({
    url: '/system/backup/list',
    method: 'get',
    params: query
  })
}

// 创建手动备份
export function createBackup(): Promise<AjaxResult<BackupCreateVo>> {
  return request({
    url: '/system/backup',
    method: 'post'
  })
}

// 租户自助导出：导出当前登录账号所属租户的数据包（无参数，后端按登录用户租户强制收窄）
export function selfExportTenantPackage(): Promise<AjaxResult<BackupCreateVo>> {
  return request({
    url: '/system/backup/self-export',
    method: 'post'
  })
}

// 恢复指定备份
export function restoreBackup(backupId: number): Promise<AjaxResult> {
  return request({
    url: '/system/backup/restore/' + backupId,
    method: 'post'
  })
}

// 删除备份
export function delBackup(backupId: number | number[]): Promise<AjaxResult> {
  return request({
    url: '/system/backup/' + backupId,
    method: 'delete'
  })
}

// 下载备份文件（自动保存到本地）
// filename 可选；未提供时使用 backup-<id>.sql 作为兜底文件名
export function downloadBackup(backupId: number, filename?: string): Promise<Blob> {
  return request({
    url: '/system/backup/download/' + backupId,
    method: 'get',
    responseType: 'blob',
    // §5.31：大备份（实测 43MB+）下载耗时超过全局 axios timeout（30s）会被
    // abort——abort 的请求无响应对象，前端只见 msgError。blob 下载不限时
    // （timeout: 0），进度由调用方 downloadingIds loading 态表达。
    timeout: 0
  }).then((blob: unknown) => {
    const data = blob instanceof Blob ? blob : new Blob([blob as BlobPart])
    saveAs(data, filename || `backup-${backupId}.sql`)
    return data
  })
}
