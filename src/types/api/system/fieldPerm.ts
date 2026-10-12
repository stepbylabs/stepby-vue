/**
 * 字段级权限 M3 API 类型定义
 *
 * 契约（fieldperm-be）：
 * - GET  /system/role/field-perm/{roleId}?tableKey=sys_user → 全白名单字段 + hidden 态
 * - PUT  /system/role/field-perm/{roleId}?tableKey=sys_user body {hiddenFields}（全量覆盖）
 * - GET  /system/user/field-hidden?tableKey=sys_user → 当前操作者生效的隐藏字段数组
 */

/** 字段权限矩阵单行（单个白名单字段及其隐藏态） */
export interface FieldPermItem {
  /** 字段键（如 phonenumber / email） */
  fieldKey: string
  /** 是否对该角色隐藏（true = 隐藏） */
  hidden: boolean
}

/** 字段权限矩阵查询响应数据 */
export interface FieldPermResult {
  /** 白名单字段及隐藏态（后端下发全量字段，前端无需自行补齐） */
  fields: FieldPermItem[]
}

/** 字段权限全量覆盖保存参数（body） */
export interface SaveFieldPermParams {
  /** 隐藏字段键数组（全量覆盖：未列出的字段视为不隐藏） */
  hiddenFields: string[]
}
