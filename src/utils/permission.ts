import useUserStore from '@/store/modules/user'

/**
 * 字符权限校验
 * @param value 校验值
 * @returns {Boolean}
 */
export function checkPermi(value: string[]): boolean {
  // 空值检查：避免权限未加载或为空时报错（P0-47）
  if (!(value && Array.isArray(value) && value.length > 0)) {
    // v8 ignore next —— DEV=false 分支仅在生产构建可达，Vitest 恒为 DEV 模式
    if (import.meta.env.DEV) console.warn(`need permissions! Like checkPermi="['system:user:add','system:user:edit']"`)
    return false
  }
  const permissions = useUserStore().permissions
  if (!permissions || permissions.length === 0) {
    return false
  }
  const permissionDatas = value
  const all_permission = '*:*:*'

  const hasPermission = permissions.some((permission: string) => {
    return all_permission === permission || permissionDatas.includes(permission)
  })

  if (!hasPermission) {
    return false
  }
  return true
}

/**
 * 角色权限校验
 * @param value 校验值
 * @returns {Boolean}
 */
export function checkRole(value: string[]): boolean {
  // 空值检查：避免角色未加载或为空时报错（P0-47）
  if (!(value && Array.isArray(value) && value.length > 0)) {
    // v8 ignore next —— DEV=false 分支仅在生产构建可达，Vitest 恒为 DEV 模式
    if (import.meta.env.DEV) console.warn(`need roles! Like checkRole="['admin','editor']"`)
    return false
  }
  const roles = useUserStore().roles
  if (!roles || roles.length === 0) {
    return false
  }
  const permissionRoles = value
  const super_admin = 'admin'

  const hasRole = roles.some((role: string) => {
    return super_admin === role || permissionRoles.includes(role)
  })

  if (!hasRole) {
    return false
  }
  return true
}
