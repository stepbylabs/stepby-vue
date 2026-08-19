import request from '@/utils/request'
import type { GenQueryParams, GenTable, GenTableInfoResult, AjaxResult, TableDataInfo } from '@/types'

// 列数据类型枚举（与后端 ColumnDataType 对齐）
export type ColumnDataType =
  | 'varchar'
  | 'char'
  | 'text'
  | 'longText'
  | 'int'
  | 'bigint'
  | 'smallint'
  | 'tinyint'
  | 'decimal'
  | 'double'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'boolean'

// 列定义 DTO
export interface CreateTableColumnDto {
  columnName: string
  dataType: ColumnDataType
  length?: number
  precision?: number
  isPrimaryKey: boolean
  isAutoIncrement: boolean
  isNotNull: boolean
  isUnique: boolean
  defaultValue?: string
  columnComment?: string
}

// 结构化建表 DTO
export interface CreateTableDto {
  tableName: string
  tableComment?: string
  columns: CreateTableColumnDto[]
  importToGen: boolean
}

// 结构化建表响应
export interface CreateTableResult {
  tableName: string
  importedToGen: boolean
  tableId?: number
}

// 查询生成表数据
export function listTable(query: GenQueryParams): Promise<TableDataInfo<GenTable>> {
  return request({
    url: '/tool/gen/list',
    method: 'get',
    params: query
  })
}

// 查询db数据库列表
export function listDbTable(query: GenQueryParams): Promise<TableDataInfo<GenTable>> {
  return request({
    url: '/tool/gen/db/list',
    method: 'get',
    params: query
  })
}

// 查询表详细信息
export function getGenTable(tableId: number): Promise<AjaxResult<GenTableInfoResult>> {
  return request({
    url: '/tool/gen/' + tableId,
    method: 'get'
  })
}

// 修改代码生成信息
export function updateGenTable(data: GenTable): Promise<AjaxResult> {
  return request({
    url: '/tool/gen',
    method: 'put',
    data: data
  })
}

// 导入表
export function importTable(data: Record<string, unknown>): Promise<AjaxResult> {
  return request({
    url: '/tool/gen/importTable',
    method: 'post',
    params: data
  })
}

// 创建表（结构化建表，方案 A：消除 SQL 注入）
export function createTable(data: CreateTableDto): Promise<AjaxResult<CreateTableResult>> {
  return request({
    url: '/tool/gen/createTable',
    method: 'post',
    data: data
  })
}

// 预览生成代码
export function previewTable(tableId: number): Promise<AjaxResult<unknown>> {
  return request({
    url: '/tool/gen/preview/' + tableId,
    method: 'get'
  })
}

// 删除表数据
export function delTable(tableId: number | number[]): Promise<AjaxResult> {
  return request({
    url: '/tool/gen/' + tableId,
    method: 'delete'
  })
}

// 生成代码（自定义路径）
export function genCode(tableName: string): Promise<AjaxResult> {
  return request({
    url: '/tool/gen/genCode/' + tableName,
    method: 'get'
  })
}

// 批量生成代码（构造 ZIP 下载地址，配合 download 插件使用）
// 对应后端路由 GET /tool/gen/batchGenCode?tables=name1,name2
export function batchGenCode(tableNames: string[]): string {
  const tables = tableNames.filter((n) => n && n.trim()).join(',')
  return `/tool/gen/batchGenCode?tables=${encodeURIComponent(tables)}`
}

// 同步数据库（POST：写操作须用 POST，避免 CSRF 风险）
export function synchDb(tableName: string): Promise<AjaxResult> {
  return request({
    url: '/tool/gen/synchDb/' + tableName,
    method: 'post'
  })
}
