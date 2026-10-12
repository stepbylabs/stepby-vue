import request from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'
import type { SysTask, TaskQueryParams } from '@/types'

// 类型重新导出，保持现有 import 路径 '@/api/system/task' 可用
export type { SysTask, TaskQueryParams }

// 查询任务列表
export function listTask(query: TaskQueryParams): Promise<TableDataInfo<SysTask>> {
  return request({
    url: '/system/task/list',
    method: 'get',
    params: query
  })
}

// 查询任务详情
export function getTask(taskId: number): Promise<AjaxResult<SysTask>> {
  return request({
    url: '/system/task/' + taskId,
    method: 'get'
  })
}

// 删除任务
export function delTask(taskId: number | number[]): Promise<AjaxResult> {
  return request({
    url: '/system/task/' + taskId,
    method: 'delete'
  })
}
