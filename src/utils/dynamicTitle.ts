import defaultSettings from '@/settings'

/**
 * 动态修改标题
 *
 * b124：入参由调用方给出（而不是本模块 import settings store）。
 * 原实现 `settings.ts → dynamicTitle.ts → settings.ts` 构成**循环依赖**
 * （rolldown `checks.circularDependency` 实测点名），ESM 的 live binding 让结果
 * 取决于模块初始化顺序——一旦有人调整 import 顺序，`useSettingsStore()` 会在
 * store 定义之前被调用（TDZ 或 undefined store），表现是白屏或标题静默不更新。
 * 依赖方向改成单向：store 把自己的两个字段传进来，util 只做字符串拼装。
 */
export interface DynamicTitleState {
  dynamicTitle: boolean
  title: string
}

export function applyDynamicTitle(state: DynamicTitleState): void {
  document.title = state.dynamicTitle ? state.title + ' - ' + defaultSettings.title : defaultSettings.title
}
