import type { BaseEntity, AjaxResult, TreeSelect } from '../common'

/** 菜单查询参数 */
export interface MenuQueryParams {
  /** 菜单名称 */
  menuName?: string
  /** 状态 */
  status?: string
}

/** 菜单信息 */
export interface SysMenu extends BaseEntity {
  /** 菜单编号 */
  menuId?: number
  /** 父菜单ID */
  parentId?: number
  /** 菜单名称 */
  menuName?: string
  /** 显示顺序 */
  orderNum?: number
  /** 路由地址 */
  path?: string
  /** 组件路径 */
  component?: string
  /** 路由参数 */
  query?: string
  /** 路由名称 */
  routeName?: string
  /** 权限字符串 */
  perms?: string
  /** 菜单图标 */
  icon?: string
  /** 是否为外链（0是 1否） */
  isFrame?: '0' | '1'
  /** 是否缓存（0缓存 1不缓存） */
  isCache?: '0' | '1'
  /** 类型（M目录 C菜单 F按钮） */
  menuType?: 'M' | 'C' | 'F'
  /** 显示状态（0显示 1隐藏） */
  visible?: '0' | '1'
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
  /** i18n 翻译 key（可选）：前端按此 key 翻译菜单标题，留空则回退到 menuName */
  i18nKey?: string
  /** 子菜单 */
  children?: SysMenu[]
}

/** 保存菜单排序参数 */
export interface MenuSortParams {
  /** 菜单 ID 列表（逗号分隔） */
  menuIds: string
  /** 菜单显示顺序列表（逗号分隔） */
  orderNums: string
}

/** 角色菜单树选择结果 */
export interface RoleMenuTreeselectResult extends AjaxResult {
  /** 已选中的菜单ID列表 */
  checkedKeys: number[]
  /** 菜单树形结构 */
  menus: TreeSelect[]
}
