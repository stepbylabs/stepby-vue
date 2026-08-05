/** 任务进度查询参数 */
export interface TaskQueryParams {
  pageNum?: number
  pageSize?: number
  taskType?: string
  status?: string
  operator?: string
  beginTime?: string
  endTime?: string
}

/** 任务进度记录 */
export interface SysTask {
  taskId: number
  taskType: string
  taskName: string
  status: string // pending / running / success / failed
  progress: number
  total: number
  current: number
  resultMsg?: string
  operator?: string
  createTime?: string
  updateTime?: string
}
