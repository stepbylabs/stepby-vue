/**
 * G-15a：移动端筛选收纳（P1 列表页样板 composable）
 *
 * 语义（MOBILE-UX-GUIDELINES §六 遗留项落地）：
 * - 移动端（<768px，与 layout 三档判定同口径）列表筛选表单**默认收起**——
 *   手机屏纵向空间宝贵，筛选条件先藏后查；
 * - 断点跨越时恢复对应端默认（回桌面自动展开、进移动端自动收起）——
 *   保证行为可预期；断点不变时用户手动开合不被覆盖；
 * - 桌面端行为与改造前逐字节一致（默认展开）。
 *
 * 用法（列表页）：
 * ```ts
 * const showSearch = ref(true)
 * const { isMobile } = useMobileFilter(showSearch)
 * ```
 * 模板侧无需改动（`v-show="showSearch"` / RightToolbar 的 showSearch 开关
 * 均作用于同一 ref，移动端与桌面共用同一收展控制点）。
 */
import { computed, watch, type Ref } from 'vue'
import { useWindowSize } from '@vueuse/core'

/** 移动端断点（与 layout/index.vue 三档判定的 mobile 阈值一致） */
export const MOBILE_BREAKPOINT = 768

export function useMobileFilter(showSearch: Ref<boolean>) {
  const { width } = useWindowSize()
  const isMobile = computed(() => width.value < MOBILE_BREAKPOINT)

  // 首次挂载：移动端默认收起（P1 筛选收纳）
  if (isMobile.value) {
    showSearch.value = false
  }

  // 断点跨越联动：恢复对应端默认（桌面展开 / 移动收起）
  watch(isMobile, (mobile: boolean) => {
    showSearch.value = !mobile
  })

  return { isMobile }
}
