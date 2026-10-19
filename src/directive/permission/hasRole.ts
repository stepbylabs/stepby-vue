/**
 * v-hasRole 角色权限处理
 * Copyright (c) 2026 Stepby
 */
import useUserStore from '@/store/modules/user'

// P1 修复：缓存元素原始 display 值，恢复时还原（与 v-hasPermi 一致）
const originalDisplay = new WeakMap<HTMLElement, string>()

function getOriginalDisplay(el: HTMLElement): string {
  if (!originalDisplay.has(el)) {
    originalDisplay.set(el, window.getComputedStyle(el).display || '')
  }
  return originalDisplay.get(el) as string
}

/**
 * 隐藏元素：先取基线再写 none（与 v-hasPermi 同修，口径必须一致）。
 * 基线在 `display:none` 写入之后才采集会把 none 当成原始值，导致角色就绪后
 * 入口永久不可见。
 */
function hide(el: HTMLElement): void {
  getOriginalDisplay(el)
  el.style.display = 'none'
}

function checkRole(el: HTMLElement, binding: DirectiveBinding) {
  const { value } = binding
  const super_admin = 'admin'
  const roles = useUserStore().roles

  // 空值检查：避免角色未加载或为空时抛错导致白屏（P0-47）
  if (!(value && value instanceof Array && value.length > 0)) {
    hide(el)
    if (import.meta.env.DEV) console.warn('[v-hasRole] Please set role tags, e.g. v-hasRole="[\'admin\']"')
    return
  }
  // 角色列表为空时直接隐藏元素，不报错
  if (!roles || roles.length === 0) {
    hide(el)
    return
  }

  const roleFlag = value
  const hasRole = roles.some((role: string) => {
    return super_admin === role || roleFlag.includes(role)
  })

  // P0 修复：使用 display:none 隐藏而非物理移除（removeChild 不可逆），
  // 与 v-hasPermi 保持一致；角色变化时可通过 updated 钩子恢复
  // P1：恢复时还原原始 display 值
  if (hasRole) el.style.display = getOriginalDisplay(el)
  else hide(el)
}

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    checkRole(el, binding)
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    checkRole(el, binding)
  }
}
