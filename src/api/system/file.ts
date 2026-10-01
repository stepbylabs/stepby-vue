import request from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'

/** 文件信息 */
export interface FileInfo {
  fileName: string
  fileSize: number
  /** 文件大小（人类可读，如 1.5MB） */
  fileSizeStr: string
  ext: string
  /** 可访问 URL */
  url: string
  lastModified: string
}

/** 文件列表分页查询参数 */
export interface FileQueryParams {
  pageNum?: number
  pageSize?: number
  /** 文件名前缀（模糊查询） */
  fileName?: string
  /** 扩展名（如 jpg/png/pdf） */
  ext?: string
}

/** 文件列表响应 */
export interface FileListResponse {
  rows: FileInfo[]
  total: number
}

/** 文件上传响应 */
export interface FileUploadResponse {
  url: string
  fileName: string
  fileSize: number
  ext: string
}

// 文件列表（分页）
export function listFiles(query: FileQueryParams): Promise<TableDataInfo<FileInfo>> {
  return request({
    url: '/system/file/list',
    method: 'get',
    params: query
  })
}

// 上传文件（multipart/form-data，字段名固定为 file）
// 注意：FormData 上传不要手动设置 Content-Type，由浏览器自动设置 multipart/form-data; boundary=...，
// 否则 boundary 丢失会导致后端解析失败（参考 user.ts 的 uploadAvatar 实现）
export function uploadFile(data: FormData): Promise<AjaxResult<FileUploadResponse>> {
  return request({
    url: '/system/file/upload',
    method: 'post',
    data
  })
}

// 删除文件（按服务器端文件名，JSON body）
export function deleteFile(fileName: string): Promise<AjaxResult> {
  return request({
    url: '/system/file/delete',
    method: 'delete',
    data: { fileName }
  })
}
