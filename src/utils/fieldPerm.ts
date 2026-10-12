/**
 * 字段级权限 M3 前端纯函数工具
 *
 * 覆盖两处消费场景：
 * 1. 角色管理页字段授权矩阵：查询响应 ⇄ 勾选状态 ⇄ 保存参数组装
 * 2. user 列表页：按当前操作者的 field-hidden 集合过滤可见列
 *
 * 全部为纯函数，便于 vitest 单测（对齐 utils 既有测试范式）。
 */
import type { FieldPermItem } from '@/types'

/** 白名单字段定义（fieldKey + 展示名 i18n key） */
export interface FieldPermFieldDef {
  /** 字段键，与后端白名单一致 */
  fieldKey: string
  /** 字段中文名的 i18n key */
  labelKey: string
}

/**
 * 首期白名单表（tableKey → 字段定义列表）
 * sys_user：phonenumber、email；后续多表在此扩展（tableKey 参数已预留）
 */
export const FIELD_PERM_TABLES: Record<string, FieldPermFieldDef[]> = {
  sys_user: [
    { fieldKey: 'phonenumber', labelKey: 'role.fieldPerm.fields.phonenumber' },
    { fieldKey: 'email', labelKey: 'role.fieldPerm.fields.email' }
  ]
}

/**
 * 矩阵查询响应 fields → 勾选状态映射（hidden = true ⇒ 勾选）
 * 容错：入参为 null/undefined/含缺失 fieldKey 的脏数据时跳过对应条目
 * @param fields 后端下发的字段隐藏态列表
 */
export function toCheckedMap(fields: FieldPermItem[] | null | undefined): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  for (const item of fields ?? []) {
    if (item && item.fieldKey) {
      map[item.fieldKey] = item.hidden === true
    }
  }
  return map
}

/**
 * 矩阵勾选状态 → 保存参数 hiddenFields（勾选 = 隐藏）
 * 按 fieldKeys 入参顺序稳定输出（白名单顺序），仅收 true 的键
 * @param fieldKeys 白名单字段键顺序列表（决定输出顺序）
 * @param checked 勾选状态映射
 */
export function buildHiddenFields(fieldKeys: string[], checked: Record<string, boolean>): string[] {
  return fieldKeys.filter((key) => checked[key] === true)
}

/**
 * 按当前操作者隐藏集过滤列键数组（保持原顺序）
 * @param columnKeys 列键列表（页面列定义顺序）
 * @param hiddenFields 后端下发的隐藏字段数组（容错 null/undefined）
 */
export function filterColumnsByHidden(columnKeys: string[], hiddenFields: string[] | null | undefined): string[] {
  const hidden = new Set(hiddenFields ?? [])
  return columnKeys.filter((key) => !hidden.has(key))
}

/**
 * 判断单列最终可见性：列显隐偏好开启 且 未被字段级权限隐藏
 * @param columnKey 列键（如 phonenumber）
 * @param prefVisible 用户列显隐偏好（RightToolbar 面板控制）
 * @param hiddenFields 当前操作者的隐藏字段数组（容错 null/undefined）
 */
export function isColumnVisible(columnKey: string, prefVisible: boolean, hiddenFields: string[] | null | undefined): boolean {
  if (!prefVisible) {
    return false
  }
  return !(hiddenFields ?? []).includes(columnKey)
}
