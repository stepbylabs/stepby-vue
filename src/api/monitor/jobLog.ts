import request from '@/utils/request'
import type { JobLogQueryParams, SysJobLog, AjaxResult, TableDataInfo, JobLogStats } from '@/types'

// 查询调度日志列表
export function listJobLog(query: JobLogQueryParams): Promise<TableDataInfo<SysJobLog>> {
  return request({
    url: '/monitor/jobLog/list',
    method: 'get',
    params: query
  })
}

// 删除调度日志
export function delJobLog(jobLogId: number | number[]): Promise<AjaxResult> {
  return request({
    url: '/monitor/jobLog/' + jobLogId,
    method: 'delete'
  })
}

// 清空调度日志
export function cleanJobLog(): Promise<AjaxResult> {
  return request({
    url: '/monitor/jobLog/clean',
    method: 'delete'
  })
}

// ===== G-09：定时任务运行统计报表 =====
export function getJobLogStats(days?: number): Promise<AjaxResult<JobLogStats>> {
  return request({
    url: '/monitor/jobLog/stats',
    method: 'get',
    params: { days }
  })
}
