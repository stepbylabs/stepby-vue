import request, { FILE_DOWNLOAD_TIMEOUT } from '@/utils/request'
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

// 下载/预览文件内容（blob，经 /common/download 存储后端统一代理）
// 与 download.name 同鉴权链（带 Authorization 的同源代理请求），不引入 token 查询参数；
// s3 后端下对象 URL 为跨域绝对地址，直连会被同源守卫拦截，故必须走代理端点。
// b99：文件大小不受控（上传上限内的任意文件），走下载族长上限而不是全局 30s。
export function downloadFileBlob(fileName: string): Promise<Blob> {
  return request({
    url: `/common/download?fileName=${encodeURIComponent(fileName)}&delete=false`,
    method: 'get',
    responseType: 'blob',
    timeout: FILE_DOWNLOAD_TIMEOUT
  }) as unknown as Promise<Blob>
}
