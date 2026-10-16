import type { BaseEntity } from '../common'

/** 部门查询参数 */
export interface DeptQueryParams {
  /** 部门名称 */
  deptName?: string
  /** 状态 */
  status?: string
}

/** 保存部门排序参数 */
export interface DeptSortParams {
  /** 部门 ID 列表（逗号分隔） */
  deptIds: string
  /** 部门显示顺序列表（逗号分隔） */
  orderNums: string
}

/**
 * 部门信息
 *
 * 契约单一事实源：`src/types/api/generated/SysDept.ts`（ts-rs 从后端生成），
 * 字段名与可空性以该文件为准；本接口同时充当新增/修改的请求体（故保留 BaseEntity 的可选项）。
 */
export interface SysDept extends BaseEntity {
  /** 部门编号 */
  deptId?: number
  /** 多租户归属（后端实发且非空；0 = 平台租户） */
  tenantId?: number
  /** 父部门ID */
  parentId?: number
  /** 祖级列表 */
  ancestors?: string
  /** 部门名称 */
  deptName?: string
  /** 显示顺序 */
  orderNum?: number
  /** 负责人（姓名，后端 leader 列） */
  leader?: string
  /** 部门主管 user_id（审批「部门主管」策略的定位依据） */
  leaderUserId?: number | null
  /** 联系电话 */
  phone?: string
  /** 邮箱 */
  email?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
  /** 删除标志（'2' = 已删除；软删行不出现在列表，仅契约对齐） */
  delFlag?: string
  /** 子部门（前端装配字段：列表接口返回平铺行，由 handleTree 组装成树；非后端列） */
  children?: SysDept[]
}
