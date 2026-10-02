import request from '@/utils/request'
import type { AjaxResult } from '@/types'

/**
 * 租户自建导航 L3 API（批次 3 / MT-1）
 *
 * 后端契约（src/handler/sys_tenant_nav_handler.rs）：
 * - GET    /system/tenant/menu/list      导航配置列表（租户 = 强制本租户；平台可传 tenantId）
 * - GET    /system/tenant/menu/options   可选菜单池（M/C 展平，带 selected）
 * - POST   /system/tenant/menu           新增导航项
 * - PUT    /system/tenant/menu           修改导航项（父级 / 排序 / 显隐 / 启停）
 * - DELETE /system/tenant/menu/{l3Id}    删除导航项（有子节点时 400）
 *
 * 准入（能力位 `nav.l3`）：
 * - `off`（默认）⇒ 租户操作者一律 403（关闭态即现状）；
 * - `view_only` ⇒ 仅可 list / options；
 * - `full` ⇒ 可读写。
 * 平台操作者（tid=0）恒可读写全部租户（不受能力位影响）。
 */

/** L3 导航行视图（对齐后端 SysTenantMenuVo） */
export interface SysTenantMenuVo {
  l3Id: number
  tenantId: number
  refMenuId: number
  /** 0 = 顶层；其余为本租户其它 L3 行的 l3Id */
  parentId: number
  orderNum?: number
  /** '0' 显示 / '1' 隐藏 */
  visible?: string
  /** '0' 正常 / '1' 停用 */
  status?: string
  createBy?: string
  createTime?: string
  updateBy?: string
  updateTime?: string
  /** 引用菜单展示信息 */
  refMenuName: string
  refMenuType: string
  refMenuPath?: string
  refMenuPerms?: string
  refMenuIcon?: string
}

/** 可选菜单项（对齐后端 TenantNavMenuOptionVo） */
export interface TenantNavMenuOptionVo {
  menuId: number
  menuName: string
  /** 'M' 目录 / 'C' 页面 */
  menuType: string
  parentId: number
  perms?: string
  icon?: string
  /** 是否已被本租户挂载 */
  selected: boolean
}

/** 新增导航项入参（对齐后端 TenantNavAddDto） */
export interface TenantNavAddDto {
  /** 平台操作者必填；租户操作者可省略 */
  tenantId?: number
  refMenuId: number
  /** 0 = 顶层（缺省） */
  parentId?: number
  orderNum?: number
  /** '0' 显示（缺省）/ '1' 隐藏 */
  visible?: string
}

/** 修改导航项入参（对齐后端 TenantNavEditDto；缺省字段表示不修改） */
export interface TenantNavEditDto {
  l3Id: number
  parentId?: number
  orderNum?: number
  visible?: string
  status?: string
}

/** 导航配置列表 */
export function listTenantNav(tenantId?: number): Promise<AjaxResult<SysTenantMenuVo[]>> {
  return request({
    url: '/system/tenant/menu/list',
    method: 'get',
    params: tenantId != null ? { tenantId } : undefined
  })
}

/** 可选菜单池 */
export function tenantNavOptions(tenantId?: number): Promise<AjaxResult<TenantNavMenuOptionVo[]>> {
  return request({
    url: '/system/tenant/menu/options',
    method: 'get',
    params: tenantId != null ? { tenantId } : undefined
  })
}

/** 新增导航项 */
export function addTenantNav(data: TenantNavAddDto): Promise<AjaxResult<SysTenantMenuVo>> {
  return request({
    url: '/system/tenant/menu',
    method: 'post',
    data
  })
}

/** 修改导航项 */
export function updateTenantNav(data: TenantNavEditDto): Promise<AjaxResult<SysTenantMenuVo>> {
  return request({
    url: '/system/tenant/menu',
    method: 'put',
    data
  })
}

/** 删除导航项 */
export function delTenantNav(l3Id: number): Promise<AjaxResult> {
  return request({
    url: '/system/tenant/menu/' + l3Id,
    method: 'delete'
  })
}
