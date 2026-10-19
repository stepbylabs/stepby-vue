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

/**
 * 隐藏元素：必须**先取基线再写 none**。
 * 基线惰性采集若发生在写入 `display:none` 之后，读到的"原始值"就是 none 本身
 * （WeakMap 此后不再覆写），元素将**永久不可见**——权限/入参修正后 updated 依旧
 * 恢复到 none。批七十二单测实证：冷加载期 permissions 为空走本分支 → getInfo 之后
 * 放行的按钮全部再也显示不出来。
 */
function hide(el: HTMLElement): void {
  getOriginalDisplay(el)
  el.style.display = 'none'
}

function checkPermission(el: HTMLElement, binding: DirectiveBinding) {
  const { value } = binding
  const all_permission = '*:*:*'
  const permissions = useUserStore().permissions

  // 空值检查：避免权限未加载或为空时抛错导致白屏（P0-47）
  if (!(value && value instanceof Array && value.length > 0)) {
    hide(el)
    if (import.meta.env.DEV)
      console.warn('[v-hasPermi] Please set permission tags, e.g. v-hasPermi="[\'system:user:add\']"')
    return
  }
  // 权限列表为空时直接隐藏元素，不报错
  if (!permissions || permissions.length === 0) {
    hide(el)
    return
  }

  const permissionFlag = value
  const hasPermissions = permissions.some((permission: string) => {
    return all_permission === permission || permissionFlag.includes(permission)
  })

  // 使用 display:none 隐藏而非物理移除，权限变化时可通过 updated 钩子恢复；
  // 恢复时还原原始 display 值（P1：不再写死 ''，避免 inline-flex 等布局被破坏）
  if (hasPermissions) el.style.display = getOriginalDisplay(el)
  else hide(el)
}

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  }
}
