/**
 * 报表看板 API 层（配置化只读报表 v1）
 *
 * 与后端 /tool/report-board/* 接口一一对应：
 * - GET    /tool/report-board/list              本人看板清单
 * - GET    /tool/report-board/{boardId}         看板详情
 * - POST   /tool/report-board                   创建看板
 * - PUT    /tool/report-board/{boardId}         更新看板
 * - DELETE /tool/report-board/{boardId}         删除看板
 * - GET    /tool/report-board/sources           数据源白名单清单
 * - GET    /tool/report-board/data/{sourceKey}  数据源数据（range=7d|30d）
 */
import request from '@/utils/request'
import type { AjaxResult } from '@/types'

/** 图表类型（与后端 ChartType 枚举对齐） */
export type ChartType = 'line' | 'bar' | 'pie'

/** 网格尺寸（单位：网格格数，取值 1-2） */
export interface CardSize {
  /** 宽（1=半行，2=整行） */
  w: 1 | 2
  /** 高（1=半高，2=全高） */
  h: 1 | 2
}

/** 看板卡片（与后端 ReportCard 强类型对齐） */
export interface ReportCard {
  /** 卡片 ID（看板内唯一，前端生成的短标识） */
  id: string
  /** 卡片标题 */
  title: string
  /** 图表类型 */
  chartType: ChartType
  /** 数据源标识（必须命中后端白名单） */
  sourceKey: string
  /** 网格尺寸 */
  size: CardSize
}

/** 看板配置（config 列 JSON 的强类型形态） */
export interface ReportBoardConfig {
  cards: ReportCard[]
}

/** 看板出参（与后端 BoardVo 对齐） */
export interface BoardVo {
  id: number
  name: string
  config: ReportBoardConfig
  enabled: string
  createTime?: string
  updateTime?: string
}

/** 数据源元数据（与后端 SourceMetaVo 对齐） */
export interface SourceMeta {
  sourceKey: string
  name: string
}

/** 数据点（统一单序列形态） */
export interface SourcePoint {
  label: string
  value: number
}

/** 数据源数据出参（与后端 SourceDataVo 对齐） */
export interface SourceData {
  sourceKey: string
  items: SourcePoint[]
}

/** 时间范围（趋势类数据源生效） */
export type SourceRange = '7d' | '30d'

/** 查询本人看板清单 */
export function listBoards(): Promise<AjaxResult<BoardVo[]>> {
  return request({ url: '/tool/report-board/list', method: 'get' })
}

/** 查询看板详情 */
export function getBoard(boardId: number): Promise<AjaxResult<BoardVo>> {
  return request({ url: `/tool/report-board/${boardId}`, method: 'get' })
}

/** 创建看板 */
export function addBoard(data: { name: string; config: ReportBoardConfig }): Promise<AjaxResult<BoardVo>> {
  return request({ url: '/tool/report-board', method: 'post', data })
}

/** 更新看板（部分更新；config 提供时全量覆盖） */
export function updateBoard(
  boardId: number,
  data: { name?: string; config?: ReportBoardConfig; enabled?: string }
): Promise<AjaxResult<BoardVo>> {
  return request({ url: `/tool/report-board/${boardId}`, method: 'put', data })
}

/** 删除看板 */
export function deleteBoard(boardId: number): Promise<AjaxResult<void>> {
  return request({ url: `/tool/report-board/${boardId}`, method: 'delete' })
}

/** 查询数据源白名单清单 */
export function listSources(): Promise<AjaxResult<SourceMeta[]>> {
  return request({ url: '/tool/report-board/sources', method: 'get' })
}

/** 查询数据源数据 */
export function getSourceData(sourceKey: string, range: SourceRange): Promise<AjaxResult<SourceData>> {
  return request({ url: `/tool/report-board/data/${sourceKey}`, method: 'get', params: { range } })
}
