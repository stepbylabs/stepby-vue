import request from '@/utils/request'
import type {
  ScimGroupAdminRow,
  ScimGroupAdminDetail,
  ScimGroupAdminUpsertDto,
  AjaxResult,
  TableDataInfo
} from '@/types'

// 分页查询 SCIM 组
export function listScimGroup(query: {
  pageNum?: number
  pageSize?: number
  displayName?: string
  mappingType?: string
}): Promise<TableDataInfo<ScimGroupAdminRow>> {
  return request({
    url: '/system/scimGroup/list',
    method: 'get',
    params: query
  })
}

// 查询 SCIM 组详情（成员只读 + 绑定）
export function getScimGroup(id: number | string): Promise<AjaxResult<ScimGroupAdminDetail>> {
  return request({
    url: '/system/scimGroup/' + id,
    method: 'get'
  })
}

// 更新组（映射类型与/或绑定全量替换，联动全成员授权 diff）
export function updateScimGroup(
  id: number | string,
  data: ScimGroupAdminUpsertDto
): Promise<AjaxResult<ScimGroupAdminDetail>> {
  return request({
    url: '/system/scimGroup/' + id,
    method: 'put',
    data: data
  })
}

// 删除组（软删 + 撤销仅 scim 来源授权）
export function delScimGroup(id: number | string): Promise<AjaxResult> {
  return request({
    url: '/system/scimGroup/' + id,
    method: 'delete'
  })
}
