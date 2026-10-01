import request from '@/utils/request'
import type { AjaxResult } from '@/types'

/** 日志文件信息 */
export interface LogFileInfo {
  /** 文件名，如 app.log.2026-08-18 */
  file_name: string
  /** 文件大小（字节） */
  file_size: number
  /** 文件大小（人类可读，如 1.5MB） */
  file_size_str: string
  /** 最后修改时间（字符串） */
  last_modified: string
}

/** 日志行 */
export interface LogLine {
  /** 本次返回批次内序号 1..n */
  no: number
  /** 日志级别 */
  level: string
  /** 原始日志文本 */
  text: string
}

/** 列出日志文件 */
export function listLogFiles(): Promise<AjaxResult<{ rows: LogFileInfo[] }>> {
  return request({
    url: '/monitor/log/files',
    method: 'get'
  })
}

/** 读取指定日志文件尾部（支持级别/关键字过滤） */
export function tailLogFile(params: {
  file_name: string
  level?: string
  keyword?: string
  lines?: number
}): Promise<AjaxResult<{ file_name: string; total: number; rows: LogLine[] }>> {
  return request({
    url: '/monitor/log/tail',
    method: 'get',
    params
  })
}
