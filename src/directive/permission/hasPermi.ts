/**
 * v-hasPermi 操作权限处理
 * Copyright (c) 2024-2026 Yebot
 */
import useUserStore from '@/store/modules/user'

function checkPermission(el: HTMLElement, binding: DirectiveBinding) {
  const { value } = binding
  const all_permission = '*:*:*'
  const permissions = useUserStore().permissions

  // 空值检查：避免权限未加载或为空时抛错导致白屏（P0-47）
  if (!(value && value instanceof Array && value.length > 0)) {
    el.style.display = 'none'
    if (import.meta.env.DEV)
      console.warn('[v-hasPermi] Please set permission tags, e.g. v-hasPermi="[\'system:user:add\']"')
    return
  }
  // 权限列表为空时直接隐藏元素，不报错
  if (!permissions || permissions.length === 0) {
    el.style.display = 'none'
    return
  }

  const permissionFlag = value
  const hasPermissions = permissions.some((permission: string) => {
    return all_permission === permission || permissionFlag.includes(permission)
  })

  // 使用 display:none 隐藏而非物理移除，权限变化时可通过 updated 钩子恢复
  el.style.display = hasPermissions ? '' : 'none'
}

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  }
}
