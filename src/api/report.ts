import request from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'

// ==================== G-01 报表数据集 / 大屏（report_dataset / report_dashboard） ====================

/** 图表类型（M2 首版六种：echarts 四种 + stat/table 自渲染） */
export type ChartType = 'bar' | 'line' | 'pie' | 'gauge' | 'stat' | 'table'

/** 数据集行（report_dataset） */
export interface ReportDataset {
  datasetId: number
  datasetCode: string
  datasetName: string
  /** SQL 模板（明文仅 report:dataset:edit 持有者可见） */
  sqlTemplate?: string
  /** 参数 schema：[{ name, type: 'string'|'number', required }] */
  paramsSchema?: unknown
  status?: string
  remark?: string
  createTime?: string
}

/** 数据集新增/编辑入参 */
export interface DatasetUpsertForm {
  datasetId?: number
  datasetCode: string
  datasetName: string
  sqlTemplate: string
  paramsSchema?: unknown
  status?: string
  remark?: string
}

/** 试跑结果（LIMIT 100 硬顶） */
export interface DatasetPreviewVo {
  columns: string[]
  rows: Record<string, unknown>[]
  truncated: boolean
}

/** 大屏行（report_dashboard） */
export interface ReportDashboard {
  dashboardId: number
  dashboardCode: string
  dashboardName: string
  /** 画布布局 JSON：{ schemaVersion, charts: [...] }（存增量不存全量 echarts option） */
  layoutJson?: unknown
  status?: string
  remark?: string
  createTime?: string
}

/** 设计器图表卡片（layout_json.charts 元素） */
export interface DashboardChart {
  chartId: string
  chartType: ChartType
  datasetId: number
  title: string
  /** 栅格宽度（24 列制档位，与 dashboardLayout 一致） */
  span: 8 | 12 | 16 | 24
  /** bar/line：类目轴字段 */
  xField?: string
  /** bar/line：数值字段 */
  yField?: string
  /** pie：名称字段 */
  nameField?: string
  /** pie/gauge：数值字段 */
  valueField?: string
}

// ---------- 数据集 ----------

export function listDataset(query?: {
  pageNum?: number
  pageSize?: number
  datasetName?: string
}): Promise<TableDataInfo<ReportDataset>> {
  return request({
    url: '/report/dataset/list',
    method: 'get',
    params: query
  })
}

export function getDataset(datasetId: number): Promise<AjaxResult<ReportDataset>> {
  return request({
    url: `/report/dataset/${datasetId}`,
    method: 'get'
  })
}

export function addDataset(data: DatasetUpsertForm): Promise<AjaxResult<ReportDataset>> {
  return request({
    url: '/report/dataset',
    method: 'post',
    data
  })
}

export function editDataset(data: DatasetUpsertForm): Promise<AjaxResult<ReportDataset>> {
  return request({
    url: '/report/dataset',
    method: 'put',
    data
  })
}

export function removeDataset(datasetIds: string): Promise<AjaxResult<unknown>> {
  return request({
    url: `/report/dataset/${datasetIds}`,
    method: 'delete'
  })
}

export function previewDataset(data: {
  datasetId: number
  params: Record<string, unknown>
}): Promise<AjaxResult<DatasetPreviewVo>> {
  return request({
    url: '/report/dataset/preview',
    method: 'post',
    data
  })
}

// ---------- 大屏 ----------

export function listDashboard(): Promise<TableDataInfo<ReportDashboard>> {
  return request({
    url: '/report/dashboard/list',
    method: 'get'
  })
}

export function getDashboard(dashboardId: number): Promise<AjaxResult<ReportDashboard>> {
  return request({
    url: `/report/dashboard/${dashboardId}`,
    method: 'get'
  })
}

/** 保存大屏（layout_json 整体覆盖；schemaVersion 由前端维护） */
export function saveDashboard(data: {
  dashboardId?: number
  dashboardCode: string
  dashboardName: string
  layoutJson: unknown
  status?: string
  remark?: string
}): Promise<AjaxResult<ReportDashboard>> {
  return request({
    url: '/report/dashboard',
    method: 'post',
    data
  })
}

export function removeDashboard(dashboardIds: string): Promise<AjaxResult<unknown>> {
  return request({
    url: `/report/dashboard/${dashboardIds}`,
    method: 'delete'
  })
}
