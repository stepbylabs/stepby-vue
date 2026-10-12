import request from '@/utils/request'
import { cachedApi, invalidateApiCache } from '@/utils/apiCache'
import type {
  MenuQueryParams,
  SysMenu,
  MenuSortParams,
  TreeSelect,
  AjaxResult,
  RoleMenuTreeselectResult
} from '@/types'

// 查询菜单列表
export function listMenu(query?: MenuQueryParams): Promise<AjaxResult<SysMenu[]>> {
  return request({
    url: '/system/menu/list',
    method: 'get',
    params: query
  })
}

// 查询菜单详细
export function getMenu(menuId: number): Promise<AjaxResult<SysMenu>> {
  return request({
    url: '/system/menu/' + menuId,
    method: 'get'
  })
}

// 全局菜单树缓存 key（不含角色定制数据，可安全缓存）
export const MENU_TREE_CACHE_KEY = 'system:menu:treeselect'

// 查询菜单下拉树结构（带 30s TTL 内存缓存 + 并发请求去重，对调用方透明）
export const treeselect = cachedApi(MENU_TREE_CACHE_KEY, (): Promise<AjaxResult<TreeSelect[]>> =>
  request({
    url: '/system/menu/treeselect',
    method: 'get'
  })
)

/**
 * 强制刷新菜单树下拉缓存（下次调用 treeselect 时会重新请求后端）
 *
 * 用途：用户在菜单管理页新增/修改/删除菜单后，可通过此方法让其它页面立即拿到最新数据
 */
export function refreshMenuTreeselect(): void {
  invalidateApiCache(MENU_TREE_CACHE_KEY)
}

// 根据角色ID查询菜单下拉树结构
export function roleMenuTreeselect(roleId: number): Promise<RoleMenuTreeselectResult> {
  return request({
    url: '/system/menu/roleMenuTreeselect/' + roleId,
    method: 'get'
  })
}

// 新增菜单
export function addMenu(data: SysMenu): Promise<AjaxResult> {
  return request({
    url: '/system/menu',
    method: 'post',
    data: data
  })
}

// 修改菜单
export function updateMenu(data: SysMenu): Promise<AjaxResult> {
  return request({
    url: '/system/menu',
    method: 'put',
    data: data
  })
}

// 保存菜单排序
export function updateMenuSort(data: MenuSortParams): Promise<AjaxResult> {
  return request({
    url: '/system/menu/updateSort',
    method: 'put',
    data: data
  })
}

// 删除菜单
export function delMenu(menuId: number): Promise<AjaxResult> {
  return request({
    url: '/system/menu/' + menuId,
    method: 'delete'
  })
}
