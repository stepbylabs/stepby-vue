import request, { LONG_TASK_TIMEOUT, FILE_DOWNLOAD_TIMEOUT } from '@/utils/request'
import { saveBlob } from '@/utils/saveBlob'
import i18n from '@/i18n'
import { errorHub } from '@/utils/errorHub'
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
// b99：全库 dump 在大库上必然超过全局 30s；后端子进程硬超时 300s，前端必须等得比它久
export function createBackup(): Promise<AjaxResult<BackupCreateVo>> {
  return request({
    url: '/system/backup',
    method: 'post',
    timeout: LONG_TASK_TIMEOUT
  })
}

// 租户自助导出：导出当前登录账号所属租户的数据包（无参数，后端按登录用户租户强制收窄）
export function selfExportTenantPackage(): Promise<AjaxResult<BackupCreateVo>> {
  return request({
    url: '/system/backup/self-export',
    method: 'post',
    timeout: LONG_TASK_TIMEOUT
  })
}

// 恢复指定备份
// b99：恢复 = 重建临时库 + 校验 + 原子替换，耗时与创建同量级；30s 会中止一个正在正常执行的恢复
export function restoreBackup(backupId: number): Promise<AjaxResult> {
  return request({
    url: '/system/backup/restore/' + backupId,
    method: 'post',
    timeout: LONG_TASK_TIMEOUT
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
/**
 * 取回并交给浏览器保存。
 *
 * 返回 `true` 的含义与 `utils/request.download()` 同一条口径：**载荷已交给保存通道**，
 * 不证明落盘（b112）。改造前它把 Blob 原样返回、把 `saveBlob` 的 false 只写进 errorHub，
 * 于是 `views/system/tenant` 那句 `await downloadBackup(...) → msgSuccess('已导出并开始下载')`
 * 在"0 字节备份 / 保存通道被拒"时照样说成功——结局必须由返回值给，不能靠"没人报异常"推断。
 */
export function downloadBackup(backupId: number, filename?: string): Promise<boolean> {
  return request({
    url: '/system/backup/download/' + backupId,
    method: 'get',
    responseType: 'blob',
    // §5.31：大备份（实测 43MB+）下载耗时超过全局 axios timeout（30s）会被
    // abort——abort 的请求无响应对象，前端只见 msgError。下载族统一走长上限
    // （b99 收敛到 request.ts 的单一常量，避免各 API 各写一个数字）。
    timeout: FILE_DOWNLOAD_TIMEOUT
  }).then((blob: unknown) => {
    const data = blob instanceof Blob ? blob : new Blob([blob as BlobPart])
    // 保存失败必须可见（0 字节备份 / 保存通道被拦）；成功分支不弹提示（落盘不可观测）
    const saved = saveBlob(data, filename || `backup-${backupId}.sql`)
    if (!saved) {
      errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
    }
    return saved
  })
}
