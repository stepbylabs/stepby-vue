import type { PageDomain } from '../common'

/** SCIM 组分页查询参数 */
export interface ScimGroupQueryParams extends PageDomain {
  /** 组显示名（模糊） */
  displayName?: string
  /** 映射类型（role/dept） */
  mappingType?: string
}

/** SCIM 组列表行（后端生成类型） */
export type ScimGroupAdminRow = import(
  '@/types/api/generated/ScimGroupAdminRow'
).ScimGroupAdminRow

/** SCIM 组详情（成员只读 + 绑定，后端生成类型） */
export type ScimGroupAdminDetail = import(
  '@/types/api/generated/ScimGroupAdminDetail'
).ScimGroupAdminDetail

/** SCIM 组成员（后端生成类型） */
export type ScimGroupAdminMember = import(
  '@/types/api/generated/ScimGroupAdminMember'
).ScimGroupAdminMember

/** SCIM 组更新 DTO（后端生成类型） */
export type ScimGroupAdminUpsertDto = import(
  '@/types/api/generated/ScimGroupAdminUpsertDto'
).ScimGroupAdminUpsertDto
