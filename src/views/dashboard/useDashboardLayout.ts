/**
 * 仪表盘布局状态与持久化（Tier-S #4）
 *
 * 从 localStorage（cache.local，与用户偏好 user-prefs 同一持久化通道）读写卡片顺序 /
 * 宽度 / 显隐；纯清洗合并逻辑在 ./dashboardLayout。编辑态开关也在此维护。
 */
import { ref, watch } from 'vue'
import cache from '@/plugins/cache'
import { type LayoutItem, type WidgetId, type WidgetSpan, normalizeLayout, defaultLayout } from './dashboardLayout'

const STORAGE_KEY = 'dashboard-layout'

/** 读取并清洗持久化布局；无 / 脏数据回退默认 */
function loadLayout(): LayoutItem[] {
  return normalizeLayout(cache.local.getJSON(STORAGE_KEY))
}

export function useDashboardLayout() {
  const layout = ref<LayoutItem[]>(loadLayout())
  const editing = ref(false)

  function persist(): void {
    cache.local.setJSON(STORAGE_KEY, layout.value)
  }

  // 深度监听：拖拽重排 / 宽度 / 显隐变化后统一落库
  watch(layout, persist, { deep: true })

  function toggleVisible(id: WidgetId): void {
    const item = layout.value.find((i: LayoutItem) => i.id === id)
    if (item) item.visible = !item.visible
  }

  function setSpan(id: WidgetId, span: WidgetSpan): void {
    const item = layout.value.find((i: LayoutItem) => i.id === id)
    if (item) item.span = span
  }

  function reset(): void {
    layout.value = defaultLayout()
  }

  return { layout, editing, toggleVisible, setSpan, reset }
}
