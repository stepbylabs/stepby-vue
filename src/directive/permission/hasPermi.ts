/**
 * v-hasPermi 操作权限处理
 * Copyright (c) 2026 Stepby
 */
import useUserStore from '@/store/modules/user'

// P1 修复：缓存元素原始 display 值（inline-flex/flex 等），
// 恢复时还原而非写成 ''（原实现会把 inline-flex 按钮恢复成 block 导致布局错乱）
const originalDisplay = new WeakMap<HTMLElement, string>()

function getOriginalDisplay(el: HTMLElement): string {
  if (!originalDisplay.has(el)) {
    // 读取元素当前计算样式中的 display（含 class 定义），作为恢复基准
    originalDisplay.set(el, window.getComputedStyle(el).display || '')
  }
  return originalDisplay.get(el) as string
}

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

  // 使用 display:none 隐藏而非物理移除，权限变化时可通过 updated 钩子恢复；
  // 恢复时还原原始 display 值（P1：不再写死 ''，避免 inline-flex 等布局被破坏）
  el.style.display = hasPermissions ? getOriginalDisplay(el) : 'none'
}

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  }
}
