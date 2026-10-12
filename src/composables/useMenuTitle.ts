/**
 * 菜单标题翻译 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：统一处理菜单标题的 i18n 翻译
 * - 优先使用 meta.i18nKey 调用 t() 翻译（响应式跟随 locale）
 * - 回退到 meta.title 原文（后端 menu_name）
 *
 * 使用场景：
 * - 在 <script setup> 中：const { translateTitle } = useMenuTitle()
 * - 在模板中：{{ translateTitle(item.meta) }}
 * - 在非组件上下文（如 permission.ts）：直接 import translateTitle
 *
 * 响应式说明：
 * - vue-i18n Composition API 模式下，i18n.global.t 内部依赖 locale ref
 * - 在模板/computed/watch 中调用 translateTitle 会自动建立对 locale 的依赖
 * - 切换语言时，所有调用 translateTitle 的地方会自动重新计算
 */
import i18n from '@/i18n'

/** 路由 meta 子集（兼容 RouteMeta 与 MetaVo） */
export interface TranslatableMeta {
  title?: string
  i18nKey?: string
  [key: string]: unknown
}

/**
 * 翻译菜单标题（响应式：依赖 i18n.global.locale）
 *
 * @param meta 路由 meta 对象，需包含 title 和可选的 i18nKey
 * @returns 翻译后的标题；若 i18nKey 不存在或未提供，回退到 title 原文
 *
 * @example
 * // 在模板中
 * <span>{{ translateTitle(item.meta) }}</span>
 *
 * // 在 setup 中
 * const title = computed(() => translateTitle(route.meta))
 */
export function translateTitle(meta?: TranslatableMeta | null): string {
  if (!meta) return ''
  const i18nKey = meta.i18nKey
  if (i18nKey) {
    try {
      if (i18n.global.te(i18nKey)) {
        return i18n.global.t(i18nKey)
      }
    } catch {
      // F11 加固：报文编译/插值异常时回落到 title 原文，避免布局区崩溃
      if (import.meta.env.DEV) console.warn(`[useMenuTitle] translate failed for key: ${i18nKey}`)
    }
  }
  return meta.title || ''
}

/**
 * useMenuTitle composable
 *
 * 在组件 setup 中使用，返回 translateTitle 函数。
 * 与直接 import translateTitle 等效，保留 composable 形式以便未来扩展
 * （如注入 locale 变体、添加翻译钩子等）。
 */
export function useMenuTitle() {
  return { translateTitle }
}
