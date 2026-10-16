import type { PageDomain, BaseEntity, AjaxResult, TreeSelect, DataScope } from '../common'

/** 角色分页查询参数 */
export interface RoleQueryParams extends PageDomain {
  /** 角色名称 */
  roleName?: string
  /** 角色权限 */
  roleKey?: string
  /** 状态 */
  status?: string
  /** 创建时间 */
  params?: {
    beginTime?: string
    endTime?: string
  }
}

/** 批量授权用户参数 */
export interface AuthUserSelectParams {
  /** 角色编号 */
  roleId: number
  /** 用户编号列表 */
  userIds: number[]
}

/** 用户和角色关联信息 */
export interface SysUserRole {
  /** 用户编号 */
  userId?: number
  /** 角色编号 */
  roleId: number
}

/** 用户和多角色关联信息 */
export interface SysUserRoles {
  /** 用户编号 */
  userId?: number
  /** 角色编号组 */
  roleIds?: number[]
}

/**
 * 角色信息
 *
 * 契约单一事实源：`src/types/api/generated/SysRole.ts`（列表/详情响应）与
 * `generated/RoleVo.ts`（含 menuIds 的视图对象），由后端 ts-rs 生成；
 * 字段名与可空性以生成文件为准，本接口同时充当新增/修改的请求体（故保留 BaseEntity 的可选项）。
 */
export interface SysRole extends BaseEntity {
  /** 角色编号 */
  roleId?: number
  /** 角色名称 */
  roleName?: string
  /** 角色权限 */
  roleKey?: string
  /** 角色排序  */
  roleSort?: number
  /** 数据范围（1：所有数据权限；2：自定义数据权限；3：本部门数据权限；4：本部门及以下数据权限；5：仅本人数据权限） */
  dataScope?: DataScope
  /** 菜单树选择项是否关联显示 */
  menuCheckStrictly?: boolean
  /** 部门树选择项是否关联显示 */
  deptCheckStrictly?: boolean
  /** 角色权限 */
  menuIds?: number[]
  /** 角色权限 */
  deptIds?: number[]
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
  /**
   * 多租户归属（后端 SysRole 实发；0 = 平台租户）。
   * 生成契约里是非空列，但本接口兼作新增/修改的请求体，而 `tenant_id` 由后端从
   * 操作者派生（写请求不得携带），故保持可选。
   */
  tenantId?: number
  /** 自定义部门 SQL 过滤片段（dataScope="2" 时可选；运行时由后端白名单解析） */
  customSql?: string
  /**
   * 系统角色标记（平台超管 = isSystem && tenantId === 0）。
   * 同 tenantId：响应实发非空，但仅种子/迁移置位、DTO 不可修改，写请求不携带故保持可选。
   */
  isSystem?: boolean
  /** 删除标志（'2' = 已删除；软删行不出现在列表，仅契约对齐） */
  delFlag?: string
}

/** 角色部门树响应 */
export interface RoleDeptTreeResult extends AjaxResult {
  /** 选中部门ID */
  checkedKeys: number[]
  /** 部门树列表 */
  depts: TreeSelect[]
}
