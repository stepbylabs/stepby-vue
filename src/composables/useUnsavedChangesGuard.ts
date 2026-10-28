/**
 * 未保存内容保护（b113）
 *
 * 立的案：报表设计器的"改即生效"是内存态——加图表、拖动顺序、改标题/字段、调宽度全都不落库，
 * 只有点「保存」才写。改造前**三条离开路径全都没有提示**：
 * ① 切到另一块大屏（`v-model="selectedId"` 直接换，画布被新布局覆盖）；
 * ② 运行/设计模式切换（`v-if="mode === 'design'"` 直接卸载设计器）；
 * ③ 点侧栏离开页面 / 刷新或关标签（内存态随组件一起消失）。
 * 用户点一次错误的菜单就会丢掉全部未保存改动，且没有任何提示——这是"页面看起来保存了"的
 * 反方向缺陷：**没有任何一处告诉用户改动还在内存里**。
 *
 * 口径：
 * - **只有脏了才拦**（`isDirty()` 由调用方按快照比对给出，不做启发式猜测）；
 * - 路由离开走确认框（`confirmAction`：取消折叠成 false，不让 rejected Promise 逸出）；
 * - 刷新/关标签走 `beforeunload`（浏览器只允许触发原生提示，文案由浏览器决定）；
 * - 监听随组件卸载移除（否则离开设计器后每次刷新都还会弹）。
 *
 * 刻意不做 `onBeforeRouteUpdate`（同路由换 query 不丢表单）与"自动保存草稿"（会改变数据面语义，
 * 属另立项）。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { confirmAction } from '@/utils/confirm'

/**
 * @param isDirty 当前是否有未保存改动（调用方应传纯读取函数，如 `() => isDirty.value`）
 * @param message 路由离开时的确认文案（懒取：语言切换后要拿到当前语言的文案）
 */
export function useUnsavedChangesGuard(isDirty: () => boolean, message: () => string): void {
  onBeforeRouteLeave(() => (isDirty() ? confirmAction(message()) : true))

  // 刷新/关标签：现代浏览器忽略自定义文案，只认 preventDefault + returnValue
  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (!isDirty()) return
    e.preventDefault()
    e.returnValue = ''
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
