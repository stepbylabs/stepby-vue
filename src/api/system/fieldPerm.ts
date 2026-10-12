import request from '@/utils/request'
import type { AjaxResult } from '@/types'
import type { FieldPermResult, SaveFieldPermParams } from '@/types'

/**
 * 字段级权限 M3 接口层
 *
 * 权限标识：system:role:fieldPerm（读）/ system:role:fieldPermSave（写）
 * 开关未开启时接口返回业务错误（msg 提示"字段级权限未启用"），由全局拦截器统一提示。
 */

/**
 * 查询角色字段授权矩阵
 * 返回该表全部白名单字段及 hidden 态（后端权威下发，前端不自行补齐字段）
 * @param roleId 角色编号
 * @param tableKey 数据表键（首期固定 sys_user，参数上预留多表）
 */
export function getFieldPerm(roleId: number | string, tableKey: string): Promise<AjaxResult<FieldPermResult>> {
  return request({
    url: `/system/role/field-perm/${roleId}`,
    method: 'get',
    params: { tableKey }
  })
}

/**
 * 全量覆盖保存角色字段隐藏配置
 * @param roleId 角色编号
 * @param tableKey 数据表键（首期固定 sys_user）
 * @param data { hiddenFields } —— 勾选（隐藏）的字段键数组，未列出的字段视为不隐藏
 */
export function saveFieldPerm(
  roleId: number | string,
  tableKey: string,
  data: SaveFieldPermParams
): Promise<AjaxResult> {
  return request({
    url: `/system/role/field-perm/${roleId}`,
    method: 'put',
    params: { tableKey },
    data
  })
}

/**
 * 查询当前操作者生效的隐藏字段数组（如 ["phonenumber","email"]）
 * user 列表页据此动态隐藏列（后端按当前用户的角色配置聚合算好下发）
 * @param tableKey 数据表键（首期固定 sys_user）
 */
export function getFieldHidden(tableKey: string): Promise<AjaxResult<string[]>> {
  return request({
    url: '/system/user/field-hidden',
    method: 'get',
    params: { tableKey }
  })
}
