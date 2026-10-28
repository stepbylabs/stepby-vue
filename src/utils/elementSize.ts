/**
 * Element Plus 组件尺寸的单一事实源（b113）
 *
 * 立的案：尺寸偏好原先分居三处且互不相认——
 * ① `store/modules/app.ts` 的 `size` 从 cookie 初始化、`setSize` 写回 store + cookie；
 * ② `App.vue` 真正喂给 `el-config-provider` 的 `size` 却**只读 cookie**（非响应式），
 *    store 里的那个值一次都没被消费；
 * ③ `SizeSelect` 因此只能 `location.reload()` 让新 cookie 生效——一次样式选择换了
 *    整页重载（丢失弹窗/筛选/滚动位置，重跑整条认证与配置链）。
 *
 * 结果是一个"看起来响应式、实际靠刷新"的假通道：store 改了没人听、cookie 读了不响应。
 * 现收敛为：**偏好值域在这里定义，有效档位由"偏好 + 视口"一个纯函数解析**，
 * store 只存偏好（'' = 未设置），App 与 SizeSelect 都消费同一个解析结果。
 */

export const ELEMENT_SIZES = ['large', 'default', 'small'] as const

export type ElementSize = (typeof ELEMENT_SIZES)[number]

/** 值域归一：非法/缺失一律 `''`（= 未设置，由视口规则兜底），不得把怪串喂给 Element Plus */
export function normalizeElementSize(value: unknown): ElementSize | '' {
  if (typeof value !== 'string') return ''
  const v = value.trim()
  return (ELEMENT_SIZES as readonly string[]).includes(v) ? (v as ElementSize) : ''
}

/**
 * 有效档位：
 * - 用户显式选过（合法值域内）⇒ 尊重用户选择；
 * - 未设置 ⇒ 手机视口自动 `large`（触控目标 ≥40px），桌面 `default`（与改造前一致）。
 */
export function resolveElementSize(preference: unknown, isMobile: boolean): ElementSize {
  const pref = normalizeElementSize(preference)
  if (pref) return pref
  return isMobile ? 'large' : 'default'
}
