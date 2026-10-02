/** 备份日志查询参数 */
export interface BackupLogQueryParams {
  pageNum?: number
  pageSize?: number
  backupType?: string
  status?: string
  beginTime?: string
  endTime?: string
}

/** 备份日志记录 */
export interface SysBackupLog {
  backupId: number
  fileName: string
  filePath: string
  fileSize: number
  backupType: string
  status: string
  errorMsg?: string
  createBy?: string
  createTime?: string
}

/** 备份创建响应 */
export interface BackupCreateVo {
  backupId: number
  fileName: string
  filePath: string
  fileSize: number
}
