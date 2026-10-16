import type { BaseEntity, AjaxResult, TreeSelect } from '../common'

/** 菜单查询参数 */
export interface MenuQueryParams {
  /** 菜单名称 */
  menuName?: string
  /** 状态 */
  status?: string
}

/**
 * 菜单信息
 *
 * 契约单一事实源：`src/types/api/generated/SysMenu.ts`（ts-rs 从后端生成），
 * 字段名与可空性以该文件为准；本接口同时充当新增/修改的请求体（故保留 BaseEntity 的可选项）。
 * 路由树另有独立契约，见 `src/types/api/menu.ts` 的 RouterVo（getRouters 返回，带 children/meta）。
 */
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
  /** 删除标志（'2' = 已删除；软删行不出现在列表，仅契约对齐） */
  delFlag?: string
  /**
   * 子菜单列表：后端 sys_menu 的非入库列（sea_orm ignore），列表接口返回 null，
   * 树形结构由前端 handleTree 装配（getRouters 的路由树另见 RouterVo.children）
   */
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
